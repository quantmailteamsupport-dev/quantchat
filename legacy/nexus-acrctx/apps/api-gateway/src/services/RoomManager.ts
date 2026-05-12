import { logger } from "../logger";
import { pubClient, redisReady } from "../redis";

// ═══════════════════════════════════════════════════════════════
// RoomManager — Multi-party WebRTC call rooms
// ═══════════════════════════════════════════════════════════════
//
// Responsibilities:
//   • Track active call rooms, participants, join/leave ordering
//   • Enforce max participant cap (default 8)
//   • Recommend topology (mesh ≤4 peers, SFU-hint 5-8 peers)
//   • Provide Redis-backed snapshot for multi-instance gateways
//     (Socket.io redis adapter handles actual fan-out; this store
//     is the source of truth for roster/topology queries)
//
// This class does NOT forward media. Forwarding is handled by
// socket.ts via room-scoped webrtc-signal events.
// ═══════════════════════════════════════════════════════════════

export const MAX_PARTICIPANTS_PER_ROOM = 8;
export const MESH_TOPOLOGY_THRESHOLD = 4;
export const ROOM_TTL_MS = 6 * 60 * 60 * 1000; // 6h hard TTL
export const ROOM_IDLE_TTL_MS = 15 * 60 * 1000; // evict empty rooms after 15m

export type RoomTopology = "mesh" | "sfu-hint";

export interface RoomParticipant {
  userId: string;
  socketId: string;
  joinedAt: number;
  /** Whether participant is publishing audio */
  audio: boolean;
  /** Whether participant is publishing video */
  video: boolean;
  /** Whether participant is currently screen-sharing */
  screen: boolean;
}

export interface RoomSnapshot {
  roomId: string;
  createdAt: number;
  topology: RoomTopology;
  participants: RoomParticipant[];
}

interface InternalRoom {
  roomId: string;
  createdAt: number;
  lastActivityAt: number;
  participants: Map<string, RoomParticipant>; // keyed by userId
}

const ROOM_KEY_PREFIX = "room:call:";

function redisRoomKey(roomId: string): string {
  return `${ROOM_KEY_PREFIX}${roomId}`;
}

function computeTopology(participantCount: number): RoomTopology {
  return participantCount <= MESH_TOPOLOGY_THRESHOLD ? "mesh" : "sfu-hint";
}

export class RoomManager {
  private rooms = new Map<string, InternalRoom>();
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(private readonly opts: { idleTtlMs?: number; hardTtlMs?: number } = {}) {
    this.sweepTimer = setInterval(() => this.sweep(), 60_000);
    if (typeof this.sweepTimer === "object" && this.sweepTimer && "unref" in this.sweepTimer) {
      this.sweepTimer.unref();
    }
  }

  /** Called when a socket disconnects — purge from any room it occupies. */
  removeSocket(socketId: string): string[] {
    const affectedRooms: string[] = [];
    for (const room of this.rooms.values()) {
      for (const [userId, participant] of room.participants) {
        if (participant.socketId === socketId) {
          room.participants.delete(userId);
          room.lastActivityAt = Date.now();
          affectedRooms.push(room.roomId);
          void this.persist(room);
        }
      }
    }
    return affectedRooms;
  }

  join(roomId: string, participant: RoomParticipant): { room: RoomSnapshot; isNew: boolean } | { error: string } {
    if (!roomId || roomId.length > 128) return { error: "Invalid roomId" };

    let room = this.rooms.get(roomId);
    let isNew = false;
    if (!room) {
      room = {
        roomId,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        participants: new Map(),
      };
      this.rooms.set(roomId, room);
      isNew = true;
    }

    // Idempotent: joining twice just refreshes the record
    const existing = room.participants.get(participant.userId);
    if (!existing && room.participants.size >= MAX_PARTICIPANTS_PER_ROOM) {
      return { error: `Room full (max ${MAX_PARTICIPANTS_PER_ROOM})` };
    }

    room.participants.set(participant.userId, {
      ...participant,
      joinedAt: existing?.joinedAt ?? participant.joinedAt,
    });
    room.lastActivityAt = Date.now();
    void this.persist(room);

    return { room: this.snapshot(room), isNew };
  }

  leave(roomId: string, userId: string): RoomSnapshot | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    if (!room.participants.delete(userId)) return this.snapshot(room);

    room.lastActivityAt = Date.now();

    if (room.participants.size === 0) {
      this.rooms.delete(roomId);
      void this.evict(roomId);
      return null;
    }

    void this.persist(room);
    return this.snapshot(room);
  }

  updatePublishState(
    roomId: string,
    userId: string,
    patch: Partial<Pick<RoomParticipant, "audio" | "video" | "screen">>,
  ): RoomSnapshot | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const p = room.participants.get(userId);
    if (!p) return null;
    room.participants.set(userId, { ...p, ...patch });
    room.lastActivityAt = Date.now();
    void this.persist(room);
    return this.snapshot(room);
  }

  get(roomId: string): RoomSnapshot | null {
    const room = this.rooms.get(roomId);
    return room ? this.snapshot(room) : null;
  }

  /** Returns the room IDs a given user is currently in. */
  roomsForUser(userId: string): string[] {
    const ids: string[] = [];
    for (const room of this.rooms.values()) {
      if (room.participants.has(userId)) ids.push(room.roomId);
    }
    return ids;
  }

  stats(): { rooms: number; participants: number } {
    let participants = 0;
    for (const r of this.rooms.values()) participants += r.participants.size;
    return { rooms: this.rooms.size, participants };
  }

  dispose(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    this.rooms.clear();
  }

  // ─── internals ─────────────────────────────────────────────

  private snapshot(room: InternalRoom): RoomSnapshot {
    const participants = Array.from(room.participants.values()).sort(
      (a, b) => a.joinedAt - b.joinedAt,
    );
    return {
      roomId: room.roomId,
      createdAt: room.createdAt,
      topology: computeTopology(participants.length),
      participants,
    };
  }

  private sweep(): void {
    const now = Date.now();
    const idleTtl = this.opts.idleTtlMs ?? ROOM_IDLE_TTL_MS;
    const hardTtl = this.opts.hardTtlMs ?? ROOM_TTL_MS;
    for (const [roomId, room] of this.rooms) {
      const idle = room.participants.size === 0 && now - room.lastActivityAt > idleTtl;
      const tooOld = now - room.createdAt > hardTtl;
      if (idle || tooOld) {
        this.rooms.delete(roomId);
        void this.evict(roomId);
        logger.debug({ roomId, idle, tooOld }, "[RoomManager] Evicted stale room");
      }
    }
  }

  private async persist(room: InternalRoom): Promise<void> {
    if (!redisReady) return;
    try {
      await pubClient.set(
        redisRoomKey(room.roomId),
        JSON.stringify(this.snapshot(room)),
        { PX: this.opts.hardTtlMs ?? ROOM_TTL_MS },
      );
    } catch (err) {
      logger.debug({ err }, "[RoomManager] Redis persist failed (non-fatal)");
    }
  }

  private async evict(roomId: string): Promise<void> {
    if (!redisReady) return;
    try {
      await pubClient.del(redisRoomKey(roomId));
    } catch {
      /* ignore */
    }
  }
}

export const roomManager = new RoomManager();
