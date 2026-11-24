# Cardly

A responsive flashcard app with personal accounts, folders, study sessions, and bulk card creation. React and Express run locally; MongoDB Atlas stores user accounts, folders, and cards.

## Run locally

1. Install Node.js 20.19+ (or 22.12+) and create a MongoDB Atlas cluster.
2. In Atlas, create a database user and allow your development IP address under **Network Access**.
3. Copy `.env.example` to `.env`. Set `MONGODB_URI` to the connection string Atlas gives you, and set `JWT_SECRET` to a random secret with at least 32 characters. Generate one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
4. Install dependencies and start both the web app and API:

   ```sh
   npm install
   npm run dev
   ```

5. Open the Vite URL printed in the terminal (normally `http://localhost:5173`) and create an account.

The API listens on port 4000. Vite proxies `/api` requests to it. The API will report a clear startup error if the database URI or session secret is missing.

To let one trusted account preload cards for the learner whose email contains both `battsetseg` and `uldekh`, set `CARD_IMPORT_ADMIN_EMAIL` to the trusted uploader's full Cardly email in the server environment. `CARD_IMPORT_TARGET_EMAIL_PARTS` defaults to `battsetseg,uldekh` and can be changed to another comma-separated set of matching fragments. The **Send cards** page appears only for the configured uploader. It accepts text lists (`term | definition`) and CSV files (`front,back` columns). Cards go directly to the learner if exactly one account matches; otherwise, no-match imports wait for signup, and ambiguous matches are rejected.

## Features

- Email and password accounts. Passwords are hashed; the signed session token is held in an HTTP-only cookie.
- Create, rename, color, and delete folders. Deleting a folder also deletes its cards.
- Create, edit, move, search, and delete individual cards. Add tags and save a preferred practice style on each card.
- Import up to 100 cards at once. Put one term on each line; use `term | definition` (or a tab) to fill in both sides. A term without a definition gets a blank back that can be filled in later.
- Study with Pair it, Guess it, Recall it, or Type it. Matching, answer feedback, animated card flips, and session progress are supported.
- Warm editorial sign-in, card editor, dashboard, and study screens adapt to mobile and desktop, with light/dark theme support.
- Switch the interface between English and Mongolian; the language preference is saved in this browser.
- Responsive layouts for mobile and desktop.

## MongoDB Atlas and 100 users

Atlas is a good fit for around 100 registered users and a typical flashcard workload. An Atlas free/shared cluster is useful for prototyping, but it does not guarantee capacity or availability for 100 people studying at the same time. For a public launch, monitor Atlas metrics and upgrade the cluster tier if concurrent usage, storage, or latency requires it.

Keep the Atlas database user limited to the app database, and never put `MONGODB_URI` or `JWT_SECRET` in frontend code. For production, set `NODE_ENV=production`, use HTTPS, use a strong unique `JWT_SECRET`, and serve the frontend and API on the same site so the secure session cookie works. Restrict Atlas network access to the deployment environment rather than allowing all IPs.

## Google Stitch MCP in VS Code

The workspace `.mcp.json` connects Copilot to Google's hosted Stitch MCP endpoint; there is no local server package to download. It reads the API key from the `STITCH_API_KEY` environment variable rather than storing the key in the project.

1. Create an API key in Stitch settings.
2. In Windows, open **Edit environment variables for your account**, add a user variable named `STITCH_API_KEY`, and set its value to the key. Don't commit or paste the key into project files or chat.
3. Fully restart VS Code so Copilot inherits the new environment variable.
4. Open **Chat: Open Customizations** → **MCP Servers**, review and enable/trust `stitch`, then start a new Copilot session and verify its tools.

If a key was previously saved directly in a project MCP file, revoke it in Stitch settings and create a replacement.

## Deploy on Render

The app is configured as one Render web service: Express serves both the built frontend and the API, and MongoDB Atlas remains the database.

1. Push the project to a GitHub repository. Keep `.env` private; it is ignored by Git.
2. In Render, choose **New → Blueprint**, connect that repository, and let Render use the root `render.yaml`.
3. Add `MONGODB_URI` in the Render service's environment settings using the Atlas connection string. The Blueprint asks Render to generate a unique `JWT_SECRET` automatically; it is stored as a private service variable.
4. In Atlas **Network Access**, allow the outbound IP addresses shown for your Render service. Avoid leaving database access open to all IPs.
5. Deploy and check `/api/health`. For a custom domain, set `CLIENT_URL` in Render to the exact HTTPS origin, then redeploy.

The Blueprint uses Render's free web-service plan, which may sleep when idle and cold-start on the next visit. Upgrade the service if you need it to stay responsive continuously.

## Commands

- `npm run dev` — start the API and frontend together.
- `npm run dev:api` — start only the API.
- `npm run build` — type-check the client and API, then create the frontend production build in `dist`.
- `npm run lint` — lint the project.
- `npm test` — run the word-list parser tests.

For a single-process production deployment, run `npm run build`, set `NODE_ENV=production` and the production environment values, then run `npm start`. The API serves the built frontend from `dist` and serves `/api` from the same origin. On Render, the app uses `RENDER_EXTERNAL_URL` for the allowed origin unless you override it with `CLIENT_URL`.
