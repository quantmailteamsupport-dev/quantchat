import { edgeAI } from "./WebLLMService";
import { AIIntent, SummarizePayload, DetectIntentPayload } from "./AITypes";
// Assuming Socket connects generically for cloud bypass
import { io, Socket } from "socket.io-client";

const API_URL = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:4000";

/**
 * AIManager (The Intelligent Meta-Router)
 * Maps generation tasks seamlessly:
 * Try Local WebGPU (1B Llama 3.2 Worker) -> if it fails/unsupported -> Fast Cloud Backend.
 */
class AIManagerRouter {
  private localSupported = false;
  private socket: Socket | null = null;
  private isInitialized = false;

  /**
   * To be called upon unlocking the "App" layer (e.g if user clicks "Initialize AI" or is implicitly connected via Wifi).
   */
  async lazyInitialize() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Setup Cloud Socket fallback
    this.socket = io(API_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
    });

    try {
      this.localSupported = await edgeAI.isDeviceSupported();
      if (this.localSupported) {
        // Run pre-warmed initialization
        this.localSupported = await edgeAI.initialize(progress => {
          // You could link this to a subtle UI spinner or simply log it.
          console.debug(`[AIManager] Background caching model: ${progress.text}`);
        });
      }
    } catch (e) {
      console.warn("[AIManager] Edge fallback triggered on load. System will shift to remote compute.", e);
      this.localSupported = false;
    }
  }

  async summarizeMessages(messages: { sender: string; text: string }[]): Promise<string> {
    if (this.localSupported) {
      try {
        const summary = await edgeAI.summarizeUnreadMessages(messages);
        return summary;
      } catch (e) {
        console.warn("[AIManager] Local summarization failed, falling back to cloud...", e);
      }
    }

    // Cloud Fallback Strategy
    return this.cloudSummarize(messages);
  }

  async detectWidgetIntent(lastMessage: string): Promise<AIIntent> {
    if (this.localSupported) {
      try {
        const intent = await edgeAI.detectWidgetIntent(lastMessage);
        return intent;
      } catch (e) {
        console.warn("[AIManager] Local intent detection failed, falling back to cloud...", e);
      }
    }

    return this.cloudDetectIntent(lastMessage);
  }

  // ─── Cloud Fallbacks ───────────────────────────────

  private cloudSummarize(messages: { sender: string; text: string }[]): Promise<string> {
    if (!this.socket) throw new Error("AIManager: Socket disconnected");
    return new Promise((resolve, reject) => {
      this.socket?.emit("ai-summarize", { messages }, (response: { error?: string; summary?: string }) => {
        if (response.error) reject(new Error(response.error));
        else resolve(response.summary || "");
      });
      // Safety timeout
      setTimeout(() => reject(new Error("Cloud timeout")), 15000);
    });
  }

  private cloudDetectIntent(lastMessage: string): Promise<AIIntent> {
    if (!this.socket) return Promise.resolve("none");
    return new Promise((resolve) => {
      this.socket?.emit("ai-detect-intent", { lastMessage }, (response: { error?: string; intent?: AIIntent }) => {
        if (response.error) resolve("none");
        else resolve(response.intent || "none");
      });
      setTimeout(() => resolve("none"), 8000);
    });
  }
}

export const AIManager = new AIManagerRouter();
