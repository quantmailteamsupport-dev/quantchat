const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;

const STORAGE_KEYS = {
  accessToken: "quantchat:authToken",
  refreshToken: "quantchat:refreshToken",
  userId: "quantchat:userId",
  email: "quantchat:userEmail",
  displayName: "quantchat:userName",
  sessionId: "quantchat:sessionId",
  expiresAt: "quantchat:expiresAt",
  behavioralConfidence: "quantchat:behavioralConfidence",
} as const;

const DEFAULT_QUANTMAIL_API_BASE = "http://localhost:3001";

interface AuthenticationOptionsJson {
  challenge: string;
  timeout?: number;
  rpId?: string;
  userVerification?: UserVerificationRequirement;
  allowCredentials?: Array<{
    id: string;
    type: PublicKeyCredentialType;
    transports?: AuthenticatorTransport[];
  }>;
}

interface AuthenticationOptionsResponse {
  options: AuthenticationOptionsJson;
}

interface QuantmailAuthUser {
  id: string;
  email: string;
  displayName: string;
}

interface QuantmailVerifyResponse {
  user: QuantmailAuthUser;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  sessionId: string;
  behavioralConfidence: number;
}

export interface QuantmailBridgeSession {
  userId: string;
  accessToken: string;
  refreshToken?: string;
  email?: string;
  displayName?: string;
  sessionId?: string;
  expiresAt?: number;
  behavioralConfidence?: number;
}

export interface QuantmailPasskeyAuthResult extends QuantmailBridgeSession {
  user: QuantmailAuthUser;
}

function readWindowStorage(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const value = window.localStorage.getItem(key)?.trim();
    return value || null;
  } catch {
    return null;
  }
}

function writeWindowStorage(key: string, value: string | null | undefined): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (value) {
      window.localStorage.setItem(key, value);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage failures in constrained browser modes.
  }
}

function emitIdentityChanged(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event("quantchat:identity-changed"));
}

function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

function arrayBufferToBase64Url(value: ArrayBuffer | ArrayBufferLike): string {
  const bytes = new Uint8Array(value);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLength);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

function toRequestOptions(
  options: AuthenticationOptionsJson,
): PublicKeyCredentialRequestOptions {
  return {
    challenge: base64UrlToArrayBuffer(options.challenge),
    timeout: options.timeout,
    rpId: options.rpId,
    userVerification: options.userVerification,
    allowCredentials: options.allowCredentials?.map((credential) => ({
      ...credential,
      id: base64UrlToArrayBuffer(credential.id),
    })),
  };
}

function serializeAuthenticationCredential(credential: PublicKeyCredential) {
  const response = credential.response as AuthenticatorAssertionResponse;
  const credentialWithAttachment = credential as PublicKeyCredential & {
    authenticatorAttachment?: string | null;
  };

  return {
    id: credential.id,
    rawId: arrayBufferToBase64Url(credential.rawId),
    type: credential.type,
    response: {
      authenticatorData: arrayBufferToBase64Url(response.authenticatorData),
      clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
      signature: arrayBufferToBase64Url(response.signature),
      userHandle: response.userHandle
        ? arrayBufferToBase64Url(response.userHandle)
        : undefined,
    },
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: credentialWithAttachment.authenticatorAttachment ?? undefined,
  };
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    return {} as T;
  }
}

function resolveQuantmailApiEnv(): string | undefined {
  return process.env.NEXT_PUBLIC_QUANTMAIL_API_URL ?? process.env.QUANTMAIL_API_URL;
}

export function resolveQuantmailApiBase(): string {
  const configured = resolveQuantmailApiEnv()?.trim();
  return (configured || DEFAULT_QUANTMAIL_API_BASE).replace(/\/$/, "");
}

export function isValidEmail(value: string): boolean {
  return normalizeEmail(value) !== null;
}

/**
 * BLOCKER-AUTH FIX: Returns the current user ID from session storage or NextAuth session.
 * In production, this will ONLY return a valid ID if the user is authenticated.
 * Returns null if no authenticated session exists (frontend should redirect to login).
 */
export function resolveFallbackQuantchatUserId(): string | null {
  const fromStorage = readWindowStorage(STORAGE_KEYS.userId);
  if (fromStorage) {
    return fromStorage;
  }

  // In production, we DO NOT use a fallback "local-user"
  // The useQuantchatIdentity hook will handle redirecting to login if needed
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  // Development: allow temporary user IDs for testing
  // But prefer environment configuration over hardcoded "local-user"
  const devUserId = process.env.NEXT_PUBLIC_CHAT_USER_ID?.trim();
  return devUserId || null;
}

export function resolveFallbackQuantmailToken(): string {
  return (
    readWindowStorage(STORAGE_KEYS.accessToken) ||
    process.env.NEXT_PUBLIC_QUANTMAIL_DEV_JWT?.trim() ||
    ""
  );
}

export function readStoredQuantmailBridgeSession(): QuantmailBridgeSession | null {
  const userId = readWindowStorage(STORAGE_KEYS.userId);
  const accessToken = readWindowStorage(STORAGE_KEYS.accessToken);

  if (!userId || !accessToken) {
    return null;
  }

  const refreshToken = readWindowStorage(STORAGE_KEYS.refreshToken) ?? undefined;
  const email = readWindowStorage(STORAGE_KEYS.email) ?? undefined;
  const displayName = readWindowStorage(STORAGE_KEYS.displayName) ?? undefined;
  const sessionId = readWindowStorage(STORAGE_KEYS.sessionId) ?? undefined;
  const expiresRaw = readWindowStorage(STORAGE_KEYS.expiresAt);
  const expiresAt = expiresRaw ? Number.parseInt(expiresRaw, 10) : undefined;
  const confidenceRaw = readWindowStorage(STORAGE_KEYS.behavioralConfidence);
  const behavioralConfidence = confidenceRaw ? Number.parseFloat(confidenceRaw) : undefined;

  return {
    userId,
    accessToken,
    refreshToken,
    email,
    displayName,
    sessionId,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : undefined,
    behavioralConfidence: Number.isFinite(behavioralConfidence) ? behavioralConfidence : undefined,
  };
}

export function persistQuantmailBridgeSession(
  session: QuantmailBridgeSession,
): void {
  writeWindowStorage(STORAGE_KEYS.userId, session.userId);
  writeWindowStorage(STORAGE_KEYS.accessToken, session.accessToken);
  writeWindowStorage(STORAGE_KEYS.refreshToken, session.refreshToken);
  writeWindowStorage(STORAGE_KEYS.email, normalizeEmail(session.email) ?? null);
  writeWindowStorage(STORAGE_KEYS.displayName, session.displayName?.trim() || null);
  writeWindowStorage(STORAGE_KEYS.sessionId, session.sessionId);
  writeWindowStorage(
    STORAGE_KEYS.expiresAt,
    typeof session.expiresAt === "number" ? String(session.expiresAt) : null,
  );
  writeWindowStorage(
    STORAGE_KEYS.behavioralConfidence,
    typeof session.behavioralConfidence === "number" ? String(session.behavioralConfidence) : null,
  );
  emitIdentityChanged();
}

export function clearQuantmailBridgeSession(): void {
  writeWindowStorage(STORAGE_KEYS.userId, null);
  writeWindowStorage(STORAGE_KEYS.accessToken, null);
  writeWindowStorage(STORAGE_KEYS.refreshToken, null);
  writeWindowStorage(STORAGE_KEYS.email, null);
  writeWindowStorage(STORAGE_KEYS.displayName, null);
  writeWindowStorage(STORAGE_KEYS.sessionId, null);
  writeWindowStorage(STORAGE_KEYS.expiresAt, null);
  emitIdentityChanged();
}

export async function authenticateQuantmailPasskey(
  email: string,
  onStatus?: (message: string) => void,
): Promise<QuantmailPasskeyAuthResult> {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    throw new Error("Passkey authentication must run in a browser.");
  }

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("Enter a valid Quantmail email address.");
  }

  onStatus?.("Requesting passkey challenge from Quantmail...");

  const optionsResponse = await fetch(
    `${resolveQuantmailApiBase()}/auth/webauthn/authenticate/options`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail }),
      cache: "no-store",
    },
  );
  const optionsPayload = await readJsonResponse<
    AuthenticationOptionsResponse & { error?: string; message?: string }
  >(optionsResponse);

  if (!optionsResponse.ok || !optionsPayload.options) {
    throw new Error(
      optionsPayload.error ||
        optionsPayload.message ||
        "Quantmail did not return a passkey challenge.",
    );
  }

  onStatus?.("Waiting for the browser passkey ceremony...");

  const credential = (await navigator.credentials.get({
    publicKey: toRequestOptions(optionsPayload.options),
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error("Passkey authentication was cancelled.");
  }

  onStatus?.("Verifying Quantmail identity...");

  const verifyResponse = await fetch(
    `${resolveQuantmailApiBase()}/auth/webauthn/authenticate/verify`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: normalizedEmail,
        response: serializeAuthenticationCredential(credential),
      }),
      cache: "no-store",
    },
  );
  const verifyPayload = await readJsonResponse<
    QuantmailVerifyResponse & { error?: string; message?: string }
  >(verifyResponse);

  if (
    !verifyResponse.ok ||
    !verifyPayload.user ||
    !verifyPayload.accessToken ||
    !verifyPayload.sessionId
  ) {
    throw new Error(
      verifyPayload.error ||
        verifyPayload.message ||
        "Quantmail did not complete passkey verification.",
    );
  }

  return {
    user: verifyPayload.user,
    userId: verifyPayload.user.id,
    email: verifyPayload.user.email,
    displayName: verifyPayload.user.displayName,
    accessToken: verifyPayload.accessToken,
    refreshToken: verifyPayload.refreshToken,
    expiresAt: verifyPayload.expiresAt,
    sessionId: verifyPayload.sessionId,
    behavioralConfidence: verifyPayload.behavioralConfidence,
  };
}

// ─── QuantChat SSO Exchange ──────────────────────────────────────

interface QuantchatSSOExchangeResponse {
  accessToken: string;
  expiresIn: number;
  user: QuantmailAuthUser;
  sessionId: string;
  livenessLevel: string;
  latencyMs: number;
}

const DEFAULT_QUANTCHAT_API_BASE = "/api";

function resolveQuantchatApiBase(): string {
  const configured = (
    process.env.NEXT_PUBLIC_QUANTCHAT_API_URL ??
    process.env.QUANTCHAT_API_URL
  )?.trim();
  return (configured || DEFAULT_QUANTCHAT_API_BASE).replace(/\/$/, "");
}

/**
 * Exchanges a Quantmail-issued access token for a QuantChat-scoped
 * session via the QuantChat API gateway's SSO exchange endpoint.
 *
 * This is the recommended path for production: the frontend authenticates
 * via Quantmail's WebAuthn flow, then hands the resulting token to the
 * QuantChat gateway for a scoped, shorter-lived session token.
 */
export async function exchangeForQuantchatSession(
  quantmailToken: string,
  email?: string,
): Promise<QuantmailPasskeyAuthResult> {
  const response = await fetch(
    `${resolveQuantchatApiBase()}/v1/auth/sso/exchange`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quantmailToken, email }),
      cache: "no-store",
    },
  );

  const payload = await readJsonResponse<
    QuantchatSSOExchangeResponse & { error?: string; message?: string }
  >(response);

  if (!response.ok || !payload.accessToken || !payload.user) {
    throw new Error(
      payload.error ?? payload.message ?? "QuantChat SSO exchange failed.",
    );
  }

  return {
    user: payload.user,
    userId: payload.user.id,
    email: payload.user.email,
    displayName: payload.user.displayName,
    accessToken: payload.accessToken,
    sessionId: payload.sessionId,
    expiresAt:
      typeof payload.expiresIn === "number"
        ? Date.now() + payload.expiresIn * 1000
        : undefined,
  };
}

/**
 * Refreshes a QuantChat session token via the gateway's refresh endpoint.
 * Returns null if the refresh token is invalid or expired.
 */
export async function refreshQuantchatSession(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number } | null> {
  try {
    const response = await fetch(
      `${resolveQuantchatApiBase()}/v1/auth/refresh`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken }),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return null;
    }

    const payload = await readJsonResponse<{
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    }>(response);

    if (!payload.accessToken) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

