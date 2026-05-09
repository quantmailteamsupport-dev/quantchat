/**
 * lib/mockChatData.ts
 *
 * Mock data for previewing the Quantchat UI before the backend is fully connected.
 * Includes: DM contacts, Discord-style servers/spaces, and AI auto-reply messages.
 */

export interface MockContact {
  id: string;
  name: string;
  avatarColor: string;
  avatarLetter: string;
  lastMessage: string;
  lastMessageAt: number;
  unreadCount: number;
  isOnline?: boolean;
}

export interface MockServer {
  id: string;
  name: string;
  icon: string;
  color: string;
  unreadCount: number;
  channels: MockChannel[];
}

export interface MockChannel {
  id: string;
  name: string;
  type: "text" | "voice" | "video";
  unread?: number;
}

export interface MockMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: number;
  isAiReply?: boolean;
  aiReplyNote?: string;
}

// ─── Mock DM Contacts ─────────────────────────────────────────
export const MOCK_DM_CONTACTS: MockContact[] = [
  {
    id: "aryan-s",
    name: "Aryan Sharma",
    avatarColor: "#6d4aff",
    avatarLetter: "A",
    lastMessage: "Did you check the new Nexus build?",
    lastMessageAt: Date.now() - 5 * 60 * 1000,
    unreadCount: 3,
    isOnline: true,
  },
  {
    id: "priya-m",
    name: "Priya Mehta",
    avatarColor: "#e91e8c",
    avatarLetter: "P",
    lastMessage: "🤖 AI: Sure, I'll pass along the message!",
    lastMessageAt: Date.now() - 30 * 60 * 1000,
    unreadCount: 0,
    isOnline: true,
  },
  {
    id: "rohan-k",
    name: "Rohan Kapoor",
    avatarColor: "#00897b",
    avatarLetter: "R",
    lastMessage: "Meeting confirmed for 5 PM",
    lastMessageAt: Date.now() - 2 * 60 * 60 * 1000,
    unreadCount: 1,
    isOnline: false,
  },
  {
    id: "zara-ali",
    name: "Zara Ali",
    avatarColor: "#f57c00",
    avatarLetter: "Z",
    lastMessage: "The designs are ready 🎨",
    lastMessageAt: Date.now() - 5 * 60 * 60 * 1000,
    unreadCount: 0,
    isOnline: false,
  },
  {
    id: "dev-nexus",
    name: "Dev Nexus",
    avatarColor: "#0288b0",
    avatarLetter: "D",
    lastMessage: "🤖 AI: I've responded on your behalf.",
    lastMessageAt: Date.now() - 8 * 60 * 60 * 1000,
    unreadCount: 0,
    isOnline: true,
  },
];

// ─── Mock Servers / Spaces ────────────────────────────────────
export const MOCK_SERVERS: MockServer[] = [
  {
    id: "nexus-hq",
    name: "Nexus HQ",
    icon: "⚡",
    color: "#6d4aff",
    unreadCount: 12,
    channels: [
      { id: "general", name: "general", type: "text", unread: 5 },
      { id: "announcements", name: "announcements", type: "text", unread: 7 },
      { id: "dev-lounge", name: "dev-lounge", type: "voice" },
      { id: "design-drops", name: "design-drops", type: "text" },
    ],
  },
  {
    id: "ai-research",
    name: "AI Research Circle",
    icon: "🧠",
    color: "#e91e8c",
    unreadCount: 4,
    channels: [
      { id: "papers", name: "papers", type: "text", unread: 4 },
      { id: "models", name: "models", type: "text" },
      { id: "study-hall", name: "study-hall", type: "voice" },
    ],
  },
  {
    id: "night-owls",
    name: "Night Owls Hub",
    icon: "🦉",
    color: "#0288b0",
    unreadCount: 0,
    channels: [
      { id: "chillzone", name: "chillzone", type: "text" },
      { id: "grind-room", name: "grind-room", type: "voice" },
      { id: "chill-room-xr", name: "chill-room-xr", type: "video" },
    ],
  },
  {
    id: "goa-trip",
    name: "Neural Hive — Goa 2026",
    icon: "🌴",
    color: "#43a047",
    unreadCount: 2,
    channels: [
      { id: "planning", name: "planning", type: "text", unread: 2 },
      { id: "photos", name: "photos", type: "text" },
    ],
  },
];

// ─── Mock Messages with AI Reply examples ────────────────────
export const MOCK_AI_THREAD: MockMessage[] = [
  {
    id: "m1",
    senderId: "aryan-s",
    senderName: "Aryan Sharma",
    text: "Hey! Are you free tonight for a quick call?",
    createdAt: Date.now() - 3 * 60 * 60 * 1000,
  },
  {
    id: "m2",
    senderId: "local-user",
    senderName: "You (AI Twin)",
    text: "Hey Aryan! I'm actually tied up right now, but I'm free after 9 PM. Does that work for you?",
    createdAt: Date.now() - 2 * 60 * 60 * 1000 - 30 * 1000,
    isAiReply: true,
    aiReplyNote: "Your Digital Twin replied while you were in a meeting.",
  },
  {
    id: "m3",
    senderId: "aryan-s",
    senderName: "Aryan Sharma",
    text: "Perfect! 9 PM works great. I'll ping you then 🙌",
    createdAt: Date.now() - 2 * 60 * 60 * 1000,
  },
  {
    id: "m4",
    senderId: "local-user",
    senderName: "You (AI Twin)",
    text: "Awesome, locked in! Looking forward to it.",
    createdAt: Date.now() - 1 * 60 * 60 * 1000 - 45 * 60 * 1000,
    isAiReply: true,
    aiReplyNote: "Your Digital Twin confirmed the appointment.",
  },
  {
    id: "m5",
    senderId: "aryan-s",
    senderName: "Aryan Sharma",
    text: "Did you check the new Nexus build? The AR module is insane 🔥",
    createdAt: Date.now() - 5 * 60 * 1000,
  },
];

// ─── Helpers ──────────────────────────────────────────────────
export function formatMockTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60 * 1000) return "now";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 24 * 60 * 60 * 1000) {
    const h = new Date(ms).getHours();
    const m = new Date(ms).getMinutes().toString().padStart(2, "0");
    return `${h}:${m}`;
  }
  return new Date(ms).toLocaleDateString();
}
