"use client";

/**
 * components/ChatInput.tsx
 *
 * Clean-Line Composer — Professional Redesign
 *
 * Features:
 *  - Ghost-text AI sentence completion (inline, greyed out)
 *  - Tab key accepts the full suggestion
 *  - Arrow-right accepts one word at a time
 *  - Contextual completions based on conversation history
 *  - BYOK / Quant AI — calls /api/ai-complete if available
 *  - Clean borderless design with teal accent
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, Smile, Paperclip, Sparkles } from "lucide-react";
import DisappearingTimerMenu from "./DisappearingTimerMenu";
import { getEmotionDetectionService } from "../lib/emotion";

// ─── Types ───────────────────────────────────────────────────────

export interface ChatInputProps {
  /** Called when the user submits a message */
  onSend: (text: string) => void;
  /** Called on every keystroke (for typing indicators) */
  onTyping?: (isTyping: boolean) => void;
  /** Recent messages for AI context */
  contextMessages?: string[];
  /** Whether the contact is currently typing */
  contactIsTyping?: boolean;
  /** User's AI API key (BYOK) */
  apiKey?: string;
  /** Whether AI predictive typing is enabled */
  aiEnabled?: boolean;
  placeholder?: string;
  disabled?: boolean;
  /**
   * Current disappearing-message TTL for this chat, in seconds.
   * `null` or `undefined` = disappearing messages OFF.
   * When this prop is `undefined`, the timer control is hidden
   * entirely (fully backward-compatible).
   */
  ttlSecs?: number | null;
  /**
   * Called when the user picks a new TTL from the timer menu.
   * Required to show the timer control.
   */
  onChangeTtl?: (ttlSecs: number | null) => void;
}

// ─── Heuristic completions (fallback when no API key) ───────────

const COMPLETIONS: Record<string, string> = {
  "how are": " you doing today?",
  "what are": " you up to?",
  "let me know": " if you need anything.",
  "sounds": " good to me!",
  "i'll be": " there in 10 minutes.",
  "can we": " schedule a call?",
  "i think": " we should discuss this.",
  "good morning": "! How are you?",
  "good night": "! Sleep well 😊",
  "see you": " tomorrow then.",
  "thanks": " for letting me know!",
  "ok": ", got it.",
  "sure": ", no problem!",
  "hey": ", what's up?",
  "i'm": " on my way.",
  "are you": " free right now?",
  "when are": " you available?",
  "i was": " just thinking about that.",
  "yeah": ", that makes sense.",
};

function getHeuristicCompletion(input: string): string {
  const lower = input.toLowerCase().trimStart();
  for (const [prefix, completion] of Object.entries(COMPLETIONS)) {
    if (lower.endsWith(prefix)) return completion;
  }
  // Fallback: just suggest a period if sentence is long enough
  if (lower.length > 30 && !lower.endsWith(".") && !lower.endsWith("?") && !lower.endsWith("!")) {
    return ".";
  }
  return "";
}

// ─── AI completion (calls API route if key present) ─────────────

async function fetchAICompletion(
  input: string,
  context: string[],
  apiKey: string
): Promise<string> {
  try {
    const res = await fetch("/api/ai-complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, context, apiKey }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return "";
    const json = (await res.json()) as { completion?: string };
    return json.completion ?? "";
  } catch {
    return "";
  }
}

// ─── Main Component ──────────────────────────────────────────────

export default function ChatInput({
  onSend,
  onTyping,
  contextMessages = [],
  contactIsTyping = false,
  apiKey,
  aiEnabled = true,
  placeholder = "Message",
  disabled = false,
  ttlSecs,
  onChangeTtl,
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);
  const [showEmojiPanel, setShowEmojiPanel] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Typing indicator ─────────────────────────────────────────
  const notifyTyping = useCallback(
    (isTyping: boolean) => {
      onTyping?.(isTyping);
    },
    [onTyping]
  );

  // ── Fetch / debounce suggestion ───────────────────────────────
  const fetchSuggestion = useCallback(
    async (value: string) => {
      if (!aiEnabled || value.length < 3) {
        setSuggestion("");
        return;
      }

      // Cancel previous
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();

      debounceRef.current = setTimeout(async () => {
        setIsLoadingSuggestion(true);
        let completion = "";

        if (apiKey) {
          abortRef.current = new AbortController();
          completion = await fetchAICompletion(value, contextMessages, apiKey);
        } else {
          completion = getHeuristicCompletion(value);
        }

        setSuggestion(completion);
        setIsLoadingSuggestion(false);
      }, 320);
    },
    [aiEnabled, apiKey, contextMessages]
  );

  // ── Handle input change ───────────────────────────────────────
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInput(value);
    setSuggestion("");

    // Typing indicators
    notifyTyping(value.length > 0);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => notifyTyping(false), 2500);

    fetchSuggestion(value);
  };

  // ── Handle keydown ────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Feed the emotion detector. We only pass category + single char;
    // the service retains no text, only aggregate statistics.
    try {
      getEmotionDetectionService().ingestKeystroke(e.key);
    } catch {
      // Detector is best-effort; never let it break typing.
    }

    // Tab → accept full suggestion
    if (e.key === "Tab" && suggestion) {
      e.preventDefault();
      const accepted = input + suggestion;
      setInput(accepted);
      setSuggestion("");
      fetchSuggestion(accepted);
      return;
    }

    // ArrowRight at end of input → accept first word of suggestion
    if (e.key === "ArrowRight" && suggestion) {
      const cursorPos = inputRef.current?.selectionStart ?? input.length;
      if (cursorPos === input.length) {
        e.preventDefault();
        const firstWord = suggestion.match(/^\s*\S+/)?.[0] ?? suggestion;
        const accepted = input + firstWord;
        const remaining = suggestion.slice(firstWord.length);
        setInput(accepted);
        setSuggestion(remaining);
        return;
      }
    }

    // Escape → clear suggestion
    if (e.key === "Escape") {
      setSuggestion("");
    }

    // Enter → send
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Send ─────────────────────────────────────────────────────
  const handleSend = () => {
    const text = input.trim();
    if (!text || disabled) return;
    try {
      getEmotionDetectionService().ingestMessage(text);
    } catch {
      /* best-effort */
    }
    onSend(text);
    setInput("");
    setSuggestion("");
    notifyTyping(false);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
  };

  // ── Cleanup ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const ACCENT = "#2DD4BF";
  const QUICK_EMOJIS = ["😂", "❤️", "👍", "🔥", "😊", "🙏", "💯", "😭"];

  return (
    <div style={{ width: "100%", flexShrink: 0 }}>

      {/* ── Contact typing indicator ── */}
      <AnimatePresence>
        {contactIsTyping && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            style={{ padding: "6px 16px" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ display: "flex", gap: 3 }}>
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    style={{ width: 4, height: 4, borderRadius: "50%", background: "#93A1BC" }}
                    animate={{ y: [0, -3, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                  />
                ))}
              </div>
              <span style={{ fontSize: 12, color: "#93A1BC", fontFamily: "'Inter', sans-serif" }}>
                typing…
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── AI suggestion hint ── */}
      <AnimatePresence>
        {suggestion && !isLoadingSuggestion && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            style={{
              padding: "4px 16px 2px",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <span style={{
              fontSize: 10.5, color: ACCENT,
              fontFamily: "'Inter', sans-serif", fontWeight: 600,
              display: "flex", alignItems: "center", gap: 4,
            }}>
              <Sparkles size={11} />
              AI
            </span>
            <span style={{ fontSize: 10.5, color: "#93A1BC", fontFamily: "'Inter', sans-serif" }}>
              Tab to accept · → for one word
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Emoji panel ── */}
      <AnimatePresence>
        {showEmojiPanel && (
          <motion.div
            initial={{ opacity: 0, y: 6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: 6, height: 0 }}
            style={{
              padding: "8px 12px",
              display: "flex", gap: 4, flexWrap: "wrap",
            }}
          >
            {QUICK_EMOJIS.map((e) => (
              <motion.button
                key={e}
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  setInput((v) => v + e);
                  inputRef.current?.focus();
                }}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 22, padding: 4, borderRadius: 8,
                }}
              >
                {e}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main input row ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px",
        background: "rgba(11, 18, 32, 0.95)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderTop: "1px solid rgba(148, 163, 184, 0.12)",
      }}>
        {/* Emoji button */}
        <button
          onClick={() => setShowEmojiPanel((v) => !v)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 34, height: 34, borderRadius: 8,
            color: showEmojiPanel ? ACCENT : "#93A1BC",
            transition: "color 0.15s",
          }}
        >
          <Smile size={20} />
        </button>

        {/* Disappearing-message timer (only when the caller opts in) */}
        {onChangeTtl && (
          <DisappearingTimerMenu
            value={ttlSecs ?? null}
            onChange={onChangeTtl}
            disabled={disabled}
          />
        )}

        {/* Ghost-text input container */}
        <div style={{
          flex: 1,
          background: "#16233A",
          border: `1px solid ${suggestion ? "rgba(45, 212, 191, 0.35)" : "rgba(148, 163, 184, 0.12)"}`,
          borderRadius: 8,
          padding: "10px 14px",
          display: "flex", alignItems: "center",
          position: "relative",
          minHeight: 40,
          transition: "border-color 0.15s",
        }}>
          {/* Overlaid ghost text (suggestion preview) */}
          {suggestion && (
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 14, right: 14,
                top: "50%", transform: "translateY(-50%)",
                fontSize: 14, lineHeight: 1,
                fontFamily: "'Inter', -apple-system, sans-serif",
                pointerEvents: "none",
                whiteSpace: "nowrap",
                overflow: "hidden",
              }}
            >
              {/* Real text (invisible — just for spacing) */}
              <span style={{ color: "transparent" }}>{input}</span>
              {/* Ghost suggestion */}
              <span style={{ color: "rgba(147, 161, 188, 0.4)" }}>{suggestion}</span>
            </div>
          )}

          {/* Actual input */}
          <input
            ref={inputRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={suggestion ? "" : placeholder}
            disabled={disabled}
            style={{
              background: "none", border: "none", outline: "none",
              color: "#E6EDF7", fontSize: 14, width: "100%",
              fontFamily: "'Inter', -apple-system, sans-serif",
              position: "relative", zIndex: 1,
              caretColor: ACCENT,
            }}
          />

          {/* Loading spinner */}
          {isLoadingSuggestion && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
              style={{
                width: 12, height: 12, borderRadius: "50%",
                border: `2px solid rgba(45, 212, 191, 0.2)`,
                borderTopColor: ACCENT,
                flexShrink: 0, marginLeft: 6,
              }}
            />
          )}
        </div>

        {/* Attachment button */}
        <button
          style={{
            background: "none", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 34, height: 34, borderRadius: 8,
            color: "#93A1BC",
            transition: "color 0.15s",
          }}
        >
          <Paperclip size={19} />
        </button>

        {/* Send / Mic button */}
        <AnimatePresence mode="wait">
          {input.trim() ? (
            <motion.button
              key="send"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSend}
              style={{
                width: 38, height: 38, borderRadius: 10,
                background: ACCENT,
                border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
                color: "#0B1220",
              }}
            >
              <Send size={17} />
            </motion.button>
          ) : (
            <motion.button
              key="mic"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              style={{
                width: 38, height: 38, borderRadius: 10,
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(148, 163, 184, 0.12)",
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
                color: "#93A1BC",
              }}
            >
              <Mic size={18} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
