"use client";

/**
 * app/chat/page.tsx  — SnapChat-inspired dark UI
 *
 * Data flow:
 *   SEND:    input → addOptimisticMessage → sendEncryptedMessage (socket)
 *              ↓ server ack → confirmOptimisticMessage (swap tempId → realId)
 *   RECEIVE: socket "receive-message" → storeIncomingMessage (Dexie)
 *              → useLiveQuery auto-rerenders the list
 *   STATUS:  socket "delivery-receipt" → updateMessageStatus (Dexie)
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

// ─── Snap Design Tokens ───────────────────────────────────────────────────────
const S = {
  black:      "#000000",
  dark:       "#0d0d0d",
  card:       "#1a1a1a",
  cardBorder: "#2a2a2a",
  outBubble:  "#0078ff",        // sent: Snapchat blue
  inBubble:   "#262626",        // received: dark gray
  yellow:     "#FFFC00",        // Snapchat yellow accent
  textPrimary:"#ffffff",
  textSecond: "rgba(255,255,255,0.55)",
  textMuted:  "rgba(255,255,255,0.30)",
  purple:     "#a855f7",
  green:      "#22c55e",
  red:        "#ef4444",
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface TypingState { [senderId: string]: boolean; }
type ContactFilter = "all" | "unread" | "groups" | "priority";
const CONTACT_FILTERS: Array<{ key: ContactFilter; label: string }> = [
  { key: "priority", label: "Priority" },
  { key: "unread",   label: "Unread"   },
  { key: "groups",   label: "Groups"   },
  { key: "all",      label: "All"      },
];

function getContactPriorityScore(contact: Contact): number {
  const unreadBoost   = Math.min(contact.unreadCount, 12) * 4;
  const groupBoost    = contact.isGroup ? 8 : 0;
  const mutedPenalty  = contact.isMuted ? -10 : 0;
  const ageMs = contact.lastMessageAt ? Date.now() - contact.lastMessageAt : Number.POSITIVE_INFINITY;
  let freshnessBoost  = 0;
  if      (ageMs <= 15 * 60 * 1000)       freshnessBoost = 12;
  else if (ageMs <= 60 * 60 * 1000)       freshnessBoost = 8;
  else if (ageMs <= 24 * 60 * 60 * 1000)  freshnessBoost = 4;
  return unreadBoost + groupBoost + mutedPenalty + freshnessBoost;
}

function formatReceiptMode(mode: ReadReceiptMode): string {
  if (mode === "delayed") return "Delayed";
  if (mode === "batch")   return "Batch";
  return "Instant";
}

// ─── Emoji / Sticker data ─────────────────────────────────────────────────────
const EMOJI_CATS = [
  { key: "hi",     label: "👋 Hi"    },
  { key: "love",   label: "❤️ Love"  },
  { key: "haha",   label: "😂 Haha"  },
  { key: "sad",    label: "😢 Sad"   },
  { key: "angry",  label: "😡 Angry" },
  { key: "wow",    label: "😮 Wow"   },
  { key: "fire",   label: "🔥 Fire"  },
  { key: "all",    label: "✨ All"   },
];
const STICKER_MAP: Record<string, string[]> = {
  hi:    ["👋","🤚","🙌","🤝","✋","🫱","🫲","🫳","🫴","🙏","💪","🫶"],
  love:  ["❤️","🧡","💛","💚","💙","💜","🤍","🖤","💗","💓","💞","💕","😍","🥰","😘","💋","💌","💝"],
  haha:  ["😂","🤣","😆","😁","😄","😃","😀","🤭","🫢","😅","😋","🤪","😜","😝","😛"],
  sad:   ["😢","😭","😔","😞","😟","🥺","😿","💔","😩","😫","🙁","☹️","😕","🫠"],
  angry: ["😡","🤬","😠","👿","💢","😤","🔥","💥","🗯️","⚡"],
  wow:   ["😮","😲","🤯","😱","😳","🫨","😨","😦","😧","🤩","✨","🌟","⭐","💫"],
  fire:  ["🔥","💥","⚡","🌪️","❄️","💨","🌊","🌈","☄️","🚀","💎","👑","🏆","🎯"],
  all:   ["😀","😂","😍","🥰","😎","🤩","😢","😡","🔥","💯","✅","🎉","🎊","🎈","🎁","💌","💪","🙌","👋","❤️","🧡","💛","💚","💙","💜","⭐","🌟","✨","💫","🎯","🏆","👑","💎","🚀","☄️","🌈","🌊","💥","⚡"],
};

// ─── Mini-Games data ──────────────────────────────────────────────────────────
const MINI_GAMES = [
  { id: "darts",        name: "101 Darts",       emoji: "🎯", color: "#1d4ed8", players: "1-2" },
  { id: "fourinrow",    name: "Four in a Row",   emoji: "🟡", color: "#d97706", players: "2"   },
  { id: "seabattle",   name: "Sea Battle",       emoji: "⚓", color: "#0369a1", players: "2"   },
  { id: "chess",        name: "Chess",            emoji: "♟️", color: "#374151", players: "2"   },
  { id: "checkers",     name: "Checkers",         emoji: "⬛", color: "#6b21a8", players: "2"   },
  { id: "minigolf",     name: "2P Mini Golf",     emoji: "⛳", color: "#166534", players: "2"   },
  { id: "pool",         name: "8 Ball Pool",      emoji: "🎱", color: "#1e293b", players: "2"   },
  { id: "snakeladder",  name: "Snake & Ladders",  emoji: "🐍", color: "#b45309", players: "2-4" },
  { id: "blockbuster",  name: "Block Buster",     emoji: "🧱", color: "#be123c", players: "1"   },
  { id: "tennis",       name: "Bitmoji Tennis",   emoji: "🎾", color: "#0d9488", players: "2"   },
  { id: "dots",         name: "Dots & Boxes",     emoji: "⬜", color: "#7c3aed", players: "2"   },
  { id: "wordbattle",   name: "Word Battle",      emoji: "📝", color: "#0891b2", players: "2"   },
  { id: "tictactoe",    name: "Tic-Tac-Toe",      emoji: "❌", color: "#dc2626", players: "2"   },
  { id: "trivia",       name: "Trivia Clash",     emoji: "🧠", color: "#7c3aed", players: "2"   },
  { id: "memory",       name: "Memory Match",     emoji: "🃏", color: "#0f766e", players: "1-2" },
  { id: "hangman",      name: "Hangman",          emoji: "🪢", color: "#9a3412", players: "2"   },
];

// ════════════════════════════════════════════════════════════════════════════════
// ROOT COMPONENT
// ════════════════════════════════════════════════════════════════════════════════
export default function ChatPage() {
  const { requestedUserId, authToken } = useQuantchatIdentity();
  const [activeContact, setActiveContact]   = useState<Contact | null>(null);
  const [typing, setTyping]                 = useState<TypingState>({});
  const [activeServerId, setActiveServerId] = useState<string | undefined>();
  const [activeChannelId, setActiveChannelId] = useState<string | undefined>();
  const [sidebarSection, setSidebarSection] = useState<"dms" | "servers">("dms");
  const { preferences }                     = useFrontendPreferences();
  const { userId: activeUserId, isConnected, sendEncryptedMessage, subscribeToMessages, subscribeToReceipts, sendTyping, socket } =
    useSignalSocket(requestedUserId, authToken);

  useEffect(() => {
    if (!activeUserId) return;
    const unsub = subscribeToMessages(async (msg) => {
      await storeIncomingMessage(activeUserId, {
        id: msg.id, senderId: msg.senderId, text: msg.plaintext, createdAt: msg.createdAt,
      });
      await upsertContact({
        id: msg.senderId, name: msg.senderId, avatarColor: "#6d4aff",
        avatarLetter: msg.senderId[0]?.toUpperCase() ?? "?",
        lastMessageText: msg.plaintext, lastMessageAt: Date.now(),
      });
    });
    return unsub;
  }, [activeUserId, subscribeToMessages]);

  useEffect(() => {
    const unsub = subscribeToReceipts(async (receipt) => {
      const status = receipt.status === "DELIVERED" ? "delivered" : "read";
      await updateMessageStatus(receipt.messageId, status,
        receipt.deliveredAt ? new Date(receipt.deliveredAt).getTime()
          : receipt.readAt ? new Date(receipt.readAt).getTime() : undefined
      );
    });
    return unsub;
  }, [subscribeToReceipts]);

  useEffect(() => {
    if (!socket) return;
    const listener = (data: { senderId: string; isTyping: boolean }) => {
      setTyping((t) => ({ ...t, [data.senderId]: data.isTyping }));
    };
    socket.on("typing", listener);
    return () => { socket.off("typing", listener); };
  }, [socket]);

  useEffect(() => {
    const engine = getAdaptiveThemeEngine();
    const detector = getEmotionDetectionService();
    engine.start(); detector.start();
    const unsub = detector.subscribe((est) => { engine.applyFromDetector(est.emotion); });
    const handleTap = () => detector.ingestTap();
    window.addEventListener("pointerdown", handleTap);
    return () => { unsub(); window.removeEventListener("pointerdown", handleTap); };
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
      <div style={{
        minHeight: "100%", display: "grid", placeItems: "center",
        background: S.black, color: S.textPrimary, padding: 24, textAlign: "center",
      }}>
        <div style={{ maxWidth: 420 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>👻</div>
          <h1 style={{ fontSize: 28, marginBottom: 10, fontFamily: "-apple-system,sans-serif" }}>Sign in to QuantChat</h1>
          <p style={{ color: S.textSecond, lineHeight: 1.6 }}>End-to-end encrypted messaging. Sign in to start chatting.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="qc qc-chat-app" data-testid="chat-control-room-shell"
      data-density={preferences.compactChatLayout ? "compact" : "regular"}
      style={{
        display: "grid",
        gridTemplateColumns: "260px 320px 1fr 280px",
        height: "100%", minHeight: 0,
        background: S.black,
      }}>
      <ChatRail activeId={activeContact?.id || activeChannelId} />

      <aside className="desktop-sidebar qc-scroll" style={{
        borderRight: `1px solid ${S.cardBorder}`,
        background: S.dark, display: "flex", flexDirection: "column", minHeight: 0,
      }}>
        <ContactList onSelect={openContact} activeContactId={activeContact?.id} />
      </aside>

      <main className="qc-chat-stage" data-testid="chat-main-stage"
        style={{ flex: 1, position: "relative", overflow: "hidden", background: S.black }}>
        <AnimatePresence mode="wait">
          {activeContact ? (
            <motion.div
              key={`conv-${activeContact.id}`}
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
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
            <motion.div key={`channel-${activeChannelId}`}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{
                position: "absolute", inset: 0, display: "flex",
                alignItems: "center", justifyContent: "center",
                flexDirection: "column", gap: 12,
              }}
            >
              <div style={{ fontSize: 48 }}>⇅</div>
              <span style={{ color: S.textSecond, fontSize: 15 }}>#{activeChannelId} — coming soon</span>
            </motion.div>
          ) : (
            <div key="list" style={{ position: "absolute", inset: 0 }} className="mobile-contact-list">
              <ContactList onSelect={openContact} activeContactId={undefined} />
            </div>
          )}
        </AnimatePresence>
      </main>

      <ChatDetails contact={activeContact} />
    </div>
  );
}

// ─── Contact List (Snapchat-dark sidebar) ─────────────────────────────────────
function ContactList({ onSelect, activeContactId }: { onSelect: (c: Contact) => void; activeContactId?: string; }) {
  const contacts = useContacts();
  const [search, setSearch]           = useState("");
  const [activeFilter, setActiveFilter] = useState<ContactFilter>("all");
  const normalizedSearch = (search ?? "").trim().toLowerCase();

  const filterCounts = useMemo<Record<ContactFilter, number>>(() => {
    let unread = 0, groups = 0, priority = 0;
    for (const c of contacts) {
      if (c.unreadCount > 0) unread++;
      if (c.isGroup) groups++;
      if (getContactPriorityScore(c) > 0) priority++;
    }
    return { all: contacts.length, unread, groups, priority };
  }, [contacts]);

  const filtered = useMemo(() => {
    const vis = contacts.filter((c) => {
      const m = normalizedSearch.length === 0
        || c.name.toLowerCase().includes(normalizedSearch)
        || (c.lastMessageText ?? "").toLowerCase().includes(normalizedSearch);
      if (!m) return false;
      if (activeFilter === "unread")   return c.unreadCount > 0;
      if (activeFilter === "groups")   return Boolean(c.isGroup);
      if (activeFilter === "priority") return getContactPriorityScore(c) > 0;
      return true;
    });
    vis.sort((a, b) => {
      if (activeFilter === "priority") {
        const d = getContactPriorityScore(b) - getContactPriorityScore(a);
        if (d !== 0) return d;
      }
      return (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0);
    });
    return vis;
  }, [contacts, normalizedSearch, activeFilter]);

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: S.dark, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "16px 16px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: S.textPrimary, fontFamily: "-apple-system,sans-serif" }}>
          💬 Chats
        </span>
        <div style={{ display: "flex", gap: 14, fontSize: 20 }}>
          <span style={{ cursor: "pointer", color: S.textSecond }}>⊕</span>
          <span style={{ cursor: "pointer", color: S.textSecond }}>⋮</span>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: "0 12px 10px" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: S.card, borderRadius: 14, padding: "9px 14px",
          border: `1px solid ${S.cardBorder}`,
        }}>
          <span style={{ color: S.textMuted, fontSize: 16 }}>🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Chats"
            style={{
              background: "none", border: "none", outline: "none",
              color: S.textPrimary, fontSize: 15, flex: 1,
              fontFamily: "-apple-system,sans-serif",
            }}
          />
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, padding: "0 12px 10px", overflowX: "auto", scrollbarWidth: "none" }}>
        {CONTACT_FILTERS.map((f) => {
          const isActive = activeFilter === f.key;
          const count = filterCounts[f.key];
          return (
            <button key={f.key} type="button" onClick={() => setActiveFilter(f.key)} style={{
              borderRadius: 999, border: isActive ? `1px solid ${S.yellow}` : `1px solid ${S.cardBorder}`,
              background: isActive ? `rgba(255,252,0,0.15)` : S.card,
              color: isActive ? S.yellow : S.textSecond,
              padding: "6px 12px", fontSize: 12, fontWeight: isActive ? 700 : 500,
              cursor: "pointer", whiteSpace: "nowrap", fontFamily: "-apple-system,sans-serif",
            }}>
              {f.label}{count > 0 ? ` (${count})` : ""}
            </button>
          );
        })}
      </div>

      {/* Empty states */}
      {contacts.length === 0 && (
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 14,
          padding: "40px 24px", color: S.textSecond, textAlign: "center",
        }}>
          <div style={{ fontSize: 56 }}>👻</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: S.textPrimary }}>No conversations yet</div>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>Add friends to start snapping!</div>
        </div>
      )}
      {contacts.length > 0 && filtered.length === 0 && (
        <div style={{ padding: "18px", color: S.textMuted, fontSize: 13, textAlign: "center" }}>
          No chats match this filter.
        </div>
      )}

      {/* Contact rows */}
      <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none" }}>
        {filtered.map((contact, i) => (
          <ContactRow key={contact.id} contact={contact} index={i}
            isActive={contact.id === activeContactId}
            onClick={() => onSelect(contact)} />
        ))}
      </div>
    </div>
  );
}

// ─── Contact Row ──────────────────────────────────────────────────────────────
const ContactRow = memo(function ContactRow({ contact, index, isActive, onClick }: {
  contact: Contact; index: number; isActive?: boolean; onClick: () => void;
}) {
  const lastTime = contact.lastMessageAt ? formatTime(contact.lastMessageAt) : "";
  const preview  = contact.lastMessageText ? parseSpoilerShieldText(contact.lastMessageText).text : "";
  return (
    <motion.div
      onClick={onClick}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index, 12) * 0.018 }}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 14px", cursor: "pointer",
        background: isActive ? "rgba(255,252,0,0.07)" : "transparent",
        borderLeft: isActive ? `3px solid ${S.yellow}` : "3px solid transparent",
        transition: "background 0.15s",
      }}
    >
      <ContactAvatar contact={contact} size={46} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: S.textPrimary, fontFamily: "-apple-system,sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {contact.isGroup && <span style={{ color: S.textSecond, marginRight: 4 }}>#</span>}
          {contact.name}
        </div>
        <div style={{ fontSize: 12, color: S.textSecond, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
          {preview || <span style={{ fontStyle: "italic", opacity: 0.5 }}>No messages yet</span>}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
        {lastTime && <span style={{ fontSize: 11, color: S.textMuted }}>{lastTime}</span>}
        {contact.unreadCount > 0 ? (
          <span style={{
            background: S.yellow, color: "#000", borderRadius: 999,
            minWidth: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 800, padding: "0 5px",
          }}>
            {contact.unreadCount > 99 ? "99+" : contact.unreadCount}
          </span>
        ) : (
          <span style={{ color: S.textMuted, fontSize: 12 }}>✓✓</span>
        )}
      </div>
    </motion.div>
  );
});
ContactRow.displayName = "ContactRow";

// ════════════════════════════════════════════════════════════════════════════════
// CHAT CONVERSATION  (Snapchat-inspired dark)
// ════════════════════════════════════════════════════════════════════════════════
function ChatConversation({
  contact, myUserId, onBack, sendEncryptedMessage, sendTyping,
  isContactTyping, showReactions, readReceiptsEnabled, readReceiptMode,
  compactLayout, aiReplySuggestionsEnabled,
}: {
  contact: Contact; myUserId: string; onBack: () => void;
  sendEncryptedMessage: (recipientId: string, plaintext: string) => Promise<void>;
  sendTyping: (receiverId: string, isTyping: boolean) => void;
  isContactTyping: boolean; showReactions: boolean;
  readReceiptsEnabled: boolean; readReceiptMode: ReadReceiptMode;
  compactLayout: boolean; aiReplySuggestionsEnabled: boolean;
}) {
  const messages = useMessages(myUserId, contact.id);
  const [input, setInput]                         = useState("");
  const [showAttach, setShowAttach]               = useState(false);
  const [showEmoji, setShowEmoji]                 = useState(false);
  const [showGames, setShowGames]                 = useState(false);
  const [emojiCategory, setEmojiCategory]         = useState("all");
  const [emojiSearch, setEmojiSearch]             = useState("");
  const [screenshotBanner, setScreenshotBanner]   = useState(false);
  const [showLocation, setShowLocation]           = useState(true);
  const [isRecordingVoice, setIsRecordingVoice]   = useState(false);
  const [isAudioCallOpen, setIsAudioCallOpen]     = useState(false);
  const [chillRoomOpen, setChillRoomOpen]         = useState(false);
  const [showHandshake, setShowHandshake]         = useState(false);
  const [isHandshakeVerified, setIsHandshakeVerified] = useState(false);
  const [spoilerShieldEnabled, setSpoilerShieldEnabled] = useState(false);
  const [spoilerShieldMode, setSpoilerShieldMode] = useState<SpoilerShieldMode>("auto");
  const [ghostSuggestion, setGhostSuggestion]     = useState("");
  const [showMoreMenu, setShowMoreMenu]           = useState(false);

  const bottomRef         = useRef<HTMLDivElement>(null);
  const typingTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ghostTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readReceiptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onInitiateHandshake = useCallback(() => setShowHandshake(true), []);

  // Auto-scroll
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  // Read receipts
  useEffect(() => {
    if (readReceiptTimerRef.current) { clearTimeout(readReceiptTimerRef.current); readReceiptTimerRef.current = null; }
    if (!readReceiptsEnabled) { void clearConversationUnread(contact.id); return; }
    if (readReceiptMode === "instant") { void markConversationRead(myUserId, contact.id); return; }
    if (readReceiptMode === "delayed") {
      readReceiptTimerRef.current = setTimeout(() => { void markConversationRead(myUserId, contact.id); }, 4500);
      return () => { if (readReceiptTimerRef.current) { clearTimeout(readReceiptTimerRef.current); readReceiptTimerRef.current = null; } };
    }
    void clearConversationUnread(contact.id);
  }, [contact.id, myUserId, readReceiptMode, readReceiptsEnabled]);

  useEffect(() => { if (!aiReplySuggestionsEnabled) setGhostSuggestion(""); }, [aiReplySuggestionsEnabled]);

  // Close panels when other opens
  const openEmojiPanel = () => { setShowEmoji(true); setShowGames(false); setShowAttach(false); };
  const openGamesPanel = () => { setShowGames(true); setShowEmoji(false); setShowAttach(false); };
  const openAttachPanel = () => { setShowAttach(true); setShowEmoji(false); setShowGames(false); };

  const triggerScreenshotBanner = () => {
    setScreenshotBanner(true);
    setTimeout(() => setScreenshotBanner(false), 4000);
  };

  const handleInputChange = useCallback((val: string) => {
    setInput(val);
    setGhostSuggestion("");
    sendTyping(contact.id, true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => sendTyping(contact.id, false), 2000);
    if (!aiReplySuggestionsEnabled) return;
    if (ghostTimerRef.current) clearTimeout(ghostTimerRef.current);
    if ((val ?? "").trim().length >= 2) {
      ghostTimerRef.current = setTimeout(async () => {
        try {
          const recentTexts = messages.slice(-5).map((m) => m.text);
          const resp = await fetch("/api/predict-typing", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ currentInput: val, recentMessages: recentTexts }),
          });
          if (resp.ok) {
            const data = await resp.json() as { suggestion?: string };
            setGhostSuggestion(data.suggestion ?? "");
          }
        } catch { /* ignore */ }
      }, 400);
    }
  }, [aiReplySuggestionsEnabled, contact.id, sendTyping, messages]);

  const handleSend = useCallback(async () => {
    const baseText = (input ?? "").trim();
    if (!baseText) return;
    const text = spoilerShieldEnabled ? encodeSpoilerShieldText(baseText, spoilerShieldMode) : baseText;
    setInput(""); setGhostSuggestion(""); setSpoilerShieldEnabled(false);
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

  const handleSendEmoji = useCallback(async (emoji: string) => {
    setShowEmoji(false);
    getEmotionDetectionService().ingestMessage(emoji);
    const tempId = `temp_${Date.now()}_${Math.random()}`;
    await addOptimisticMessage(myUserId, contact.id, emoji, tempId);
    try {
      await sendEncryptedMessage(contact.id, emoji);
      await confirmOptimisticMessage(tempId, tempId.replace("temp_", "real_"));
    } catch {
      const { updateMessageStatus } = await import("@/lib/useChatDB");
      await updateMessageStatus(tempId, "failed");
    }
  }, [contact.id, myUserId, sendEncryptedMessage]);

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
    { emoji: "🖼️", label: "Gallery",  color: "#7c3aed" },
    { emoji: "📷", label: "Camera",   color: "#ef4444" },
    { emoji: "📍", label: "Location", color: "#22c55e" },
    { emoji: "👤", label: "Contact",  color: "#3b82f6" },
    { emoji: "📄", label: "Document", color: "#f59e0b" },
    { emoji: "🎵", label: "Audio",    color: "#f97316" },
    { emoji: "📊", label: "Poll",     color: "#6366f1" },
    { emoji: "💸", label: "Payment",  color: "#14b8a6" },
    { emoji: "🎬", label: "GIF",      color: "#ec4899" },
    { emoji: "🔗", label: "Link",     color: "#0ea5e9" },
    { emoji: "📝", label: "Note",     color: "#84cc16" },
    { emoji: "⏱️", label: "Timer",   color: "#a78bfa" },
  ];

  // Filtered emoji for search
  const displayEmojis = useMemo(() => {
    const pool = STICKER_MAP[emojiCategory] ?? STICKER_MAP.all;
    if (!emojiSearch.trim()) return pool;
    return pool.filter((e) => e.includes(emojiSearch));
  }, [emojiCategory, emojiSearch]);

  return (
    <div style={{
      width: "100%", height: "100%", display: "flex", flexDirection: "column",
      background: S.black, position: "relative",
    }}>
      {/* Screenshot notification banner */}
      <AnimatePresence>
        {screenshotBanner && (
          <motion.div
            initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            style={{
              position: "absolute", top: 0, left: 0, right: 0, zIndex: 100,
              background: "rgba(30,30,30,0.97)", padding: "14px 20px",
              display: "flex", alignItems: "center", gap: 10,
              borderBottom: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <span style={{ fontSize: 20 }}>📸</span>
            <span style={{
              color: S.textSecond, fontSize: 13, fontWeight: 700,
              letterSpacing: "0.06em", textTransform: "uppercase",
              fontFamily: "-apple-system,sans-serif",
            }}>
              YOU TOOK A SCREENSHOT OF CHAT!
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <ChillRoomModal isOpen={chillRoomOpen} onClose={() => setChillRoomOpen(false)} spaceName={`${contact.name} Chill Room`} />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", padding: "10px 14px", gap: 10,
        background: S.dark, zIndex: 10, flexShrink: 0,
        borderBottom: `1px solid ${S.cardBorder}`,
      }}>
        <button onClick={onBack} style={{
          background: "none", border: "none", cursor: "pointer",
          color: S.yellow, fontSize: 22, padding: 4, lineHeight: 1,
        }}>←</button>

        <ContactAvatar contact={contact} size={38} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            color: S.textPrimary, fontWeight: 800, fontSize: 16,
            fontFamily: "-apple-system,sans-serif", overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {contact.name}
          </div>
          <div style={{ fontSize: 11, color: isContactTyping ? S.green : S.textMuted }}>
            {isContactTyping ? (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                typing…
              </motion.span>
            ) : "tap to view profile"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Chill Room */}
          <motion.button
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.93 }}
            onClick={() => setChillRoomOpen(true)}
            style={{
              background: "rgba(255,252,0,0.12)", border: `1px solid rgba(255,252,0,0.3)`,
              borderRadius: 20, padding: "4px 10px", cursor: "pointer",
              color: S.yellow, fontSize: 11, fontWeight: 700,
              letterSpacing: "0.04em", textTransform: "uppercase",
              display: "flex", alignItems: "center", gap: 4,
            }}
          >
            🏠 Chill
          </motion.button>

          {/* Handshake */}
          {!isHandshakeVerified ? (
            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.93 }}
              onClick={onInitiateHandshake}
              style={{
                background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.3)",
                borderRadius: 20, padding: "4px 10px", cursor: "pointer",
                color: S.purple, fontSize: 11, fontWeight: 700,
                letterSpacing: "0.04em", textTransform: "uppercase",
              }}
            >
              🤝 Trust
            </motion.button>
          ) : (
            <div style={{
              background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)",
              borderRadius: 20, padding: "4px 10px",
              color: S.green, fontSize: 10, fontWeight: 800,
              letterSpacing: "0.05em", textTransform: "uppercase",
            }}>
              ✅ Verified
            </div>
          )}

          {/* Video call */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, padding: 4 }}
            title="Video call"
          >
            📹
          </motion.button>

          {/* Audio call */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsAudioCallOpen(true)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, padding: 4 }}
            title="Voice call"
          >
            📞
          </motion.button>

          {/* Screenshot (for demo) */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={triggerScreenshotBanner}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, padding: 4 }}
            title="Screenshot"
          >
            📸
          </motion.button>

          {/* More menu */}
          <div style={{ position: "relative" }}>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setShowMoreMenu((v) => !v)}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, padding: 4, color: S.textSecond }}
            >
              ⋮
            </motion.button>
            <AnimatePresence>
              {showMoreMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: -8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -8 }}
                  style={{
                    position: "absolute", right: 0, top: "100%",
                    background: S.card, border: `1px solid ${S.cardBorder}`,
                    borderRadius: 14, padding: "8px 0", zIndex: 50,
                    minWidth: 180, boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
                  }}
                >
                  {[
                    { icon: "🔒", label: "View Encryption Info" },
                    { icon: "🔕", label: "Mute Notifications"   },
                    { icon: "👤", label: "View Profile"          },
                    { icon: "🗑️", label: "Clear Chat"            },
                    { icon: "🚫", label: "Block Contact"          },
                  ].map((item) => (
                    <button key={item.label} onClick={() => setShowMoreMenu(false)} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      width: "100%", padding: "10px 16px", background: "none", border: "none",
                      color: item.label === "Block Contact" ? S.red : S.textPrimary,
                      fontSize: 13, cursor: "pointer", textAlign: "left",
                      fontFamily: "-apple-system,sans-serif",
                    }}>
                      {item.icon} {item.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Audio Call overlay */}
      {isAudioCallOpen && (
        <AudioCall
          myUserId={myUserId} peerId={contact.id} peerName={contact.name}
          open={isAudioCallOpen} onClose={() => setIsAudioCallOpen(false)}
        />
      )}

      {/* Biometric handshake */}
      {showHandshake && (
        <BiometricHandshake
          partnerName={contact.name}
          onCancel={() => setShowHandshake(false)}
          onVerified={() => { setIsHandshakeVerified(true); setShowHandshake(false); }}
        />
      )}

      {/* ── Location sharing banner ─────────────────────────────────────── */}
      <AnimatePresence>
        {showLocation && (
          <motion.div
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              background: "rgba(34,197,94,0.08)", borderBottom: "1px solid rgba(34,197,94,0.2)",
              padding: "8px 16px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 18 }}>📍</span>
            <span style={{ flex: 1, fontSize: 12, color: S.green, fontFamily: "-apple-system,sans-serif" }}>
              <strong>{contact.name}</strong> shares their location with you.{" "}
              <span style={{ textDecoration: "underline", cursor: "pointer" }}>Share yours?</span>
            </span>
            <button onClick={() => setShowLocation(false)} style={{
              background: "none", border: "none", cursor: "pointer",
              color: S.textMuted, fontSize: 18, padding: 0, lineHeight: 1,
            }}>×</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Messages stream ─────────────────────────────────────────────── */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "12px 10px",
        scrollbarWidth: "none", zIndex: 5, position: "relative",
        display: "flex", flexDirection: "column", gap: compactLayout ? 1 : 2,
      }}>
        {messages.length === 0 && (
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            color: S.textSecond, fontSize: 13,
            padding: "60px 20px", textAlign: "center", gap: 14,
          }}>
            <div style={{ fontSize: 64 }}>👻</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: S.textPrimary }}>
              Say hi to {contact.name}!
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.6, color: S.textSecond, maxWidth: 280 }}>
              Messages are end-to-end encrypted — only you and {contact.name} can read them.
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id} msg={msg} isMine={msg.senderId === myUserId}
            showReactions={showReactions} readReceiptsEnabled={readReceiptsEnabled}
            readReceiptMode={readReceiptMode} compactLayout={compactLayout}
            onRetry={msg.status === "failed" ? () => handleRetry(msg) : undefined}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* ── Attachment tray ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showAttach && (
          <motion.div
            initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 350, damping: 30 }}
            style={{
              background: S.dark, padding: "20px 16px 12px",
              zIndex: 20, flexShrink: 0,
              display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px 8px",
              borderTop: `1px solid ${S.cardBorder}`,
            }}
          >
            {ATTACH_ITEMS.map((a) => (
              <button key={a.label} onClick={() => setShowAttach(false)} style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                background: "none", border: "none", cursor: "pointer",
              }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 16, background: a.color,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
                }}>
                  {a.emoji}
                </div>
                <span style={{ color: S.textSecond, fontSize: 11, fontFamily: "-apple-system,sans-serif" }}>
                  {a.label}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Emoji / Sticker panel ───────────────────────────────────────── */}
      <AnimatePresence>
        {showEmoji && (
          <motion.div
            initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 350, damping: 30 }}
            style={{
              background: S.dark, borderTop: `1px solid ${S.cardBorder}`,
              zIndex: 20, flexShrink: 0, padding: "12px 12px 8px",
              maxHeight: 280,
            }}
          >
            {/* Search */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: S.card, borderRadius: 12, padding: "7px 12px",
              marginBottom: 10, border: `1px solid ${S.cardBorder}`,
            }}>
              <span style={{ color: S.textMuted }}>🔍</span>
              <input
                value={emojiSearch}
                onChange={(e) => setEmojiSearch(e.target.value)}
                placeholder="Search stickers & emojis"
                style={{
                  background: "none", border: "none", outline: "none",
                  color: S.textPrimary, fontSize: 13, flex: 1,
                }}
              />
            </div>
            {/* Category chips */}
            <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", marginBottom: 10 }}>
              {EMOJI_CATS.map((cat) => (
                <button key={cat.key} onClick={() => setEmojiCategory(cat.key)} style={{
                  borderRadius: 999,
                  border: emojiCategory === cat.key ? `1px solid ${S.yellow}` : `1px solid ${S.cardBorder}`,
                  background: emojiCategory === cat.key ? "rgba(255,252,0,0.15)" : S.card,
                  color: emojiCategory === cat.key ? S.yellow : S.textSecond,
                  padding: "4px 10px", fontSize: 11, fontWeight: 700,
                  cursor: "pointer", whiteSpace: "nowrap",
                }}>
                  {cat.label}
                </button>
              ))}
            </div>
            {/* Emoji grid */}
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 4,
              overflowY: "auto", maxHeight: 140,
            }}>
              {displayEmojis.map((emoji, i) => (
                <button
                  key={`${emoji}-${i}`}
                  onClick={() => handleSendEmoji(emoji)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: 26, padding: "4px", borderRadius: 8,
                    transition: "background 0.1s",
                  }}
                  title={emoji}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Mini Games panel ────────────────────────────────────────────── */}
      <AnimatePresence>
        {showGames && (
          <motion.div
            initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 350, damping: 30 }}
            style={{
              background: S.dark, borderTop: `1px solid ${S.cardBorder}`,
              zIndex: 20, flexShrink: 0, padding: "12px 12px 8px",
              maxHeight: 300,
            }}
          >
            <div style={{
              fontSize: 12, fontWeight: 800, color: S.textSecond,
              letterSpacing: "0.08em", textTransform: "uppercase",
              marginBottom: 10, fontFamily: "-apple-system,sans-serif",
            }}>
              🎮 Mini Games
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8,
              overflowY: "auto", maxHeight: 220,
            }}>
              {MINI_GAMES.map((game) => (
                <motion.button
                  key={game.id}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }}
                  onClick={() => setShowGames(false)}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                    background: game.color, borderRadius: 14, padding: "12px 6px",
                    border: "none", cursor: "pointer",
                  }}
                >
                  <span style={{ fontSize: 24 }}>{game.emoji}</span>
                  <span style={{
                    color: "#fff", fontSize: 9, fontWeight: 700,
                    textAlign: "center", lineHeight: 1.2,
                    fontFamily: "-apple-system,sans-serif",
                    letterSpacing: "0.01em",
                  }}>
                    {game.name}
                  </span>
                  <span style={{
                    color: "rgba(255,255,255,0.6)", fontSize: 8,
                    fontFamily: "-apple-system,sans-serif",
                  }}>
                    {game.players}P
                  </span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <TrustSnapshotCard context="compose" draftText={input} recipientName={contact.name} />

      {/* ── Snapchat-style Input Bar ────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 10px 12px", background: S.dark, flexShrink: 0, zIndex: 10,
        borderTop: `1px solid ${S.cardBorder}`,
      }}>
        {/* Left: Camera button */}
        <motion.button
          whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
          style={{
            width: 44, height: 44, borderRadius: "50%",
            background: S.yellow, border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, flexShrink: 0,
            boxShadow: `0 2px 12px rgba(255,252,0,0.25)`,
          }}
          title="Camera"
        >
          📷
        </motion.button>

        {/* Input pill (Snapchat style) */}
        <div style={{
          flex: 1, display: "flex", alignItems: "center", gap: 6,
          background: S.card, borderRadius: 28, padding: "8px 14px",
          border: `1px solid ${S.cardBorder}`, minHeight: 42, position: "relative",
        }}>
          {/* Spoiler toggle */}
          {spoilerShieldEnabled && (
            <motion.button
              type="button"
              onClick={() => setSpoilerShieldMode((m) => m === "auto" ? "hold" : "auto")}
              style={{
                background: "rgba(83,189,235,0.15)", border: "1px solid rgba(83,189,235,0.4)",
                borderRadius: 8, padding: "2px 7px", cursor: "pointer",
                color: "#53bdeb", fontSize: 9, fontWeight: 700, flexShrink: 0,
              }}
            >
              {spoilerShieldMode === "auto" ? "AUTO" : "HOLD"}
            </motion.button>
          )}

          {/* Ghost suggestion overlay */}
          {ghostSuggestion && (input ?? "").trim() && (
            <div aria-hidden="true" style={{
              position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
              pointerEvents: "none", whiteSpace: "pre", fontSize: 15,
              fontFamily: "-apple-system,sans-serif", color: "transparent",
            }}>
              {input}<span style={{ color: "rgba(255,255,255,0.25)" }}>{ghostSuggestion}</span>
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
                setInput(input + ghostSuggestion); setGhostSuggestion("");
                sendTyping(contact.id, false);
              } else if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault(); handleSend();
              }
            }}
            placeholder={ghostSuggestion ? "" : "Send a Chat…"}
            style={{
              background: "transparent", border: "none", outline: "none",
              color: S.textPrimary, fontSize: 15, flex: 1,
              fontFamily: "-apple-system,sans-serif",
            }}
          />

          {/* Tab accept hint */}
          {ghostSuggestion && (input ?? "").trim() && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              onClick={() => { setInput(input + ghostSuggestion); setGhostSuggestion(""); }}
              style={{
                flexShrink: 0, background: "rgba(109,74,255,0.18)",
                border: "1px solid rgba(109,74,255,0.35)", borderRadius: 6,
                padding: "2px 7px", fontSize: 10, color: S.purple,
                fontWeight: 700, cursor: "pointer",
              }}
            >
              Tab ↹
            </motion.div>
          )}

          {/* Attach button */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={showAttach ? () => setShowAttach(false) : openAttachPanel}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 18, flexShrink: 0,
              color: showAttach ? S.yellow : S.textSecond,
            }}
            title="Attach"
          >
            📎
          </motion.button>
        </div>

        {/* Right side icon cluster */}
        <div style={{ display: "flex", gap: 2, alignItems: "center", flexShrink: 0 }}>
          {/* Spoiler */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setSpoilerShieldEnabled((e) => !e)}
            style={{
              width: 36, height: 36, borderRadius: "50%", border: "none",
              background: spoilerShieldEnabled ? "rgba(83,189,235,0.2)" : "transparent",
              cursor: "pointer", fontSize: 16, display: "flex",
              alignItems: "center", justifyContent: "center",
              color: spoilerShieldEnabled ? "#53bdeb" : S.textMuted,
            }}
            title="Spoiler Shield"
          >
            🛡️
          </motion.button>

          {/* Emoji / Sticker */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={showEmoji ? () => setShowEmoji(false) : openEmojiPanel}
            style={{
              width: 36, height: 36, borderRadius: "50%", border: "none",
              background: showEmoji ? "rgba(255,252,0,0.12)" : "transparent",
              cursor: "pointer", fontSize: 20, display: "flex",
              alignItems: "center", justifyContent: "center",
            }}
            title="Stickers & Emojis"
          >
            😊
          </motion.button>

          {/* Bitmoji / sticker icon */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={openEmojiPanel}
            style={{
              width: 36, height: 36, borderRadius: "50%", border: "none",
              background: "transparent", cursor: "pointer", fontSize: 20,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            title="Bitmoji"
          >
            🎭
          </motion.button>

          {/* Games */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={showGames ? () => setShowGames(false) : openGamesPanel}
            style={{
              width: 36, height: 36, borderRadius: "50%", border: "none",
              background: showGames ? "rgba(168,85,247,0.15)" : "transparent",
              cursor: "pointer", fontSize: 20, display: "flex",
              alignItems: "center", justifyContent: "center",
              color: showGames ? S.purple : undefined,
            }}
            title="Mini Games"
          >
            🎮
          </motion.button>

          {/* Send OR mic */}
          {(input ?? "").trim() ? (
            <motion.button
              data-testid="chat-send-message-button"
              onClick={handleSend}
              whileTap={{ scale: 0.9 }}
              style={{
                width: 42, height: 42, borderRadius: "50%",
                background: S.outBubble, border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, flexShrink: 0,
                boxShadow: "0 2px 8px rgba(0,120,255,0.4)",
              }}
            >
              ➤
            </motion.button>
          ) : (
            <motion.button
              whileTap={{ scale: 0.9 }}
              onMouseDown={() => setIsRecordingVoice(true)}
              onMouseUp={() => setIsRecordingVoice(false)}
              onMouseLeave={() => setIsRecordingVoice(false)}
              style={{
                width: 42, height: 42, borderRadius: "50%", border: "none",
                background: isRecordingVoice ? S.red : "transparent",
                cursor: "pointer", fontSize: 22,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background 0.15s",
                boxShadow: isRecordingVoice ? `0 2px 12px rgba(239,68,68,0.5)` : "none",
              }}
              title="Hold to record voice"
            >
              🎤
            </motion.button>
          )}
        </div>
      </div>

      {/* Voice recording indicator */}
      <AnimatePresence>
        {isRecordingVoice && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            style={{
              position: "absolute", bottom: 80, left: "50%", transform: "translateX(-50%)",
              background: S.red, borderRadius: 28, padding: "10px 20px",
              display: "flex", alignItems: "center", gap: 10, zIndex: 50,
              boxShadow: "0 4px 20px rgba(239,68,68,0.4)",
            }}
          >
            <motion.div
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
              style={{ width: 10, height: 10, borderRadius: "50%", background: "#fff" }}
            />
            <span style={{ color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "-apple-system,sans-serif" }}>
              Recording… release to send
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg, isMine, showReactions, readReceiptsEnabled, readReceiptMode, compactLayout, onRetry }: {
  msg: ChatMessage; isMine: boolean; showReactions: boolean;
  readReceiptsEnabled: boolean; readReceiptMode: ReadReceiptMode;
  compactLayout: boolean; onRetry?: () => void;
}) {
  const text = typeof msg.text === "string" ? msg.text : "";
  const isAiReply = text.trim().startsWith("AI:") || text.trim().startsWith("[AI]");
  const isEmoji = /^\p{Emoji}+$/u.test(text.trim()) && text.trim().length <= 4;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: msg.status === "sending" ? 0.7 : 1, y: 0, scale: 1 }}
      style={{ display: "flex", justifyContent: isMine ? "flex-end" : "flex-start", marginBottom: compactLayout ? 4 : 6 }}
    >
      <div style={{ maxWidth: compactLayout ? "84%" : "78%" }}>
        {isEmoji ? (
          /* Big emoji message */
          <div style={{ fontSize: 48, textAlign: isMine ? "right" : "left", lineHeight: 1.2, padding: "4px 8px" }}>
            {text}
          </div>
        ) : (
          <div style={{
            background: isAiReply
              ? "linear-gradient(135deg, #1e0a3c 0%, #150828 100%)"
              : isMine ? S.outBubble : S.inBubble,
            borderRadius: isMine ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
            padding: compactLayout ? "6px 12px" : "9px 14px",
            boxShadow: isMine
              ? "0 2px 8px rgba(0,120,255,0.25)"
              : isAiReply
                ? "0 0 0 1px rgba(168,85,247,0.4), 0 0 16px rgba(168,85,247,0.15)"
                : "0 1px 4px rgba(0,0,0,0.4)",
            transition: "opacity 0.2s",
            border: isAiReply ? "1px solid rgba(168,85,247,0.3)" : "none",
          }}>
            {isAiReply && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                background: "rgba(109,74,255,0.2)", border: "1px solid rgba(109,74,255,0.4)",
                borderRadius: 6, padding: "2px 6px", marginBottom: 5,
              }}>
                <span style={{ fontSize: 10 }}>✨</span>
                <span style={{ fontSize: 9, fontWeight: 800, color: S.purple, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  AI Replied
                </span>
              </div>
            )}

            <SpoilerShieldText rawText={text} compact={compactLayout} />

            {showReactions && (
              <div style={{ marginTop: compactLayout ? 4 : 6 }}>
                <MessageReactions align={isMine ? "right" : "left"} enabled={showReactions} />
              </div>
            )}

            <div style={{ marginTop: compactLayout ? 3 : 5, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 5 }}>
              <span style={{ color: isMine ? "rgba(255,255,255,0.55)" : S.textMuted, fontSize: 10 }}>
                {formatTime(msg.createdAt)}
              </span>
              {isMine && (
                <DeliveryStatusBadge
                  status={msg.status} readReceiptsEnabled={readReceiptsEnabled} readReceiptMode={readReceiptMode}
                />
              )}
            </div>
          </div>
        )}

        {msg.status === "failed" && onRetry && (
          <div style={{ display: "flex", justifyContent: isMine ? "flex-end" : "flex-start", marginTop: 4 }}>
            <button type="button" onClick={onRetry} data-testid="chat-message-retry-button"
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: S.red, fontSize: 11, fontWeight: 700, padding: "3px 8px",
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

// ─── Utilities ────────────────────────────────────────────────────────────────
function formatTime(ts: number): string {
  const d   = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
