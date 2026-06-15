import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db";

export interface AuthPayload {
  userId: string;
  partyId: string;
  token: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user: AuthPayload;
    }
  }
}

export async function authenticateJWT(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  const appToken = header.slice(7);
  try {
    const decoded = jwt.verify(appToken, process.env.JWT_SECRET!) as { userId: string };
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) return res.status(401).json({ error: "User not found" });

    req.user = {
      userId: user.id,
      partyId: user.partyId,
      token: user.partyToken,
      role: user.role,
    };
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireOperator(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "operator") {
    return res.status(403).json({ error: "Operator role required" });
  }
  return next();
}
