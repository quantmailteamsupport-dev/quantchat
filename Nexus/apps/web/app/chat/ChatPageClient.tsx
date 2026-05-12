"use client";

/**
 * app/chat/page.tsx
 *
 * Production chat page â€” fully wired to real backend.
 *
 * Data flow:
 *   SEND:    input â†’ addOptimisticMessage â†’ sendEncryptedMessage (socket)
 *              â†“ server ack â†’ confirmOptimisticMessage (swap tempId â†’ realId)
 *   RECEIVE: socket "receive-message" â†’ storeIncomingMessage (Dexie)
 *              â†’ useLiveQuery auto-rerenders the list
 *   STATUS:  socket "delivery-receipt" â†’ updateMessageStatus (Dexie)
 *
 * Architecture:
 *   - useSignalSocket:  socket connect/send/subscribe
 *   - useChatDB:        all Dexie reads (reactive via useLiveQuery)
 *   - No dummy data.    No static arrays.
 */

import { memo, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSignalSocket } from "@/lib/useSignalSocket";
import AudioCall from "@/components/AudioCall";
import ChatRail from "@/components/ChatRail";
import ChatDetails from "@/components/ChatDetails";
import ServersSidebar from "@/components/ServersSidebar";
import ChillRoomModal from "@/components/ChillRoomModal";
import { ContactAvatar, Icon } from "@/components/qc-shared";
import { DeliveryStatusBadge, MessageReactions } from "@/components/MessageMeta";
import SpoilerShieldText, {
  encodeSpoilerShieldText,
  parseSpoilerShieldText,
  type SpoilerShieldMode,
} from "@/components/SpoilerShieldText";
import { TrustSnapshotCard } from "@/components/TrustSnapshotCard";
import BiometricHandshake from "@/components/BiometricHandshake";
import { MOCK_SERVERS } from "@/lib/mockChatData";
import { useQuantchatIdentity } from "@/lib/useQuantchatIdentity";
import {
  useContacts,
  useMessages,
  addOptimisticMessage,
  confirmOptimisticMessage,
  storeIncomingMessage,
  updateMessageStatus,
  clearConversationUnread,
  markConversationRead,
  upsertContact,
} from "@/lib/useChatDB";
import { useFrontendPreferences, type ReadReceiptMode } from "@/lib/useFrontendPreferences";
import type { Contact, ChatMessage } from "@/lib/db";
import { getEmotionDetectionService, getAdaptiveThemeEngine } from "@/lib/emotion";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface TypingState {
  [senderId: string]: boolean;
}

type ContactFilter = "all" | "unread" | "groups" | "priority";

const CONTACT_FILTERS: Array<{ key: ContactFilter; label: string }> = [
  { key: "priority", label: "Priority" },
  { key: "unread", label: "Unread" },
  { key: "groups", label: "Groups" },
  { key: "all", label: "All" },
];

function getContactPriorityScore(contact: Contact): number {
  const unreadBoost = Math.min(contact.unreadCount, 12) * 4;
  const groupBoost = contact.isGroup ? 8 : 0;
  const mutedPenalty = contact.isMuted ? -10 : 0;
  const ageMs = contact.lastMessageAt ? Date.now() - contact.lastMessageAt : Number.POSITIVE_INFINITY;

  let freshnessBoost = 0;
  if (ageMs <= 15 * 60 * 1000) freshnessBoost = 12;
  else if (ageMs <= 60 * 60 * 1000) freshnessBoost = 8;
  else if (ageMs <= 24 * 60 * 60 * 1000) freshnessBoost = 4;

  return unreadBoost + groupBoost + mutedPenalty + freshnessBoost;
}

function formatReceiptMode(mode: ReadReceiptMode): string {
  if (mode === "delayed") return "Delayed";
  if (mode === "batch") return "Batch";
  return "Instant";
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ROOT COMPONENT â€“ manages socket lifecycle and routing
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export default function ChatPage() {
  const { requestedUserId, authToken } = useQuantchatIdentity();
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [typing, setTyping] = useState<TypingState>({});
  const [activeServerId, setActiveServerId] = useState<string | undefined>();
  const [activeChannelId, setActiveChannelId] = useState<string | undefined>();
  const [sidebarSection, setSidebarSection] = useState<"dms" | "servers">("dms");
  const { preferences } = useFrontendPreferences();
  const { userId: activeUserId, isConnected, sendEncryptedMessage, subscribeToMessages, subscribeToReceipts, sendTyping, socket } =
    useSignalSocket(requestedUserId, authToken);

  // â”€â”€â”€ Subscribe to incoming messages globally â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (!activeUserId) return;
    const unsub = subscribeToMessages(async (msg) => {
      await storeIncomingMessage(activeUserId, {
        id: msg.id,
        senderId: msg.senderId,
        text: msg.plaintext,
        createdAt: msg.createdAt,
      });
      // Ensure sender exists as a contact
      await upsertContact({
        id: msg.senderId,
        name: msg.senderId, // Replace with profile lookup
        avatarColor: "#6d4aff",
        avatarLetter: msg.senderId[0]?.toUpperCase() ?? "?",
        lastMessageText: msg.plaintext,
        lastMessageAt: Date.now(),
      });
    });
    return unsub;
  }, [activeUserId, subscribeToMessages]);

  // â”€â”€â”€ Subscribe to delivery receipts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    const unsub = subscribeToReceipts(async (receipt) => {
      const status = receipt.status === "DELIVERED" ? "delivered" : "read";
      await updateMessageStatus(
        receipt.messageId,
        status,
        receipt.deliveredAt ? new Date(receipt.deliveredAt).getTime()
          : receipt.readAt ? new Date(receipt.readAt).getTime()
          : undefined
      );
    });
    return unsub;
  }, [subscribeToReceipts]);

  // ————————————————————— Subscribe to typing indicators ———————————————————————————
  useEffect(() => {
    if (!socket) return;
    const listener = (data: { senderId: string; isTyping: boolean }) => {
      setTyping((t) => ({ ...t, [data.senderId]: data.isTyping }));
    };
    socket.on("typing", listener);
    return () => { socket.off("typing", listener); };
  }, [socket]);

  // ————————————————————— Subscribe to emotion engine ——————————————————————————————
  useEffect(() => {
    const engine = getAdaptiveThemeEngine();
    const detector = getEmotionDetectionService();
    engine.start();
    detector.start();

    const unsub = detector.subscribe((est) => {
      engine.applyFromDetector(est.emotion);
    });

    const handleTap = () => detector.ingestTap();
    window.addEventListener("pointerdown", handleTap);

    return () => {
      unsub();
      window.removeEventListener("pointerdown", handleTap);
    };
  }, []);

  const openContact = useCallback((contact: Contact) => {
    setActiveContact(contact);
    setActiveChannelId(undefined);

    if (activeUserId && preferences.readReceiptsEnabled && preferences.readReceiptMode === "instant") {
      void markConversationRead(activeUserId, contact.id);
    } else {
      void clearConversationUnread(contact.id);
    }
  }, [activeUserId, preferences.readReceiptMode, preferences.readReceiptsEnabled]);

  if (!activeUserId) {
    return (
      <div className="qc qc-chat-app" data-testid="chat-auth-required" style={{
        minHeight: "100%",
        display: "grid",
        placeItems: "center",
        background: "var(--qc-bg)",
        color: "var(--qc-ink)",
        padding: 24,
        textAlign: "center",
      }}>
        <div style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 28, marginBottom: 10 }}>Sign in to open secure chat</h1>
          <p style={{ color: "var(--qc-ink-3)", lineHeight: 1.6 }}>QuantChat needs a verified identity before starting encrypted realtime sessions.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="qc qc-chat-app" data-testid="chat-control-room-shell" data-density={preferences.compactChatLayout ? "compact" : "regular"} style={{
      display: "grid",
      gridTemplateColumns: "260px 320px 1fr 280px",
      height: "100%", minHeight: 0,
      background: "var(--qc-bg)",
    }}>
      <ChatRail activeId={activeContact?.id || activeChannelId} />

      {/* ── Desktop Hybrid Sidebar (hidden on mobile) ── */}
      <aside
        className="desktop-sidebar qc-scroll"
        style={{
          borderRight: "1px solid var(--qc-line)",
          background: "var(--qc-bg)",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <ContactList onSelect={openContact} activeContactId={activeContact?.id} />
      </aside>

      {/* ── Main content area ── */}
      <main className="qc-chat-stage" data-testid="chat-main-stage" style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <AnimatePresence mode="wait">
          {activeContact ? (
            <motion.div
              key={`conv-${activeContact.id}`}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 350, damping: 35 }}
              style={{ position: "absolute", inset: 0 }}
            >
              <ChatConversation
                contact={activeContact}
                myUserId={activeUserId}
                onBack={() => setActiveContact(null)}
                sendEncryptedMessage={sendEncryptedMessage}
                sendTyping={sendTyping}
                isContactTyping={typing[activeContact.id] ?? false}
                showReactions={preferences.reactionsEnabled}
                readReceiptsEnabled={preferences.readReceiptsEnabled}
                readReceiptMode={preferences.readReceiptsEnabled ? preferences.readReceiptMode : "instant"}
                compactLayout={preferences.compactChatLayout}
                aiReplySuggestionsEnabled={preferences.aiReplySuggestionsEnabled}
              />
            </motion.div>
          ) : activeChannelId ? (
            <motion.div
              key={`channel-${activeChannelId}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{
                position: "absolute", inset: 0, display: "flex",
                alignItems: "center", justifyContent: "center",
                flexDirection: "column", gap: 12,
              }}
            >
              <div style={{ fontSize: 48 }}>⇅</div>
              <span style={{ color: "var(--qc-ink-3)", fontSize: 15, fontFamily: "-apple-system,sans-serif" }}>
                #{activeChannelId} — coming soon
              </span>
            </motion.div>
          ) : (
            <div key="list" style={{ position: "absolute", inset: 0 }} className="mobile-contact-list">
              <ContactList onSelect={openContact} activeContactId={undefined} />
            </div>
          )}
        </AnimatePresence>
      </main>

      {/* ── Right details panel ── */}
      <ChatDetails contact={activeContact} />
    </div>
  );
}

function ContactList({
  onSelect,
  activeContactId,
}: {
  onSelect: (c: Contact) => void;
  activeContactId?: string;
}) {
  const contacts = useContacts(); // reactive, auto-updates on new messages
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ContactFilter>("all");
  const normalizedSearch = (search ?? "").trim().toLowerCase();

  const filterCounts = useMemo<Record<ContactFilter, number>>(() => {
    let unread = 0;
    let groups = 0;
    let priority = 0;

    for (const contact of contacts) {
      if (contact.unreadCount > 0) unread += 1;
      if (contact.isGroup) groups += 1;
      if (getContactPriorityScore(contact) > 0) priority += 1;
    }

    return {
      all: contacts.length,
      unread,
      groups,
      priority,
    };
  }, [contacts]);

  const filtered = useMemo(() => {
    const visible = contacts.filter((contact) => {
      const matchesSearch = normalizedSearch.length === 0
        || contact.name.toLowerCase().includes(normalizedSearch)
        || (contact.lastMessageText ?? "").toLowerCase().includes(normalizedSearch);
      if (!matchesSearch) return false;

      if (activeFilter === "unread") return contact.unreadCount > 0;
      if (activeFilter === "groups") return Boolean(contact.isGroup);
      if (activeFilter === "priority") return getContactPriorityScore(contact) > 0;
      return true;
    });

    visible.sort((a, b) => {
      if (activeFilter === "priority") {
        const scoreDelta = getContactPriorityScore(b) - getContactPriorityScore(a);
        if (scoreDelta !== 0) return scoreDelta;
      }
      return (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0);
    });

    return visible;
  }, [contacts, normalizedSearch, activeFilter]);

  const topPriorityContact = useMemo(() => {
    const prioritized = contacts
      .filter((contact) => {
        const matchesSearch = normalizedSearch.length === 0
          || contact.name.toLowerCase().includes(normalizedSearch)
          || (contact.lastMessageText ?? "").toLowerCase().includes(normalizedSearch);
        return matchesSearch && getContactPriorityScore(contact) > 0;
      })
      .sort((a, b) => {
        const scoreDelta = getContactPriorityScore(b) - getContactPriorityScore(a);
        if (scoreDelta !== 0) return scoreDelta;
        return (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0);
      });

    return prioritized[0];
  }, [contacts, normalizedSearch]);

  return (
    <div style={{
      width: "100%", height: "100%", display: "flex", flexDirection: "column",
      background: "var(--qc-bg)", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 16px 8px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: "var(--qc-ink)", fontFamily: "-apple-system,sans-serif" }}>
          Chats
        </span>
        <div style={{ display: "flex", gap: 18, color: "var(--qc-ink-3)", fontSize: 20 }}>
          <span style={{ cursor: "pointer" }}>⊕</span>
          <span style={{ cursor: "pointer" }}>⋮</span>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: "0 12px 10px" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "var(--qc-bg-2)", borderRadius: 12, padding: "9px 14px",
        }}>
          <span style={{ color: "var(--qc-ink-4)", fontSize: 16 }}>🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            style={{
              background: "none", border: "none", outline: "none",
              color: "var(--qc-ink)", fontSize: 15, flex: 1,
              fontFamily: "-apple-system,sans-serif",
            }}
          />
        </div>
      </div>

      {/* Smart filters for one-tap inbox triage */}
      <div style={{
        display: "flex", gap: 8, padding: "0 12px 10px",
        overflowX: "auto", scrollbarWidth: "none",
      }}>
        {CONTACT_FILTERS.map((filter) => {
          const isActive = activeFilter === filter.key;
          const count = filterCounts[filter.key];
          return (
            <button
              key={filter.key}
              type="button"
              onClick={() => setActiveFilter(filter.key)}
              style={{
                borderRadius: 999,
                border: isActive ? "1px solid var(--qc-accent)" : "1px solid var(--qc-line)",
                background: isActive ? "oklch(from var(--qc-accent) l c h / 0.2)" : "var(--qc-bg-3)",
                color: isActive ? "var(--qc-accent)" : "var(--qc-ink-3)",
                padding: "6px 11px",
                fontSize: 12,
                fontWeight: isActive ? 700 : 500,
                cursor: "pointer",
                whiteSpace: "nowrap",
                fontFamily: "-apple-system,sans-serif",
              }}
            >
              {filter.label} {count > 0 ? `(${count})` : ""}
            </button>
          );
        })}
      </div>

      {topPriorityContact && (
        <div style={{ padding: "0 12px 10px" }}>
          <button
            type="button"
            onClick={() => onSelect(topPriorityContact)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              borderRadius: 12,
              border: "1px solid oklch(from var(--qc-accent) l c h / 0.4)",
              background: "oklch(from var(--qc-accent) l c h / 0.1)",
              color: "var(--qc-accent)",
              padding: "10px 12px",
              cursor: "pointer",
              fontFamily: "-apple-system,sans-serif",
            }}
            aria-label={`Open top priority conversation with ${topPriorityContact.name}`}
          >
            <span style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Open top priority
            </span>
          </button>
        </div>
      )}

      {/* Empty state */}
      {contacts.length === 0 && (
        <div data-testid="chat-list-empty-state" style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 12,
          padding: "40px 24px",
          color: "var(--qc-ink-3)",
          textAlign: "center",
        }}>
          <div aria-hidden="true" style={{
            width: 56, height: 56, borderRadius: 14, display: "grid", placeItems: "center",
            background: "var(--qc-accent-bg)", color: "var(--qc-accent)",
            border: "1px solid var(--qc-accent-line)",
          }}>
            <Icon name="users" size={24} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--qc-ink)" }}>
            No conversations yet
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.5, maxWidth: 280 }}>
            Once you connect with someone, your encrypted threads will land here.
          </div>
        </div>
      )}
      {contacts.length > 0 && filtered.length === 0 && (
        <div style={{
          padding: "18px 24px 12px",
          color: "var(--qc-ink-4)",
          fontSize: 13,
          textAlign: "center",
          fontFamily: "-apple-system,sans-serif",
        }}>
          No chats match this filter yet.
        </div>
      )}

      {/* Contact rows */}
      <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none" }}>
        {filtered.map((contact, i) => (
          <ContactRow
            key={contact.id}
            contact={contact}
            index={i}
            isActive={contact.id === activeContactId}
            onClick={() => onSelect(contact)}
          />
        ))}
      </div>
    </div>
  );
}

// ————————————————————————————————————————————————————————————————————————
// Single Contact Row 
// ————————————————————————————————————————————————————————————————————————
const ContactRow = memo(function ContactRow({ contact, index, isActive, onClick }: {
  contact: Contact; index: number; isActive?: boolean; onClick: () => void;
}) {
  const lastTime = contact.lastMessageAt
    ? formatTime(contact.lastMessageAt)
    : "";
  const lastMessagePreview = contact.lastMessageText
    ? parseSpoilerShieldText(contact.lastMessageText).text
    : "";
  return (
    <motion.div
      onClick={onClick}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index, 12) * 0.018 }}
      className="qc-conv"
      aria-selected={isActive}
    >
      <ContactAvatar contact={contact} size={40} />
      <div style={{ minWidth: 0, overflow: "hidden" }}>
        <div className="qc-conv-name">
          {contact.isGroup && <span style={{ color: "var(--qc-ink-3)", fontSize: 13, marginRight: 2 }}>#</span>}
          {contact.name}
        </div>
        <div className="qc-conv-preview">
          {lastMessagePreview || <span style={{ fontStyle: "italic", opacity: 0.6 }}>No messages yet</span>}
        </div>
      </div>
      <div className="qc-conv-meta">
        {lastTime && <span className="qc-conv-time">{lastTime}</span>}
        {contact.unreadCount > 0 ? (
          <span className="qc-conv-unread">
            {contact.unreadCount > 99 ? "99+" : contact.unreadCount}
          </span>
        ) : (
          <span style={{ color: "var(--qc-ink-4)", fontSize: 12 }}>✓✓</span>
        )}
      </div>
    </motion.div>
  );
});
ContactRow.displayName = "ContactRow";

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CHAT CONVERSATION  â€”  messages from Dexie (useLiveQuery)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function ChatConversation({
  contact,
  myUserId,
  onBack,
  sendEncryptedMessage,
  sendTyping,
  isContactTyping,
  showReactions,
  readReceiptsEnabled,
  readReceiptMode,
  compactLayout,
  aiReplySuggestionsEnabled,
}: {
  contact: Contact;
  myUserId: string;
  onBack: () => void;
  sendEncryptedMessage: (recipientId: string, plaintext: string) => Promise<void>;
  sendTyping: (receiverId: string, isTyping: boolean) => void;
  isContactTyping: boolean;
  showReactions: boolean;
  readReceiptsEnabled: boolean;
  readReceiptMode: ReadReceiptMode;
  compactLayout: boolean;
  aiReplySuggestionsEnabled: boolean;
}) {
  const messages = useMessages(myUserId, contact.id); // reactive
  const [input, setInput] = useState("");
  const [showAttach, setShowAttach] = useState(false);
  const [isAudioCallOpen, setIsAudioCallOpen] = useState(false);
  const [chillRoomOpen, setChillRoomOpen] = useState(false);
  const [showHandshake, setShowHandshake] = useState(false);
  const [isHandshakeVerified, setIsHandshakeVerified] = useState(false);
  const [spoilerShieldEnabled, setSpoilerShieldEnabled] = useState(false);
  const [spoilerShieldMode, setSpoilerShieldMode] = useState<SpoilerShieldMode>("auto");
  const [ghostSuggestion, setGhostSuggestion] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ghostTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readReceiptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onInitiateHandshake = useCallback(() => setShowHandshake(true), []);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Mark all read when conversation opens
  useEffect(() => {
    if (readReceiptTimerRef.current) {
      clearTimeout(readReceiptTimerRef.current);
      readReceiptTimerRef.current = null;
    }

    if (!readReceiptsEnabled) {
      void clearConversationUnread(contact.id);
      return;
    }

    if (readReceiptMode === "instant") {
      void markConversationRead(myUserId, contact.id);
      return;
    }

    if (readReceiptMode === "delayed") {
      readReceiptTimerRef.current = setTimeout(() => {
        void markConversationRead(myUserId, contact.id);
      }, 4500);
      return () => {
        if (readReceiptTimerRef.current) {
          clearTimeout(readReceiptTimerRef.current);
          readReceiptTimerRef.current = null;
        }
      };
    }

    void clearConversationUnread(contact.id);
  }, [contact.id, myUserId, readReceiptMode, readReceiptsEnabled]);

  useEffect(() => {
    if (!aiReplySuggestionsEnabled) {
      setGhostSuggestion("");
    }
  }, [aiReplySuggestionsEnabled]);

  const handleInputChange = useCallback((val: string) => {
    setInput(val);
    setGhostSuggestion(""); // clear old suggestion immediately
    sendTyping(contact.id, true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => sendTyping(contact.id, false), 2000);

    if (!aiReplySuggestionsEnabled) {
      return;
    }

    // BCI ghost text: debounced prediction after 400ms of idle typing
    if (ghostTimerRef.current) clearTimeout(ghostTimerRef.current);
    if ((val ?? "").trim().length >= 2) {
      ghostTimerRef.current = setTimeout(async () => {
        try {
          const recentTexts = messages.slice(-5).map((m) => m.text);
          const resp = await fetch("/api/predict-typing", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ currentInput: val, recentMessages: recentTexts }),
          });
          if (resp.ok) {
            const data = await resp.json() as { suggestion?: string };
            setGhostSuggestion(data.suggestion ?? "");
          }
        } catch {
          // ignore prediction errors silently
        }
      }, 400);
    }
  }, [aiReplySuggestionsEnabled, contact.id, sendTyping, messages]);

  const handleSend = useCallback(async () => {
    const baseText = (input ?? "").trim();
    if (!baseText) return;

    const text = spoilerShieldEnabled
      ? encodeSpoilerShieldText(baseText, spoilerShieldMode)
      : baseText;

    setInput("");
    setGhostSuggestion("");
    setSpoilerShieldEnabled(false);
    sendTyping(contact.id, false);

    getEmotionDetectionService().ingestMessage(text);

    const tempId = `temp_${Date.now()}_${Math.random()}`;
    await addOptimisticMessage(myUserId, contact.id, text, tempId);

    try {
      await sendEncryptedMessage(contact.id, text);
      await confirmOptimisticMessage(tempId, tempId.replace("temp_", "real_"));
    } catch {
      const { updateMessageStatus } = await import("@/lib/useChatDB");
      await updateMessageStatus(tempId, "failed");
    }
  }, [contact.id, input, myUserId, sendEncryptedMessage, sendTyping, spoilerShieldEnabled, spoilerShieldMode]);

  const handleRetry = useCallback(async (failedMessage: ChatMessage) => {
    const { updateMessageStatus } = await import("@/lib/useChatDB");
    await updateMessageStatus(failedMessage.id, "sending");
    try {
      await sendEncryptedMessage(contact.id, failedMessage.text);
      await updateMessageStatus(failedMessage.id, "sent");
    } catch {
      await updateMessageStatus(failedMessage.id, "failed");
    }
  }, [contact.id, sendEncryptedMessage]);

  const ATTACH_ITEMS = [
    { emoji: "IMG", label: "Gallery", color: "#7B5EA7" },
    { emoji: "CAM", label: "Camera", color: "#E53935" },
    { emoji: "LOC", label: "Location", color: "#43A047" },
    { emoji: "CON", label: "Contact", color: "#1E88E5" },
    { emoji: "DOC", label: "Document", color: "#7B5EA7" },
    { emoji: "AUD", label: "Audio", color: "#F4511E" },
    { emoji: "POL", label: "Poll", color: "#3949AB" },
    { emoji: "PAY", label: "Payment", color: "#00897B" },
  ];
  return (
    <div className="qc-conversation-stage" data-testid="chat-conversation-stage" style={{
      width: "100%", height: "100%", display: "flex", flexDirection: "column",
      background: "#ffffff", position: "relative",
    }}>
      {/* Background pattern */}
      <div style={{
        position: "absolute", inset: 0, opacity: 0.04, pointerEvents: "none",
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4z' fill='%23fff'/%3E%3C/svg%3E")`,
      }} />

      {/* Chill Room Modal */}
      <ChillRoomModal
        isOpen={chillRoomOpen}
        onClose={() => setChillRoomOpen(false)}
        spaceName={`${contact.name} Chill Room`}
      />

      {/* Header */}
      <div className="qc-conversation-header" data-testid="chat-conversation-header" style={{
        display: "flex", alignItems: "center", padding: "10px 12px", gap: 10,
        background: "#ffffff", zIndex: 10, flexShrink: 0,
        boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
      }}>
        <button data-testid="chat-back-button" onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#002FA7", fontSize: 20, padding: 4 }}>←</button>
        <ContactAvatar contact={contact} size={40} />
        <div style={{ flex: 1 }}>
          <div data-testid="chat-active-contact-name" className="qc-display" style={{ color: "#09090b", fontWeight: 800, fontSize: 18 }}>
            {contact.name}
          </div>
          <div data-testid="chat-active-contact-status" className="mono" style={{ color: "#52525B", fontSize: 11 }}>
            {isContactTyping ? (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{ color: "#00C853" }}
              >
                typing…
              </motion.span>
            ) : "tap for contact info"}
            <span style={{ marginLeft: 6, color: "#002FA7" }}>
              {`Receipts ${readReceiptsEnabled ? formatReceiptMode(readReceiptMode) : "Off"}`}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {/* Enter Chill Room button */}
          <motion.button
            data-testid="chat-open-chill-room-button"
            className="qc-chat-action-button"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setChillRoomOpen(true)}
            style={{
              background: "#ffffff",
              border: "none",
              borderRadius: 20,
              padding: "5px 10px",
              cursor: "pointer",
              color: "#09090b",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              display: "flex",
              alignItems: "center",
              gap: 4,
              boxShadow: "none",
              whiteSpace: "nowrap",
            }}
          >
            Chill Room
          </motion.button>

          {/* Biometric Handshake trigger */}
          {!isHandshakeVerified && (
            <motion.button
              data-testid="chat-handshake-button"
              className="qc-chat-action-button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onInitiateHandshake}
              style={{
                background: "#ffffff",
                border: "1px solid rgba(9,9,11,0.14)",
                borderRadius: 20,
                padding: "5px 10px",
                cursor: "pointer",
                color: "#002FA7",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                display: "flex",
                alignItems: "center",
                gap: 4,
                boxShadow: "none",
                whiteSpace: "nowrap",
              }}
            >
              Handshake
            </motion.button>
          )}

          {isHandshakeVerified && (
            <div style={{
              background: "rgba(0, 245, 255, 0.15)",
              border: "1px solid rgba(0, 245, 255, 0.5)",
              borderRadius: 20,
              padding: "5px 10px",
              color: "#002FA7",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}>
              Obsidian Class
            </div>
          )}

          <span data-testid="chat-video-placeholder-button" className="mono" style={{ cursor: "pointer", color: "#002FA7", fontSize: 11, fontWeight: 800 }}>VIDEO</span>
          <button
            data-testid="chat-audio-call-button"
            onClick={() => setIsAudioCallOpen(true)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#002FA7",
              fontSize: 11,
              fontWeight: 800,
              padding: 0,
            }}
            aria-label={`Start encrypted audio call with ${contact.name}`}
          >
            CALL
          </button>
          <span data-testid="chat-more-menu-placeholder" className="mono" style={{ cursor: "pointer", color: "#52525B", fontSize: 16 }}>•••</span>
        </div>
      </div>

      {isAudioCallOpen && (
        <AudioCall
          myUserId={myUserId}
          peerId={contact.id}
          peerName={contact.name}
          open={isAudioCallOpen}
          onClose={() => setIsAudioCallOpen(false)}
        />
      )}

      {showHandshake && (
        <BiometricHandshake
          partnerName={contact.name}
          onCancel={() => setShowHandshake(false)}
          onVerified={() => {
            setIsHandshakeVerified(true);
            setShowHandshake(false);
          }}
        />
      )}

      {/* Messages */}
      <div className="qc-message-stream" data-testid="chat-message-stream" style={{
        flex: 1, overflowY: "auto", padding: "12px 10px",
        scrollbarWidth: "none", zIndex: 5, position: "relative",
        display: "flex", flexDirection: "column", gap: compactLayout ? 1 : 2,
      }}>
        {messages.length === 0 && (
          <div className="qc-chat-empty-state" data-testid="chat-empty-state" style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            color: "var(--qc-ink-3)", fontSize: 13, fontFamily: "var(--qc-font-ui)",
            padding: "60px 20px", textAlign: "center", gap: 14, maxWidth: 380, margin: "0 auto",
          }}>
            <div aria-hidden="true" style={{
              width: 56, height: 56, borderRadius: 14, display: "grid", placeItems: "center",
              background: "var(--qc-accent-bg)", color: "var(--qc-accent)",
              border: "1px solid var(--qc-accent-line)",
            }}>
              <Icon name="shield-check" size={26} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--qc-ink)" }}>
              Start of your conversation with {contact.name}
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--qc-ink-3)" }}>
              Messages are end-to-end encrypted — only you and {contact.name} can read them.
              Say hi to break the silence.
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            isMine={msg.senderId === myUserId}
            showReactions={showReactions}
            readReceiptsEnabled={readReceiptsEnabled}
            readReceiptMode={readReceiptMode}
            compactLayout={compactLayout}
            onRetry={msg.status === "failed" ? () => handleRetry(msg) : undefined}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Attachment tray */}
      <AnimatePresence>
        {showAttach && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 350, damping: 30 }}
            className="qc-attach-tray"
            data-testid="chat-attachment-tray"
            style={{
              background: "#ffffff", padding: "20px 16px 12px",
              zIndex: 20, flexShrink: 0,
              display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px 8px",
            }}
          >
            {ATTACH_ITEMS.map((a) => (
              <button
                key={a.label}
                onClick={() => setShowAttach(false)}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                  background: "none", border: "none", cursor: "pointer",
                }}
              >
                <div style={{
                  width: 52, height: 52, borderRadius: 16, background: a.color,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
                }}>
                  {a.emoji}
                </div>
                <span style={{ color: "#aebac1", fontSize: 11, fontFamily: "-apple-system,sans-serif" }}>
                  {a.label}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <TrustSnapshotCard
        context="compose"
        draftText={input}
        recipientName={contact.name}
      />

      {/* Input bar */}
        <div className="qc-input-bar" data-testid="chat-input-bar" style={{
        display: "flex", alignItems: "flex-end", gap: 8,
        padding: "10px 12px 12px", background: "#ffffff", flexShrink: 0, zIndex: 10,
      }}>
        <motion.button
          type="button"
          data-testid="chat-spoiler-toggle-button"
          onClick={() => setSpoilerShieldEnabled((enabled) => !enabled)}
          animate={{
            background: spoilerShieldEnabled ? "rgba(83,189,235,0.2)" : "rgba(255,255,255,0.04)",
            border: spoilerShieldEnabled ? "1px solid rgba(83,189,235,0.55)" : "1px solid rgba(255,255,255,0.08)",
            boxShadow: spoilerShieldEnabled ? "0 0 10px rgba(83,189,235,0.25)" : "none",
          }}
          title={spoilerShieldEnabled ? "Spoiler Shield: ON" : "Spoiler Shield: OFF"}
          style={{
            minWidth: 78,
            height: 40,
            borderRadius: 999,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.03em",
            flexShrink: 0,
            padding: "0 12px",
            marginBottom: 4,
            color: spoilerShieldEnabled ? "#53bdeb" : "#aebac1",
          }}
        >
          SPOILER
        </motion.button>
        {spoilerShieldEnabled && (
          <motion.button
            type="button"
            onClick={() => setSpoilerShieldMode((mode) => (mode === "auto" ? "hold" : "auto"))}
            whileTap={{ scale: 0.96 }}
            title={spoilerShieldMode === "auto" ? "Auto re-hide enabled" : "Manual hide mode"}
            style={{
              minWidth: 58,
              height: 36,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.06)",
              color: "#cfd7dc",
              cursor: "pointer",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.03em",
              flexShrink: 0,
              padding: "0 10px",
              marginBottom: 6,
            }}
          >
            {spoilerShieldMode === "auto" ? "AUTO" : "HOLD"}
          </motion.button>
        )}

        <div className="qc-composer" style={{
          flex: 1, display: "flex", alignItems: "center", gap: 6,
          padding: "9px 14px", minHeight: 46, position: "relative",
        }}>
          <button data-testid="chat-tone-button" className="mono" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#002FA7", fontWeight: 800 }}>TONE</button>

          {/* Ghost-text + real input wrapper */}
          <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center" }}>
            {/* Ghost suggestion overlay (shown behind the cursor) */}
            {ghostSuggestion && (input ?? "").trim() && (
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: 0,
                  top: "50%",
                  transform: "translateY(-50%)",
                  pointerEvents: "none",
                  whiteSpace: "pre",
                  fontSize: 15,
                  fontFamily: "-apple-system,sans-serif",
                  color: "transparent",
                  userSelect: "none",
                }}
              >
                {input}
                <span style={{ color: "rgba(174,186,193,0.45)" }}>{ghostSuggestion}</span>
              </div>
            )}
            <input
              data-testid="chat-message-input"
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key.length === 1 || e.key === "Backspace" || e.key === "Enter") {
                  getEmotionDetectionService().ingestKeystroke(e.key);
                }
                if (e.key === "Tab" && ghostSuggestion) {
                  e.preventDefault();
                  const accepted = input + ghostSuggestion;
                  setInput(accepted);
                  setGhostSuggestion("");
                  sendTyping(contact.id, false);
                } else if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={ghostSuggestion ? "" : "Write a secure message"}
              style={{
                background: "transparent", border: "none", outline: "none",
                color: "#e9edef", fontSize: 15, flex: 1, width: "100%",
                fontFamily: "-apple-system,sans-serif",
                caretColor: "#e9edef",
              }}
            />
          </div>

          {/* Ghost suggestion pill hint */}
          {ghostSuggestion && (input ?? "").trim() && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              style={{
                flexShrink: 0,
                background: "rgba(109,74,255,0.18)",
                border: "1px solid rgba(109,74,255,0.35)",
                borderRadius: 8,
                padding: "2px 7px",
                fontSize: 10,
                color: "#bf5af2",
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
              onClick={() => {
                setInput(input + ghostSuggestion);
                setGhostSuggestion("");
              }}
              title="Press Tab to accept"
            >
              Tab ↹
            </motion.div>
          )}

          <button data-testid="chat-attach-button" className="mono" onClick={() => setShowAttach((a) => !a)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#002FA7", fontWeight: 800 }}>ADD</button>
          <button data-testid="chat-camera-button" className="mono" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#002FA7", fontWeight: 800 }}>CAM</button>
        </div>
        <button
          data-testid="chat-send-message-button"
          className="qc-send-button"
          onClick={handleSend}
          style={{
            width: 48, height: 48, borderRadius: "50%",
            background: (input ?? "").trim() ? "var(--emotion-accent-strong, #00a884)" : "var(--emotion-surface-raised, #374248)",
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, flexShrink: 0,
            transition: "background var(--emotion-duration, 0.2s)",
            boxShadow: (input ?? "").trim() ? "var(--emotion-shadow-md, 0 2px 8px rgba(0,168,132,0.4))" : "none",
          }}
        >
          SEND
        </button>
      </div>
    </div>
  );
}

// ————————————————————————————————————————————————————————————————————————————————
function MessageBubble({
  msg,
  isMine,
  showReactions,
  readReceiptsEnabled,
  readReceiptMode,
  compactLayout,
  onRetry,
}: {
  msg: ChatMessage;
  isMine: boolean;
  showReactions: boolean;
  readReceiptsEnabled: boolean;
  readReceiptMode: ReadReceiptMode;
  compactLayout: boolean;
  onRetry?: () => void;
}) {
  const text = typeof msg.text === "string" ? msg.text : "";
  const isAiReply = text.trim().startsWith("AI:") || text.trim().startsWith("[AI]");

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: msg.status === "sending" ? 0.7 : 1, y: 0 }}
      style={{
        display: "flex",
        justifyContent: isMine ? "flex-end" : "flex-start",
        marginBottom: compactLayout ? 4 : 6,
      }}
    >
      <div style={{ maxWidth: compactLayout ? "84%" : "78%" }}>
        <div
          className={`qc-bubble ${isMine ? "qc-bubble-own" : "qc-bubble-other"}`}
          style={{
            background: isAiReply ? "linear-gradient(135deg, oklch(0.25 0.05 280) 0%, oklch(0.20 0.05 280) 100%)" : undefined,
            padding: compactLayout ? "6px 10px" : "8px 12px",
            boxShadow: isAiReply
              ? "0 0 0 1px oklch(0.40 0.10 280), 0 0 16px oklch(0.30 0.10 280 / 0.2)"
              : "var(--qc-shadow-1)",
            transition: "opacity 0.2s",
          }}
        >
          {isAiReply && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: "rgba(109, 74, 255, 0.2)",
                border: "1px solid rgba(109, 74, 255, 0.4)",
                borderRadius: 6,
                padding: "2px 6px",
                marginBottom: 5,
              }}
            >
              <span style={{ fontSize: 10 }}>AI</span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  color: "#a78bfa",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontFamily: "-apple-system,sans-serif",
                }}
              >
                Replied
              </span>
            </div>
          )}

          <SpoilerShieldText rawText={text} compact={compactLayout} />

          {showReactions && (
            <div style={{ marginTop: compactLayout ? 4 : 6 }}>
              <MessageReactions align={isMine ? "right" : "left"} enabled={showReactions} />
            </div>
          )}

          <div
            style={{
              marginTop: compactLayout ? 4 : 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 6,
            }}
          >
            <span
              style={{
                color: "rgba(233,237,239,0.5)",
                fontSize: 11,
                fontFamily: "-apple-system,sans-serif",
              }}
            >
              {formatTime(msg.createdAt)}
            </span>
            {isMine && (
              <DeliveryStatusBadge
                status={msg.status}
                readReceiptsEnabled={readReceiptsEnabled}
                readReceiptMode={readReceiptMode}
              />
            )}
          </div>
        </div>
        {msg.status === "failed" && onRetry && (
          <div style={{
            display: "flex", justifyContent: isMine ? "flex-end" : "flex-start",
            marginTop: 4,
          }}>
            <button
              type="button"
              onClick={onRetry}
              className="qc-btn qc-btn-ghost qc-btn-sm"
              data-testid="chat-message-retry-button"
              aria-label="Retry sending message"
              style={{
                color: "var(--qc-warn, #ff5722)",
                fontSize: 11,
                fontWeight: 700,
                padding: "3px 8px",
              }}
            >
              ↻ Retry
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}


// â”€â”€â”€ Utilities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}




