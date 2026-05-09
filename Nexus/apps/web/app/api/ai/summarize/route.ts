import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { PrismaClient } from "@prisma/client";
import {
  consumeAiRateLimit,
  digestForRetention,
  normalizeAiOptIn,
  normalizeAiPrivacyMode,
  normalizeChatId,
  normalizeRetentionSecs,
  recordAiAuditEvent,
  resolveRequesterKey,
} from "@/lib/server/aiSafety";

const FREE_TIER_LIMIT = 20;
const MAX_MESSAGES = 50;
const MAX_MESSAGE_CHARS = 700;
const MAX_CHANNEL_NAME_CHARS = 80;
const SUMMARY_TIMEOUT_MS = 10_000;

type SummarizeBody = {
  messages?: unknown;
  channelName?: unknown;
  byokKey?: unknown;
  aiOptIn?: unknown;
  privacyMode?: unknown;
  chatId?: unknown;
  retentionSecs?: unknown;
};

const globalForPrisma = globalThis as unknown as { _summarizePrisma?: PrismaClient };
const prisma = globalForPrisma._summarizePrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") {
  globalForPrisma._summarizePrisma = prisma;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

    if (!userId) {
      return NextResponse.json(
        { error: "PAYWALL", used: FREE_TIER_LIMIT, limit: FREE_TIER_LIMIT },
        { status: 402 },
      );
    }

    const body = (await req.json()) as SummarizeBody;
    const messages = normalizeMessages(body.messages);
    const channelName = normalizeChannelName(body.channelName);

    if (messages.length === 0) {
      return NextResponse.json({ error: "No messages provided." }, { status: 400 });
    }

    const byokKey = normalizeString(body.byokKey, 512);
    const privacyMode = normalizeAiPrivacyMode(body.privacyMode);
    const retentionSecs = normalizeRetentionSecs(body.retentionSecs, privacyMode);
    const aiOptIn = normalizeAiOptIn(body.aiOptIn, byokKey.length > 0);
    const chatId = normalizeChatId(body.chatId, `channel:${channelName.toLowerCase()}`);
    const requesterKey = resolveRequesterKey(req, userId);

    const rateLimit = consumeAiRateLimit({
      scope: "ai-summarize",
      requesterKey,
      chatId,
      limit: 14,
      windowMs: 60_000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "RATE_LIMITED",
          retryAfterSec: rateLimit.retryAfterSec,
        },
        { status: 429 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { aiCount: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    let used = user.aiCount;
    const transcript = messages.join("\n");

    let summary = buildLocalSummary(messages, channelName);
    let source: "local-safe" | "quant-ai" | "byok" = "local-safe";

    if (aiOptIn) {
      const wantsPlatformCredits = byokKey.length === 0;
      if (wantsPlatformCredits && used >= FREE_TIER_LIMIT) {
        return NextResponse.json(
          { error: "PAYWALL", used, limit: FREE_TIER_LIMIT },
          { status: 402 },
        );
      }

      let modelSummary = "";
      try {
        modelSummary = await generateModelSummary({
          transcript,
          channelName,
          messageCount: messages.length,
          apiKey: byokKey || process.env.OPENAI_API_KEY || "",
        });
      } catch {
        modelSummary = "";
      }

      if (modelSummary) {
        summary = modelSummary;
        source = byokKey ? "byok" : "quant-ai";

        if (wantsPlatformCredits) {
          const updated = await prisma.user.update({
            where: { id: userId },
            data: { aiCount: { increment: 1 } },
            select: { aiCount: true },
          });
          used = updated.aiCount;
        }
      }

      recordAiAuditEvent({
        scope: "ai-summarize",
        requesterKey,
        chatId,
        privacyMode,
        retentionSecs,
        digest: digestForRetention([channelName, transcript]),
      });
    }

    return NextResponse.json({
      summary,
      used,
      limit: FREE_TIER_LIMIT,
      remaining: Math.max(0, FREE_TIER_LIMIT - used),
      source,
      policy: {
        aiOptIn,
        privacyMode,
        retentionSecs,
        chatId,
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

async function generateModelSummary(params: {
  transcript: string;
  channelName: string;
  messageCount: number;
  apiKey: string;
}): Promise<string> {
  if (!params.apiKey) {
    return "";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUMMARY_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 180,
        messages: [
          {
            role: "system",
            content:
              "Summarize the conversation in exactly 2 concise sentences. Prioritize decisions, blockers, and next actions.",
          },
          {
            role: "user",
            content: `Summarize ${params.messageCount} messages from #${params.channelName}:\n\n${params.transcript}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      return "";
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return data.choices?.[0]?.message?.content?.trim() ?? "";
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeMessages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];

  const normalized: string[] = [];
  for (const item of raw.slice(-MAX_MESSAGES)) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    normalized.push(trimmed.slice(0, MAX_MESSAGE_CHARS));
  }

  return normalized;
}

function normalizeChannelName(raw: unknown): string {
  if (typeof raw !== "string") return "this-channel";
  const trimmed = raw.trim();
  if (!trimmed) return "this-channel";
  return trimmed.slice(0, MAX_CHANNEL_NAME_CHARS);
}

function normalizeString(raw: unknown, maxLen: number): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, maxLen);
}

function buildLocalSummary(messages: string[], channelName: string): string {
  const keywords = extractTopKeywords(messages);
  const keywordPhrase = keywords.length > 0 ? keywords.join(", ") : "recent discussion points";

  const actionCount = messages.filter((message) => {
    return /\b(action|todo|follow up|deadline|ship|fix|review|owner|next step)\b/i.test(message);
  }).length;

  const actionSentence =
    actionCount > 0
      ? `Action-oriented updates appeared in ${actionCount} messages and should be reviewed for owners.`
      : "No explicit action keywords were detected in the sampled messages.";

  return `Summary for #${channelName}: ${messages.length} recent messages focused on ${keywordPhrase}. ${actionSentence}`;
}

function extractTopKeywords(messages: string[]): string[] {
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "that",
    "with",
    "this",
    "from",
    "have",
    "will",
    "your",
    "about",
    "into",
    "were",
    "they",
    "them",
    "there",
    "their",
    "need",
    "just",
    "chat",
    "channel",
  ]);

  const counts = new Map<string, number>();
  for (const message of messages) {
    for (const token of message.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)) {
      if (token.length < 4 || stopWords.has(token)) continue;
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([token]) => token);
}
