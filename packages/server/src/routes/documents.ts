import { Router, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { authenticate, AuthRequest } from "../middleware/auth";
import { CrdtDocument } from "../models/Document";
import { User } from "../models/User";

const router = Router();

// All document routes require auth
router.use(authenticate);

// GET /api/documents — list user's documents
router.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const docs = await CrdtDocument.find({
      $or: [{ owner: req.userId }, { collaborators: req.userId }],
    })
      .select("roomId title owner createdAt updatedAt")
      .populate("owner", "username")
      .sort({ updatedAt: -1 });

    res.json({ documents: docs });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/documents — create new document
router.post("/", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const roomId = uuidv4();
    const title = req.body.title || "Untitled Document";

    const doc = await CrdtDocument.create({
      roomId,
      title,
      owner: req.userId,
      collaborators: [],
      operations: [],
    });

    res.status(201).json({ document: doc });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/documents/:roomId — get document meta + op log
router.get("/:roomId", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const doc = await CrdtDocument.findOne({ roomId: req.params.roomId })
      .populate("owner", "username email");

    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    if (doc.owner.toString() !== req.userId && !doc.collaborators.some((id) => id.toString() === req.userId)) {
      doc.collaborators.push(req.userId as any);
      await doc.save();
    }

    res.json({ document: doc });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/documents/:roomId/collaborators — invite a collaborator by email
router.post("/:roomId/collaborators", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email } = req.body as { email?: string };

    if (!email) {
      res.status(400).json({ error: "Email is required" });
      return;
    }

    const doc = await CrdtDocument.findOne({ roomId: req.params.roomId });
    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    if (doc.owner.toString() !== req.userId) {
      res.status(403).json({ error: "Only the owner can invite collaborators" });
      return;
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (doc.owner.toString() === user._id.toString()) {
      res.status(400).json({ error: "Owner already has access" });
      return;
    }

    const alreadyCollaborator = doc.collaborators.some((id) => id.toString() === user._id.toString());
    if (!alreadyCollaborator) {
      doc.collaborators.push(user._id);
      await doc.save();
    }

    res.json({ success: true, collaborator: { id: user._id, email: user.email, username: user.username } });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/documents/:roomId — update title
router.patch("/:roomId", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const doc = await CrdtDocument.findOne({ roomId: req.params.roomId }).populate("collaborators");
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }

    if (doc.owner.toString() !== req.userId) {
      res.status(403).json({ error: "Only the owner can rename this document" });
      return;
    }

    doc.title = req.body.title || doc.title;
    await doc.save();
    res.json({ document: doc });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/documents/:roomId
router.delete("/:roomId", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const doc = await CrdtDocument.findOne({ roomId: req.params.roomId });
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }

    if (doc.owner.toString() !== req.userId) {
      res.status(403).json({ error: "Only the owner can delete this document" });
      return;
    }

    await doc.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
