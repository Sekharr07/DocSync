import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { URL } from "url";

import authRoutes from "./routes/auth";
import documentRoutes from "./routes/documents";
import inviteRoutes from "./routes/invites";
import { CrdtDocument } from "./models/Document";
import { verifyWsToken } from "./middleware/auth";
import {
  getRoomWithDoc,
  joinRoom,
  leaveRoom,
  broadcastToRoom,
  persistOperation,
  getRoomPresence,
  assignColor,
  Client,
} from "./services/room";
import { Operation } from "@crdts/crdt-core";

// ── Express ───────────────────────────────────────────────────────────────────

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173", credentials: true }));
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/invites", inviteRoutes);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// ── HTTP + WebSocket server ───────────────────────────────────────────────────

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", async (ws: WebSocket, req) => {
  const url = new URL(req.url!, `http://localhost`);
  const token = url.searchParams.get("token");
  const roomId = url.searchParams.get("roomId");

  if (!token || !roomId) {
    ws.close(4001, "Missing token or roomId");
    return;
  }

  const payload = verifyWsToken(token);
  if (!payload) {
    ws.close(4002, "Invalid token");
    return;
  }

  let room, title, opLog;
  try {
    ({ room, title, opLog } = await getRoomWithDoc(roomId));
  } catch (err) {
    console.error("[ws] Failed to load room:", err);
    ws.close(4003, "Failed to load document");
    return;
  }

  const siteId = uuidv4();
  const client: Client = {
    ws,
    userId: payload.userId,
    username: payload.username,
    siteId,
    color: assignColor(room),
  };

  joinRoom(room, client);

  ws.send(JSON.stringify({
    type: "init",
    siteId,
    color: client.color,
    title,
    opLog,
    presence: getRoomPresence(room).filter((p: any) => p.siteId !== siteId),
  }));

  console.log(`[ws] ${payload.username} joined room ${roomId} (${opLog.length} ops, "${title}")`);

  // Notify others of this user joining
  broadcastToRoom(room, {
    type: "presence",
    action: "join",
    siteId,
    username: payload.username,
    color: client.color,
  }, siteId);

  // ── Incoming messages ───────────────────────────────────────────────────────

  ws.on("message", async (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === "operation") {
        const op: Operation = msg.operation;
        // Apply to server-side RGA (keeps it in sync for future joiners)
        room.rga.applyOperation(op);
        // Persist to MongoDB
        await persistOperation(roomId, op);
        // Broadcast to all other clients in room
        broadcastToRoom(room, { type: "operation", operation: op }, siteId);
      }

      else if (msg.type === "cursor") {
        client.cursor = msg.cursor;
        broadcastToRoom(room, {
          type: "cursor",
          siteId,
          username: payload.username,
          color: client.color,
          cursor: msg.cursor,
        }, siteId);
      }

      else if (msg.type === "title") {
        const newTitle: string = msg.title || "Untitled Document";
        // Persist title change
        await CrdtDocument.updateOne({ roomId }, { $set: { title: newTitle } });
        // Broadcast to peers
        broadcastToRoom(room, { type: "title", title: newTitle }, siteId);
      }

    } catch (err) {
      console.error("[ws message]", err);
    }
  });

  ws.on("close", () => {
    leaveRoom(room, siteId);
    broadcastToRoom(room, {
      type: "presence",
      action: "leave",
      siteId,
      username: payload.username,
    });
    console.log(`[ws] ${payload.username} left room ${roomId}`);
  });

  ws.on("error", (err) => console.error("[ws error]", err));
});

// ── MongoDB + start ───────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/docsync";

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  });
