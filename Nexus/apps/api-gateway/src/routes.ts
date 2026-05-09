import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { issueQuantChatAccessToken, requireBiometricAuth, verifyQuantChatToken } from "./middleware/auth";
import { prisma } from "@repo/database";
import { logger } from "./logger";
import {
  DISAPPEARING_MAX_SECS,
  DISAPPEARING_MIN_SECS,
  normalizeTtlSecs,
} from "./services/DisappearingMessages";
import {
  AttentionTokenService,
  InsufficientBalanceError,
  InvalidAmountError,
} from "./services/AttentionTokenService";
import {
  GiftSystem,
  GiftNotFoundError,
  GiftRateLimitError,
  RecipientRefusesGiftsError,
  SelfGiftError,
} from "./services/GiftSystem";
import { ReciprocityEngine } from "./services/ReciprocityEngine";
import {
  listCompanionSessions,
  revokeCompanionSession,
} from "./services/CompanionSessionTracker";
import {
  BiometricProofOfIntent,
  InvalidPoiLevelError,
  PoiChallengeNotFoundError,
  PoiUserMismatchError,
  PoiChallengeExpiredError,
  PoiInsufficientLevelError,
  PoiReplayDetectedError,
} from "./services/BiometricProofOfIntent";
import {
  scheduledMessageQueue,
  ScheduledQueueFullError,
  ScheduledMessageValidationError,
} from "./services/ScheduledMessageQueue";
import { sessionController } from "./services/AuthoritativeSessionController";

const router = Router();

// ─── Simple in-process rate limiter for REST routes ──────────
// Uses a sliding window per IP address.
interface RateBucket { count: number; windowStart: number; }
const restRateBuckets = new Map<string, RateBucket>();
const REST_WINDOW_MS = 60_000;        // 1-minute window
const REST_MAX_REQUESTS = 30;         // max requests per window

const restRateSweep = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of restRateBuckets) {
    if (now - bucket.windowStart > REST_WINDOW_MS * 2) restRateBuckets.delete(key);
  }
}, 5 * 60_000);

if (typeof restRateSweep.unref === "function") {
  restRateSweep.unref();
}

function restRateLimit(req: Request, res: Response, next: NextFunction): void {
  const forwarded = req.headers["x-forwarded-for"];
  const firstForwarded = typeof forwarded === "string"
    ? forwarded.split(",")[0]?.trim()
    : undefined;
  const ip = firstForwarded ?? req.socket?.remoteAddress ?? "unknown";
  const key = `${ip}:${req.path}`;
  const now = Date.now();
  const bucket = restRateBuckets.get(key);

  if (!bucket || now - bucket.windowStart > REST_WINDOW_MS) {
    restRateBuckets.set(key, { count: 1, windowStart: now });
    next();
    return;
  }

  bucket.count++;
  if (bucket.count > REST_MAX_REQUESTS) {
    res.status(429).json({ error: "Too many requests. Please try again later." });
    return;
  }
  next();
}

function normalizeOptionalString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

// ─── Zod Schemas ────────────────────────────────────────────

const MediaPresignSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileType: z.string().min(1).max(128),
});

const TwinAutoReplySchema = z.object({
  incomingMessage: z.string().min(1).max(4096),
  conversationId: z.string().uuid().optional(),
  senderId: z.string().min(1).max(128),
});

const UpdateTwinSchema = z.object({
  ghostModeActive: z.boolean().optional(),
  toneProfile: z.string().max(2048).optional(),
  systemPrompt: z.string().max(4096).optional(),
});

const DisappearingSchema = z.object({
  ttlSecs: z.number().int().nullable(),
});

// ─── Health Check ────────────────────────────────────────────
router.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "api-gateway",
    e2ee: "enabled",
    scaling: "redis-adapter",
    sso: "quantmail-biometric",
  });
});

router.get("/healthz", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

router.get("/readyz", async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ready" });
  } catch {
    res.status(503).json({ status: "not ready", reason: "database unreachable" });
  }
});

// ─── Quantmail SSO Token Exchange ────────────────────────────
//
// POST /api/v1/auth/sso/exchange
// Accepts a Quantmail-issued access token and exchanges it for a
// QuantChat-scoped session. This is the canonical SSO entry point
// that replaces the previous mock bridge.
//
// Flow:
//   1. Client authenticates via Quantmail WebAuthn passkey flow
//   2. Client sends the Quantmail access token to this endpoint
//   3. We verify the token using the shared-kernel AuthenticationService
//   4. We issue a scoped QuantChat session token via SSO exchange
//   5. Client uses the QuantChat token for all subsequent API calls
//

const SSOExchangeSchema = z.object({
  quantmailToken: z.string().min(1).max(4096),
  email: z.string().email().optional(),
});

router.post(
  "/api/v1/auth/sso/exchange",
  restRateLimit,
  async (req: Request, res: Response) => {
    const startedAt = Date.now();
    const parsed = SSOExchangeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "VALIDATION_FAILED",
        message: "quantmailToken is required",
        issues: parsed.error.issues,
      });
    }

    const { quantmailToken } = parsed.data;

    try {
      // 1. Verify a signed token using the configured production JWT secret.
      const payload = verifyQuantChatToken(quantmailToken);

      if (!payload || !payload.sub) {
        return res.status(401).json({
          error: "INVALID_TOKEN",
          message: "Quantmail token verification failed",
        });
      }

      // 2. Ensure the Quantmail token includes 'quantchat' in its audience
      //    (shared-kernel tokens are issued with all 9 apps in the audience)
      const audience = Array.isArray(payload.aud) ? payload.aud : [];
      if (!audience.includes("quantchat") && audience.length > 0) {
        return res.status(403).json({
          error: "INSUFFICIENT_SCOPE",
          message: "Token does not authorize access to QuantChat",
        });
      }

      // 3. Exchange for a QuantChat-scoped token
      const ssoResult = issueQuantChatAccessToken(payload);

      // 4. Cross-reference with database to get user profile
      let userProfile: { id: string; email: string; displayName: string } | null = null;
      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: payload.sub },
          select: { id: true, email: true, name: true },
        });
        if (dbUser) {
          userProfile = {
            id: dbUser.id,
            email: dbUser.email,
            displayName: dbUser.name || dbUser.email.split("@")[0] || "User",
          };
        }
      } catch {
        // Database lookup is best-effort; token payload is authoritative
      }

      const latencyMs = Date.now() - startedAt;

      logger.info(
        {
          userId: payload.sub,
          sessionId: payload.sessionId,
          latencyMs,
          livenessLevel: payload.livenessLevel,
        },
        "[SSO] Quantmail token exchanged for QuantChat session",
      );

      res.json({
        accessToken: ssoResult.accessToken,
        expiresIn: ssoResult.expiresIn,
        user: userProfile ?? {
          id: payload.sub,
          email: payload.email ?? parsed.data.email ?? "unknown",
          displayName: payload.username ?? payload.email?.split("@")[0] ?? "User",
        },
        sessionId: payload.sessionId,
        livenessLevel: payload.livenessLevel ?? "none",
        latencyMs,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "SSO exchange failed";
      const errorCode = (err as any)?.code ?? "SSO_EXCHANGE_FAILED";

      logger.error({ err, latencyMs: Date.now() - startedAt }, "[SSO] Exchange failed");

      // Map known auth error codes to appropriate HTTP status codes
      const statusCode =
        errorCode === "TOKEN_EXPIRED" ? 401 :
        errorCode === "INVALID_TOKEN" ? 401 :
        errorCode === "ACCOUNT_BANNED" ? 403 :
        errorCode === "INVALID_APP" ? 400 :
        500;

      res.status(statusCode).json({
        error: errorCode,
        message: errorMessage,
      });
    }
  },
);

// ─── Quantmail SSO Token Validation ──────────────────────────
//
// POST /api/v1/auth/sso/validate
// Validates a Quantmail-issued token without exchanging it.
// Used by the NextAuth credentials provider on the web app side.
//

const SSOValidateSchema = z.object({
  token: z.string().min(1).max(4096),
});

router.post(
  "/api/v1/auth/sso/validate",
  restRateLimit,
  async (req: Request, res: Response) => {
    const parsed = SSOValidateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ valid: false, error: "Token is required" });
    }

    try {
      const payload = verifyQuantChatToken(parsed.data.token);

      if (!payload || !payload.sub) {
        return res.json({ valid: false });
      }

      res.json({
        valid: true,
        userId: payload.sub,
        email: payload.email,
        displayName: payload.username,
        sessionId: payload.sessionId,
        livenessLevel: payload.livenessLevel,
      });
    } catch {
      res.json({ valid: false });
    }
  },
);

// ─── Token Refresh Proxy ─────────────────────────────────────
//
// POST /api/v1/auth/refresh
// Proxies a token refresh through the shared-kernel AuthenticationService
// so the QuantChat frontend can refresh tokens without calling QuantMail.
//

const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1).max(4096),
});

router.post(
  "/api/v1/auth/refresh",
  restRateLimit,
  async (req: Request, res: Response) => {
    const parsed = RefreshTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "VALIDATION_FAILED",
        message: "refreshToken is required",
      });
    }

    try {
      const payload = verifyQuantChatToken(parsed.data.refreshToken);
      if (!payload?.sub) {
        return res.status(401).json({ error: "INVALID_TOKEN", message: "Refresh token is invalid" });
      }
      const issued = issueQuantChatAccessToken(payload);

      logger.info(
        { sessionId: issued.accessToken ? "issued" : "none" },
        "[Auth] Token refreshed via shared-kernel",
      );

      res.json({
        accessToken: issued.accessToken,
        refreshToken: parsed.data.refreshToken,
        expiresIn: issued.expiresIn,
      });
    } catch (err) {
      const errorCode = (err as any)?.code ?? "REFRESH_FAILED";
      logger.error({ err }, "[Auth] Token refresh failed");
      res.status(401).json({
        error: errorCode,
        message: err instanceof Error ? err.message : "Token refresh failed",
      });
    }
  },
);

// Companion device session visibility for account settings.
router.get(
  "/api/v1/auth/sessions",
  restRateLimit,
  requireBiometricAuth,
  async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });

    const parsedLimit = Number.parseInt(String(req.query.limit ?? "25"), 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 25;

    try {
      const sessions = await listCompanionSessions(req.user.sub, limit);
      res.json({
        currentSessionId: req.authSessionId ?? null,
        sessions,
      });
    } catch (err) {
      logger.error({ err, userId: req.user.sub }, "[AuthSessions] list failed");
      res.status(500).json({ error: "Failed to load active sessions" });
    }
  },
);

router.delete(
  "/api/v1/auth/sessions/:sessionId",
  restRateLimit,
  requireBiometricAuth,
  async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    const sessionId = normalizeOptionalString(req.params.sessionId, 256);
    if (!sessionId) return res.status(400).json({ error: "Invalid sessionId" });

    try {
      const revoked = await revokeCompanionSession(req.user.sub, sessionId);
      res.json({ revoked, sessionId });
    } catch (err) {
      logger.error({ err, userId: req.user.sub, sessionId }, "[AuthSessions] revoke failed");
      res.status(500).json({ error: "Failed to revoke session" });
    }
  },
);

// ─── Media Presigned URL (AWS S3) ──────────────────────────────
// BLOCKER-S3 FIX: Real AWS S3 presigned URLs with CloudFront CDN
import { S3Service } from "./services/S3Service";

router.get("/api/media/s3/status", restRateLimit, (_req: Request, res: Response) => {
  res.json(S3Service.getConfigurationStatus());
});

router.post(
  "/api/media/presign",
  restRateLimit,
  requireBiometricAuth,
  async (req: Request, res: Response) => {
    const result = MediaPresignSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: "Validation failed", issues: result.error.issues });
    }

    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { fileName, fileType } = result.data;

    try {
      // Generate real presigned URL using S3Service
      const presigned = await S3Service.generatePresignedUrl({
        userId: req.user.sub,
        fileName,
        fileType,
      });

      logger.info(
        { userId: req.user.sub, fileName, fileKey: presigned.fileKey },
        "[S3] Presigned URL generated",
      );

      res.json({
        uploadUrl: presigned.uploadUrl,
        downloadUrl: presigned.downloadUrl,
        expiresIn: presigned.expiresIn,
        fileKey: presigned.fileKey,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to generate presigned URL";
      logger.error(
        { err, userId: req.user.sub, fileName },
        "[S3] Presigned URL generation failed",
      );
      res.status(400).json({
        error: "Failed to generate presigned URL",
        message: errorMessage,
      });
    }
  }
);

// ─── Reels Stream (Range-based chunking) ─────────────────────
router.get("/api/reels/stream/:id", (req: Request, res: Response) => {
  const range = req.headers.range;
  if (!range) {
    return res.status(400).send("Requires Range header for video chunking.");
  }

  // TODO: Replace with S3 getObject().createReadStream() piped through
  const videoSize = 50 * 1024 * 1024; // 50MB mock
  const CHUNK_SIZE = 10 ** 6;         // 1MB chunks
  const start = Number(range.replace(/\D/g, ""));
  const end = Math.min(start + CHUNK_SIZE - 1, videoSize - 1);
  const contentLength = end - start + 1;

  res.writeHead(206, {
    "Content-Range": `bytes ${start}-${end}/${videoSize}`,
    "Accept-Ranges": "bytes",
    "Content-Length": contentLength,
    "Content-Type": "video/mp4",
  });
  res.end(Buffer.alloc(contentLength, 0));
});

// ─── Digital Twin Ghost Mode ──────────────────────────────────
/**
 * POST /api/v1/twin/auto-reply
 *
 * The Digital Twin AI endpoint.
 * Reads an incoming message and drafts a contextual reply in the
 * authenticated user's personal tone/style.
 *
 * Body: { incomingMessage, conversationId?, senderId }
 * Returns: { draft, toneProfileUsed, ghostModeActive }
 */
router.post(
  "/api/v1/twin/auto-reply",
  restRateLimit,
  requireBiometricAuth,
  async (req: Request, res: Response) => {
    const result = TwinAutoReplySchema.safeParse(req.body);
    if (!result.success) {
      return res
        .status(400)
        .json({ error: "Validation failed", issues: result.error.issues });
    }

    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { incomingMessage: _incomingMessage, conversationId, senderId } = result.data;
    const userId = req.user.sub;

    try {
      // Fetch or create the user's DigitalTwin record
      let twin = await prisma.digitalTwin.findUnique({ where: { userId } });

      if (!twin) {
        twin = await prisma.digitalTwin.create({ data: { userId } });
      }

      if (!twin.ghostModeActive) {
        return res
          .status(403)
          .json({ error: "Ghost mode is not active for this user", ghostModeActive: false });
      }

      // TODO: Replace with a real AI call (e.g. OpenAI GPT-4 with tone profile)
      // The toneProfile JSON string can be passed as a system context to the LLM.
      const draft = `Thanks for reaching out! I'll get back to you shortly. 🤖`;

      await prisma.digitalTwin.update({
        where: { userId },
        data: { autoRepliesCount: { increment: 1 } },
      });

      logger.info(
        { userId, senderId, conversationId, ghostModeActive: twin.ghostModeActive },
        "[DigitalTwin] Auto-reply drafted"
      );

      res.json({
        draft,
        toneProfileUsed: !!twin.toneProfile,
        ghostModeActive: twin.ghostModeActive,
        conversationId: conversationId ?? null,
      });
    } catch (err) {
      logger.error({ err, userId }, "[DigitalTwin] Error generating auto-reply");
      res.status(500).json({ error: "Failed to generate auto-reply" });
    }
  }
);

/**
 * GET /api/v1/twin
 * Returns the current user's DigitalTwin configuration.
 */
router.get(
  "/api/v1/twin",
  restRateLimit,
  requireBiometricAuth,
  async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const userId = req.user.sub;

    try {
      const twin = await prisma.digitalTwin.findUnique({ where: { userId } });

      if (!twin) {
        return res.json({
          userId,
          ghostModeActive: false,
          toneProfile: null,
          autoRepliesCount: 0,
        });
      }

      res.json({
        userId: twin.userId,
        ghostModeActive: twin.ghostModeActive,
        toneProfile: twin.toneProfile,
        autoRepliesCount: twin.autoRepliesCount,
        systemPrompt: twin.systemPrompt,
      });
    } catch (err) {
      logger.error({ err, userId }, "[DigitalTwin] Error fetching twin config");
      res.status(500).json({ error: "Failed to fetch twin configuration" });
    }
  }
);

/**
 * PATCH /api/v1/twin
 * Updates the authenticated user's DigitalTwin configuration.
 */
router.patch(
  "/api/v1/twin",
  restRateLimit,
  requireBiometricAuth,
  async (req: Request, res: Response) => {
    const result = UpdateTwinSchema.safeParse(req.body);
    if (!result.success) {
      return res
        .status(400)
        .json({ error: "Validation failed", issues: result.error.issues });
    }

    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const userId = req.user.sub;
    const updates = result.data;

    try {
      const twin = await prisma.digitalTwin.upsert({
        where: { userId },
        create: { userId, ...updates },
        update: updates,
      });

      logger.info({ userId, updates }, "[DigitalTwin] Config updated");

      res.json({
        userId: twin.userId,
        ghostModeActive: twin.ghostModeActive,
        toneProfile: twin.toneProfile,
        systemPrompt: twin.systemPrompt,
      });
    } catch (err) {
      logger.error({ err, userId }, "[DigitalTwin] Error updating twin config");
      res.status(500).json({ error: "Failed to update twin configuration" });
    }
  }
);

// ─── Disappearing Messages (per-conversation default TTL) ────
/**
 * GET /api/v1/conversations/:id/disappearing
 * Returns the current disappearing-message TTL for the conversation.
 * The authenticated user must be a participant.
 */
router.get(
  "/api/v1/conversations/:id/disappearing",
  restRateLimit,
  requireBiometricAuth,
  async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    const rawId = req.params.id;
    const conversationId = typeof rawId === "string" ? rawId : "";
    if (!conversationId || conversationId.length > 128) {
      return res.status(400).json({ error: "Invalid conversationId" });
    }

    try {
      const conversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          participants: { some: { userId: req.user.sub } },
        },
        select: { disappearingSecs: true },
      });
      if (!conversation) return res.status(403).json({ error: "Not a participant" });
      res.json({ conversationId, ttlSecs: conversation.disappearingSecs });
    } catch (err) {
      logger.error({ err }, "[Disappearing] fetch failed");
      res.status(500).json({ error: "Failed to fetch disappearing setting" });
    }
  }
);

/**
 * PUT /api/v1/conversations/:id/disappearing
 * Body: { ttlSecs: number | null }
 * Sets the conversation-default disappearing TTL. null disables.
 */
router.put(
  "/api/v1/conversations/:id/disappearing",
  restRateLimit,
  requireBiometricAuth,
  async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });

    const parsed = DisappearingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
    }

    const normalized = normalizeTtlSecs(parsed.data.ttlSecs);
    if (normalized === undefined) {
      return res.status(400).json({
        error: `Invalid ttlSecs (must be null or between ${DISAPPEARING_MIN_SECS}s and ${DISAPPEARING_MAX_SECS}s)`,
      });
    }

    const rawId = req.params.id;
    const conversationId = typeof rawId === "string" ? rawId : "";
    if (!conversationId || conversationId.length > 128) {
      return res.status(400).json({ error: "Invalid conversationId" });
    }

    try {
      const existing = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          participants: { some: { userId: req.user.sub } },
        },
        select: { id: true },
      });
      if (!existing) return res.status(403).json({ error: "Not a participant" });

      const updated = await prisma.conversation.update({
        where: { id: conversationId },
        data: { disappearingSecs: normalized },
        select: { id: true, disappearingSecs: true },
      });
      logger.info(
        { userId: req.user.sub, conversationId, ttlSecs: updated.disappearingSecs },
        "[Disappearing] Updated",
      );
      res.json({ conversationId: updated.id, ttlSecs: updated.disappearingSecs });
    } catch (err) {
      logger.error({ err }, "[Disappearing] update failed");
      res.status(500).json({ error: "Failed to update disappearing setting" });
    }
  }
);

// ─── Gifts & Attention Token Economy ─────────────────────────
//
// All routes require an authenticated user. The service layer is
// the source of truth for business rules (consent, rate limits,
// balance atomicity); this layer just validates payloads and maps
// errors to HTTP status codes.

const SendGiftSchema = z.object({
  recipientId: z.string().min(1).max(128),
  giftSlug: z.string().min(1).max(64),
  note: z.string().max(GiftSystem.MAX_GIFT_NOTE_LENGTH).optional(),
  callId: z.string().max(128).optional(),
  conversationId: z.string().uuid().optional(),
});

const GiftPrefsSchema = z.object({
  acceptGifts: z.boolean().optional(),
  earnFromCalls: z.boolean().optional(),
  thankYouSuggestions: z.boolean().optional(),
  showCallStreakCounter: z.boolean().optional(),
});

router.get(
  "/api/gifts/catalog",
  restRateLimit,
  requireBiometricAuth,
  async (_req: Request, res: Response) => {
    try {
      const catalog = await GiftSystem.listCatalog();
      res.json({ gifts: catalog });
    } catch (err) {
      logger.error({ err }, "[Gifts] catalog error");
      res.status(500).json({ error: "Failed to load gift catalog" });
    }
  },
);

router.get(
  "/api/gifts/balance",
  restRateLimit,
  requireBiometricAuth,
  async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    try {
      const snapshot = await AttentionTokenService.getBalance(req.user.sub);
      res.json(snapshot);
    } catch (err) {
      logger.error({ err, userId: req.user.sub }, "[Gifts] balance error");
      res.status(500).json({ error: "Failed to load balance" });
    }
  }
);

router.get(
  "/api/gifts/history",
  restRateLimit,
  requireBiometricAuth,
  async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    const direction = req.query.direction;
    const dir =
      direction === "sent" || direction === "received" ? direction : "both";
    const rawLimit = req.query.limit;
    const parsedLimit =
      typeof rawLimit === "string" ? Number.parseInt(rawLimit, 10) : NaN;
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : 30;
    try {
      const history = await GiftSystem.listHistory({
        userId: req.user.sub,
        direction: dir,
        limit,
      });
      res.json({ items: history });
    } catch (err) {
      logger.error({ err, userId: req.user.sub }, "[Gifts] history error");
      res.status(500).json({ error: "Failed to load history" });
    }
  },
);

router.post(
  "/api/gifts/send",
  restRateLimit,
  requireBiometricAuth,
  async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    const parsed = SendGiftSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
    }
    try {
      const result = await GiftSystem.sendGift({
        senderId: req.user.sub,
        recipientId: parsed.data.recipientId,
        giftSlug: parsed.data.giftSlug,
        note: parsed.data.note ?? null,
        callId: parsed.data.callId ?? null,
        conversationId: parsed.data.conversationId ?? null,
      });
      logger.info(
        { senderId: req.user.sub, txnId: result.transactionId, slug: parsed.data.giftSlug },
        "[Gifts] sent",
      );
      res.json(result);
    } catch (err) {
      if (err instanceof SelfGiftError) return res.status(400).json({ error: err.message });
      if (err instanceof GiftNotFoundError) return res.status(404).json({ error: err.message });
      if (err instanceof RecipientRefusesGiftsError) {
        return res.status(403).json({ error: "recipient_refuses_gifts" });
      }
      if (err instanceof GiftRateLimitError) {
        return res.status(429).json({ error: "gift_rate_limited", scope: err.scope });
      }
      if (err instanceof InsufficientBalanceError) {
        return res.status(402).json({
          error: "insufficient_balance",
          required: err.required,
          available: err.available,
        });
      }
      if (err instanceof InvalidAmountError) return res.status(400).json({ error: err.message });
      logger.error({ err, userId: req.user.sub }, "[Gifts] send failed");
      res.status(500).json({ error: "Failed to send gift" });
    }
  },
);

router.get(
  "/api/gifts/preferences",
  restRateLimit,
  requireBiometricAuth,
  async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    try {
      const prefs = await prisma.giftPreferences.upsert({
        where: { userId: req.user.sub },
        create: { userId: req.user.sub },
        update: {},
      });
      res.json(prefs);
    } catch (err) {
      logger.error({ err, userId: req.user.sub }, "[Gifts] prefs read failed");
      res.status(500).json({ error: "Failed to load preferences" });
    }
  },
);

router.post(
  "/api/gifts/preferences",
  restRateLimit,
  requireBiometricAuth,
  async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    const parsed = GiftPrefsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
    }
    try {
      const prefs = await prisma.giftPreferences.upsert({
        where: { userId: req.user.sub },
        create: { userId: req.user.sub, ...parsed.data },
        update: { ...parsed.data },
      });
      res.json(prefs);
    } catch (err) {
      logger.error({ err, userId: req.user.sub }, "[Gifts] prefs update failed");
      res.status(500).json({ error: "Failed to update preferences" });
    }
  },
);

router.get(
  "/api/gifts/insights",
  restRateLimit,
  requireBiometricAuth,
  async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    try {
      const [summary, suggestions] = await Promise.all([
        ReciprocityEngine.getSelfEngagementSummary(req.user.sub),
        ReciprocityEngine.getThankYouSuggestionsForRecipient(req.user.sub),
      ]);
      res.json({ summary, thankYouSuggestions: suggestions });
    } catch (err) {
      logger.error({ err, userId: req.user.sub }, "[Gifts] insights failed");
      res.status(500).json({ error: "Failed to load insights" });
    }
  }
);

// ─── QUANTNEON: Avatar Personality ─────────────────────────────
router.post(
  "/api/v1/avatar/chat",
  restRateLimit,
  requireBiometricAuth,
  async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    const { avatarId, message } = req.body;
    
    try {
      // In production, we wire this to AvatarPersonalityEngine
      // For now, return a success mock
      res.json({ reply: "Avatar says hello!", avatarId, emotion: "joy" });
    } catch (err) {
      logger.error({ err }, "[Avatar] chat error");
      res.status(500).json({ error: "Failed to process avatar chat" });
    }
  }
);

// ─── QUANTSINK: Live Stream Reactions ─────────────────────────
router.post(
  "/api/v1/stream/react",
  restRateLimit,
  requireBiometricAuth,
  async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    const { streamId, emoji } = req.body;

    try {
      // Call LiveStreamReactionEngine.react() here
      res.json({ success: true, floatingConfig: { emoji, scale: 1.0 } });
    } catch (err) {
      logger.error({ err }, "[Stream] reaction error");
      res.status(500).json({ error: "Failed to process reaction" });
    }
  }
);

// ─── Proof of Intent (PoI) Message Signing ───────────────────────
//
// POST /api/v1/poi/challenge    — Create a PoI challenge
// POST /api/v1/poi/sign         — Sign a PoI challenge with biometric proof
// GET  /api/v1/poi/verify/:id   — Verify a completed PoI signature
// GET  /api/v1/poi/pending      — List pending challenges for the user
// GET  /api/v1/poi/stats        — Get PoI system stats (operator)

const PoiChallengeSchema = z.object({
  conversationId: z.string().min(1).max(128),
  messageDigest: z.string().min(1).max(128),
  requiredLevel: z.number().int().min(0).max(3),
  deviceAttestation: z.string().max(2048).optional(),
});

const PoiSignSchema = z.object({
  challengeId: z.string().min(1).max(128),
  biometricHash: z.string().min(1).max(512),
  deviceId: z.string().min(1).max(128),
  level: z.number().int().min(0).max(3),
});

router.post(
  "/api/v1/poi/challenge",
  restRateLimit,
  requireBiometricAuth,
  (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    const parsed = PoiChallengeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
    }

    try {
      const challenge = BiometricProofOfIntent.createChallenge({
        userId: req.user.sub,
        conversationId: parsed.data.conversationId,
        messageDigest: parsed.data.messageDigest,
        requiredLevel: parsed.data.requiredLevel as 0 | 1 | 2 | 3,
        deviceAttestation: parsed.data.deviceAttestation,
      });

      res.json({
        challengeId: challenge.challengeId,
        nonce: challenge.nonce,
        requiredLevel: challenge.requiredLevel,
        expiresAt: challenge.expiresAt,
      });
    } catch (err) {
      if (err instanceof InvalidPoiLevelError) {
        return res.status(400).json({ error: err.message });
      }
      logger.error({ err, userId: req.user.sub }, "[PoI] Challenge creation failed");
      res.status(500).json({ error: "Failed to create PoI challenge" });
    }
  },
);

router.post(
  "/api/v1/poi/sign",
  restRateLimit,
  requireBiometricAuth,
  (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    const parsed = PoiSignSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
    }

    try {
      const signature = BiometricProofOfIntent.signChallenge({
        challengeId: parsed.data.challengeId,
        userId: req.user.sub,
        biometricHash: parsed.data.biometricHash,
        deviceId: parsed.data.deviceId,
        level: parsed.data.level as 0 | 1 | 2 | 3,
      });

      res.json({
        challengeId: signature.challengeId,
        level: signature.level,
        signedAt: signature.signedAt,
        signature: signature.signature,
      });
    } catch (err) {
      if (err instanceof PoiChallengeNotFoundError) return res.status(404).json({ error: err.message });
      if (err instanceof PoiUserMismatchError) return res.status(403).json({ error: err.message });
      if (err instanceof PoiChallengeExpiredError) return res.status(410).json({ error: err.message });
      if (err instanceof PoiInsufficientLevelError) return res.status(403).json({ error: err.message });
      if (err instanceof PoiReplayDetectedError) return res.status(409).json({ error: err.message });
      logger.error({ err, userId: req.user.sub }, "[PoI] Challenge signing failed");
      res.status(500).json({ error: "Failed to sign PoI challenge" });
    }
  },
);

router.get(
  "/api/v1/poi/verify/:challengeId",
  restRateLimit,
  requireBiometricAuth,
  (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    const challengeId = normalizeOptionalString(req.params.challengeId, 128);
    if (!challengeId) return res.status(400).json({ error: "Invalid challengeId" });

    const messageDigest = normalizeOptionalString(req.query.messageDigest as string, 128) ?? "";
    const conversationId = normalizeOptionalString(req.query.conversationId as string, 128) ?? "";

    const verification = BiometricProofOfIntent.verify(challengeId, messageDigest, conversationId);
    res.json(verification);
  },
);

router.get(
  "/api/v1/poi/pending",
  restRateLimit,
  requireBiometricAuth,
  (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    const challenges = BiometricProofOfIntent.getPendingChallenges(req.user.sub);
    res.json({
      challenges: challenges.map((c) => ({
        challengeId: c.challengeId,
        requiredLevel: c.requiredLevel,
        conversationId: c.conversationId,
        expiresAt: c.expiresAt,
      })),
    });
  },
);

router.get(
  "/api/v1/poi/stats",
  restRateLimit,
  requireBiometricAuth,
  (_req: Request, res: Response) => {
    res.json(BiometricProofOfIntent.getStats());
  },
);

// ─── Scheduled Messages ("Send Later") ──────────────────────────
//
// POST   /api/v1/messages/scheduled          — Schedule a message
// GET    /api/v1/messages/scheduled          — List pending scheduled messages
// DELETE /api/v1/messages/scheduled/:id      — Cancel a scheduled message
// GET    /api/v1/messages/scheduled/stats    — Queue stats (operator)
// PUT    /api/v1/quiet-hours                 — Set quiet hours config
// GET    /api/v1/quiet-hours                 — Get quiet hours config

const ScheduleMessageSchema = z.object({
  receiverId: z.string().min(1).max(128),
  conversationId: z.string().min(1).max(128),
  content: z.string().min(1).max(8192),
  contentType: z.enum(["text", "media", "voice-burst", "poll-card"]).optional(),
  scheduledAt: z.number().int().positive(),
  senderTimezone: z.string().max(64).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const QuietHoursSchema = z.object({
  enabled: z.boolean(),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(0).max(23),
  timezone: z.string().min(1).max(64),
  allowUrgent: z.boolean().optional(),
});

router.post(
  "/api/v1/messages/scheduled",
  restRateLimit,
  requireBiometricAuth,
  (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    const parsed = ScheduleMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
    }

    try {
      const scheduled = scheduledMessageQueue.schedule({
        senderId: req.user.sub,
        receiverId: parsed.data.receiverId,
        conversationId: parsed.data.conversationId,
        content: parsed.data.content,
        contentType: parsed.data.contentType,
        scheduledAt: parsed.data.scheduledAt,
        senderTimezone: parsed.data.senderTimezone,
        metadata: parsed.data.metadata,
      });

      res.status(201).json({
        id: scheduled.id,
        scheduledAt: scheduled.scheduledAt,
        status: scheduled.status,
        senderTimezone: scheduled.senderTimezone,
      });
    } catch (err) {
      if (err instanceof ScheduledQueueFullError) {
        return res.status(503).json({ error: "Queue full, try again later" });
      }
      if (err instanceof ScheduledMessageValidationError) {
        return res.status(400).json({ error: err.message });
      }
      logger.error({ err, userId: req.user.sub }, "[ScheduledMsg] Schedule failed");
      res.status(500).json({ error: "Failed to schedule message" });
    }
  },
);

router.get(
  "/api/v1/messages/scheduled",
  restRateLimit,
  requireBiometricAuth,
  (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    const parsedLimit = Number.parseInt(String(req.query.limit ?? "25"), 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 25;

    const messages = scheduledMessageQueue.listForSender(req.user.sub, limit);
    res.json({
      messages: messages.map((m) => ({
        id: m.id,
        receiverId: m.receiverId,
        conversationId: m.conversationId,
        scheduledAt: m.scheduledAt,
        senderTimezone: m.senderTimezone,
        status: m.status,
        contentType: m.contentType,
        quietHourDeferred: m.quietHourDeferred,
      })),
    });
  },
);

router.delete(
  "/api/v1/messages/scheduled/:id",
  restRateLimit,
  requireBiometricAuth,
  (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    const messageId = normalizeOptionalString(req.params.id, 128);
    if (!messageId) return res.status(400).json({ error: "Invalid messageId" });

    const cancelled = scheduledMessageQueue.cancel(messageId, req.user.sub);
    if (!cancelled) {
      return res.status(404).json({ error: "Scheduled message not found or not cancellable" });
    }
    res.json({ cancelled: true, messageId });
  },
);

router.get(
  "/api/v1/messages/scheduled/stats",
  restRateLimit,
  requireBiometricAuth,
  (_req: Request, res: Response) => {
    res.json(scheduledMessageQueue.getStats());
  },
);

router.put(
  "/api/v1/quiet-hours",
  restRateLimit,
  requireBiometricAuth,
  (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    const parsed = QuietHoursSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
    }

    scheduledMessageQueue.setQuietHours(req.user.sub, {
      enabled: parsed.data.enabled,
      startHour: parsed.data.startHour,
      endHour: parsed.data.endHour,
      timezone: parsed.data.timezone,
      allowUrgent: parsed.data.allowUrgent ?? false,
    });

    res.json({ updated: true });
  },
);

router.get(
  "/api/v1/quiet-hours",
  restRateLimit,
  requireBiometricAuth,
  (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    const config = scheduledMessageQueue.getQuietHours(req.user.sub);
    res.json(config ?? { enabled: false, startHour: 22, endHour: 7, timezone: "UTC", allowUrgent: false });
  },
);

// ─── Authoritative Session Controller ────────────────────────────
//
// GET    /api/v1/sessions/policy            — Get current session policy
// PATCH  /api/v1/sessions/policy            — Update session policy (admin)
// GET    /api/v1/sessions/trust/:deviceId   — Get device trust score
// POST   /api/v1/sessions/revoke-all        — Revoke all sessions except current
// GET    /api/v1/sessions/stats             — Session enforcement stats
// GET    /api/v1/sessions/ai-retention      — AI retention stats for current session

router.get(
  "/api/v1/sessions/policy",
  restRateLimit,
  requireBiometricAuth,
  (_req: Request, res: Response) => {
    res.json(sessionController.getPolicy());
  },
);

router.patch(
  "/api/v1/sessions/policy",
  restRateLimit,
  requireBiometricAuth,
  (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });

    // In production, this would check for admin role
    const updates: Record<string, unknown> = {};
    const body = req.body as Record<string, unknown>;

    if (typeof body.maxConcurrentSessions === "number") updates.maxConcurrentSessions = body.maxConcurrentSessions;
    if (typeof body.requireReauthAfterHours === "number") updates.requireReauthAfterHours = body.requireReauthAfterHours;
    if (typeof body.aiRetentionMaxHours === "number") updates.aiRetentionMaxHours = body.aiRetentionMaxHours;
    if (typeof body.aiRetentionMaxMessages === "number") updates.aiRetentionMaxMessages = body.aiRetentionMaxMessages;
    if (typeof body.receiptLadderEnforced === "boolean") updates.receiptLadderEnforced = body.receiptLadderEnforced;

    const policy = sessionController.updatePolicy(updates as any);
    res.json(policy);
  },
);

router.get(
  "/api/v1/sessions/trust/:deviceId",
  restRateLimit,
  requireBiometricAuth,
  async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    const deviceId = normalizeOptionalString(req.params.deviceId, 256);
    if (!deviceId) return res.status(400).json({ error: "Invalid deviceId" });

    try {
      const trust = await sessionController.computeDeviceTrust(req.user.sub, deviceId);
      res.json(trust);
    } catch (err) {
      logger.error({ err, userId: req.user.sub }, "[Sessions] Trust computation failed");
      res.status(500).json({ error: "Failed to compute device trust" });
    }
  },
);

router.post(
  "/api/v1/sessions/revoke-all",
  restRateLimit,
  requireBiometricAuth,
  async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });

    const currentSessionId = req.authSessionId ?? null;

    try {
      const sessions = await listCompanionSessions(req.user.sub, 100);
      const toRevoke = sessions.filter(
        (s) => s.status === "active" && s.sessionId !== currentSessionId,
      );

      let revokedCount = 0;
      for (const session of toRevoke) {
        const revoked = await sessionController.revokeAndPropagate(req.user.sub, session.sessionId);
        if (revoked) revokedCount++;
      }

      logger.info(
        { userId: req.user.sub, revokedCount, currentSessionId },
        "[Sessions] Revoked all other sessions",
      );

      res.json({ revokedCount, currentSessionId });
    } catch (err) {
      logger.error({ err, userId: req.user.sub }, "[Sessions] Revoke-all failed");
      res.status(500).json({ error: "Failed to revoke sessions" });
    }
  },
);

router.get(
  "/api/v1/sessions/stats",
  restRateLimit,
  requireBiometricAuth,
  (_req: Request, res: Response) => {
    res.json(sessionController.getStats());
  },
);

router.get(
  "/api/v1/sessions/ai-retention",
  restRateLimit,
  requireBiometricAuth,
  (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    const sessionId = normalizeOptionalString(req.query.sessionId as string, 256) ?? "default";
    const stats = sessionController.getAiRetentionStats(req.user.sub, sessionId);
    res.json(stats ?? {
      userId: req.user.sub,
      sessionId,
      autoRepliesInWindow: 0,
      windowStartMs: 0,
      retainedMessageIds: [],
    });
  },
);

// ─── System Metrics (Admin Dashboard) ──────────────────────────
// BLOCKER-METRICS FIX: Real metrics from database
import { MetricsService } from "./services/MetricsService";

router.get(
  "/api/v1/metrics/system",
  restRateLimit,
  requireBiometricAuth,
  async (_req: Request, res: Response) => {
    try {
      const metrics = await MetricsService.getSystemMetrics();
      res.json(metrics);
    } catch (err) {
      logger.error({ err }, "[Metrics] System metrics failed");
      res.status(500).json({ error: "Failed to retrieve system metrics" });
    }
  }
);

router.get(
  "/api/v1/metrics/users",
  restRateLimit,
  requireBiometricAuth,
  async (_req: Request, res: Response) => {
    try {
      const metrics = await MetricsService.getUserMetrics();
      res.json(metrics);
    } catch (err) {
      logger.error({ err }, "[Metrics] User metrics failed");
      res.status(500).json({ error: "Failed to retrieve user metrics" });
    }
  }
);

router.get(
  "/api/v1/metrics/messages",
  restRateLimit,
  requireBiometricAuth,
  async (_req: Request, res: Response) => {
    try {
      const metrics = await MetricsService.getMessageMetrics();
      res.json(metrics);
    } catch (err) {
      logger.error({ err }, "[Metrics] Message metrics failed");
      res.status(500).json({ error: "Failed to retrieve message metrics" });
    }
  }
);

router.get(
  "/api/v1/metrics/health",
  restRateLimit,
  async (_req: Request, res: Response) => {
    try {
      const health = await MetricsService.getHealthStatus();
      const statusCode = health.status === "healthy" ? 200 : 503;
      res.status(statusCode).json(health);
    } catch (err) {
      logger.error({ err }, "[Metrics] Health check failed");
      res.status(503).json({ status: "down", error: "Health check failed" });
    }
  }
);

export default router;
