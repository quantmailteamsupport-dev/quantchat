/**
 * lib/useChatDB.ts  —  Data Access Layer Hook
 *
 * All Dexie reads/writes go through here.
 * Components import this hook — they never touch Dexie directly.
 */
"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, ChatMessage, Contact, conversationId, MessageStatus } from "./db";

// ─── CONTACTS ─────────────────────────────────────────────────

/** Reactive list of all contacts, sorted by last message time */
export function useContacts() {
  return useLiveQuery(
    () => db.contacts.orderBy("lastMessageAt").reverse().toArray(),
    [],
    [] as Contact[]
  );
}

/** Upsert a contact (called when a new message arrives from an unknown sender) */
export async function upsertContact(partial: Partial<Contact> & { id: string }) {
  const existing = await db.contacts.get(partial.id);
  if (existing) {
    await db.contacts.update(partial.id, partial);
  } else {
    await db.contacts.add({
      name: partial.name ?? partial.id,
      avatarColor: partial.avatarColor ?? "#6d4aff",
      avatarLetter: partial.avatarLetter ?? (partial.name?.[0]?.toUpperCase() ?? "?"),
      unreadCount: partial.unreadCount ?? 0,
      ...partial,  // includes id, and overrides defaults with any explicitly provided values
    } as Contact);
  }
}

// ─── MESSAGES ─────────────────────────────────────────────────

/** Reactive message list for a single conversation thread */
export function useMessages(myUserId: string, contactId: string) {
  const convId = conversationId(myUserId, contactId);
  return useLiveQuery(
    () =>
      db.messages
        .where("conversationId")
        .equals(convId)
        .sortBy("createdAt"),
    [convId],
    [] as ChatMessage[]
  );
}

/** Write an outgoing message immediately (optimistic UI) */
export async function addOptimisticMessage(
  myUserId: string,
  contactId: string,
  text: string,
  tempId: string
): Promise<ChatMessage> {
  const msg: ChatMessage = {
    id: tempId,
    conversationId: conversationId(myUserId, contactId),
    senderId: myUserId,
    receiverId: contactId,
    text,
    status: "sending",
    createdAt: Date.now(),
    isTemp: true,
  };
  await db.messages.add(msg);
  return msg;
}

/** Confirm an optimistic message with the real server ID */
export async function confirmOptimisticMessage(
  tempId: string,
  realId: string
): Promise<void> {
  const msg = await db.messages.get(tempId);
  if (!msg) return;
  await db.transaction("rw", db.messages, async () => {
    await db.messages.delete(tempId);
    await db.messages.add({ ...msg, id: realId, status: "sent", isTemp: false });
  });
}

/** Store an incoming message (received from socket) */
export async function storeIncomingMessage(
  myUserId: string,
  incoming: {
    id: string;
    senderId: string;
    text: string;
    createdAt: string;
  }
): Promise<void> {
  const existing = await db.messages.get(incoming.id);
  if (existing) return; // duplicate guard

  const msg: ChatMessage = {
    id: incoming.id,
    conversationId: conversationId(myUserId, incoming.senderId),
    senderId: incoming.senderId,
    receiverId: myUserId,
    text: incoming.text,
    status: "delivered",
    createdAt: new Date(incoming.createdAt).getTime(),
    deliveredAt: Date.now(),
  };

  await db.messages.add(msg);

  // Update contact metadata: last message + unread count
  const contact = await db.contacts.get(incoming.senderId);
  await db.contacts.put({
    id: incoming.senderId,
    name: contact?.name ?? incoming.senderId,
    avatarColor: contact?.avatarColor ?? "#6d4aff",
    avatarLetter: contact?.avatarLetter ?? incoming.senderId[0]?.toUpperCase(),
    lastMessageText: incoming.text,
    lastMessageAt: msg.createdAt,
    unreadCount: (contact?.unreadCount ?? 0) + 1,
    isGroup: contact?.isGroup,
    isMuted: contact?.isMuted,
  } as Contact);
}

/** Update message status (delivered / read) */
export async function updateMessageStatus(
  messageId: string,
  status: MessageStatus,
  timestamp?: number
): Promise<void> {
  const update: Partial<ChatMessage> = { status };
  if (status === "delivered") update.deliveredAt = timestamp ?? Date.now();
  if (status === "read") update.readAt = timestamp ?? Date.now();
  await db.messages.update(messageId, update);
}

/** Mark all messages in a conversation as read */
export async function markConversationRead(
  myUserId: string,
  contactId: string
): Promise<void> {
  const convId = conversationId(myUserId, contactId);
  const now = Date.now();
  await db.transaction("rw", db.messages, db.contacts, async () => {
    // Mark messages read
    await db.messages
      .where("conversationId").equals(convId)
      .and((m) => m.receiverId === myUserId && m.status !== "read")
      .modify({ status: "read", readAt: now });
    // Reset unread count on contact
    await db.contacts.update(contactId, { unreadCount: 0 });
  });
}

/** Clear unread badge without writing read receipts to message rows */
export async function clearConversationUnread(contactId: string): Promise<void> {
  await db.contacts.update(contactId, { unreadCount: 0 });
}

/** Hook: unread count for a specific contact */
export function useUnreadCount(contactId: string) {
  return useLiveQuery(
    () => db.contacts.get(contactId).then((c) => c?.unreadCount ?? 0),
    [contactId],
    0
  );
}
