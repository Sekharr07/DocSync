import WebSocket from "ws";
import { RGA, Operation } from "@crdts/crdt-core";
import { CrdtDocument, sanitizeOps } from "../models/Document";

export interface Client {
  ws: WebSocket;
  userId: string;
  username: string;
  siteId: string;
  color: string;
  cursor?: { line: number; column: number };
}

interface Room {
  roomId: string;
  rga: RGA;
  clients: Map<string, Client>;
}

const COLORS = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4",
  "#FECA57", "#FF9FF3", "#54A0FF", "#5F27CD",
];

const rooms = new Map<string, Room>();

export async function getRoomWithDoc(
  roomId: string
): Promise<{ room: Room; title: string; opLog: Operation[] }> {

  // .lean() returns a plain JS object — no Mongoose Document wrappers at all
  const doc = await CrdtDocument.findOne({ roomId }).lean();

  const title: string = doc?.title ?? "Untitled Document";
  const rawOps: any[] = doc?.operations ?? [];

  // Sanitize: explicitly reconstruct each op as a clean typed object
  const opLog = sanitizeOps(rawOps);

  console.log(`[room] "${title}" — ${rawOps.length} raw ops → ${opLog.length} valid ops`);

  // Reuse in-memory RGA if room is already warm (other users connected)
  let room = rooms.get(roomId);
  if (!room) {
    const rga = RGA.fromOps(`server-${roomId}`, opLog);
    room = { roomId, rga, clients: new Map() };
    rooms.set(roomId, room);
    console.log(`[room] Cold start — RGA built, text length: ${rga.getText().length}`);
  }

  return { room, title, opLog };
}

export function joinRoom(room: Room, client: Client): void {
  room.clients.set(client.siteId, client);
}

export function leaveRoom(room: Room, siteId: string): void {
  room.clients.delete(siteId);
  // Keep room in memory — RGA state preserved for reconnections
}

export function broadcastToRoom(room: Room, message: object, excludeSiteId?: string): void {
  const data = JSON.stringify(message);
  room.clients.forEach((client, sid) => {
    if (sid !== excludeSiteId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    }
  });
}

export async function persistOperation(roomId: string, op: Operation): Promise<void> {
  try {
    await CrdtDocument.updateOne(
      { roomId },
      { $push: { operations: op }, $set: { updatedAt: new Date() } }
    );
  } catch (err) {
    console.error("[persist]", err);
  }
}

export function getRoomPresence(room: Room): object[] {
  return Array.from(room.clients.values()).map((c) => ({
    siteId: c.siteId,
    username: c.username,
    color: c.color,
    cursor: c.cursor,
  }));
}

export function assignColor(room: Room): string {
  const used = new Set(Array.from(room.clients.values()).map((c) => c.color));
  return COLORS.find((c) => !used.has(c)) ?? COLORS[room.clients.size % COLORS.length];
}
