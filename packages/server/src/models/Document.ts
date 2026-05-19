import mongoose, { Document, Schema } from "mongoose";
import { Operation, InsertOperation, DeleteOperation } from "@crdts/crdt-core";

export interface IDocument extends Document {
  _id: mongoose.Types.ObjectId;
  roomId: string;
  title: string;
  owner: mongoose.Types.ObjectId;
  collaborators: mongoose.Types.ObjectId[];
  operations: any[];
  createdAt: Date;
  updatedAt: Date;
}

const DocumentSchema = new Schema<IDocument>(
  {
    roomId:  { type: String, required: true, unique: true, index: true },
    title:   { type: String, default: "Untitled Document", maxlength: 128 },
    owner:   { type: Schema.Types.ObjectId, ref: "User", required: true },
    collaborators: [{ type: Schema.Types.ObjectId, ref: "User" }],
    operations: { type: [Schema.Types.Mixed as any], default: [] },
  },
  { timestamps: true }
);

export const CrdtDocument = mongoose.model<IDocument>("Document", DocumentSchema);

// ── sanitizeOps ───────────────────────────────────────────────────────────────
// Handles two formats that may exist in MongoDB:
//
// OLD format (saved before the charId rename):
//   { _id: { siteId, clock }, type: "insert", value, parentId, siteId, clock }
//   Mongoose auto-added _id to each Mixed subdocument as the CharId object.
//
// NEW format (saved after the charId rename):
//   { charId: { siteId, clock }, type: "insert", value, parentId, siteId, clock }
//
// We detect which format each op uses and normalize to the new shape.
export function sanitizeOps(rawOps: any[]): Operation[] {
  const result: Operation[] = [];

  for (const raw of rawOps) {
    try {
      const op = typeof raw?.toObject === "function"
        ? raw.toObject({ versionKey: false })
        : { ...raw };

      if (!op || !op.type) continue;

      if (op.type === "insert") {
        // Resolve charId — try new field first, fall back to old _id field
        const cid = op.charId ?? op._id;

        // cid might be a Mongoose ObjectId string if truly auto-generated,
        // or it might be our { siteId, clock } object. Validate it.
        if (!cid || typeof cid !== "object" || cid.siteId == null) {
          console.warn("[sanitize] Skipping insert op — unresolvable charId:", JSON.stringify(op).slice(0, 120));
          continue;
        }

        const insert: InsertOperation = {
          type:     "insert",
          charId:   { siteId: String(cid.siteId), clock: Number(cid.clock) },
          value:    String(op.value ?? ""),
          parentId: op.parentId && op.parentId.siteId != null
            ? { siteId: String(op.parentId.siteId), clock: Number(op.parentId.clock) }
            : null,
          siteId:   String(op.siteId),
          clock:    Number(op.clock),
        };
        result.push(insert);

      } else if (op.type === "delete") {
        const tid = op.targetId;
        if (!tid || tid.siteId == null) {
          console.warn("[sanitize] Skipping delete op — missing targetId:", JSON.stringify(op).slice(0, 120));
          continue;
        }
        const del: DeleteOperation = {
          type:     "delete",
          targetId: { siteId: String(tid.siteId), clock: Number(tid.clock) },
          siteId:   String(op.siteId),
          clock:    Number(op.clock),
        };
        result.push(del);

      } else {
        console.warn("[sanitize] Unknown op type:", op.type);
      }
    } catch (err) {
      console.error("[sanitize] Error on op:", JSON.stringify(raw).slice(0, 120), err);
    }
  }

  console.log(`[sanitize] ${rawOps.length} raw → ${result.length} valid ops`);
  return result;
}
