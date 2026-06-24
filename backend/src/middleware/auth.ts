import { NextFunction, Request, Response } from "express";
import { prisma } from "../db";
import { verifyOAuthToken } from "../auth/oauth";

export interface AuthPayload {
  userId: string;
  partyId: string;
  token: string;
  role: string;
  status: string;
  agreementId?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user: AuthPayload;
    }
  }
}

export async function authenticateOAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  const oauthToken = header.slice(7);
  let identity: Awaited<ReturnType<typeof verifyOAuthToken>>;
  try {
    identity = await verifyOAuthToken(oauthToken);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid OAuth token";
    return res.status(401).json({ error: message });
  }

  const user = await prisma.user.findUnique({ where: { oauthSub: identity.sub } });
  if (!user) {
    return res.status(401).json({ error: "User not registered. Call POST /api/auth/oauth/login first." });
  }

  req.user = {
    userId: user.id,
    partyId: user.partyId ?? "",
    token: oauthToken,
    role: user.role,
    status: user.status,
    agreementId: user.agreementId,
  };
  return next();
}

export function requireOperator(req: Request, res: Response, next: NextFunction) {
  if (req.user?.status !== "ACTIVE") {
    return res.status(403).json({ error: "User is not approved yet" });
  }
  if (req.user?.role !== "operator") {
    return res.status(403).json({ error: "Operator role required" });
  }
  return next();
}

export function requireActiveUser(req: Request, res: Response, next: NextFunction) {
  if (req.user?.status !== "ACTIVE") {
    return res.status(403).json({ error: "User is not approved yet" });
  }
  return next();
}
