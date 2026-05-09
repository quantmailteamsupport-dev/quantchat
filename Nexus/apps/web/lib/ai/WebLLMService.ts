import { InitProgressReport } from "@mlc-ai/web-llm";
import { AIWorkerRequest, AIWorkerResponse, SummarizePayload, DetectIntentPayload, AIIntent, AnalyzeSentimentPayload, SentimentResult } from "./AITypes";

// Type definition for WebGPU
interface GPU {
  requestAdapter(options?: GPURequestAdapterOptions): Promise<GPUAdapter | null>;
}

interface GPURequestAdapterOptions {
  powerPreference?: "low-power" | "high-performance";
}

interface GPUAdapter {
  readonly name: string;
  readonly features: ReadonlyArray<string>;
  readonly limits: Record<string, number>;
}

/**
 * WebLLMService (Client)
 * Runs strictly as an interface to the background WebLLMWorker.
 * It does not block the main UI thread during generation or loading.
 */
export class EdgeAIEngine {
  private worker: Worker | null = null;
  private isInitializing = false;
  private isLoaded = false;
  private pendingRequests: Map<string, {
    resolve: (val: unknown) => void;
    reject: (err: Error) => void
  }> = new Map();

  /**
   * Hardware Capability Check
   */
  public async isDeviceSupported(): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    // Reject devices with under 4GB RAM to prevent immediate OOM
    const navWithMemory = navigator as Navigator & { deviceMemory?: number; gpu?: GPU };
    if ("deviceMemory" in navWithMemory) {
      const mem = navWithMemory.deviceMemory;
      if (mem && mem < 4) {
        console.warn(`[EdgeAI] Device memory (${mem}GB) is under 4GB threshold. Aborting local AI.`);
        return false;
      }
    }

    // Reject if WebGPU is absent
    if (!navWithMemory.gpu) {
      console.warn("[EdgeAI] WebGPU is not supported natively in this browser.");
      return false;
    }

    try {
      const adapter = await navWithMemory.gpu.requestAdapter();
      if (!adapter) return false;
    } catch {
      return false;
    }

    return true;
  }

  /**
   * Spawns the WebWorker and initializing the 1B LLM model in background
   */
  public async initialize(onProgress?: (report: InitProgressReport) => void): Promise<boolean> {
    if (this.isLoaded) return true;
    if (this.isInitializing) return false;

    const supported = await this.isDeviceSupported();
    if (!supported) return false;

    this.isInitializing = true;
    try {
      // Load Web Worker
      this.worker = new Worker(new URL("./WebLLMWorker.ts", import.meta.url), { type: "module" });
      
      this.worker.onmessage = (e: MessageEvent<AIWorkerResponse>) => {
        const { id, action, success, result, error, progress } = e.data;

        if (action === "init" && progress && onProgress) {
          onProgress(progress as unknown as InitProgressReport); // map to InitProgressReport type loosely
          return;
        }

        const promise = this.pendingRequests.get(id);
        if (!promise) return;

        this.pendingRequests.delete(id);
        if (success) {
          promise.resolve(result);
        } else {
          promise.reject(new Error(error));
        }
      };

      // Request init
      const initPromise = this.postMessageAsync<any>({
        id: this.uuid(),
        action: "init",
      });

      await initPromise;
      this.isLoaded = true;
      console.log("🚀 Edge AI (Web Worker) initialized successfully. Zero-cost compute active.");
      return true;
    } catch (e) {
      console.error("Failed to initialize Edge AI Worker:", e);
      if (this.worker) {
        this.worker.terminate();
        this.worker = null;
      }
      return false;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Phase 4.2: Catch-up Summaries for 500+ Unread Messages
   */
  public async summarizeUnreadMessages(messages: {sender: string, text: string}[]): Promise<string> {
    if (!this.isLoaded) throw new Error("Edge AI not loaded");

    const req: AIWorkerRequest<SummarizePayload> = {
      id: this.uuid(),
      action: "summarize",
      payload: { messages }
    };
    return this.postMessageAsync<string>(req);
  }

  /**
   * AI Concierge Intent Detector
   */
  public async detectWidgetIntent(lastMessage: string): Promise<AIIntent> {
    if (!this.isLoaded) return "none";

    const req: AIWorkerRequest<DetectIntentPayload> = {
      id: this.uuid(),
      action: "detect-intent",
      payload: { lastMessage }
    };
    return this.postMessageAsync<AIIntent>(req);
  }

  /**
   * On-Device Sentiment Analysis
   * Classifies the emotional tone of a single message and returns
   * a structured SentimentResult suitable for driving visual shader params.
   */
  public async analyzeSentiment(text: string): Promise<SentimentResult> {
    if (!this.isLoaded) throw new Error("Edge AI not loaded");

    const req: AIWorkerRequest<AnalyzeSentimentPayload> = {
      id: this.uuid(),
      action: "analyze-sentiment",
      payload: { text },
    };
    return this.postMessageAsync<SentimentResult>(req);
  }

  // ─── Internal Utilities ───────────────────────────────

  private postMessageAsync<T>(request: AIWorkerRequest): Promise<T> {
    if (!this.worker) return Promise.reject(new Error("Worker destroyed"));

    return new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(request.id, {
        resolve: resolve as (val: unknown) => void,
        reject
      });
      this.worker!.postMessage(request);
    });
  }

  private uuid(): string {
    return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
  }
}

// Export singleton engine via UI
export const edgeAI = new EdgeAIEngine();
