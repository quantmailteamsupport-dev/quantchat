import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface ZeroTrustUser {
  sub: string;
  email?: string;
  username?: string;
  sessionId?: string;
  livenessLevel?: string;
}

type SharedKernelAuthService = {
  verifyAccessToken: (token: string) => Promise<{
    sub: string;
    email?: string;
    username?: string;
    sessionId?: string;
    livenessLevel?: string;
  } | null>;
};

function readBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader !== "string") return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token || null;
}

async function verifyWithSharedKernel(token: string): Promise<ZeroTrustUser | null> {
  try {
    const mod = (await import("../../../../../../../shared-kernel/AuthenticationService.js")) as {
      authService?: SharedKernelAuthService;
    };
    const payload = await mod.authService?.verifyAccessToken(token);
    if (!payload?.sub) return null;
    return {
      sub: payload.sub,
      email: payload.email,
      username: payload.username,
      sessionId: payload.sessionId,
      livenessLevel: payload.livenessLevel,
    };
  } catch {
    return null;
  }
}

function verifyWithJwtSecret(token: string): ZeroTrustUser | null {
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
    };
  } catch {
    return null;
  }
}

/**
 * Express middleware – verifies Zero-Trust identity and attaches user to request.
 */
export async function requireBiometricAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = readBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  const sharedKernelUser = await verifyWithSharedKernel(token);
  const fallbackUser = sharedKernelUser ?? verifyWithJwtSecret(token);
  if (!fallbackUser?.sub) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  req.user = fallbackUser;
  req.authSessionId = fallbackUser.sessionId;
  next();
}

/**
 * Synchronous-looking wrapper for verifyAccessToken (now async).
 * Used by Socket.io handlers.
 */
export async function verifyBiometricToken(token: string) {
  const fromSharedKernel = await verifyWithSharedKernel(token);
  if (fromSharedKernel?.sub) return fromSharedKernel;
  return verifyWithJwtSecret(token);
}

// Backward compatibility for validateAuthConfig (noop now as shared-kernel handles it)
export function validateAuthConfig(): void {
  // Configured via AuthenticationService singleton
}

