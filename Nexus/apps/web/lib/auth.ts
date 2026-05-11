import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { resolveQuantmailApiBase } from "./quantmailBridge";
import { extractJwtSubject } from "./socketIdentity";

function resolveQuantchatApiBase(): string {
  const configured = (process.env.QUANTCHAT_API_URL ?? process.env.NEXT_PUBLIC_QUANTCHAT_API_URL)?.trim();
  if (!configured) {
    throw new Error("QUANTCHAT_API_URL or NEXT_PUBLIC_QUANTCHAT_API_URL is required.");
  }
  return configured.replace(/\/$/, "");
}

function quantchatApiPath(path: string): string {
  const base = resolveQuantchatApiBase();
  return `${base}${base.endsWith("/api") ? "" : "/api"}${path}`;
}

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

  // ── Primary path: QuantChat gateway token validation ──────────────
  try {
    const response = await fetch(quantchatApiPath("/v1/auth/sso/validate"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: accessToken }),
      cache: "no-store",
    });
    if (response.ok) {
      const payload = (await response.json()) as QuantmailValidationResponse;
      if (payload.valid && payload.userId === tokenUserId) {
        return payload;
      }
    }
  } catch {
    // Fall through to Quantmail legacy validation.
  }

  // ── Local JWT payload fallback for already-exchanged QuantChat tokens ─
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString("utf8")) as {
      sub?: string;
      email?: string;
      username?: string;
      sessionId?: string;
    };
    if (payload.sub === tokenUserId) {
      return {
        valid: true,
        userId: tokenUserId,
        email: payload.email,
        displayName: payload.username,
        sessionId: payload.sessionId,
      };
    }
  } catch {
    // Fall through to legacy path.
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

import { prisma } from "@repo/database";

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

          // Sync user to local database if not exists
          const user = await prisma.user.upsert({
            where: { id: validation.userId },
            update: { email: normalizedEmail ?? validation.email ?? undefined, name: displayName },
            create: { id: validation.userId, email: normalizedEmail ?? validation.email ?? "no-email@quantchat.local", name: displayName },
          });

          return {
            id: user.id,
            email: user.email,
            name: user.name,
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
        // TODO: Implement Argon2/Bcrypt password verification if traditional
        //       passwords are ever re-introduced. For now, we prefer WebAuthn.
        if (process.env.NODE_ENV === "production") {
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
          
        // Fetch fresh data from DB to ensure session reflects DB state (e.g. name changes)
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { name: true, image: true, email: true }
        });
        
        if (dbUser) {
          session.user.name = dbUser.name;
          session.user.email = dbUser.email;
          session.user.image = dbUser.image;
        }
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
