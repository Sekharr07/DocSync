# DocSync 🚀

A real-time collaborative document editor where multiple users can edit the same document simultaneously without conflicts. Built with a custom **RGA (Replicated Growable Array) CRDT**, **JWT + bcrypt authentication**, **MongoDB**, **React + Monaco Editor**, and **WebSockets** to ensure real-time sync and eventual consistency across all replicas.

---

## Features ✨

- ⚡ Real-time collaboration with per-character CRDT operations — no page reload needed
- 🔐 Register + Login with email/password — JWT authentication, bcrypt password hashing
- 📨 Email-based invite system — invite collaborators by email, accept/decline from dashboard
- 🔁 Custom RGA sequence CRDT ensuring mathematical convergence across replicas
- 🛡️ Handles out-of-order operations, ghost deletes, and concurrent inserts robustly
- 👥 User presence — live avatar indicators showing who is editing in real time
- 💾 Persistent document storage via MongoDB — documents and full operation log survive restarts
- 📋 Dashboard — create, rename, share, and delete documents; view pending invites
- 🎨 Dark aurora-themed UI with glass effects and gradient accents

---

## Architecture & Tech Stack 🧭

```
Frontend (React + Vite)  <-->  WebSocket (ws)  <-->  Backend (Node.js + Express)
                          \                         /
                           \-> crdt-core (shared package) <-/
                                        |
                                   MongoDB (Mongoose)
```

| Layer     | Technology                                             |
|-----------|--------------------------------------------------------|
| Frontend  | React 18, Vite, Monaco Editor                          |
| CRDT      | Custom RGA implementation (TypeScript, shared package) |
| Transport | WebSocket (`ws`)                                       |
| Backend   | Node.js, Express                                       |
| Auth      | JWT (`jsonwebtoken`), bcrypt (`bcryptjs`)               |
| Database  | MongoDB (Mongoose)                                     |
| Monorepo  | npm workspaces                                         |

---

## Project Structure 📁

```
DocSync/
├── package.json                    ← monorepo root
├── README.md
└── packages/
    ├── crdt-core/                  ← shared CRDT library (used by client AND server)
    │   └── src/
    │       ├── char.ts             ← CharId + Char types
    │       ├── operation.ts        ← InsertOperation + DeleteOperation types
    │       ├── rga.ts              ← RGA algorithm: localInsert, localDelete, applyRemote, fromOps
    │       └── rga.test.ts         ← Jest convergence tests
    ├── server/
    │   └── src/
    │       ├── index.ts            ← Express app + WebSocket server
    │       ├── middleware/
    │       │   └── auth.ts         ← JWT middleware + token generation + WS token verifier
    │       ├── models/
    │       │   ├── User.ts         ← Mongoose user schema (bcrypt pre-save hook)
    │       │   ├── Document.ts     ← Mongoose document schema + sanitizeOps()
    │       │   └── Invite.ts       ← Mongoose invite schema (pending/accepted/rejected)
    │       ├── routes/
    │       │   ├── auth.ts         ← POST /api/auth/register, /login, GET /me
    │       │   ├── documents.ts    ← CRUD /api/documents
    │       │   └── invites.ts      ← POST /api/invites, accept, reject, incoming, outgoing
    │       └── services/
    │           └── room.ts         ← In-memory room state + presence management
    └── client/
        └── src/
            ├── context/
            │   └── AuthContext.tsx     ← JWT storage, axios instance, login/register/logout
            ├── hooks/
            │   ├── useCrdt.ts          ← RGA ref, localInsert/Delete, applyRemote
            │   ├── useWebSocket.ts     ← WS connection with exponential backoff reconnect
            │   └── useInvites.ts       ← fetch incoming invites, accept, reject, sendInvite
            └── components/
                ├── auth/
                │   ├── AuthPage.tsx        ← Login + Register form
                │   └── ProtectedRoute.tsx  ← Redirect to /auth if not logged in
                └── editor/
                    ├── Dashboard.tsx       ← Document list, create, delete, copy link
                    ├── EditorPage.tsx      ← Monaco editor wired to CRDT + WebSocket
                    ├── InviteModal.tsx     ← Share modal: email invite + copy link
                    └── InvitePanel.tsx     ← Pending invites section on dashboard
```

---

## Getting Started 🏁

### Prerequisites ⚙️

- Node.js v18+
- MongoDB running locally (`mongod`) **or** a [MongoDB Atlas](https://www.mongodb.com/atlas) free account

### Install 📦

```bash
git clone https://github.com/Sekharr07/DocSync.git
cd DocSync
npm install
```

### Environment 🛠️

```bash
cp packages/server/.env.example packages/server/.env
```

Edit `packages/server/.env`:

```env
PORT=3001
MONGODB_URI=mongodb://localhost:27017/docsync
JWT_SECRET=replace_this_with_a_long_random_string_at_least_32_chars
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173
```

> **MongoDB Atlas:** replace `MONGODB_URI` with your Atlas connection string:
> `mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/docsync?retryWrites=true&w=majority`
> Then go to Atlas → **Network Access → Add IP Address → Allow from anywhere**.

### Build CRDT Core 🏗️

The shared package must be compiled before the server or client can import it:

```bash
npm run build --workspace=packages/crdt-core
```

### Run in Development ▶️

**Terminal 1 — Backend:**
```bash
npm run dev --workspace=packages/server
```

**Terminal 2 — Frontend:**
```bash
npm run dev --workspace=packages/client
```

Open **http://localhost:5173**, register an account, and create a document. To test collaboration, open the same document URL in a second browser window or incognito tab — changes appear instantly in both directions.

---

## How It Works

1. User registers or logs in → server returns a **JWT**
2. JWT is stored in `localStorage` and attached as `Authorization: Bearer ...` on every API request
3. When opening a document, a **WebSocket** is opened with the JWT in the query string
4. The server verifies the token, loads the document's full operation log from MongoDB, and sends it to the client in the `init` message
5. The client replays all operations through the **RGA** (`RGA.fromOps(...)`) to reconstruct the current document state
6. Every keystroke generates a CRDT `Insert` or `Delete` operation → sent over WebSocket → broadcast to all peers → applied to their local RGA
7. All replicas converge to the same text regardless of message arrival order

### Why the editor doesn't loop infinitely

Monaco Editor's `onDidChangeModelContent` fires asynchronously — any boolean flag set before `setValue()` is already cleared by the time the event fires. The solution used here is to **dispose the listener entirely** before writing remote changes to Monaco, then re-attach it afterwards. This means there is literally no listener present during remote writes, making it impossible for remote changes to be misidentified as local edits and re-broadcast.

---

## Invite System 📨

1. Open a document and click **＋ Share** in the header
2. Enter the invitee's email and click **Send invite**
3. The invite is stored in MongoDB linked to the document and the invitee's email
4. When the invitee logs into their dashboard, a **🔔 Pending Invites** panel appears
5. Clicking **Accept** adds them as a collaborator and navigates them into the editor; the document appears in their dashboard permanently
6. Clicking **Decline** marks the invite rejected and removes it from their list

> **Note:** Invites are in-app only — no actual email is delivered. The invitee must already have a DocSync account registered with the same email address.

---

## API Reference

All endpoints except register and login require `Authorization: Bearer <token>`.

### Auth

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | `{ email, username, password }` | Create account, returns JWT |
| POST | `/api/auth/login` | `{ email, password }` | Login, returns JWT |
| GET | `/api/auth/me` | — | Returns current user |

### Documents

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | `/api/documents` | — | List owned + collaborating documents |
| POST | `/api/documents` | `{ title? }` | Create a new document |
| GET | `/api/documents/:roomId` | — | Get document metadata + op log |
| PATCH | `/api/documents/:roomId` | `{ title }` | Rename document (owner only) |
| DELETE | `/api/documents/:roomId` | — | Delete document (owner only) |

### Invites

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/api/invites` | `{ roomId, email }` | Send an invite |
| GET | `/api/invites/incoming` | — | List pending invites for current user |
| GET | `/api/invites/outgoing` | — | List invites sent by current user |
| POST | `/api/invites/:id/accept` | — | Accept invite, become collaborator |
| POST | `/api/invites/:id/reject` | — | Decline invite |
| DELETE | `/api/invites/:id` | — | Cancel a sent invite (sender only) |

### WebSocket

Connect to `ws://localhost:3001?roomId=<roomId>&token=<jwt>`

| Type | Direction | Payload |
|------|-----------|---------|
| `init` | Server → Client | `{ siteId, color, title, opLog, presence }` |
| `operation` | Bidirectional | `{ operation: InsertOp \| DeleteOp }` |
| `cursor` | Bidirectional | `{ cursor: { line, column } }` |
| `presence` | Server → Client | `{ action: "join"\|"leave", siteId, username, color }` |
| `title` | Bidirectional | `{ title: string }` |

---

## Notes for Contributors

### `charId` not `id`

`InsertOperation` uses the field name `charId` rather than `id`. This is intentional. Mongoose has a built-in virtual `.id` getter on every document and subdocument that returns `_id` as a string. When operations with a field named `id` are stored in a MongoDB `Mixed` array and retrieved, Mongoose shadows the custom field with its own getter, silently corrupting the CRDT data. Renaming to `charId` sidesteps this permanently.

### `sanitizeOps()`

Operations are retrieved with `.lean()` (plain JS objects, no Mongoose wrappers) then explicitly reconstructed by `sanitizeOps()` in `Document.ts`. This guarantees the exact `{ siteId, clock }` shape the RGA expects regardless of Mongoose or MongoDB version differences.

### Room memory model

Rooms stay in memory as long as the server is running. When the last user leaves, the room is kept (RGA state preserved for fast reconnects). On a cold server start the room is rebuilt from the MongoDB operation log via `RGA.fromOps()`.

---

## Testing 🧪

```bash
npm test --workspace=packages/crdt-core
```

Covers: local insert/delete, concurrent inserts (convergence), out-of-order delivery, ghost deletes, idempotency, and full `fromOps` round-trip reconstruction.

---

## Known Limitations

- **Tombstone accumulation** — deleted characters are marked with a tombstone flag but never physically removed from the RGA. Long heavily-edited documents accumulate invisible nodes over time. Production CRDT systems (e.g. Yjs) implement garbage collection; this project does not.
- **Plaintext only** — Monaco is configured in `plaintext` mode. Rich text (bold, headings, code blocks) is not supported.
- **In-app invites only** — the invite system does not send actual emails. Invitees must already have a DocSync account.
- **No read-only mode** — any logged-in user who opens a share link can edit the document.
- **Single server** — the WebSocket relay is a single Node.js process. Horizontal scaling would require a pub/sub layer (e.g. Redis) to broadcast between instances.

---

## Troubleshooting 🐞

**`Cannot find module '@crdts/crdt-core'`**

The shared package needs to be compiled first:
```bash
npm run build --workspace=packages/crdt-core
npm install
```

**MongoDB connection timeout (ETIMEOUT)**

- For Atlas: whitelist your IP under **Network Access → Add IP Address → Allow from anywhere (`0.0.0.0/0`)**
- For Atlas: check the cluster isn't paused — free tier clusters pause after inactivity; click **Resume**
- Double-check `MONGODB_URI` in `.env` — the password must be your **database user** password, not your Atlas account password

**Documents not loading after server restart**

Check server logs for `[sanitize] X raw → Y valid ops`. If `Y` is 0 but `X` is not, the operations in MongoDB may be in a legacy format. Delete the affected documents from MongoDB Compass and recreate them.

**401 Unauthorized on API calls**

Log out and log back in to reset the token. On first load the axios interceptor may not be ready before the first request fires.

---

## Building for Production 🏷️

```bash
npm run build --workspace=packages/crdt-core
npm run build --workspace=packages/server
npm run build --workspace=packages/client
```

- Client output: `packages/client/dist` — serve with any static host (Vercel, Netlify, Nginx)
- Server output: `packages/server/dist/index.js` — run with `node packages/server/dist/index.js`

---

