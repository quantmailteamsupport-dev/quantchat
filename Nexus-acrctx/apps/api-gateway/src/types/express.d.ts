import type { ZeroTrustUser } from "../middleware/auth";

declare global {
  namespace Express {
    interface Request {
      user?: ZeroTrustUser;
      authSessionId?: string;
    }
  }
}

export {};
