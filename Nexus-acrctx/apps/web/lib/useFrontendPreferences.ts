"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "quantchat:frontend-preferences";
const USER_STORAGE_KEY = "quantchat:userId";
const PREFERENCES_SYNC_EVENT = "quantchat:frontend-preferences-updated";
const USER_ID_PATTERN = /^[a-zA-Z0-9._:-]{3,128}$/;
const READ_RECEIPT_MODES = ["instant", "delayed", "batch"] as const;

export type ReadReceiptMode = (typeof READ_RECEIPT_MODES)[number];

export interface FrontendPreferences {
  readReceiptsEnabled: boolean;
  readReceiptMode: ReadReceiptMode;
  reactionsEnabled: boolean;
  compactChatLayout: boolean;
  aiReplySuggestionsEnabled: boolean;
  companionDeviceAlertsEnabled: boolean;
  strictKeyVerification: boolean;
  privateForwardGuardEnabled: boolean;
  trustedMediaOnlyEnabled: boolean;
}

export const DEFAULT_FRONTEND_PREFERENCES: FrontendPreferences = {
  readReceiptsEnabled: true,
  readReceiptMode: "instant",
  reactionsEnabled: true,
  compactChatLayout: false,
  aiReplySuggestionsEnabled: true,
  companionDeviceAlertsEnabled: true,
  strictKeyVerification: true,
  privateForwardGuardEnabled: true,
  trustedMediaOnlyEnabled: false,
};

export type FrontendBooleanPreferenceKey = {
  [K in keyof FrontendPreferences]: FrontendPreferences[K] extends boolean ? K : never;
}[keyof FrontendPreferences];

function sanitizeUserId(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim();
  if (!USER_ID_PATTERN.test(normalized)) return null;
  return normalized;
}

function resolveStorageKey(): string {
  if (typeof window === "undefined") return STORAGE_KEY;
  const scopedUserId = sanitizeUserId(window.localStorage.getItem(USER_STORAGE_KEY));
  return scopedUserId ? `${STORAGE_KEY}:${scopedUserId}` : STORAGE_KEY;
}

function sanitizeReadReceiptMode(value: unknown): ReadReceiptMode {
  if (typeof value !== "string") return DEFAULT_FRONTEND_PREFERENCES.readReceiptMode;
  if ((READ_RECEIPT_MODES as readonly string[]).includes(value)) {
    return value as ReadReceiptMode;
  }
  return DEFAULT_FRONTEND_PREFERENCES.readReceiptMode;
}

function parsePreferences(raw: string | null): FrontendPreferences {
  if (!raw) return DEFAULT_FRONTEND_PREFERENCES;

  try {
    const parsed = JSON.parse(raw) as Partial<FrontendPreferences>;
    return {
      readReceiptsEnabled: parsed.readReceiptsEnabled ?? DEFAULT_FRONTEND_PREFERENCES.readReceiptsEnabled,
      readReceiptMode: sanitizeReadReceiptMode(parsed.readReceiptMode),
      reactionsEnabled: parsed.reactionsEnabled ?? DEFAULT_FRONTEND_PREFERENCES.reactionsEnabled,
      compactChatLayout: parsed.compactChatLayout ?? DEFAULT_FRONTEND_PREFERENCES.compactChatLayout,
      aiReplySuggestionsEnabled:
        parsed.aiReplySuggestionsEnabled ?? DEFAULT_FRONTEND_PREFERENCES.aiReplySuggestionsEnabled,
      companionDeviceAlertsEnabled:
        parsed.companionDeviceAlertsEnabled ?? DEFAULT_FRONTEND_PREFERENCES.companionDeviceAlertsEnabled,
      strictKeyVerification:
        parsed.strictKeyVerification ?? DEFAULT_FRONTEND_PREFERENCES.strictKeyVerification,
      privateForwardGuardEnabled:
        parsed.privateForwardGuardEnabled ?? DEFAULT_FRONTEND_PREFERENCES.privateForwardGuardEnabled,
      trustedMediaOnlyEnabled:
        parsed.trustedMediaOnlyEnabled ?? DEFAULT_FRONTEND_PREFERENCES.trustedMediaOnlyEnabled,
    };
  } catch {
    return DEFAULT_FRONTEND_PREFERENCES;
  }
}

function readStoredPreferences(): FrontendPreferences {
  if (typeof window === "undefined") return DEFAULT_FRONTEND_PREFERENCES;

  try {
    const raw = window.localStorage.getItem(resolveStorageKey());
    return parsePreferences(raw);
  } catch {
    return DEFAULT_FRONTEND_PREFERENCES;
  }
}

function persistPreferences(preferences: FrontendPreferences) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(resolveStorageKey(), JSON.stringify(preferences));
  } catch {
    // Ignore storage failures in restricted browser modes.
  }
  window.dispatchEvent(new CustomEvent(PREFERENCES_SYNC_EVENT));
}

export function useFrontendPreferences() {
  const [preferences, setPreferences] = useState<FrontendPreferences>(DEFAULT_FRONTEND_PREFERENCES);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncPreferences = () => setPreferences(readStoredPreferences());
    syncPreferences();

    window.addEventListener("storage", syncPreferences);
    window.addEventListener(PREFERENCES_SYNC_EVENT, syncPreferences);
    return () => {
      window.removeEventListener("storage", syncPreferences);
      window.removeEventListener(PREFERENCES_SYNC_EVENT, syncPreferences);
    };
  }, []);

  const setPreference = useCallback(
    <K extends keyof FrontendPreferences>(key: K, value: FrontendPreferences[K]) => {
      setPreferences((current) => {
        const next = { ...current, [key]: value };
        persistPreferences(next);
        return next;
      });
    },
    [],
  );

  return { preferences, setPreference };
}
