export type AIIntent = "flight" | "map" | "none";

export type SentimentLabel = "positive" | "negative" | "neutral" | "joyful" | "angry" | "sad";

export interface SentimentResult {
  label: SentimentLabel;
  /** Emotional valence: -1.0 (most negative) to +1.0 (most positive) */
  valence: number;
  /** Arousal / energy level: 0.0 (calm) to 1.0 (highly activated) */
  arousal: number;
  /** Model confidence: 0.0 to 1.0 */
  confidence: number;
}

export interface AIWorkerRequest<T = any> {
  id: string; // Ensure unique request ID for the promise resolver
  action: "init" | "summarize" | "detect-intent" | "analyze-sentiment";
  payload?: T;
}

export interface AIWorkerResponse<T = any> {
  id: string;
  success: boolean;
  action: "init" | "summarize" | "detect-intent" | "analyze-sentiment";
  result?: T;
  error?: string;
  progress?: {
    text: string;
    progress: number;
    timeElapsed: number;
  };
}

// Payload Types
export interface SummarizePayload {
  messages: { sender: string; text: string }[];
}

export interface DetectIntentPayload {
  lastMessage: string;
}

export interface AnalyzeSentimentPayload {
  text: string;
}
