import { CreateMLCEngine, MLCEngine, InitProgressCallback } from "@mlc-ai/web-llm";
import { AIWorkerRequest, AIWorkerResponse, SummarizePayload, DetectIntentPayload, AIIntent, AnalyzeSentimentPayload, SentimentResult, SentimentLabel } from "./AITypes";

// Downgrade to 1B INT4 model to guarantee running under limited mobile RAM constraints (~700MB VRAM footprint).
const SELECTED_MODEL = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

let engine: MLCEngine | null = null;
let isInitializing = false;

// ─── Worker Event Listener ───────────────────────────────

self.addEventListener("message", async (event: MessageEvent<AIWorkerRequest>) => {
  const req = event.data;

  try {
    switch (req.action) {
      case "init":
        await initializeEngine(req.id);
        break;

      case "summarize":
        await handleSummarize(req.id, req.payload as SummarizePayload);
        break;

      case "detect-intent":
        await handleDetectIntent(req.id, req.payload as DetectIntentPayload);
        break;

      case "analyze-sentiment":
        await handleAnalyzeSentiment(req.id, req.payload as AnalyzeSentimentPayload);
        break;

      default:
        sendError(req.id, req.action, "Unknown action");
    }
  } catch (err: any) {
    sendError(req.id, req.action, err.message || "Worker execution failed.");
  }
});

// ─── Actions ─────────────────────────────────────────────

async function initializeEngine(id: string) {
  if (engine) {
    sendSuccess(id, "init", { loaded: true });
    return;
  }
  if (isInitializing) {
    sendError(id, "init", "Engine is already initializing.");
    return;
  }

  isInitializing = true;

  try {
    const onProgress: InitProgressCallback = (progress) => {
      self.postMessage({
        id,
        success: true,
        action: "init",
        progress,
      } as AIWorkerResponse);
    };

    // Rely on MLC default context size for the 1B model
    engine = await CreateMLCEngine(SELECTED_MODEL, {
      initProgressCallback: onProgress,
    });

    sendSuccess(id, "init", { loaded: true });
  } catch (error: any) {
    console.error("Worker failed to init AI:", error);
    sendError(id, "init", "Failed to load WebGPU model. " + error.message);
  } finally {
    isInitializing = false;
  }
}

async function handleSummarize(id: string, payload: SummarizePayload) {
  if (!engine) throw new Error("Initialize AI engine first.");

  const formattedLog = payload.messages.map(m => `${m.sender}: ${m.text}`).join('\n');
  const prompt = `You are the Quantchat AI Concierge. Summarize the following group chat instantly.\nChat Log:\n${formattedLog}\n\nInstructions: Maximum 2 sentences. Identify key decisions or urgent items. Output ONLY the summary text.`;

  const reply = await engine.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2, 
  });

  const content = reply.choices[0]?.message.content;
  sendSuccess(id, "summarize", content || "Could not generate summary.");
}

async function handleDetectIntent(id: string, payload: DetectIntentPayload) {
  if (!engine) throw new Error("Initialize AI engine first.");

  const prompt = `Analyze if the user needs a widget based on the message. Reply strictly with ONE word: "flight", "map", or "none". Message: "${payload.lastMessage}"`;
  
  const reply = await engine.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
  });

  const intentString = reply.choices[0]?.message.content?.toLowerCase().trim() || "none";
  let intent: AIIntent = "none";
  if (intentString.includes("flight")) intent = "flight";
  else if (intentString.includes("map")) intent = "map";

  sendSuccess(id, "detect-intent", intent);
}

async function handleAnalyzeSentiment(id: string, payload: AnalyzeSentimentPayload) {
  if (!engine) throw new Error("Initialize AI engine first.");

  // Truncate to keep within context budget; 500 chars is ample for a message.
  const safeText = payload.text.slice(0, 500).replace(/"/g, "'");
  const prompt = `Classify the emotional sentiment of the message below.
Reply ONLY with a JSON object — no markdown, no explanation.
Format: {"label":"positive"|"negative"|"neutral"|"joyful"|"angry"|"sad","valence":<-1.0 to 1.0>,"arousal":<0.0 to 1.0>}
Message: "${safeText}"`;

  const reply = await engine.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
  });

  const raw = reply.choices[0]?.message.content ?? "{}";
  const cleaned = raw.replace(/```(?:json)?\n?/g, "").replace(/```/g, "").trim();

  const NEUTRAL_RESULT: SentimentResult = { label: "neutral", valence: 0, arousal: 0.5, confidence: 0 };

  try {
    const parsed = JSON.parse(cleaned);
    const validLabels: SentimentLabel[] = ["positive", "negative", "neutral", "joyful", "angry", "sad"];
    const label: SentimentLabel = validLabels.includes(parsed.label) ? parsed.label : "neutral";
    const result: SentimentResult = {
      label,
      valence: Math.max(-1, Math.min(1, Number(parsed.valence) || 0)),
      arousal: Math.max(0, Math.min(1, Number(parsed.arousal) || 0.5)),
      confidence: 0.85,
    };
    sendSuccess(id, "analyze-sentiment", result);
  } catch {
    sendSuccess(id, "analyze-sentiment", NEUTRAL_RESULT);
  }
}

// ─── Helpers ─────────────────────────────────────────────

function sendSuccess(id: string, action: AIWorkerResponse["action"], result: any) {
  self.postMessage({
    id,
    success: true,
    action,
    result,
  } as AIWorkerResponse);
}

function sendError(id: string, action: AIWorkerResponse["action"], error: string) {
  self.postMessage({
    id,
    success: false,
    action,
    error,
  } as AIWorkerResponse);
}
