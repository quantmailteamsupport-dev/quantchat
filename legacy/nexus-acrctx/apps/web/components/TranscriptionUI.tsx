"use client";

/**
 * TranscriptionUI
 *
 * Full-featured UI for voice message transcription inside Quantchat.
 *
 * Exported components
 * ───────────────────
 * • <TranscriptionPanel>   — main panel shown below a voice message bubble
 * • <LiveTranscriptionOverlay> — floating overlay during active recording/call
 * • <TranscriptionSearchPanel> — search drawer for searching all transcriptions
 *
 * Design system: inline styles matching the existing dark WhatsApp-inspired
 * palette used across the Quantchat web app.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";

import type {
  TranscriptionResult,
  TranscribedWord,
} from "@/lib/services/VoiceTranscriber";
import {
  getVoiceTranscriber,
} from "@/lib/services/VoiceTranscriber";
import type { SearchResult, SearchFilters } from "@/lib/services/TranscriptionSearchService";
import { getTranscriptionSearchService } from "@/lib/services/TranscriptionSearchService";

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg:           "#111b21",
  surface:      "#182229",
  surfaceHover: "#1f2c35",
  border:       "#27353d",
  accent:       "#00a884",
  accentDim:    "rgba(0,168,132,0.15)",
  accentText:   "#00d9a8",
  textPrimary:  "#e9edef",
  textSecondary:"#aebac1",
  textMuted:    "#8696a0",
  highlight:    "rgba(0,168,132,0.35)",
  error:        "#ff8a80",
  warning:      "#ffd54f",
  font:         "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
} as const;

// ─── Shared primitives ────────────────────────────────────────────────────────

function Chip({ label, color = C.accent }: { label: string; color?: string }) {
  return (
    <span
      style={{
        display:       "inline-flex",
        alignItems:    "center",
        padding:       "2px 8px",
        borderRadius:  999,
        background:    `${color}22`,
        color,
        fontSize:      10,
        fontWeight:    700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        fontFamily:    C.font,
      }}
    >
      {label}
    </span>
  );
}

function IconButton({
  label,
  title,
  onClick,
  active = false,
}: {
  label: string;
  title?: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title ?? label}
      style={{
        display:        "inline-flex",
        alignItems:     "center",
        gap:            5,
        padding:        "5px 10px",
        borderRadius:   8,
        border:         "none",
        cursor:         "pointer",
        background:     active ? C.accentDim : "transparent",
        color:          active ? C.accentText : C.textSecondary,
        fontSize:       12,
        fontFamily:     C.font,
        fontWeight:     600,
        whiteSpace:     "nowrap",
        transition:     "background 0.15s, color 0.15s",
      }}
    >
      {label}
    </button>
  );
}

function Divider() {
  return (
    <div
      style={{
        height:     1,
        background: C.border,
        margin:     "8px 0",
      }}
    />
  );
}

function ProgressBar({ percent, color = C.accent }: { percent: number; color?: string }) {
  return (
    <div
      style={{
        height:       3,
        borderRadius: 999,
        background:   C.border,
        overflow:     "hidden",
      }}
    >
      <div
        style={{
          width:        `${Math.min(percent, 100)}%`,
          height:       "100%",
          background:   color,
          transition:   "width 0.3s ease",
        }}
      />
    </div>
  );
}

// ─── Word token (read-along) ──────────────────────────────────────────────────

function WordToken({
  word,
  isActive,
  isHighlighted,
  onClick,
}: {
  word: TranscribedWord;
  isActive: boolean;
  isHighlighted: boolean;
  onClick: (timeSeconds: number) => void;
}) {
  return (
    <span
      onClick={() => onClick(word.startTime)}
      title={`${word.startTime.toFixed(2)}s — confidence ${Math.round(word.confidence * 100)}%`}
      style={{
        cursor:      "pointer",
        borderRadius: 4,
        padding:     "1px 2px",
        background:  isActive
          ? C.accent
          : isHighlighted
          ? C.highlight
          : "transparent",
        color:       isActive ? "#fff" : C.textPrimary,
        fontSize:    14,
        lineHeight:  1.7,
        fontFamily:  C.font,
        transition:  "background 0.1s",
        display:     "inline",
        userSelect:  "text",
      }}
    >
      {word.word}{" "}
    </span>
  );
}

// ─── Speaker badge ────────────────────────────────────────────────────────────

const SPEAKER_COLORS = [
  "#00a884", "#2196f3", "#ff9800", "#e91e63",
  "#9c27b0", "#00bcd4",
];

function SpeakerLabel({ index }: { index: number }) {
  const color = SPEAKER_COLORS[index % SPEAKER_COLORS.length] ?? SPEAKER_COLORS[0];
  return (
    <span
      style={{
        display:      "inline-block",
        width:        18,
        height:       18,
        borderRadius: "50%",
        background:   color,
        color:        "#fff",
        fontSize:     10,
        fontWeight:   700,
        textAlign:    "center",
        lineHeight:   "18px",
        fontFamily:   C.font,
        flexShrink:   0,
        margin:       "0 4px 0 0",
        verticalAlign:"middle",
      }}
    >
      {index + 1}
    </span>
  );
}

// ─── Key Moment card ──────────────────────────────────────────────────────────

type KeyMomentKind = "action" | "decision" | "question" | "highlight";

interface KeyMoment {
  kind:          KeyMomentKind;
  text:          string;
  timeSeconds:   number;
  wordIndices:   number[];
}

const KIND_META: Record<KeyMomentKind, { label: string; color: string; icon: string }> = {
  action:    { label: "Action",    color: "#2196f3", icon: "✓" },
  decision:  { label: "Decision",  color: "#9c27b0", icon: "◆" },
  question:  { label: "Question",  color: "#ff9800", icon: "?" },
  highlight: { label: "Highlight", color: "#00a884", icon: "★" },
};

function KeyMomentCard({
  moment,
  onJump,
}: {
  moment: KeyMoment;
  onJump: (t: number) => void;
}) {
  const meta = KIND_META[moment.kind];
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      style={{
        display:      "flex",
        alignItems:   "flex-start",
        gap:          10,
        padding:      "8px 12px",
        borderRadius: 10,
        background:   `${meta.color}18`,
        border:       `1px solid ${meta.color}33`,
        cursor:       "pointer",
      }}
      onClick={() => onJump(moment.timeSeconds)}
    >
      <span
        style={{
          width:        22,
          height:       22,
          borderRadius: "50%",
          background:   meta.color,
          color:        "#fff",
          fontSize:     12,
          fontWeight:   700,
          display:      "flex",
          alignItems:   "center",
          justifyContent: "center",
          flexShrink:   0,
        }}
      >
        {meta.icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
          <Chip label={meta.label} color={meta.color} />
          <span style={{ color: C.textMuted, fontSize: 11, fontFamily: C.font }}>
            {formatTime(moment.timeSeconds)}
          </span>
        </div>
        <span style={{ color: C.textPrimary, fontSize: 13, lineHeight: 1.5, fontFamily: C.font }}>
          {moment.text}
        </span>
      </div>
    </motion.div>
  );
}

// ─── Key moments extraction ───────────────────────────────────────────────────

const ACTION_KEYWORDS   = ["do", "need", "should", "must", "will", "send", "call", "email", "schedule", "fix", "check", "review", "update", "create", "build", "complete", "finish", "implement"];
const DECISION_KEYWORDS = ["decided", "agreed", "confirmed", "approved", "going with", "choosing", "selected", "resolved", "chose", "settled on", "conclusion"];
const QUESTION_MARKERS  = ["?", "who", "what", "when", "where", "why", "how", "could", "would", "should", "is there", "are there", "can you", "do you", "does"];

function extractKeyMoments(words: TranscribedWord[]): KeyMoment[] {
  if (words.length === 0) return [];

  const fullText = words.map((w) => w.word.toLowerCase()).join(" ");
  const moments:  KeyMoment[] = [];
  const addedTexts = new Set<string>();

  const sentenceBoundaries: number[] = [];
  for (let i = 0; i < words.length; i++) {
    if ((words[i]?.word ?? "").match(/[.!?]$/)) {
      sentenceBoundaries.push(i);
    }
  }
  // Add final sentence
  if (words.length > 0 && !sentenceBoundaries.includes(words.length - 1)) {
    sentenceBoundaries.push(words.length - 1);
  }

  let prevBoundary = -1;

  for (const boundary of sentenceBoundaries) {
    const sentenceWords  = words.slice(prevBoundary + 1, boundary + 1);
    const sentenceText   = sentenceWords.map((w) => w.word).join(" ");
    const sentenceLower  = sentenceText.toLowerCase();

    if (addedTexts.has(sentenceLower)) {
      prevBoundary = boundary;
      continue;
    }

    const firstWord = sentenceWords[0];
    if (!firstWord) {
      prevBoundary = boundary;
      continue;
    }

    const indices = sentenceWords.map((_, li) => prevBoundary + 1 + li);

    // Question detection
    if (
      sentenceLower.endsWith("?") ||
      QUESTION_MARKERS.some((m) => sentenceLower.startsWith(m))
    ) {
      moments.push({ kind: "question", text: sentenceText, timeSeconds: firstWord.startTime, wordIndices: indices });
      addedTexts.add(sentenceLower);
    }
    // Decision detection
    else if (DECISION_KEYWORDS.some((kw) => sentenceLower.includes(kw))) {
      moments.push({ kind: "decision", text: sentenceText, timeSeconds: firstWord.startTime, wordIndices: indices });
      addedTexts.add(sentenceLower);
    }
    // Action item detection
    else if (ACTION_KEYWORDS.some((kw) => sentenceLower.includes(kw))) {
      moments.push({ kind: "action", text: sentenceText, timeSeconds: firstWord.startTime, wordIndices: indices });
      addedTexts.add(sentenceLower);
    }

    prevBoundary = boundary;
  }

  // Use LLM summary if available (fallback: keyword-based highlights for long transcripts)
  if (moments.length === 0 && words.length > 60) {
    const step = Math.floor(words.length / 4);
    for (let i = 0; i < 4; i++) {
      const slice = words.slice(i * step, (i + 1) * step);
      const t = slice[0]?.startTime ?? 0;
      const text = slice.map((w) => w.word).join(" ").slice(0, 80);
      moments.push({ kind: "highlight", text, timeSeconds: t, wordIndices: slice.map((_, li) => i * step + li) });
    }
  }

  // Limit to 8 key moments
  return moments.slice(0, 8);
}

// ─── AI summary generation ────────────────────────────────────────────────────

async function generateSummary(
  result: TranscriptionResult,
  onChunk: (text: string) => void
): Promise<string> {
  const transcriber = getVoiceTranscriber();
  return transcriber.generateSummary(result, onChunk);
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function copyToClipboard(text: string): void {
  navigator.clipboard?.writeText(text).catch(() => {
    const el = document.createElement("textarea");
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  });
}

// ─── TranscriptionPanel ───────────────────────────────────────────────────────

export interface TranscriptionPanelProps {
  result:          TranscriptionResult;
  /** Current playback position in seconds. Pass 0 if unknown. */
  currentTime:     number;
  /** Callback to seek the audio player to a timestamp. */
  onSeek:          (seconds: number) => void;
  /** Words to highlight (e.g. from a search result). */
  highlightWords?: Set<number>;
  /** Whether to show the key-moments section. Default: true */
  showKeyMoments?: boolean;
  /** Whether to show the summary section (for messages > 2 min). Default: true */
  showSummary?:    boolean;
}

type PanelTab = "transcript" | "moments" | "summary";

export function TranscriptionPanel({
  result,
  currentTime,
  onSeek,
  highlightWords = new Set(),
  showKeyMoments = true,
  showSummary    = true,
}: TranscriptionPanelProps) {
  const [activeTab,    setActiveTab]    = useState<PanelTab>("transcript");
  const [copied,       setCopied]       = useState(false);
  const [keyMoments,   setKeyMoments]   = useState<KeyMoment[]>([]);
  const [summary,      setSummary]      = useState<string>("");
  const [summaryLoading, setSummaryLoading] = useState(false);

  const activeWordIndex = useMemo(() => {
    let best = -1;
    for (let i = 0; i < result.words.length; i++) {
      const w = result.words[i];
      if (!w) continue;
      if (w.startTime <= currentTime && currentTime <= w.endTime) return i;
      if (w.startTime <= currentTime) best = i;
    }
    return best;
  }, [currentTime, result.words]);

  useEffect(() => {
    if (showKeyMoments && result.words.length > 0) {
      setKeyMoments(extractKeyMoments(result.words));
    }
  }, [result.words, showKeyMoments]);

  const handleLoadSummary = useCallback(async () => {
    if (summary || summaryLoading) return;
    setSummaryLoading(true);
    try {
      await generateSummary(result, setSummary);
    } finally {
      setSummaryLoading(false);
    }
  }, [result, summary, summaryLoading]);

  useEffect(() => {
    if (activeTab === "summary" && showSummary && result.durationSeconds >= 120) {
      void handleLoadSummary();
    }
  }, [activeTab, showSummary, result.durationSeconds, handleLoadSummary]);

  const handleCopy = () => {
    copyToClipboard(result.fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const showSummaryTab = showSummary && result.durationSeconds >= 120;

  return (
    <div
      style={{
        background:   C.surface,
        borderRadius: 12,
        border:       `1px solid ${C.border}`,
        overflow:     "hidden",
        fontFamily:   C.font,
        width:        "100%",
        maxWidth:     520,
      }}
    >
      {/* Header */}
      <div
        style={{
          display:    "flex",
          alignItems: "center",
          gap:        8,
          padding:    "10px 14px",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <span style={{ fontSize: 16 }}>🎙️</span>
        <span style={{ color: C.textPrimary, fontWeight: 600, fontSize: 13 }}>
          Transcription
        </span>
        <Chip label={result.language.toUpperCase()} />
        {result.speakerCount > 1 && (
          <Chip label={`${result.speakerCount} speakers`} color="#2196f3" />
        )}
        <span
          style={{
            color:    C.textMuted,
            fontSize: 11,
            marginLeft: "auto",
          }}
        >
          {formatTime(result.durationSeconds)}
        </span>
      </div>

      {/* Tab bar */}
      <div
        style={{
          display:      "flex",
          borderBottom: `1px solid ${C.border}`,
          padding:      "0 8px",
          gap:          2,
        }}
      >
        {([
          { id: "transcript", label: "📝 Transcript" },
          ...(showKeyMoments ? [{ id: "moments", label: `✦ Key Moments (${keyMoments.length})` }] : []),
          ...(showSummaryTab ? [{ id: "summary",    label: "✦ Summary" }] : []),
        ] as Array<{ id: PanelTab; label: string }>).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={{
              padding:     "8px 12px",
              background:  "transparent",
              border:      "none",
              borderBottom: activeTab === id ? `2px solid ${C.accent}` : "2px solid transparent",
              color:       activeTab === id ? C.accentText : C.textSecondary,
              fontSize:    12,
              fontWeight:  activeTab === id ? 700 : 400,
              cursor:      "pointer",
              fontFamily:  C.font,
              whiteSpace:  "nowrap",
            }}
          >
            {label}
          </button>
        ))}

        {/* Copy button pinned to right */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
          <IconButton
            label={copied ? "✓ Copied!" : "Copy"}
            onClick={handleCopy}
            active={copied}
          />
        </div>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {activeTab === "transcript" && (
          <motion.div
            key="transcript"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ padding: "12px 14px", maxHeight: 260, overflowY: "auto" }}
          >
            <TranscriptBody
              words={result.words}
              activeIndex={activeWordIndex}
              highlightIndices={highlightWords}
              speakerCount={result.speakerCount}
              onWordClick={onSeek}
            />
          </motion.div>
        )}

        {activeTab === "moments" && (
          <motion.div
            key="moments"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              padding:   "12px 14px",
              maxHeight: 320,
              overflowY: "auto",
              display:   "flex",
              flexDirection: "column",
              gap:       8,
            }}
          >
            {keyMoments.length === 0 ? (
              <span style={{ color: C.textMuted, fontSize: 13 }}>
                No key moments detected in this message.
              </span>
            ) : (
              <AnimatePresence>
                {keyMoments.map((m, i) => (
                  <KeyMomentCard key={i} moment={m} onJump={onSeek} />
                ))}
              </AnimatePresence>
            )}
          </motion.div>
        )}

        {activeTab === "summary" && (
          <motion.div
            key="summary"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ padding: "12px 14px" }}
          >
            {summaryLoading && !summary ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ color: C.textMuted, fontSize: 12 }}>
                  Generating summary with on-device AI…
                </span>
                <ProgressBar percent={50} />
              </div>
            ) : (
              <p
                style={{
                  color:      C.textPrimary,
                  fontSize:   14,
                  lineHeight: 1.6,
                  margin:     0,
                  fontFamily: C.font,
                }}
              >
                {summary || "Summary not available."}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── TranscriptBody ───────────────────────────────────────────────────────────

function TranscriptBody({
  words,
  activeIndex,
  highlightIndices,
  speakerCount,
  onWordClick,
}: {
  words:           TranscribedWord[];
  activeIndex:     number;
  highlightIndices: Set<number>;
  speakerCount:    number;
  onWordClick:     (t: number) => void;
}) {
  if (words.length === 0) {
    return (
      <span style={{ color: C.textMuted, fontSize: 13 }}>
        Transcription is empty or could not be generated.
      </span>
    );
  }

  if (speakerCount <= 1) {
    // Single-speaker: inline word tokens
    return (
      <div style={{ lineHeight: 1.7 }}>
        {words.map((word, i) => (
          <WordToken
            key={`${word.startTime}-${i}`}
            word={word}
            isActive={i === activeIndex}
            isHighlighted={highlightIndices.has(i)}
            onClick={onWordClick}
          />
        ))}
      </div>
    );
  }

  // Multi-speaker: group consecutive words by speakerIndex
  const groups = groupBySpeaker(words);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {groups.map((group, gi) => (
        <div key={gi} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ paddingTop: 3 }}>
            <SpeakerLabel index={group.speakerIndex} />
          </div>
          <div style={{ flex: 1, lineHeight: 1.7 }}>
            {group.words.map((word, wi) => {
              const globalIndex = group.startIndex + wi;
              return (
                <WordToken
                  key={`${word.startTime}-${globalIndex}`}
                  word={word}
                  isActive={globalIndex === activeIndex}
                  isHighlighted={highlightIndices.has(globalIndex)}
                  onClick={onWordClick}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

interface SpeakerGroup {
  speakerIndex: number;
  words:        TranscribedWord[];
  startIndex:   number;
}

function groupBySpeaker(words: TranscribedWord[]): SpeakerGroup[] {
  const groups: SpeakerGroup[] = [];
  let current: SpeakerGroup | null = null;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (!word) continue;
    const speaker = word.speakerIndex;

    if (!current || current.speakerIndex !== speaker) {
      current = { speakerIndex: speaker, words: [], startIndex: i };
      groups.push(current);
    }
    current.words.push(word);
  }

  return groups;
}

// ─── LiveTranscriptionOverlay ─────────────────────────────────────────────────

export interface LiveTranscriptionOverlayProps {
  /** Whether to show the overlay. */
  visible:     boolean;
  /** Words received so far (updated in real time). */
  words:       TranscribedWord[];
  /** Detected language code. */
  language:    string;
  /** Loading / progress message while model is initialising. */
  loadingText: string;
  /** 0–100 model loading progress. */
  progress:    number;
}

export function LiveTranscriptionOverlay({
  visible,
  words,
  language,
  loadingText,
  progress,
}: LiveTranscriptionOverlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom as new words arrive
  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [words.length]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          style={{
            position:     "absolute",
            bottom:       72,
            left:         12,
            right:        12,
            background:   "rgba(17,27,33,0.95)",
            border:       `1px solid ${C.border}`,
            borderRadius: 14,
            padding:      12,
            backdropFilter: "blur(8px)",
            zIndex:       30,
            fontFamily:   C.font,
          }}
        >
          {/* Header row */}
          <div
            style={{
              display:    "flex",
              alignItems: "center",
              gap:        8,
              marginBottom: 8,
            }}
          >
            <LiveDot />
            <span style={{ color: C.accentText, fontSize: 11, fontWeight: 700 }}>
              LIVE TRANSCRIPTION
            </span>
            {language && (
              <Chip label={language.toUpperCase()} />
            )}
          </div>

          {/* Progress bar shown while model loads */}
          {progress < 100 && (
            <div style={{ marginBottom: 8 }}>
              <ProgressBar percent={progress} />
              <span style={{ color: C.textMuted, fontSize: 11, marginTop: 4, display: "block" }}>
                {loadingText}
              </span>
            </div>
          )}

          {/* Scrollable word stream */}
          <div
            ref={containerRef}
            style={{
              maxHeight: 80,
              overflowY: "auto",
              scrollbarWidth: "none",
              lineHeight: 1.6,
            }}
          >
            {words.length === 0 ? (
              <span style={{ color: C.textMuted, fontSize: 13 }}>
                Listening…
              </span>
            ) : (
              words.map((w, i) => (
                <span
                  key={`${w.startTime}-${i}`}
                  style={{
                    color:      i === words.length - 1 ? C.accentText : C.textPrimary,
                    fontSize:   14,
                    fontWeight: i === words.length - 1 ? 600 : 400,
                    transition: "color 0.2s",
                  }}
                >
                  {w.word}{" "}
                </span>
              ))
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function LiveDot() {
  return (
    <motion.div
      animate={{ opacity: [1, 0.3, 1] }}
      transition={{ duration: 1.2, repeat: Infinity }}
      style={{
        width:        8,
        height:       8,
        borderRadius: "50%",
        background:   C.accent,
        flexShrink:   0,
      }}
    />
  );
}

// ─── TranscriptionSearchPanel ─────────────────────────────────────────────────

export interface TranscriptionSearchPanelProps {
  /** Whether the search panel is open. */
  open:    boolean;
  /** Close callback. */
  onClose: () => void;
  /** Seek callback for jumping to a result in an audio player. */
  onSeek?: (messageId: string, seconds: number) => void;
}

export function TranscriptionSearchPanel({
  open,
  onClose,
  onSeek,
}: TranscriptionSearchPanelProps) {
  const [query,       setQuery]       = useState("");
  const [results,     setResults]     = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [totalStored, setTotalStored] = useState<number>(0);
  const [filterDate,  setFilterDate]  = useState<"all" | "today" | "week" | "month">("all");
  const [contacts,    setContacts]    = useState<string[]>([]);
  const [filterContact, setFilterContact] = useState("all");
  const [panelWidth, setPanelWidth]   = useState(420);

  const service = useMemo(() => {
    if (typeof window === "undefined") return null;
    return getTranscriptionSearchService();
  }, []);

  // Compute panel width safely on the client to avoid SSR hydration mismatches
  useEffect(() => {
    const update = () => setPanelWidth(Math.min(420, window.innerWidth - 20));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Load metadata
  useEffect(() => {
    if (!open || !service) return;
    void service.count().then(setTotalStored);
    void service.listContacts().then(setContacts);
  }, [open, service]);

  const buildFilters = useCallback((): SearchFilters => {
    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const dateFrom: string | undefined = (() => {
      if (filterDate === "today") return today.toISOString();
      if (filterDate === "week") {
        const d = new Date(today);
        d.setDate(d.getDate() - 7);
        return d.toISOString();
      }
      if (filterDate === "month") {
        const d = new Date(today);
        d.setMonth(d.getMonth() - 1);
        return d.toISOString();
      }
      return undefined;
    })();

    return {
      dateFrom,
      contactId: filterContact !== "all" ? filterContact : undefined,
      limit: 30,
    };
  }, [filterDate, filterContact]);

  const runSearch = useCallback(
    async (q: string) => {
      if (!service || !q.trim()) {
        setResults([]);
        return;
      }
      setIsSearching(true);
      try {
        const r = await service.search(q, buildFilters());
        setResults(r);
      } finally {
        setIsSearching(false);
      }
    },
    [service, buildFilters]
  );

  // Debounced search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleQueryChange = (v: string) => {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runSearch(v), 280);
  };

  // Re-run search when filters change
  useEffect(() => {
    if (query.trim()) void runSearch(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterDate, filterContact]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position:   "fixed",
              inset:      0,
              background: "rgba(0,0,0,0.55)",
              zIndex:     50,
            }}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            style={{
              position:   "fixed",
              top:        0,
              right:      0,
              bottom:     0,
              width:      panelWidth,
              background: C.bg,
              borderLeft: `1px solid ${C.border}`,
              zIndex:     51,
              display:    "flex",
              flexDirection: "column",
              fontFamily: C.font,
              overflow:   "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                display:      "flex",
                alignItems:   "center",
                gap:          10,
                padding:      "16px 18px",
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              <span style={{ fontSize: 18 }}>🔍</span>
              <div>
                <div style={{ color: C.textPrimary, fontWeight: 700, fontSize: 15 }}>
                  Search Transcriptions
                </div>
                <div style={{ color: C.textMuted, fontSize: 11 }}>
                  {totalStored} voice message{totalStored !== 1 ? "s" : ""} indexed
                </div>
              </div>
              <button
                onClick={onClose}
                style={{
                  marginLeft:   "auto",
                  background:   "transparent",
                  border:       "none",
                  color:        C.textMuted,
                  fontSize:     20,
                  cursor:       "pointer",
                  lineHeight:   1,
                  padding:      4,
                }}
              >
                ×
              </button>
            </div>

            {/* Search input */}
            <div style={{ padding: "12px 18px 0" }}>
              <input
                type="search"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                placeholder="Search voice messages…"
                autoFocus
                style={{
                  width:        "100%",
                  background:   C.surface,
                  border:       `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding:      "10px 14px",
                  color:        C.textPrimary,
                  fontSize:     14,
                  fontFamily:   C.font,
                  outline:      "none",
                  boxSizing:    "border-box",
                }}
              />
            </div>

            {/* Filters */}
            <div
              style={{
                display:    "flex",
                gap:        8,
                padding:    "10px 18px",
                overflowX:  "auto",
                scrollbarWidth: "none",
              }}
            >
              {/* Date filter */}
              {(["all", "today", "week", "month"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setFilterDate(d)}
                  style={{
                    padding:      "4px 12px",
                    borderRadius: 999,
                    border:       `1px solid ${filterDate === d ? C.accent : C.border}`,
                    background:   filterDate === d ? C.accentDim : "transparent",
                    color:        filterDate === d ? C.accentText : C.textSecondary,
                    fontSize:     12,
                    cursor:       "pointer",
                    fontFamily:   C.font,
                    whiteSpace:   "nowrap",
                  }}
                >
                  {d === "all" ? "All time" : d === "today" ? "Today" : d === "week" ? "This week" : "This month"}
                </button>
              ))}

              {/* Contact filter */}
              {contacts.length > 0 && (
                <select
                  value={filterContact}
                  onChange={(e) => setFilterContact(e.target.value)}
                  style={{
                    background:   C.surface,
                    border:       `1px solid ${C.border}`,
                    borderRadius: 999,
                    color:        C.textSecondary,
                    fontSize:     12,
                    padding:      "3px 10px",
                    fontFamily:   C.font,
                    cursor:       "pointer",
                    outline:      "none",
                  }}
                >
                  <option value="all">All contacts</option>
                  {contacts.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              )}
            </div>

            <Divider />

            {/* Results list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "0 18px 18px" }}>
              {isSearching && (
                <div style={{ padding: "20px 0" }}>
                  <ProgressBar percent={60} />
                  <div style={{ color: C.textMuted, fontSize: 12, marginTop: 6, textAlign: "center" }}>
                    Searching…
                  </div>
                </div>
              )}

              {!isSearching && query.trim() && results.length === 0 && (
                <div
                  style={{
                    padding:   "32px 0",
                    textAlign: "center",
                    color:     C.textMuted,
                    fontSize:  13,
                  }}
                >
                  No transcriptions matched "{query}"
                </div>
              )}

              {!isSearching && !query.trim() && (
                <div
                  style={{
                    padding:   "32px 0",
                    textAlign: "center",
                    color:     C.textMuted,
                    fontSize:  13,
                  }}
                >
                  Type to search across all transcribed voice messages
                </div>
              )}

              <AnimatePresence>
                {results.map((result, i) => (
                  <SearchResultCard
                    key={result.transcription.messageId}
                    result={result}
                    index={i}
                    query={query}
                    onJump={() =>
                      onSeek?.(result.transcription.messageId, result.jumpToSeconds)
                    }
                  />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── SearchResultCard ─────────────────────────────────────────────────────────

function SearchResultCard({
  result,
  index,
  query,
  onJump,
}: {
  result: SearchResult;
  index: number;
  query: string;
  onJump: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const t = result.transcription;

  const receivedLabel = useMemo(() => {
    const d = new Date(t.receivedAt);
    const now = Date.now();
    const diffMs = now - d.getTime();
    const diffDays = Math.floor(diffMs / 86_400_000);
    if (diffDays === 0) return "Today " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7)  return `${diffDays} days ago`;
    return d.toLocaleDateString();
  }, [t.receivedAt]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ delay: index * 0.04 }}
      style={{
        background:   C.surface,
        border:       `1px solid ${C.border}`,
        borderRadius: 12,
        padding:      "12px 14px",
        marginBottom: 10,
        cursor:       "pointer",
      }}
      onClick={() => setExpanded((v) => !v)}
    >
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 13 }}>🎙️</span>
        <span style={{ color: C.textPrimary, fontWeight: 600, fontSize: 13 }}>
          {t.contactId || "Unknown"}
        </span>
        <span style={{ color: C.textMuted, fontSize: 11, marginLeft: "auto" }}>
          {receivedLabel}
        </span>
      </div>

      {/* Context snippet with highlights */}
      <div style={{ lineHeight: 1.6 }}>
        {result.highlightSpans.map((span, i) => (
          <span
            key={i}
            style={{
              background:  span.isMatch ? C.highlight : "transparent",
              color:       span.isMatch ? C.accentText : C.textSecondary,
              fontWeight:  span.isMatch ? 600 : 400,
              fontSize:    13,
              borderRadius: span.isMatch ? 3 : 0,
              padding:     span.isMatch ? "0 2px" : 0,
              fontFamily:  C.font,
            }}
          >
            {span.text}
          </span>
        ))}
        {!expanded && result.transcription.fullText.length > result.contextSnippet.length && (
          <span style={{ color: C.textMuted, fontSize: 12 }}> …</span>
        )}
      </div>

      {/* Expanded full transcript */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: "hidden" }}
          >
            <Divider />
            <p style={{ color: C.textSecondary, fontSize: 13, margin: 0, lineHeight: 1.6, fontFamily: C.font }}>
              {t.fullText}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer row */}
      <div
        style={{
          display:    "flex",
          alignItems: "center",
          gap:        8,
          marginTop:  8,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Chip label={t.language.toUpperCase()} />
        <span style={{ color: C.textMuted, fontSize: 11 }}>
          {formatTime(t.durationSeconds)}
        </span>
        <span style={{ color: C.textMuted, fontSize: 11 }}>
          · {result.matchedWords.length} match{result.matchedWords.length !== 1 ? "es" : ""}
        </span>
        <button
          onClick={onJump}
          style={{
            marginLeft:   "auto",
            padding:      "4px 10px",
            borderRadius: 8,
            border:       "none",
            background:   C.accentDim,
            color:        C.accentText,
            fontSize:     12,
            fontWeight:   600,
            cursor:       "pointer",
            fontFamily:   C.font,
          }}
        >
          Jump to {formatTime(result.jumpToSeconds)}
        </button>
      </div>
    </motion.div>
  );
}

// ─── useVoiceTranscription hook ───────────────────────────────────────────────

/**
 * Convenience React hook that wires up VoiceTranscriber + storage.
 *
 * Usage:
 * ```tsx
 * const { words, result, transcribeBlob } = useVoiceTranscription();
 * ```
 */
export function useVoiceTranscription(contactId = "") {
  const [words,    setWords]    = useState<TranscribedWord[]>([]);
  const [result,   setResult]   = useState<TranscriptionResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [phase,    setPhase]    = useState("Standby");
  const [error,    setError]    = useState<string | null>(null);

  const transcriber = useMemo(() => {
    if (typeof window === "undefined") return null;
    return getVoiceTranscriber();
  }, []);

  useEffect(() => {
    if (!transcriber) return;

    const offWord  = transcriber.on("word",  (w)  => setWords((prev) => [...prev, w]));
    const offDone  = transcriber.on("done",  (r)  => {
      setResult(r);
      setWords(r.words);
      // Persist to search index
      if (typeof window !== "undefined") {
        const svc = getTranscriptionSearchService();
        void svc.store(r, contactId).catch((err: unknown) => {
          console.error("[TranscriptionUI] Failed to store transcription", {
            messageId: r.messageId,
            contactId,
            error: err,
          });
        });
      }
    });
    const offErr   = transcriber.on("error", (e)  => setError(e.message));
    const offProg  = transcriber.on("progress", ({ phase: p, percent }) => {
      setPhase(p);
      setProgress(percent);
    });

    return () => { offWord(); offDone(); offErr(); offProg(); };
  }, [transcriber, contactId]);

  const transcribeBlob = useCallback(
    async (messageId: string, blob: Blob, lang?: string) => {
      if (!transcriber) return null;
      setWords([]);
      setResult(null);
      setError(null);
      return transcriber.transcribeBlob(
        messageId,
        blob,
        lang as Parameters<typeof transcriber.transcribeBlob>[2]
      );
    },
    [transcriber]
  );

  const warmUp = useCallback(() => {
    transcriber?.warmUp().catch(console.error);
  }, [transcriber]);

  return {
    words,
    result,
    progress,
    phase,
    error,
    transcribeBlob,
    warmUp,
  };
}
