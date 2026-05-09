export interface ResolvedSocketIdentity {
  token: string;
  userId: string;
  tokenUserId: string | null;
}

function decodeBase64Url(value: string): string | null {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLength);

  try {
    if (typeof atob === "function") {
      return atob(padded);
    }

    if (typeof Buffer !== "undefined") {
      return Buffer.from(padded, "base64").toString("utf-8");
    }
  } catch {
    return null;
  }

  return null;
}

export function extractJwtSubject(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const payloadRaw = decodeBase64Url(parts[1] ?? "");
  if (!payloadRaw) return null;

  try {
    const payload = JSON.parse(payloadRaw) as { sub?: unknown };
    if (typeof payload.sub !== "string") return null;
    const normalized = payload.sub.trim();
    if (!normalized || normalized.length > 128) return null;
    return normalized;
  } catch {
    return null;
  }
}

export function resolveSocketIdentity(
  requestedUserId: string | null | undefined,
  providedAuthToken?: string | null,
): ResolvedSocketIdentity {
  const token =
    providedAuthToken?.trim() ||
    process.env.NEXT_PUBLIC_QUANTMAIL_DEV_JWT?.trim() ||
    "";
  const tokenUserId = token ? extractJwtSubject(token) : null;
  const requested =
    typeof requestedUserId === "string" && requestedUserId.trim().length > 0
      ? requestedUserId.trim()
      : "local-user";

  return {
    token,
    userId: tokenUserId ?? requested,
    tokenUserId,
  };
}
