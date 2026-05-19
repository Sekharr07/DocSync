# Tech Stack Breakdown

This document provides a concise breakdown of the libraries, packages, and technologies used in DocSync and why they were chosen.

---

## 1. Frontend (React + Vite) 🎨

- **Vite**: Fast dev server and HMR for TypeScript React workspaces.
- **React (v18)**: UI framework; hooks-based components for precise rendering control.
- **Monaco Editor**: Rich editor with decoration APIs used for remote cursors and precise delta application.
- **React Router**: SPA routing and dynamic room URLs.

## 2. Core Math & Tests 🧮

- **TypeScript**: Shared types between client and server via npm workspaces.
- **Jest**: Unit and property tests for RGA convergence and safety under network anomalies.

## 3. Backend (Node.js & Express) ⚙️

- **Node.js**: Runtime for server and workers.
- **Express**: Lightweight HTTP layer for API endpoints and upgrades to WebSocket.
- **ws**: Minimal WebSocket implementation for low-overhead bidirectional messaging.

## 4. Storage (MongoDB) 💾

- **MongoDB (Mongoose)**: Document-oriented persistence for rooms and operation logs. Chosen for flexibility and familiarity in the existing codebase.

## 5. Monorepo Tooling & Scripts 🔧

- **npm workspaces**: Manage `packages/*` for shared code (`crdt-core`) and separate build/test flows.
- **npm scripts / Makefile**: Provide shortcuts to build, test, and run the client and server concurrently in development.

## 6. Why These Choices?

- The stack prioritizes developer ergonomics (Vite, TypeScript) and algorithmic correctness (plain TypeScript CRDTs with comprehensive tests).
- `ws` keeps the protocol minimal and transparent; application-layer features (presence, retries) are implemented in code rather than a heavy framework.

---

If you'd like, I can expand any section into more detail, add version recommendations, or produce per-package `README.md` files.
