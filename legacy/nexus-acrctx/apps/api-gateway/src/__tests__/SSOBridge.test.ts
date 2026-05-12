/**
 * @module SSOBridge.test
 * @description Tests for the Quantmail → QuantChat SSO bridge endpoints:
 *   - POST /api/v1/auth/sso/exchange
 *   - POST /api/v1/auth/sso/validate
 *   - POST /api/v1/auth/refresh
 *
 * These tests validate the critical identity path that replaces the
 * previous mock bridge with real shared-kernel JWT verification.
 */

// ─── Mocks ──────────────────────────────────────────────────────

const mockVerifyAccessToken = jest.fn();
const mockExchangeForApp = jest.fn();
const mockRefreshAccessToken = jest.fn();

jest.mock("../../../../../../../../shared-kernel/AuthenticationService.js", () => ({
  authService: {
    verifyAccessToken: (...args: unknown[]) => mockVerifyAccessToken(...args),
    exchangeForApp: (...args: unknown[]) => mockExchangeForApp(...args),
    refreshAccessToken: (...args: unknown[]) => mockRefreshAccessToken(...args),
  },
}));

jest.mock("@repo/database", () => ({
  prisma: {
    $queryRaw: jest.fn().mockResolvedValue([{ result: 1 }]),
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    conversation: { findFirst: jest.fn() },
    digitalTwin: { findUnique: jest.fn() },
    giftPreferences: { upsert: jest.fn() },
    userSession: { findUnique: jest.fn() },
  },
}));

// ─── Test Setup ──────────────────────────────────────────────────

import request from "supertest";
import express from "express";

// Minimal Express app setup matching the gateway
const app = express();
app.use(express.json());

// Import routes after mocks are in place
import router from "../routes";
app.use(router);

// ─── Test Data ──────────────────────────────────────────────────

const VALID_PAYLOAD = {
  sub: "usr_test_abc123",
  email: "test@quantmail.app",
  username: "testuser",
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 900,
  iss: "infinity-trinity",
  aud: ["quantchat", "quantmail", "quanttube"],
  deviceId: "dev_test_xyz",
  sessionId: "sess_test_001",
  livenessLevel: "full" as const,
};

const VALID_EXCHANGE_RESULT = {
  targetApp: "quantchat",
  accessToken: "scoped-quantchat-jwt-token",
  expiresIn: 300,
};

// ─── Tests ──────────────────────────────────────────────────────

describe("POST /api/v1/auth/sso/exchange", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 400 when quantmailToken is missing", async () => {
    const res = await request(app)
      .post("/api/v1/auth/sso/exchange")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_FAILED");
  });

  it("should return 400 when quantmailToken is empty", async () => {
    const res = await request(app)
      .post("/api/v1/auth/sso/exchange")
      .send({ quantmailToken: "" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_FAILED");
  });

  it("should return 401 when token verification fails", async () => {
    mockVerifyAccessToken.mockRejectedValue(
      Object.assign(new Error("Invalid access token"), { code: "INVALID_TOKEN" }),
    );

    const res = await request(app)
      .post("/api/v1/auth/sso/exchange")
      .send({ quantmailToken: "invalid-token-here" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("INVALID_TOKEN");
  });

  it("should return 401 when token is expired", async () => {
    mockVerifyAccessToken.mockRejectedValue(
      Object.assign(new Error("Access token has expired"), { code: "TOKEN_EXPIRED" }),
    );

    const res = await request(app)
      .post("/api/v1/auth/sso/exchange")
      .send({ quantmailToken: "expired-token-here" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("TOKEN_EXPIRED");
  });

  it("should return 403 when token audience does not include quantchat", async () => {
    mockVerifyAccessToken.mockResolvedValue({
      ...VALID_PAYLOAD,
      aud: ["quantmail"], // Only scoped to quantmail
    });

    const res = await request(app)
      .post("/api/v1/auth/sso/exchange")
      .send({ quantmailToken: "scoped-to-quantmail-only" });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("INSUFFICIENT_SCOPE");
  });

  it("should exchange valid token and return QuantChat session", async () => {
    mockVerifyAccessToken.mockResolvedValue(VALID_PAYLOAD);
    mockExchangeForApp.mockResolvedValue(VALID_EXCHANGE_RESULT);

    const res = await request(app)
      .post("/api/v1/auth/sso/exchange")
      .send({ quantmailToken: "valid-quantmail-jwt" });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe("scoped-quantchat-jwt-token");
    expect(res.body.expiresIn).toBe(300);
    expect(res.body.sessionId).toBe("sess_test_001");
    expect(res.body.livenessLevel).toBe("full");
    expect(res.body.user).toBeDefined();
    expect(res.body.user.id).toBe("usr_test_abc123");
    expect(res.body.latencyMs).toBeDefined();
    expect(typeof res.body.latencyMs).toBe("number");

    expect(mockVerifyAccessToken).toHaveBeenCalledWith("valid-quantmail-jwt");
    expect(mockExchangeForApp).toHaveBeenCalledWith("valid-quantmail-jwt", "quantchat");
  });

  it("should accept tokens with empty audience (ecosystem-wide)", async () => {
    mockVerifyAccessToken.mockResolvedValue({
      ...VALID_PAYLOAD,
      aud: [], // Ecosystem-wide token
    });
    mockExchangeForApp.mockResolvedValue(VALID_EXCHANGE_RESULT);

    const res = await request(app)
      .post("/api/v1/auth/sso/exchange")
      .send({ quantmailToken: "ecosystem-wide-token" });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe("scoped-quantchat-jwt-token");
  });
});

describe("POST /api/v1/auth/sso/validate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return { valid: false } when token is missing", async () => {
    const res = await request(app)
      .post("/api/v1/auth/sso/validate")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.valid).toBe(false);
  });

  it("should return { valid: true } for a valid token", async () => {
    mockVerifyAccessToken.mockResolvedValue(VALID_PAYLOAD);

    const res = await request(app)
      .post("/api/v1/auth/sso/validate")
      .send({ token: "valid-jwt-token" });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.userId).toBe("usr_test_abc123");
    expect(res.body.email).toBe("test@quantmail.app");
    expect(res.body.sessionId).toBe("sess_test_001");
  });

  it("should return { valid: false } when verification throws", async () => {
    mockVerifyAccessToken.mockRejectedValue(new Error("Invalid token"));

    const res = await request(app)
      .post("/api/v1/auth/sso/validate")
      .send({ token: "bad-token" });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
  });
});

describe("POST /api/v1/auth/refresh", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 400 when refreshToken is missing", async () => {
    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_FAILED");
  });

  it("should return new tokens on valid refresh", async () => {
    mockRefreshAccessToken.mockResolvedValue({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      expiresIn: 900,
      tokenType: "Bearer",
    });

    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: "valid-refresh-token" });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe("new-access-token");
    expect(res.body.refreshToken).toBe("new-refresh-token");
    expect(res.body.expiresIn).toBe(900);
  });

  it("should return 401 when refresh token is invalid", async () => {
    mockRefreshAccessToken.mockRejectedValue(
      Object.assign(new Error("Invalid or expired"), { code: "INVALID_REFRESH_TOKEN" }),
    );

    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: "expired-refresh-token" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("INVALID_REFRESH_TOKEN");
  });
});
