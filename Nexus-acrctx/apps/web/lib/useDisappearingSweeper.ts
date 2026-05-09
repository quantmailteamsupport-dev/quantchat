"use client";

import { useEffect } from "react";
import { db } from "./db";

// ═══════════════════════════════════════════════════════════════
// useDisappearingSweeper
// ═══════════════════════════════════════════════════════════════
//
// Client-side self-destruct for disappearing messages.
// Polls the local Dexie store every `intervalMs` and hard-deletes any
// ChatMessage whose `expiresAt` has passed. This mirrors the behavior
// of Signal/WhatsApp/Snap: once the TTL elapses, the decrypted
// plaintext is removed from the device even if the server hasn't yet
// purged its ciphertext row (which happens on a separate cadence).
//
// Mount once near the app root (e.g. AppShell).
// ═══════════════════════════════════════════════════════════════

export interface DisappearingSweeperOptions {
  /** Poll interval in milliseconds. Defaults to 5_000 (5 seconds). */
  intervalMs?: number;
}

export function useDisappearingSweeper(opts: DisappearingSweeperOptions = {}): void {
  const intervalMs = opts.intervalMs ?? 5_000;

  useEffect(() => {
    let cancelled = false;

    const sweep = async (): Promise<void> => {
      if (cancelled) return;
      try {
        const now = Date.now();
        // Dexie's where()..below() will also skip rows missing the indexed field
        // because Dexie stores only rows with a defined indexed value.
        const expiredIds = await db.messages
          .where("expiresAt")
          .below(now)
          .primaryKeys();
        if (expiredIds.length > 0) {
          await db.messages.bulkDelete(expiredIds as string[]);
        }
      } catch (err) {
        console.error("[DisappearingSweeper] sweep failed", err);
      }
    };

    // Kick immediately, then every interval.
    void sweep();
    const timer = setInterval(() => { void sweep(); }, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [intervalMs]);
}
