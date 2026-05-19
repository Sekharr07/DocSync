import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User";

export interface AuthRequest extends Request {
  userId?: string;
  username?: string;
}

interface JwtPayload {
  userId: string;
  username: string;
  iat: number;
  exp: number;
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "No token provided" });
      return;
    }

    const token = authHeader.slice(7);
    const secret = process.env.JWT_SECRET!;
    const payload = jwt.verify(token, secret) as JwtPayload;

    // Verify user still exists in DB
    const user = await User.findById(payload.userId).select("_id username");
    if (!user) {
      res.status(401).json({ error: "User no longer exists" });
      return;
    }

    req.userId = payload.userId;
    req.username = payload.username;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: "Token expired" });
    } else {
      res.status(401).json({ error: "Invalid token" });
    }
  }
}

export function generateToken(userId: string, username: string): string {
  return jwt.sign({ userId, username }, process.env.JWT_SECRET!, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  } as jwt.SignOptions);
}

// Lightweight WS token verifier (no DB check for performance)
export function verifyWsToken(token: string): { userId: string; username: string } | null {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    return { userId: payload.userId, username: payload.username };
  } catch {
    return null;
  }
}
