import mongoose, { Document, Schema } from "mongoose";

export type InviteStatus = "pending" | "accepted" | "rejected";

export interface IInvite extends Document {
  _id: mongoose.Types.ObjectId;
  document: mongoose.Types.ObjectId;
  roomId: string;
  documentTitle: string;
  invitedBy: mongoose.Types.ObjectId;
  invitedEmail: string;
  invitedUser: mongoose.Types.ObjectId | null;
  status: InviteStatus;
  createdAt: Date;
  updatedAt: Date;
}

const InviteSchema = new Schema<IInvite>(
  {
    document:      { type: Schema.Types.ObjectId, ref: "Document", required: true },
    roomId:        { type: String, required: true },
    documentTitle: { type: String, required: true },
    invitedBy:     { type: Schema.Types.ObjectId, ref: "User", required: true },
    invitedEmail:  { type: String, required: true, lowercase: true, trim: true },
    invitedUser:   { type: Schema.Types.ObjectId, ref: "User", default: null },
    status:        { type: String, enum: ["pending", "accepted", "rejected"], default: "pending" },
  },
  { timestamps: true }
);

// Simple compound index — no partialFilterExpression (not supported on Atlas M0)
// Duplicate invite prevention is handled in the route logic instead
InviteSchema.index({ document: 1, invitedEmail: 1, status: 1 });

export const Invite = mongoose.model<IInvite>("Invite", InviteSchema);
