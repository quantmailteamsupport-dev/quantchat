"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState, type ReactElement } from "react";
import GiftRenderer3D, { type GiftRendererKind } from "./GiftRenderer3D";
import type { IncomingGift } from "../../lib/gifts/useGiftSocket";

// ═══════════════════════════════════════════════════════════════
// GiftOverlay
// ═══════════════════════════════════════════════════════════════
//
// Renders a queue of incoming gifts as 3D overlays on top of the
// current call / chat surface. One gift plays at a time; additional
// gifts wait in a FIFO queue. Each animation is ~3.5s and the panel
// fully disposes its WebGL context after each play (see
// GiftRenderer3D). A small "From: {name} — {note}" card fades in
// alongside the 3D animation so recipients know who sent it.
// ═══════════════════════════════════════════════════════════════

export interface GiftOverlayProps {
  /** Incoming gifts arrive here (append-only) */
  incoming: IncomingGift[];
  /** Optional display-name resolver keyed by userId */
  resolveDisplayName?: (userId: string) => string | undefined;
  /** Max simultaneous overlays; excess queue up. Default 1. */
  maxSimultaneous?: number;
}

interface QueuedGift extends IncomingGift {
  queueId: string;
}

function kindFromString(s: string): GiftRendererKind {
  return (s === "rose" || s === "heart" || s === "bolt" || s === "crown")
    ? s
    : "heart";
}

export function GiftOverlay(props: GiftOverlayProps): ReactElement {
  const { incoming, resolveDisplayName, maxSimultaneous = 1 } = props;
  const [queue, setQueue] = useState<QueuedGift[]>([]);
  const [playing, setPlaying] = useState<QueuedGift[]>([]);
  const [seenIds] = useState<Set<string>>(() => new Set());

  // Enqueue any newly-arrived gifts
  useEffect(() => {
    for (const g of incoming) {
      if (seenIds.has(g.transactionId)) continue;
      seenIds.add(g.transactionId);
      setQueue((prev) => [...prev, { ...g, queueId: g.transactionId }]);
    }
  }, [incoming, seenIds]);

  // Promote queued gifts into the playing slot when there's room
  useEffect(() => {
    if (playing.length >= maxSimultaneous) return;
    if (queue.length === 0) return;
    setQueue((q) => {
      if (q.length === 0) return q;
      const [head, ...rest] = q;
      if (!head) return q;
      setPlaying((p) => [...p, head]);
      return rest;
    });
  }, [queue, playing, maxSimultaneous]);

  const onOneComplete = useCallback((queueId: string) => {
    setPlaying((p) => p.filter((g) => g.queueId !== queueId));
  }, []);

  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 900,
      }}
    >
      <AnimatePresence>
        {playing.map((g) => {
          const name = resolveDisplayName?.(g.fromUserId) ?? "Someone";
          return (
            <motion.div
              key={g.queueId}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              }}
            >
              <div style={{ width: 360, height: 360 }}>
                <GiftRenderer3D
                  kind={kindFromString(g.rendererKind)}
                  palette={g.palette}
                  ariaLabel={`${name} sent a ${g.displayName}`}
                  onComplete={() => onOneComplete(g.queueId)}
                />
              </div>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, delay: 0.1 }}
                style={{
                  marginTop: -24,
                  background: "rgba(17, 24, 39, 0.85)",
                  border: "1px solid #1f2937",
                  borderRadius: 10,
                  padding: "8px 12px",
                  color: "#e5e7eb",
                  fontSize: 13,
                  maxWidth: 320,
                  textAlign: "center",
                  backdropFilter: "blur(4px)",
                }}
              >
                <strong>{name}</strong> sent a {g.displayName}
                {g.note ? (
                  <div style={{ marginTop: 4, color: "#d1d5db", fontStyle: "italic" }}>
                    “{g.note}”
                  </div>
                ) : null}
              </motion.div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export default GiftOverlay;
