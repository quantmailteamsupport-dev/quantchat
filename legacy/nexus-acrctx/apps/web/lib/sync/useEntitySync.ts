/**
 * useEntitySync.ts
 * ═══════════════════════════════════════════════════════════════════
 * P2P STATE SYNCHRONIZATION FOR THE SHARED IDENTITY ENTITY.
 * Authored by: Claude 3 Opus (Phase 12.2)
 * ═══════════════════════════════════════════════════════════════════
 *
 * PROBLEM: Both users must see the exact same 3D holographic entity.
 * If User A triggers an evolution, User B's canvas must update in
 * real-time with the identical SharedIdentityState.
 *
 * SOLUTION: We leverage the EXISTING useSignalSocket E2EE tunnel
 * to broadcast serialized state snapshots. This means the entity
 * state is encrypted in transit—the server never sees the mathematical
 * representation of someone's friendship depth.
 *
 * CONFLICT RESOLUTION: Last-Write-Wins with timestamp comparison.
 * If both users evolve simultaneously (race condition), the state
 * with the higher lastInteractionTimestamp wins. This is safe because:
 *   1. The evolution function is deterministic given the same inputs
 *   2. The later timestamp represents the more recent conversation
 *   3. Bond strength can only increase (monotonic within a session)
 *
 * PROTOCOL:
 *   __ENTITY_SYNC__:{json} — Full state snapshot broadcast
 *   __ENTITY_ACK__:{entityId} — Peer acknowledges receipt
 */

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSignalSocket } from "../useSignalSocket";
import type { SharedIdentityState } from "../ai/LudicLoopEngine";
import { LudicLoopEngine } from "../ai/LudicLoopEngine";

const SYNC_PREFIX = "__ENTITY_SYNC__:";
const ACK_PREFIX = "__ENTITY_ACK__:";

interface SyncStatus {
  lastSyncedAt: number;
  peerAcknowledged: boolean;
  conflictsResolved: number;
}

export function useEntitySync(
  myId: string,
  peerId: string,
  initialEntity?: SharedIdentityState
) {
  // The canonical entity state — both peers converge on this
  const [entity, setEntity] = useState<SharedIdentityState>(
    initialEntity ?? LudicLoopEngine.createSeed(myId, peerId)
  );

  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    lastSyncedAt: 0,
    peerAcknowledged: false,
    conflictsResolved: 0,
  });

  const { isConnected, sendEncryptedMessage, subscribeToMessages } = useSignalSocket(myId);
  const entityRef = useRef(entity);

  // Keep ref in sync with state (for use inside socket callbacks)
  useEffect(() => {
    entityRef.current = entity;
  }, [entity]);

  // ── RECEIVE: Listen for peer's state broadcasts ──
  useEffect(() => {
    const unsubscribe = subscribeToMessages((msg: any) => {
      if (msg.senderId !== peerId) return;
      const message = msg.plaintext;

      // Handle entity state sync
      if (message.startsWith(SYNC_PREFIX)) {
        const peerStateJSON = message.slice(SYNC_PREFIX.length);
        try {
          const peerState = JSON.parse(peerStateJSON) as SharedIdentityState;

          // ── CONFLICT RESOLUTION: Last-Write-Wins ──
          // The state with the more recent lastInteractionTimestamp is
          // considered authoritative. This prevents oscillation where
          // two peers keep overwriting each other.
          const local = entityRef.current;

          if (peerState.lastInteractionTimestamp > local.lastInteractionTimestamp) {
            // Peer's state is newer — accept it
            console.log(
              `[EntitySync] Accepting peer state (ts: ${peerState.lastInteractionTimestamp} > ${local.lastInteractionTimestamp})`
            );
            setEntity(peerState);
            setSyncStatus((prev) => ({
              ...prev,
              lastSyncedAt: Date.now(),
              peerAcknowledged: true,
            }));
          } else if (peerState.lastInteractionTimestamp === local.lastInteractionTimestamp) {
            // Exact same timestamp — compare bondStrength as tiebreaker
            // Higher bond = more evolution happened = more authoritative
            if (peerState.bondStrength > local.bondStrength) {
              setEntity(peerState);
            }
            setSyncStatus((prev) => ({
              ...prev,
              conflictsResolved: prev.conflictsResolved + 1,
            }));
          } else {
            // Our state is newer — ignore peer's state, they'll get ours
            console.log(
              `[EntitySync] Rejecting stale peer state (theirs: ${peerState.lastInteractionTimestamp} < ours: ${local.lastInteractionTimestamp})`
            );
          }

          // Always send ACK so peer knows we received it
          sendEncryptedMessage(peerId, `${ACK_PREFIX}${peerState.entityId}`);
        } catch (e) {
          console.error("[EntitySync] Failed to parse peer state:", e);
        }
      }

      // Handle acknowledgement
      if (message.startsWith(ACK_PREFIX)) {
        setSyncStatus((prev: SyncStatus) => ({ ...prev, peerAcknowledged: true }));
      }
    });

    return unsubscribe;
  }, [peerId, sendEncryptedMessage, subscribeToMessages]);

  // ── BROADCAST: Push our state to the peer ──
  const broadcastState = useCallback(
    async (state: SharedIdentityState) => {
      if (!isConnected) {
        console.warn("[EntitySync] Cannot broadcast — socket disconnected");
        return;
      }

      const payload = `${SYNC_PREFIX}${JSON.stringify(state)}`;
      await sendEncryptedMessage(peerId, payload);

      setSyncStatus((prev) => ({
        ...prev,
        lastSyncedAt: Date.now(),
        peerAcknowledged: false, // Reset until ACK arrives
      }));

      console.log(`[EntitySync] Broadcasted state to peer ${peerId}`);
    },
    [isConnected, peerId, sendEncryptedMessage]
  );

  // ── EVOLVE + SYNC: Atomic operation that evolves and broadcasts ──
  const evolveAndSync = useCallback(
    async (signals: Parameters<typeof LudicLoopEngine.evolve>[1]) => {
      const newState = LudicLoopEngine.evolve(entityRef.current, signals);
      setEntity(newState);
      await broadcastState(newState);
      return newState;
    },
    [broadcastState]
  );

  // ── REQUEST SYNC: Ask peer for their current state ──
  // Used on initial load to ensure we start with the latest state
  useEffect(() => {
    if (isConnected) {
      // Broadcast our current state on connect so peer can compare
      broadcastState(entityRef.current);
    }
  }, [isConnected, broadcastState]);

  return {
    entity,
    setEntity,
    syncStatus,
    evolveAndSync,
    broadcastState,
    isConnected,
  };
}
