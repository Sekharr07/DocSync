import { Router, Response } from "express";
import { authenticate, AuthRequest } from "../middleware/auth";
import { Invite } from "../models/Invite";
import { CrdtDocument } from "../models/Document";
import { User } from "../models/User";

const router = Router();
router.use(authenticate);

// ── DEBUG: GET /api/invites/debug — see all invites in DB (remove in prod) ────
router.get("/debug", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.userId).select("email username");
    const allInvites = await Invite.find({}).lean();
    res.json({ currentUser: user, totalInvites: allInvites.length, invites: allInvites });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /api/invites ─────────────────────────────────────────────────────────
router.post("/", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { roomId, email } = req.body;

    if (!roomId || !email) {
      res.status(400).json({ error: "roomId and email are required" });
      return;
    }

    const doc = await CrdtDocument.findOne({ roomId });
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

    const isOwner = doc.owner.toString() === req.userId;
    const isCollaborator = doc.collaborators.map(String).includes(req.userId!);
    if (!isOwner && !isCollaborator) {
      res.status(403).json({ error: "You don't have access to this document" });
      return;
    }

    const inviter = await User.findById(req.userId).select("email");
    if (inviter?.email?.toLowerCase() === email.toLowerCase()) {
      res.status(400).json({ error: "You can't invite yourself" });
      return;
    }

    const inviteeUser = await User.findOne({ email: email.toLowerCase() }).select("_id email");
    if (inviteeUser) {
      const alreadyIn =
        doc.owner.toString() === inviteeUser._id.toString() ||
        doc.collaborators.map(String).includes(inviteeUser._id.toString());
      if (alreadyIn) {
        res.status(409).json({ error: "This user already has access to the document" });
        return;
      }
    }

    // Check for existing pending invite
    const existing = await Invite.findOne({
      document: doc._id,
      invitedEmail: email.toLowerCase(),
      status: "pending",
    });
    if (existing) {
      res.status(409).json({ error: "An invite has already been sent to this email" });
      return;
    }

    const invite = await Invite.create({
      document: doc._id,
      roomId,
      documentTitle: doc.title,
      invitedBy: req.userId,
      invitedEmail: email.toLowerCase(),
      invitedUser: inviteeUser?._id ?? null,
      status: "pending",
    });

    await invite.populate("invitedBy", "username email");

    console.log(`[invite] Created invite ${invite._id} for ${email} to doc ${roomId}`);

    res.status(201).json({
      invite,
      message: inviteeUser
        ? `Invite sent to ${email}. They'll see it in their dashboard.`
        : `Invite sent. ${email} will see it once they register.`,
    });
  } catch (err: any) {
    console.error("[invite send]", err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// ── GET /api/invites/incoming ─────────────────────────────────────────────────
router.get("/incoming", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.userId).select("email");
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    console.log(`[invite] Fetching incoming for ${user.email}`);

    const invites = await Invite.find({
      invitedEmail: user.email.toLowerCase(),
      status: "pending",
    })
      .populate("invitedBy", "username email")
      .sort({ createdAt: -1 });

    console.log(`[invite] Found ${invites.length} pending invites for ${user.email}`);

    res.json({ invites });
  } catch (err) {
    console.error("[invite incoming]", err);
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /api/invites/outgoing ─────────────────────────────────────────────────
router.get("/outgoing", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const invites = await Invite.find({ invitedBy: req.userId }).sort({ createdAt: -1 });
    res.json({ invites });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /api/invites/:id/accept ──────────────────────────────────────────────
router.post("/:id/accept", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.userId).select("email _id");
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    console.log(`[invite] Accept attempt — inviteId: ${req.params.id}, user: ${user.email}`);

    // FIX: Find by ID only first, then verify ownership — avoids email mismatch issues
    const invite = await Invite.findById(req.params.id);

    if (!invite) {
      console.log(`[invite] Invite ${req.params.id} not found in DB`);
      res.status(404).json({ error: "Invite not found" });
      return;
    }

    console.log(`[invite] Found invite — status: ${invite.status}, invitedEmail: ${invite.invitedEmail}, userEmail: ${user.email}`);

    if (invite.status !== "pending") {
      res.status(400).json({ error: `Invite already ${invite.status}` });
      return;
    }

    // Verify this invite is for this user (case-insensitive)
    if (invite.invitedEmail.toLowerCase() !== user.email.toLowerCase()) {
      console.log(`[invite] Email mismatch: invite=${invite.invitedEmail} user=${user.email}`);
      res.status(403).json({ error: "This invite is not for your account" });
      return;
    }

    // Add to collaborators and persist the document explicitly so accept
    // cannot succeed without the membership change actually being saved.
    const doc = await CrdtDocument.findById(invite.document);
    if (!doc) {
      console.log(`[invite] Document ${invite.document} not found for invite ${invite._id}`);
      res.status(404).json({ error: "Document not found" });
      return;
    }

    const userId = user._id.toString();
    const alreadyCollaborator = doc.collaborators.some((id) => id.toString() === userId);
    if (!alreadyCollaborator) {
      doc.collaborators.push(user._id as any);
      await doc.save();
    }

    // Mark accepted
    invite.status = "accepted";
    invite.invitedUser = user._id as any;
    await invite.save();

    console.log(`[invite] Accepted successfully — roomId: ${invite.roomId}`);

    res.json({ success: true, roomId: invite.roomId, documentTitle: invite.documentTitle });
  } catch (err) {
    console.error("[invite accept]", err);
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /api/invites/:id/reject ──────────────────────────────────────────────
router.post("/:id/reject", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.userId).select("email");
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const invite = await Invite.findById(req.params.id);

    if (!invite) {
      res.status(404).json({ error: "Invite not found" });
      return;
    }

    if (invite.status !== "pending") {
      res.status(400).json({ error: `Invite already ${invite.status}` });
      return;
    }

    if (invite.invitedEmail.toLowerCase() !== user.email.toLowerCase()) {
      res.status(403).json({ error: "This invite is not for your account" });
      return;
    }

    invite.status = "rejected";
    await invite.save();

    res.json({ success: true });
  } catch (err) {
    console.error("[invite reject]", err);
    res.status(500).json({ error: String(err) });
  }
});

// ── DELETE /api/invites/:id ───────────────────────────────────────────────────
router.delete("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const invite = await Invite.findOne({ _id: req.params.id, invitedBy: req.userId });
    if (!invite) { res.status(404).json({ error: "Invite not found" }); return; }
    await invite.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
