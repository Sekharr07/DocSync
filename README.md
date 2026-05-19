# DocSync 🚀

A real-time collaborative document editor built with **CRDT (RGA algorithm)**, **JWT + bcrypt authentication**, **MongoDB**, **React + Monaco Editor**, and **WebSockets**.

# DocSync

A real-time collaborative document editor where multiple users can simultaneously edit the same document without conflicts. The system uses a custom RGA (Replicated Growable Array) CRDT to guarantee eventual consistency across replicas.

---

## Features ✨

- ⚡ Real-time collaboration with per-character CRDT operations
- 🔐 Custom RGA sequence CRDT ensuring mathematical convergence
- 🔁 Handles out-of-order operations and tombstones robustly
- 👥 User presence and remote cursors supported
- 📴 Offline-capable client design (local-first edits)
- 💾 Persistent storage using MongoDB (Mongoose)

---

## Architecture & Tech Stack 🧭

```
Frontend (React + Vite)  <-->  WebSocket (ws)  <-->  Backend (Node.js + Express)
                          \                         /
                           \-> CRDT core (shared package) <-/
```

| Layer        | Technology                  |
|--------------|----------------------------|
| Frontend     | React 18, Vite, Monaco     |
| Editor       | Monaco Editor              |
| Data Type    | Custom RGA CRDT (TypeScript)|
| Transport    | WebSocket (ws)             |
| Backend      | Node.js, Express           |
| Auth         | JWT (jsonwebtoken), bcryptjs|
| Database     | MongoDB (Mongoose)         |
| Monorepo     | npm workspaces             |

---

## Project Structure 📁

```
DocSync/
├── package.json                # monorepo root
├── README.md
└── packages/
    ├── client/                 # React app (Vite)
    │   ├── package.json
    │   └── src/
    │       ├── App.tsx
    │       ├── main.tsx
    │       └── components/
    │           ├── auth/
    │           └── editor/
    ├── crdt-core/              # shared CRDT implementation
    │   ├── package.json
    │   └── src/
    │       ├── char.ts
    │       ├── operation.ts
    │       └── rga.ts
    └── server/                 # Express + WebSocket server
        ├── package.json
        └── src/
            ├── index.ts
            ├── middleware/
            ├── models/
            └── routes/
```

---

## Getting Started 🏁

### Prerequisites ⚙️

- Node.js v18+
- MongoDB (local `mongod`) or a MongoDB Atlas connection

### Install 📦

From the repository root:

```bash
git clone <your-repo>
cd DocSync
npm install
```

### Environment 🛠️

Copy and edit the server example env file:

```bash
cp packages/server/.env.example packages/server/.env
# then edit packages/server/.env
```

Default development env values (example):

```env
PORT=3001
MONGODB_URI=mongodb://localhost:27017/docsync
JWT_SECRET=replace_this_with_a_long_random_string
CLIENT_URL=http://localhost:5173
```

### Build (CRDT core) 🏗️

```bash
npm run build --workspace=packages/crdt-core
```

### Run (development) ▶️

Start the server and client in two terminals:

Terminal 1 — Backend:

```bash
npm run dev --workspace=packages/server
```

Terminal 2 — Frontend:

```bash
npm run dev --workspace=packages/client
```

Open the app at 🌐 `http://localhost:5173` and create a document to begin collaborating.

---

## Testing 🧪

Run the CRDT tests:

```bash
npm test --workspace=packages/crdt-core
```

The test suite covers concurrent inserts/deletes, out-of-order delivery, tombstones, and convergence properties.

---

## Building for Production 🏷️

Compile and bundle the client and build the shared packages as needed:

```bash
npm run build --workspace=packages/crdt-core
npm run build --workspace=packages/client
```
---

## How it works

1. User registers/logs in → server returns a **JWT**
2. JWT is stored in `localStorage` and sent on every API request (`Authorization: Bearer ...`)
3. When opening an editor, a **WebSocket** is opened with the JWT in the query string
4. The server verifies the token, loads the document's operation log from MongoDB, and sends it to the client
5. The client replays all operations through the **RGA** to reconstruct the current document state
6. Every keystroke generates a CRDT Insert or Delete operation → sent over WebSocket → broadcast to all peers → applied to their local RGA
7. All replicas converge to the same text regardless of network ordering

---

## Troubleshooting 🐞

- 🚫 Server connection refused: ensure nothing else is using port `3001`.
- 🔗 MongoDB connection issues: verify `MONGODB_URI` and that `mongod` is running.
- 🧹 If test data needs resetting, stop the server and clear the database used for development.

---

