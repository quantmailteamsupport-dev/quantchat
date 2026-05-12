/**
 * NotificationStore — in-memory store for /notifications surface.
 *
 * Seeded with realistic notifications. A real implementation would
 * query a database table keyed by recipient user ID. When ready,
 * implement the same interface against `prisma.notification`.
 */

export type NotifType = "message" | "call_missed" | "security" | "system" | "mention";

export interface Notification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  read: boolean;
  createdAt: number;
  avatarLetter?: string;
  avatarColor?: string;
  href?: string;
}

const now = Date.now();

const SEED: Notification[] = [
  {
    id: "notif-1",
    type: "message",
    title: "Riya Kapoor",
    body: "Hey! Did you see that feed post? The BCI module is insane 🤯",
    read: false,
    createdAt: now - 5 * 60 * 1000,
    avatarLetter: "R",
    avatarColor: "#e91e8c",
    href: "/chat",
  },
  {
    id: "notif-2",
    type: "call_missed",
    title: "Missed call",
    body: "Aryan Nexus tried to reach you",
    read: false,
    createdAt: now - 18 * 60 * 1000,
    avatarLetter: "A",
    avatarColor: "#6d4aff",
    href: "/call/aryan.builds?name=Aryan+Nexus",
  },
  {
    id: "notif-3",
    type: "mention",
    title: "Noor AI Twin mentioned you",
    body: "@you your offline avatar replied before you did 😂 #QuantChat",
    read: false,
    createdAt: now - 45 * 60 * 1000,
    avatarLetter: "N",
    avatarColor: "#00897b",
    href: "/feed",
  },
  {
    id: "notif-4",
    type: "security",
    title: "New sign-in detected",
    body: "Chrome · Linux · Mumbai, IN — if this wasn't you, secure your account.",
    read: true,
    createdAt: now - 2 * 3600 * 1000,
    avatarLetter: "⚠",
    avatarColor: "#ff6b35",
    href: "/settings/devices",
  },
  {
    id: "notif-5",
    type: "message",
    title: "Dev Singh",
    body: "Family group is so much quieter with AI Strict Mode 🙌",
    read: true,
    createdAt: now - 4 * 3600 * 1000,
    avatarLetter: "D",
    avatarColor: "#ff6b35",
    href: "/chat",
  },
  {
    id: "notif-6",
    type: "system",
    title: "Keys rotated",
    body: "Your E2EE pre-keys were automatically rotated for forward secrecy.",
    read: true,
    createdAt: now - 6 * 3600 * 1000,
    avatarLetter: "🔐",
    avatarColor: "#0288b0",
    href: "/settings/key-verification",
  },
  {
    id: "notif-7",
    type: "call_missed",
    title: "Missed call",
    body: "Priya Creates tried to reach you",
    read: true,
    createdAt: now - 24 * 3600 * 1000,
    avatarLetter: "P",
    avatarColor: "#0288b0",
    href: "/call/priya.creates?name=Priya+Creates",
  },
];

const store = new Map<string, Notification>(SEED.map((n) => [n.id, { ...n }]));

export function listNotifications(): Notification[] {
  return Array.from(store.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function unreadCount(): number {
  return Array.from(store.values()).filter((n) => !n.read).length;
}

export function markRead(id: string): boolean {
  const n = store.get(id);
  if (!n) return false;
  n.read = true;
  return true;
}

export function markAllRead(): number {
  let count = 0;
  for (const n of store.values()) {
    if (!n.read) { n.read = true; count++; }
  }
  return count;
}
