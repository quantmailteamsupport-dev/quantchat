import { NextRequest, NextResponse } from "next/server";
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

const MAX_INPUT_CHARS = 500;
const MAX_CONTEXT_MESSAGES = 8;
const MAX_CONTEXT_MESSAGE_CHARS = 400;
const BYOK_TIMEOUT_MS = 5_000;

type PredictTypingBody = {
  currentInput?: unknown;
  recentMessages?: unknown;
  byokKey?: unknown;
  aiOptIn?: unknown;
  privacyMode?: unknown;
  chatId?: unknown;
  retentionSecs?: unknown;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PredictTypingBody;
    const currentInput = normalizeString(body.currentInput, MAX_INPUT_CHARS);
    const recentMessages = normalizeRecentMessages(body.recentMessages);
    const byokKey = normalizeString(body.byokKey, 512);

    if (!currentInput.trim()) {
      return NextResponse.json({ suggestion: "" });
    }

    if (currentInput.length < 2 || currentInput.endsWith("  ")) {
      return NextResponse.json({ suggestion: "" });
    }

    const privacyMode = normalizeAiPrivacyMode(body.privacyMode);
    const retentionSecs = normalizeRetentionSecs(body.retentionSecs, privacyMode);
    const aiOptIn = normalizeAiOptIn(body.aiOptIn, byokKey.length > 0);
    const chatId = normalizeChatId(body.chatId, "direct:unknown");
    const requesterKey = resolveRequesterKey(req);

    const rateLimit = consumeAiRateLimit({
      scope: "predict-typing",
      requesterKey,
      chatId,
      limit: 70,
      windowMs: 60_000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          suggestion: "",
          error: "RATE_LIMITED",
          retryAfterSec: rateLimit.retryAfterSec,
        },
        { status: 429 },
      );
    }

    let suggestion = "";
    if (aiOptIn && byokKey) {
      suggestion = await fetchByokSuggestion(currentInput, recentMessages, byokKey);
    }

    if (!suggestion) {
      suggestion = heuristicComplete(currentInput, recentMessages);
    }

    if (aiOptIn) {
      recordAiAuditEvent({
        scope: "predict-typing",
        requesterKey,
        chatId,
        privacyMode,
        retentionSecs,
        digest: digestForRetention([currentInput, ...recentMessages]),
      });
    }

    return NextResponse.json({
      suggestion,
      policy: {
        aiOptIn,
        privacyMode,
        retentionSecs,
        chatId,
      },
    });
  } catch {
    return NextResponse.json({ suggestion: "" });
  }
}

async function fetchByokSuggestion(
  currentInput: string,
  recentMessages: string[],
  byokKey: string,
): Promise<string> {
  const contextBlock =
    recentMessages.length > 0
      ? `Recent conversation:\n${recentMessages.join("\n")}\n\n`
      : "";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BYOK_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${byokKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 30,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              "You are a smart autocomplete assistant. Return only a concise completion for the user text. Keep it under 10 words.",
          },
          {
            role: "user",
            content: `${contextBlock}Complete this message (return only the completion, not the start): \"${currentInput}\"`,
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

    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    return raw.replace(/^["']|["']$/g, "").trim();
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeString(raw: unknown, maxLen: number): string {
  if (typeof raw !== "string") return "";
  return raw.slice(0, maxLen);
}

function normalizeRecentMessages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];

  const normalized: string[] = [];
  for (const item of raw.slice(-MAX_CONTEXT_MESSAGES)) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    normalized.push(trimmed.slice(0, MAX_CONTEXT_MESSAGE_CHARS));
  }

  return normalized;
}

function heuristicComplete(input: string, context: string[]): string {
  const lower = input.toLowerCase().trim();

  const completions: Array<[RegExp, string]> = [
    [/^ok$/, " got it, will do"],
    [/^okay$/, ", sounds good"],
    [/^yes$/, ", I will be there"],
    [/^no$/, ", I cannot make it"],
    [/^sure$/, ", let's do it"],
    [/^i\'ll$/, " get back to you shortly"],
    [/^sounds$/, " good to me"],
    [/^let me$/, " check and confirm"],
    [/^can you$/, " send me the details?"],
    [/^thanks$/, " a lot"],
    [/^thank you$/, " so much"],
    [/^on my way$/, ", I will be there soon"],
    [/^hey$/, ", what's up?"],
    [/^hi$/, ", how are you?"],
    [/^hello$/, " there"],
  ];

  for (const [pattern, suffix] of completions) {
    if (pattern.test(lower)) {
      return suffix;
    }
  }

  if (context.some((message) => /meeting|call|standup/i.test(message))) {
    if (lower.includes("meet")) return "ing time works for me";
    if (lower.includes("call")) return " you in 5 minutes";
  }

  if (context.some((message) => /homework|assignment|submit/i.test(message))) {
    if (lower.includes("submit")) return "ted mine already";
    if (lower.includes("done")) return " with the assignment";
  }

  return "";
}
