import 'dotenv/config'
import bcrypt from 'bcryptjs'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express, { type ErrorRequestHandler, type Request } from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'
import jwt from 'jsonwebtoken'
import mongoose, { Types } from 'mongoose'
import path from 'node:path'
import { z } from 'zod'
import { CardModel, FolderModel, PendingCardBatchModel, UserModel } from './models.js'

declare global {
  namespace Express {
    interface Request {
      userId?: string
    }
  }
}

const port = Number(process.env.PORT ?? 4000)
const mongoUri = process.env.MONGODB_URI
const jwtSecret = process.env.JWT_SECRET
const clientUrl = process.env.CLIENT_URL ?? process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:5173'
const sessionCookie = 'cardly_session'
const cardImportAdminEmail = process.env.CARD_IMPORT_ADMIN_EMAIL?.trim().toLowerCase()
const cardImportTargetEmailParts = (process.env.CARD_IMPORT_TARGET_EMAIL_PARTS ?? 'battsetseg,uldekh')
  .split(',')
  .map((part) => part.trim().toLowerCase())
  .filter(Boolean)

if (!mongoUri) throw new Error('MONGODB_URI is required. Add your MongoDB Atlas connection string to .env.')
if (!jwtSecret || jwtSecret.length < 32) throw new Error('JWT_SECRET must be set to a random secret of at least 32 characters.')
if (!cardImportTargetEmailParts.length) throw new Error('CARD_IMPORT_TARGET_EMAIL_PARTS must contain at least one email fragment.')

const app = express()
app.disable('x-powered-by')
app.use(helmet())
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origin === clientUrl) callback(null, true)
    else callback(new Error('Origin is not allowed by CORS.'))
  },
  credentials: true,
}))
app.use(express.json({ limit: '100kb' }))
app.use(cookieParser())

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please wait a little and try again.' },
})

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(60, 'Name must be 60 characters or fewer.'),
  email: z.string().trim().email('Enter a valid email address.').max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(72, 'Password must be 72 characters or fewer.'),
})
const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.').transform((value) => value.toLowerCase()),
  password: z.string().min(1, 'Enter your password.').max(72),
})
const folderSchema = z.object({
  name: z.string().trim().min(1, 'Folder name is required.').max(50),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, 'Choose a valid folder color.'),
})
const cardSchema = z.object({
  front: z.string().trim().min(1, 'Card front is required.').max(500),
  back: z.string().trim().max(2000).optional().default(''),
  folderId: z.string().nullable().optional().default(null),
  studyMode: z.enum(['pair', 'guess', 'recall', 'type']).optional().default('recall'),
  tags: z.array(z.string().trim().min(1).max(24)).max(8, 'A card can have up to 8 tags.').optional().default([]),
})
const importedCardsSchema = z.object({
  folderId: z.string().nullable().optional().default(null),
  cards: z.array(z.object({
    front: z.string().trim().min(1).max(500),
    back: z.string().trim().max(2000).default(''),
  })).min(1).max(100),
})
const adminImportedCardsSchema = z.object({
  cards: importedCardsSchema.shape.cards,
})

function publicUser(user: { id: string; name: string; email: string }) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    canImportCards: Boolean(cardImportAdminEmail && user.email.toLowerCase() === cardImportAdminEmail),
  }
}

function setSessionCookie(res: express.Response, userId: string) {
  const token = jwt.sign({ sub: userId }, jwtSecret!, { expiresIn: '7d' })
  res.cookie(sessionCookie, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
}

function clearSessionCookie(res: express.Response) {
  res.clearCookie(sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  })
}

function requireAuth(req: Request, res: express.Response, next: express.NextFunction) {
  const token = req.cookies?.[sessionCookie] as string | undefined
  if (!token) return res.status(401).json({ error: 'Please sign in to continue.' })
  try {
    const payload = jwt.verify(token, jwtSecret!)
    if (typeof payload === 'string' || typeof payload.sub !== 'string') {
      clearSessionCookie(res)
      return res.status(401).json({ error: 'Your session has expired. Please sign in again.' })
    }
    req.userId = payload.sub
    return next()
  } catch {
    clearSessionCookie(res)
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' })
  }
}

function authenticatedUserId(req: Request) {
  if (!req.userId) throw new Error('Authenticated route was called without a user.')
  return new Types.ObjectId(req.userId)
}

function validationMessage(error: z.ZodError) {
  return error.issues[0]?.message ?? 'Please check the information you entered.'
}

function validObjectId(id: string) {
  return Types.ObjectId.isValid(id)
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function recipientEmailFilter() {
  return { $and: cardImportTargetEmailParts.map((part) => ({ email: { $regex: escapeRegex(part), $options: 'i' } })) }
}

async function attachPendingCards(email: string, userId: Types.ObjectId) {
  const batches = await PendingCardBatchModel.find({
    emailParts: { $all: cardImportTargetEmailParts },
  })
  if (!batches.length) return

  const matchingUsers = await UserModel.find(recipientEmailFilter()).select('_id').lean()
  if (matchingUsers.length !== 1 || !matchingUsers[0]._id.equals(userId) || !cardImportTargetEmailParts.every((part) => email.toLowerCase().includes(part))) return

  for (const batch of batches) {
    await CardModel.insertMany(batch.cards.map((card) => ({ front: card.front, back: card.back, userId, folderId: null })))
    await batch.deleteOne()
  }
}

async function requireCardImportAdmin(req: Request, res: express.Response, next: express.NextFunction) {
  if (!cardImportAdminEmail) {
    return res.status(503).json({ error: 'Card imports are not configured. Set CARD_IMPORT_ADMIN_EMAIL on the server.' })
  }
  const user = await UserModel.findById(authenticatedUserId(req)).select('email')
  if (!user || user.email.toLowerCase() !== cardImportAdminEmail) {
    return res.status(403).json({ error: 'Only the configured Cardly admin can import cards for another user.' })
  }
  return next()
}

function routeId(req: Request) {
  const value = req.params.id
  return typeof value === 'string' ? value : null
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }))

app.post('/api/auth/register', authLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: validationMessage(parsed.error) })

  const { name, email, password } = parsed.data
  const passwordHash = await bcrypt.hash(password, 12)
  try {
    const user = await UserModel.create({ name, email, passwordHash })
    await attachPendingCards(user.email, user._id)
    setSessionCookie(res, user.id)
    return res.status(201).json(publicUser(user))
  } catch (error) {
    if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) {
      return res.status(409).json({ error: 'An account with that email already exists.' })
    }
    throw error
  }
})

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: validationMessage(parsed.error) })

  const user = await UserModel.findOne({ email: parsed.data.email }).select('+passwordHash')
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return res.status(401).json({ error: 'That email and password do not match.' })
  }
  setSessionCookie(res, user.id)
  return res.json(publicUser(user))
})

app.post('/api/auth/logout', (_req, res) => {
  clearSessionCookie(res)
  return res.status(204).end()
})

app.get('/api/auth/me', requireAuth, async (req, res) => {
  const user = await UserModel.findById(authenticatedUserId(req))
  if (!user) {
    clearSessionCookie(res)
    return res.status(401).json({ error: 'Your account could not be found. Please sign in again.' })
  }
  return res.json(publicUser(user))
})

app.get('/api/folders', requireAuth, async (req, res) => {
  const folders = await FolderModel.find({ userId: authenticatedUserId(req) }).sort({ createdAt: 1 }).lean()
  return res.json(folders.map((folder) => ({ id: folder._id.toString(), name: folder.name, color: folder.color, createdAt: folder.createdAt })))
})

app.post('/api/folders', requireAuth, async (req, res) => {
  const parsed = folderSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: validationMessage(parsed.error) })
  const folder = await FolderModel.create({ ...parsed.data, userId: authenticatedUserId(req) })
  return res.status(201).json({ id: folder.id, name: folder.name, color: folder.color, createdAt: folder.createdAt })
})

app.patch('/api/folders/:id', requireAuth, async (req, res) => {
  const id = routeId(req)
  if (!id || !validObjectId(id)) return res.status(400).json({ error: 'Invalid folder.' })
  const parsed = folderSchema.partial().safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: validationMessage(parsed.error) })
  const folder = await FolderModel.findOneAndUpdate(
    { _id: id, userId: authenticatedUserId(req) },
    parsed.data,
    { new: true, runValidators: true },
  )
  if (!folder) return res.status(404).json({ error: 'Folder not found.' })
  return res.json({ id: folder.id, name: folder.name, color: folder.color, createdAt: folder.createdAt })
})

app.delete('/api/folders/:id', requireAuth, async (req, res) => {
  const id = routeId(req)
  if (!id || !validObjectId(id)) return res.status(400).json({ error: 'Invalid folder.' })
  const userId = authenticatedUserId(req)
  const folder = await FolderModel.findOneAndDelete({ _id: id, userId })
  if (!folder) return res.status(404).json({ error: 'Folder not found.' })
  await CardModel.deleteMany({ folderId: folder._id, userId })
  return res.status(204).end()
})

app.get('/api/cards', requireAuth, async (req, res) => {
  const userId = authenticatedUserId(req)
  const filter: { userId: Types.ObjectId; folderId?: Types.ObjectId } = { userId }
  if (typeof req.query.folderId === 'string') {
    if (!validObjectId(req.query.folderId)) return res.status(400).json({ error: 'Invalid folder.' })
    filter.folderId = new Types.ObjectId(req.query.folderId)
  }
  const cards = await CardModel.find(filter).sort({ createdAt: -1 }).limit(2000).lean()
  return res.json(cards.map((card) => ({ id: card._id.toString(), folderId: card.folderId?.toString() ?? null, front: card.front, back: card.back, studyMode: card.studyMode ?? 'recall', tags: card.tags ?? [], createdAt: card.createdAt })))
})

app.post('/api/cards', requireAuth, async (req, res) => {
  const parsed = cardSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: validationMessage(parsed.error) })
  const userId = authenticatedUserId(req)
  const { front, back, folderId } = parsed.data
  if (folderId && (!validObjectId(folderId) || !await FolderModel.exists({ _id: folderId, userId }))) {
    return res.status(400).json({ error: 'Choose a folder in your library.' })
  }
  const card = await CardModel.create({ ...parsed.data, userId, folderId: folderId ? new Types.ObjectId(folderId) : null, front, back })
  return res.status(201).json({ id: card.id, folderId: card.folderId?.toString() ?? null, front: card.front, back: card.back, studyMode: card.studyMode, tags: card.tags, createdAt: card.createdAt })
})

app.post('/api/cards/import', requireAuth, async (req, res) => {
  const parsed = importedCardsSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: validationMessage(parsed.error) })
  const userId = authenticatedUserId(req)
  const { folderId, cards } = parsed.data
  if (folderId && (!validObjectId(folderId) || !await FolderModel.exists({ _id: folderId, userId }))) {
    return res.status(400).json({ error: 'Choose a folder in your library.' })
  }
  await CardModel.insertMany(cards.map((card) => ({ ...card, userId, folderId: folderId ? new Types.ObjectId(folderId) : null })))
  return res.status(201).json({ count: cards.length })
})

app.post('/api/admin/cards/import', requireAuth, requireCardImportAdmin, async (req, res) => {
  const parsed = adminImportedCardsSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: validationMessage(parsed.error) })

  const matchingUsers = await UserModel.find(recipientEmailFilter()).select('_id').lean()
  if (matchingUsers.length > 1) {
    return res.status(409).json({ error: 'More than one account matches the configured email fragments. Use a more specific match.' })
  }

  if (matchingUsers.length === 1) {
    await CardModel.insertMany(parsed.data.cards.map((card) => ({ ...card, userId: matchingUsers[0]._id, folderId: null })))
    return res.status(201).json({ count: parsed.data.cards.length, delivery: 'added' })
  }

  await PendingCardBatchModel.create({ emailParts: cardImportTargetEmailParts, cards: parsed.data.cards })
  return res.status(201).json({ count: parsed.data.cards.length, delivery: 'pending' })
})

app.patch('/api/cards/:id', requireAuth, async (req, res) => {
  const id = routeId(req)
  if (!id || !validObjectId(id)) return res.status(400).json({ error: 'Invalid card.' })
  const parsed = cardSchema.partial().safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: validationMessage(parsed.error) })
  const userId = authenticatedUserId(req)
  if ('folderId' in parsed.data && parsed.data.folderId && (!validObjectId(parsed.data.folderId) || !await FolderModel.exists({ _id: parsed.data.folderId, userId }))) {
    return res.status(400).json({ error: 'Choose a folder in your library.' })
  }
  const update = { ...parsed.data, ...(parsed.data.folderId ? { folderId: new Types.ObjectId(parsed.data.folderId) } : {}) }
  const card = await CardModel.findOneAndUpdate({ _id: id, userId }, update, { new: true, runValidators: true })
  if (!card) return res.status(404).json({ error: 'Card not found.' })
  return res.json({ id: card.id, folderId: card.folderId?.toString() ?? null, front: card.front, back: card.back, studyMode: card.studyMode ?? 'recall', tags: card.tags ?? [], createdAt: card.createdAt })
})

app.delete('/api/cards/:id', requireAuth, async (req, res) => {
  const id = routeId(req)
  if (!id || !validObjectId(id)) return res.status(400).json({ error: 'Invalid card.' })
  const card = await CardModel.findOneAndDelete({ _id: id, userId: authenticatedUserId(req) })
  if (!card) return res.status(404).json({ error: 'Card not found.' })
  return res.status(204).end()
})

if (process.env.NODE_ENV === 'production') {
  const webRoot = path.resolve('dist')
  app.use(express.static(webRoot))
  app.get('/{*path}', (_req, res, next) => {
    res.sendFile(path.join(webRoot, 'index.html'), (error) => {
      if (error) next(error)
    })
  })
}

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error(error)
  if (error instanceof mongoose.Error.ValidationError) return res.status(400).json({ error: 'Please check the information you entered.' })
  return res.status(500).json({ error: 'Something went wrong on our end. Please try again.' })
}
app.use(errorHandler)

await mongoose.connect(mongoUri)
app.listen(port, () => {
  console.log(`Cardly API listening on http://localhost:${port}`)
})
