import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { PrismaClient } from "@prisma/client";

/**
 * POST /api/ai-avatar
 *
 * Generates an AI auto-reply on behalf of an offline user.
 *
 * Body:
 *   incomingMessage  string
 *   persona          string
 *   allowanceLevel   "strict" | "casual" | "autonomous"
 *   recentHistory    string[]
 *   byokKey          string (optional OpenAI API key)
 *
 * Response:
 *   { reply: string, creditsUsed: number, remainingCredits: number | null }
 */

const FREE_TIER_LIMIT = 20;

const globalForPrisma = globalThis as unknown as { _aiAvatarPrisma?: PrismaClient };
const prisma = globalForPrisma._aiAvatarPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma._aiAvatarPrisma = prisma;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      incomingMessage: string;
      persona?: string;
      allowanceLevel?: "strict" | "casual" | "autonomous";
      recentHistory?: string[];
      byokKey?: string;
    };

    const {
      incomingMessage,
      persona = "",
      allowanceLevel = "strict",
      recentHistory = [],
      byokKey,
    } = body;
    const normalizedByokKey = byokKey?.trim() ?? "";

    if (!incomingMessage?.trim()) {
      return NextResponse.json(
        { error: "incomingMessage is required" },
        { status: 400 },
      );
    }

    // BYOK path: uses caller key, no platform credit spend.
    if (normalizedByokKey) {
      try {
        const openAIResp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${normalizedByokKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            max_tokens: 120,
            temperature: 0.85,
            messages: [
              {
                role: "system",
                content: buildSystemPrompt(persona, allowanceLevel),
              },
              ...recentHistory.map((h) => ({ role: "user" as const, content: h })),
              { role: "user", content: incomingMessage },
            ],
          }),
        });

        if (!openAIResp.ok) {
          const errBody = (await openAIResp.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          throw new Error(errBody?.error?.message ?? `OpenAI error ${openAIResp.status}`);
        }

        const data = (await openAIResp.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const reply =
          data.choices?.[0]?.message?.content?.trim() ??
          "Hey, I'm a bit busy right now. Will get back to you soon!";

        return NextResponse.json({
          reply,
          creditsUsed: 0,
          remainingCredits: null,
          source: "byok",
        });
      } catch (openAIErr) {
        console.error("[AI Avatar] BYOK call failed:", openAIErr);
        return NextResponse.json(
          { error: "BYOK request failed. Verify your OpenAI key and try again." },
          { status: 502 },
        );
      }
    }

    // Platform credit path: requires authenticated user and server-side accounting.
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required for platform AI credits." },
        { status: 401 },
      );
    }

    let remainingCredits = 0;
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { aiCount: true },
      });

      if (!user) {
        return NextResponse.json({ error: "User not found." }, { status: 404 });
      }

      if (user.aiCount >= FREE_TIER_LIMIT) {
        return NextResponse.json(
          {
            error: "No AI credits remaining. Add a BYOK OpenAI key or upgrade to Quant Premium.",
            code: "CREDITS_EXHAUSTED",
            remainingCredits: 0,
          },
          { status: 402 },
        );
      }

      const updated = await prisma.user.update({
        where: { id: userId },
        data: { aiCount: { increment: 1 } },
        select: { aiCount: true },
      });
      remainingCredits = Math.max(0, FREE_TIER_LIMIT - updated.aiCount);
    } catch (dbErr) {
      console.error("[AI Avatar] Credit accounting failed:", dbErr);
      return NextResponse.json(
        { error: "Service temporarily unavailable. Please try again." },
        { status: 503 },
      );
    }

    const reply = generateMockReply(incomingMessage, allowanceLevel, persona);

    return NextResponse.json({
      reply,
      creditsUsed: 1,
      remainingCredits,
      source: "quant-ai",
    });
  } catch (err) {
    console.error("[AI Avatar API]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

function buildSystemPrompt(
  persona: string,
  allowanceLevel: "strict" | "casual" | "autonomous",
): string {
  const baseInstructions = {
    strict:
      "Only acknowledge receipt safely. Do NOT make any commitments or promises. Keep it very brief (1 sentence max).",
    casual:
      "Reply naturally in the user's texting style. Keep replies short and conversational. Match their energy.",
    autonomous:
      "You can reply fully on their behalf, make plans, answer questions, and make reasonable commitments. Be helpful.",
  };

  return `You are an AI Digital Twin acting as a stand-in for a user who is currently offline.
${persona ? `The user's texting style: ${persona}` : "Use a natural, casual texting style."}
Instructions: ${baseInstructions[allowanceLevel]}
Keep replies authentic, short, and human-sounding. Never reveal you are an AI unless directly asked.`;
}

function generateMockReply(
  _message: string,
  allowanceLevel: "strict" | "casual" | "autonomous",
  _persona: string,
): string {
  const strictReplies = [
    "Hey, got your message! Will reply properly when I'm free.",
    "Noted! Will get back to you soon.",
    "Saw this! Will respond later.",
  ];
  const casualReplies = [
    "Haha yeah, will talk soon!",
    "Ooh interesting, tell me more when I'm back.",
    "Makes sense! Catch ya later.",
  ];
  const autonomousReplies = [
    "That sounds good! Let's plan it for the weekend.",
    "Sure, I can do that! Will send the details shortly.",
    "Absolutely! I'll handle it and update you by tomorrow.",
  ];

  const pool =
    allowanceLevel === "strict"
      ? strictReplies
      : allowanceLevel === "casual"
      ? casualReplies
      : autonomousReplies;

  return pool[Math.floor(Math.random() * pool.length)]!;
}
