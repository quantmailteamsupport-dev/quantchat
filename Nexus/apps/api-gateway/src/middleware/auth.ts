import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface ZeroTrustUser {
  sub: string;
  email?: string;
  username?: string;
  sessionId?: string;
  livenessLevel?: string;
}

export interface QuantChatTokenPayload extends ZeroTrustUser {
  aud?: string[] | string;
}

function readBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader !== "string") return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token || null;
}

function verifyWithJwtSecret(token: string): ZeroTrustUser | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is required for authentication");
  try {
    const decoded = jwt.verify(token, secret) as jwt.JwtPayload;
    const sub = typeof decoded.sub === "string" ? decoded.sub.trim() : "";
    if (!sub) return null;
    return {
      sub,
      email: typeof decoded.email === "string" ? decoded.email : undefined,
      username: typeof decoded.username === "string" ? decoded.username : undefined,
      sessionId: typeof decoded.sessionId === "string" ? decoded.sessionId : undefined,
      livenessLevel: typeof decoded.livenessLevel === "string" ? decoded.livenessLevel : undefined,
    };
  } catch {
    return null;
  }
}

export function verifyQuantChatToken(token: string): QuantChatTokenPayload | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  try {
    const decoded = jwt.verify(token, secret) as jwt.JwtPayload;
    const sub = typeof decoded.sub === "string" ? decoded.sub.trim() : "";
    if (!sub) return null;
    return {
      sub,
      email: typeof decoded.email === "string" ? decoded.email : undefined,
      username: typeof decoded.username === "string" ? decoded.username : undefined,
      sessionId: typeof decoded.sessionId === "string" ? decoded.sessionId : undefined,
      livenessLevel: typeof decoded.livenessLevel === "string" ? decoded.livenessLevel : undefined,
      aud: decoded.aud,
    };
  } catch {
    return null;
  }
}

export function issueQuantChatAccessToken(payload: ZeroTrustUser): { accessToken: string; expiresIn: number } {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is required to issue access tokens");
  const expiresIn = 60 * 60;
  const accessToken = jwt.sign(
    {
      sub: payload.sub,
      email: payload.email,
      username: payload.username,
      sessionId: payload.sessionId,
      livenessLevel: payload.livenessLevel,
      aud: ["quantchat"],
    },
    secret,
    { expiresIn },
  );
  return { accessToken, expiresIn };
}

/**
 * Express middleware – verifies Zero-Trust identity and attaches user to request.
 */
export function requireBiometricAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token = readBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  try {
    const user = verifyWithJwtSecret(token);
    if (!user?.sub) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }
    req.user = user;
    req.authSessionId = user.sessionId;
    next();
  } catch {
    res.status(500).json({ error: "Authentication service unavailable" });
  }
}

/**
 * Synchronous-looking wrapper for verifyAccessToken (now async).
 * Used by Socket.io handlers.
 */
export function verifyBiometricToken(token: string) {
  return verifyWithJwtSecret(token);
}

// Backward compatibility for validateAuthConfig.
export function validateAuthConfig(): void {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is required for authentication");
  }
}

