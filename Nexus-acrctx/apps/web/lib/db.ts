/**
 * lib/db.ts  —  Dexie Local Database Schema  (v2)
 *
 * Single source of truth for all local persistent state.
 * All message content is stored as DECRYPTED plaintext client-side.
 * The backend only ever sees ciphertext.
 */
import Dexie, { type Table } from "dexie";

// ─── Message (local, decrypted) ──────────────────────────────
export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";

export interface ChatMessage {
  id: string;               // Server-assigned UUID (or temp local ID for optimistic)
  conversationId: string;   // = sorted pair of userIds: "userA::userB"
  senderId: string;
  receiverId: string;
  text: string;             // Decrypted plaintext — never leaves the device
  status: MessageStatus;
  createdAt: number;        // Unix ms for fast range queries
  deliveredAt?: number;
  readAt?: number;
  isTemp?: boolean;         // True while in-flight. Replaced once server ack arrives.
  // Disappearing-message TTL, absolute epoch millis. When now > expiresAt
  // the local sweeper removes this row. Undefined = does not disappear.
  expiresAt?: number;
}

// ─── Contact / Conversation Metadata ─────────────────────────
export interface Contact {
  id: string;               // remote userId
  name: string;
  avatarColor: string;
  avatarLetter: string;
  lastMessageText?: string;
  lastMessageAt?: number;
  unreadCount: number;
  isGroup?: boolean;
  isMuted?: boolean;
  // Per-conversation default disappearing TTL in seconds.
  // null/undefined = disappearing messages OFF.
  disappearingSecs?: number | null;
  // Server conversation id (if known). Required to toggle per-conversation
  // defaults on the backend. For purely-local peer chats this stays undefined.
  serverConversationId?: string;
}

// ─── Database Class ───────────────────────────────────────────
export class QuantchatDB extends Dexie {
  messages!: Table<ChatMessage, string>;
  contacts!: Table<Contact, string>;

  constructor() {
    super("QuantchatDatabase");

    this.version(2).stores({
      // Indexed:  id (PK), conversationId (for thread queries), createdAt (for sorting)
      messages: "id, conversationId, senderId, receiverId, createdAt, status, isTemp",
      // Indexed:  id (PK), lastMessageAt (for sorting contact list)
      contacts: "id, lastMessageAt",
    });

    // v3 — disappearing messages. Adds expiresAt index so the local
    // sweeper can efficiently find messages past their TTL.
    this.version(3).stores({
      messages: "id, conversationId, senderId, receiverId, createdAt, status, isTemp, expiresAt",
      contacts: "id, lastMessageAt",
    });
  }
}

export const db = new QuantchatDB();

// ─── Helpers ─────────────────────────────────────────────────

/** Deterministic conversation ID — same for both users */
export function conversationId(userA: string, userB: string): string {
  return [userA, userB].sort().join("::");
}
