/**
 * FeedStore — in-memory store for /feed and /reels surfaces.
 *
 * Intentionally in-memory: this gives the web app a real API to develop against
 * (proper loading/error/empty states, optimistic UI for likes) before we wire
 * up Prisma models. Restart-safe persistence is a follow-up — when ready,
 * implement the same interface against `prisma.feedPost` / `prisma.reel`.
 */

export type FeedItemType = "snap" | "reel" | "story";

export interface FeedItem {
  id: string;
  type: FeedItemType;
  username: string;
  handle: string;
  caption: string;
  song?: string;
  likes: number;
  comments: number;
  shares: number;
  avatarColor: string;
  avatarLetter: string;
  bg: string;
  neonAccent: string;
  following: boolean;
  isNew?: boolean;
  snapExpiry?: number;
  createdAt: number;
}

export interface Reel {
  id: string;
  username: string;
  handle: string;
  caption: string;
  song: string;
  likes: number;
  comments: number;
  shares: number;
  sends: number;
  saves: number;
  avatarColor: string;
  avatarLetter: string;
  bg: string;
  neonAccent: string;
  following: boolean;
  createdAt: number;
}

const now = Date.now();

const SEED_FEED: FeedItem[] = [
  {
    id: "f1", type: "snap",
    username: "Riya Kapoor", handle: "riya.k",
    caption: "Living in 2030 while others are stuck in 2024",
    likes: 2100, comments: 84, shares: 312,
    avatarColor: "#e91e8c", avatarLetter: "R",
    bg: "radial-gradient(ellipse at 30% 20%, #e91e8c28, transparent 55%), radial-gradient(ellipse at 70% 80%, #6d4aff20, transparent 60%), #000",
    neonAccent: "#e91e8c",
    following: true,
    isNew: true, snapExpiry: 24,
    createdAt: now - 1000 * 60 * 30,
  },
  {
    id: "f2", type: "reel",
    username: "Aryan Nexus", handle: "aryan.builds",
    caption: "Shipped the BCI typing module in QuantChat. Tab to accept AI ghost text.",
    song: "Kesariya — Arijit Singh",
    likes: 8700, comments: 1200, shares: 940,
    avatarColor: "#6d4aff", avatarLetter: "A",
    bg: "radial-gradient(ellipse at 20% 70%, #6d4aff28, transparent 60%), radial-gradient(ellipse at 80% 20%, #00f5ff18, transparent 55%), #000",
    neonAccent: "#6d4aff",
    following: false,
    createdAt: now - 1000 * 60 * 90,
  },
  {
    id: "f3", type: "reel",
    username: "Noor AI Twin", handle: "noor.twin",
    caption: "My offline AI Avatar replied to 23 messages while I slept. This is insane. #QuantChat",
    song: "Original Sound — Noor",
    likes: 22300, comments: 750, shares: 2500,
    avatarColor: "#00897b", avatarLetter: "N",
    bg: "radial-gradient(ellipse at 60% 80%, #00897b28, transparent 55%), radial-gradient(ellipse at 20% 20%, #bf5af218, transparent 50%), #000",
    neonAccent: "#00f5ff",
    following: true,
    createdAt: now - 1000 * 60 * 180,
  },
  {
    id: "f4", type: "snap",
    username: "Dev Singh", handle: "dev.s",
    caption: "Family group with AI Strict Mode = pure bliss. No more good morning spam.",
    likes: 4000, comments: 210, shares: 880,
    avatarColor: "#ff6b35", avatarLetter: "D",
    bg: "radial-gradient(ellipse at 75% 25%, #ff6b3525, transparent 55%), radial-gradient(ellipse at 25% 75%, #bf5af215, transparent 50%), #000",
    neonAccent: "#ff6b35",
    following: false,
    isNew: true, snapExpiry: 8,
    createdAt: now - 1000 * 60 * 240,
  },
  {
    id: "f5", type: "reel",
    username: "Priya Creates", handle: "priya.creates",
    caption: "POV: AI camera filter — typed 'Make me look like a neon warrior' and this happened. #QuantSnap",
    song: "Raataan Lambiyan — Jubin Nautiyal",
    likes: 1600, comments: 27, shares: 431,
    avatarColor: "#0288b0", avatarLetter: "P",
    bg: "radial-gradient(ellipse at 40% 60%, #0288b028, transparent 55%), radial-gradient(ellipse at 80% 10%, #39ff1412, transparent 50%), #000",
    neonAccent: "#00f5ff",
    following: false,
    createdAt: now - 1000 * 60 * 360,
  },
];

const SEED_REELS: Reel[] = [
  {
    id: "r1",
    username: "Aryan Sharma", handle: "aryan.sharma",
    caption: "Just shipped the NativeAI Core. Running fully offline on-device. No cloud needed. #QuantAI #OfflineFirst",
    song: "Kesariya — Arijit Singh",
    likes: 4012, comments: 847, shares: 1200, sends: 318, saves: 906,
    avatarColor: "#6d4aff", avatarLetter: "A",
    bg: "radial-gradient(ellipse at 20% 80%, #1a003380 0%, transparent 60%), radial-gradient(ellipse at 80% 10%, #00f5ff18 0%, transparent 55%), linear-gradient(180deg,#0d001a 0%,#040008 100%)",
    neonAccent: "#bf5af2",
    following: false,
    createdAt: now - 1000 * 60 * 60,
  },
  {
    id: "r2",
    username: "Noor", handle: "noor.ai.twin",
    caption: "My AI Twin replied before I could. The future is weird. #DigitalTwin #Quantchat",
    song: "Original Sound — Noor",
    likes: 22300, comments: 750, shares: 2560, sends: 15400, saves: 18200,
    avatarColor: "#e91e8c", avatarLetter: "N",
    bg: "radial-gradient(ellipse at 75% 85%, #ff2d7830 0%, transparent 55%), radial-gradient(ellipse at 20% 15%, #bf5af218 0%, transparent 50%), linear-gradient(180deg,#120009 0%,#000 100%)",
    neonAccent: "#ff2d78",
    following: true,
    createdAt: now - 1000 * 60 * 120,
  },
  {
    id: "r3",
    username: "Priya Mehta", handle: "priya.creates",
    caption: "POV: You built a whole social platform from scratch in a month. @Quantchat #BuildInPublic",
    song: "Raataan Lambiyan — Jubin Nautiyal",
    likes: 1565, comments: 27, shares: 431, sends: 232, saves: 189,
    avatarColor: "#0288b0", avatarLetter: "P",
    bg: "radial-gradient(ellipse at 30% 70%, #00f5ff22 0%, transparent 55%), radial-gradient(ellipse at 70% 20%, #39ff1412 0%, transparent 50%), linear-gradient(180deg,#000d12 0%,#000 100%)",
    neonAccent: "#00f5ff",
    following: false,
    createdAt: now - 1000 * 60 * 200,
  },
  {
    id: "r4",
    username: "Nexus Dev", handle: "nexus.official",
    caption: "E2EE + WebRTC + AI Twin. One app. Zero servers reading your messages. #Privacy #Quantchat",
    song: "Trending Sound — Quantchat",
    likes: 8700, comments: 1200, shares: 940, sends: 2100, saves: 3400,
    avatarColor: "#ff6b35", avatarLetter: "N",
    bg: "radial-gradient(ellipse at 60% 80%, #ff6b3525 0%, transparent 55%), radial-gradient(ellipse at 20% 20%, #bf5af215 0%, transparent 50%), linear-gradient(180deg,#120600 0%,#000 100%)",
    neonAccent: "#ff6b35",
    following: true,
    createdAt: now - 1000 * 60 * 280,
  },
];

const feedItems = new Map<string, FeedItem>(SEED_FEED.map((i) => [i.id, { ...i }]));
const reels = new Map<string, Reel>(SEED_REELS.map((r) => [r.id, { ...r }]));
const userLikes = new Map<string, Set<string>>();

function userLikeSet(userId: string): Set<string> {
  let set = userLikes.get(userId);
  if (!set) {
    set = new Set();
    userLikes.set(userId, set);
  }
  return set;
}

export function listFeed(userId?: string): Array<FeedItem & { liked: boolean }> {
  const likes = userId ? userLikeSet(userId) : new Set<string>();
  return Array.from(feedItems.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((item) => ({ ...item, liked: likes.has(item.id) }));
}

export function listReels(userId?: string): Array<Reel & { liked: boolean }> {
  const likes = userId ? userLikeSet(userId) : new Set<string>();
  return Array.from(reels.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((reel) => ({ ...reel, liked: likes.has(reel.id) }));
}

export function toggleFeedLike(
  userId: string,
  id: string,
): { liked: boolean; likes: number } | null {
  const item = feedItems.get(id);
  if (!item) return null;
  const likes = userLikeSet(userId);
  if (likes.has(id)) {
    likes.delete(id);
    item.likes = Math.max(0, item.likes - 1);
    return { liked: false, likes: item.likes };
  }
  likes.add(id);
  item.likes += 1;
  return { liked: true, likes: item.likes };
}

export function toggleReelLike(
  userId: string,
  id: string,
): { liked: boolean; likes: number } | null {
  const reel = reels.get(id);
  if (!reel) return null;
  const likes = userLikeSet(userId);
  if (likes.has(id)) {
    likes.delete(id);
    reel.likes = Math.max(0, reel.likes - 1);
    return { liked: false, likes: reel.likes };
  }
  likes.add(id);
  reel.likes += 1;
  return { liked: true, likes: reel.likes };
}
