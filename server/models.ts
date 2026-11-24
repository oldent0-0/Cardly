import mongoose, { Schema, type InferSchemaType } from 'mongoose'

const userSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
}, { timestamps: true })

const folderSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 50 },
  color: { type: String, required: true, match: /^#[0-9a-f]{6}$/i },
}, { timestamps: true })

const cardSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  folderId: { type: Schema.Types.ObjectId, ref: 'Folder', default: null },
  front: { type: String, required: true, trim: true, maxlength: 500 },
  back: { type: String, default: '', trim: true, maxlength: 2000 },
  studyMode: { type: String, enum: ['pair', 'guess', 'recall', 'type'], default: 'recall' },
  tags: {
    type: [{ type: String, trim: true, maxlength: 24 }],
    default: [],
    validate: { validator: (tags: string[]) => tags.length <= 8, message: 'A card can have up to 8 tags.' },
  },
}, { timestamps: true })

const pendingCardSchema = new Schema({
  front: { type: String, required: true, trim: true, maxlength: 500 },
  back: { type: String, default: '', trim: true, maxlength: 2000 },
}, { _id: false })

type PendingCardBatch = { emailParts: string[]; cards: { front: string; back: string }[] }

const pendingCardBatchSchema = new Schema<PendingCardBatch>({
  emailParts: { type: [String], required: true },
  cards: { type: [pendingCardSchema], required: true },
}, { timestamps: true })

cardSchema.index({ userId: 1, folderId: 1 })
pendingCardBatchSchema.index({ emailParts: 1, createdAt: 1 })

export type UserDocument = InferSchemaType<typeof userSchema>
export const UserModel = mongoose.models.User ?? mongoose.model('User', userSchema)
export const FolderModel = mongoose.models.Folder ?? mongoose.model('Folder', folderSchema)
export const CardModel = mongoose.models.Card ?? mongoose.model('Card', cardSchema)
export const PendingCardBatchModel = mongoose.models.PendingCardBatch
  ? mongoose.model<PendingCardBatch>('PendingCardBatch')
  : mongoose.model<PendingCardBatch>('PendingCardBatch', pendingCardBatchSchema)
