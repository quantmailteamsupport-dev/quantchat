import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { resolveQuantmailApiBase } from "./quantmailBridge";
import { extractJwtSubject } from "./socketIdentity";

let generatedDevSecret: string | undefined;

function getDevSecret() {
  if (!generatedDevSecret) {
    generatedDevSecret =
      crypto.randomUUID().replace(/-/g, "") +
      crypto.randomUUID().replace(/-/g, "");
  }
  return generatedDevSecret;
}

function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;

  const normalized = value.trim().toLowerCase();
  const emailRegex =
    /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;

  return emailRegex.test(normalized) ? normalized : null;
}

interface QuantmailValidationResponse {
  valid: boolean;
  userId?: string;
  email?: string;
  displayName?: string;
  sessionId?: string;
}

/**
 * Validates a Quantmail-issued access token using two verification paths:
 *
 * 1. **Primary (Zero-Trust)**: Uses the shared-kernel AuthenticationService
 *    to cryptographically verify the JWT and cross-check the Prisma-backed
 *    session record. This is the canonical SSO path.
 *
 * 2. **Fallback (Legacy)**: Calls Quantmail's POST /auth/verify endpoint
 *    for legacy Master SSO tokens that predate the shared-kernel JWT format.
 *
 * Returns null if neither path can validate the token.
 */
async function validateQuantmailBridgeToken(
  accessToken: string,
): Promise<QuantmailValidationResponse | null> {
  const tokenUserId = extractJwtSubject(accessToken);
  if (!tokenUserId) {
    return null;
  }

  // ── Primary path: shared-kernel JWT verification ─────────────────
  // This uses the same AuthenticationService singleton that all 9 apps
  // share, verifying the HMAC-SHA256 signature, checking token expiry,
  // and confirming the Prisma-backed session is active (not revoked).
  try {
    const { authService } = await import(
      "@infinity-trinity/shared-kernel/AuthenticationService"
    );
    const payload = await authService.verifyAccessToken(accessToken);
    if (payload && payload.sub === tokenUserId) {
      return {
        valid: true,
        userId: payload.sub,
        email: payload.email,
        displayName: payload.username,
        sessionId: payload.sessionId,
      };
    }
  } catch {
    // Token is not a valid shared-kernel JWT; fall through to legacy path.
  }

  // ── Fallback path: Quantmail /auth/verify endpoint ───────────────
  // Handles Master SSO tokens issued by Quantmail's legacy crypto module.
  try {
    const response = await fetch(
      `${resolveQuantmailApiBase()}/auth/verify`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: accessToken }),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      user?: { id: string; email?: string; displayName?: string };
    };

    if (!payload.user || payload.user.id !== tokenUserId) {
      return null;
    }

    return {
      valid: true,
      userId: payload.user.id,
      email: payload.user.email,
      displayName: payload.user.displayName,
    };
  } catch {
    return null;
  }
}

const isProductionRuntime =
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PHASE !== "phase-production-build";

// Fail fast in production runtime if the secret is not configured.
if (isProductionRuntime && !process.env.NEXTAUTH_SECRET) {
  throw new Error(
    "NEXTAUTH_SECRET environment variable is required in production."
  );
}

export const authOptions: NextAuthOptions = {
  // In production the check above guarantees NEXTAUTH_SECRET is defined.
  // Development uses a per-process random fallback so builds can complete
  // without accidentally baking in a predictable shared secret.
  secret: process.env.NEXTAUTH_SECRET ?? getDevSecret(),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    // Google OAuth (configure GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET in env)
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
    // Email/password credentials
    CredentialsProvider({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        quantmailToken: { label: "Quantmail Token", type: "text" },
        quantmailRefreshToken: { label: "Quantmail Refresh Token", type: "text" },
        name: { label: "Display Name", type: "text" },
      },
      async authorize(credentials) {
        const quantmailToken =
          typeof credentials?.quantmailToken === "string"
            ? credentials.quantmailToken.trim()
            : "";

        if (quantmailToken) {
          const validation = await validateQuantmailBridgeToken(quantmailToken);
          if (!validation?.userId) {
            return null;
          }

          const normalizedEmail = normalizeEmail(
            typeof credentials?.email === "string" ? credentials.email : null,
          );
          const displayName =
            (typeof credentials?.name === "string" && credentials.name.trim()) ||
            normalizedEmail?.split("@")[0] ||
            validation.userId;

          return {
            id: validation.userId,
            email: normalizedEmail ?? undefined,
            name: displayName,
            accessToken: quantmailToken,
            refreshToken:
              typeof credentials?.quantmailRefreshToken === "string" &&
              credentials.quantmailRefreshToken.trim()
                ? credentials.quantmailRefreshToken.trim()
                : undefined,
            authProvider: "quantmail",
          };
        }

        if (!credentials?.email || !credentials?.password) return null;

        const normalizedEmail = normalizeEmail(credentials.email);
        if (!normalizedEmail) return null;

        // In production, look up the user in the database and verify their
        // hashed password. The demo below accepts any well-formed email so
        // the UI remains functional during local development without a
        // database connection.
        // TODO: Replace with `prisma.user.findUnique` + `bcrypt.compare`
        //       before deploying to production.
        if (process.env.NODE_ENV === "production") {
          // Credentials auth is intentionally disabled until a secure
          // password-verification flow is implemented.
          return null;
        }

        return {
          id: normalizedEmail,
          email: normalizedEmail,
          name: normalizedEmail.split("@")[0],
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.accessToken = user.accessToken;
        token.refreshToken = user.refreshToken;
        token.authProvider = user.authProvider ?? token.authProvider ?? "credentials";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as typeof session.user & { id: string }).id =
          token.id as string;
      }
      session.accessToken =
        typeof token.accessToken === "string" ? token.accessToken : undefined;
      session.refreshToken =
        typeof token.refreshToken === "string" ? token.refreshToken : undefined;
      session.authProvider =
        typeof token.authProvider === "string" ? token.authProvider : undefined;
      return session;
    },
  },
};
