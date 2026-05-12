"use client";

import { CreateMLCEngine, InitProgressReport, MLCEngine } from "@mlc-ai/web-llm";
import { useState, useRef } from "react";

const MODEL_MAP = {
  // Llama-3 8B is the default instruction model for high logic
  LLAMA_3_8B: "Llama-3-8B-Instruct-q4f16_1-MLC",
  // TinyLlama is an ultra-fast fallback for low-end devices
  TINY_LLAMA: "TinyLlama-1.1B-Chat-v0.4-q4f16_1-MLC",
};

export function useWebLLMEngine(modelKey: keyof typeof MODEL_MAP = "LLAMA_3_8B") {
  const [engine, setEngine] = useState<MLCEngine | null>(null);
  const [loadingText, setLoadingText] = useState("AI Engine Standby...");
  const [progress, setProgress] = useState(0);
  const [isReady, setIsReady] = useState(false);
  
  const selectedModel = MODEL_MAP[modelKey];
  const isInitializing = useRef(false);

  const initProgressCallback = (report: InitProgressReport) => {
    setLoadingText(report.text);
    setProgress(report.progress * 100);
  };

  const loadEngine = async () => {
    if (isInitializing.current || isReady) return;
    isInitializing.current = true;
    
    try {
      setLoadingText("Checking GPU acceleration (WebGPU)...");
      // Actually instantiates the WebGPU context and pulls the multi-gigabyte files from CDN to IndexedDB
      const mlcEngine = await CreateMLCEngine(selectedModel, {
        initProgressCallback: initProgressCallback,
      });
      
      setEngine(mlcEngine);
      setIsReady(true);
      setLoadingText("Local Intelligence Online.");
    } catch (err: any) {
      console.error("[WebLLM] Failed to inject AI logic into WASM context: ", err);
      setLoadingText(`Edge Failed: ${err.message}`);
    } finally {
      isInitializing.current = false;
    }
  };

  /**
   * Directly triggers the local hardware to stream a response.
   */
  const generateResponse = async (prompt: string, onUpdate?: (chunk: string) => void) => {
    if (!engine || !isReady) throw new Error("Engine offline or syncing weights.");
    
    const stream = await engine.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      stream: true, // We want word-by-word real-time output
    });

    let fullText = "";
    for await (const chunk of stream) {
      const addedText = chunk.choices[0]?.delta.content || "";
      fullText += addedText;
      if (onUpdate) onUpdate(fullText);
    }
    return fullText;
  };

  return { engine, isReady, progress, loadingText, loadEngine, generateResponse };
}
