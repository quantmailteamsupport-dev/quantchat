"use client";

import { memo, useEffect, useMemo, useState } from "react";

export type SpoilerShieldMode = "auto" | "hold";

const SPOILER_PREFIX = "[[spoiler:";
const DEFAULT_AUTO_REHIDE_MS = 2600;

interface ParsedSpoilerText {
  isSpoiler: boolean;
  autoRehide: boolean;
  text: string;
}

export function encodeSpoilerShieldText(text: string, mode: SpoilerShieldMode): string {
  return `${SPOILER_PREFIX}${mode}]]${text}`;
}

export function parseSpoilerShieldText(rawText: string): ParsedSpoilerText {
  if (!rawText.startsWith(SPOILER_PREFIX)) {
    return { isSpoiler: false, autoRehide: false, text: rawText };
  }

  const markerEnd = rawText.indexOf("]]", SPOILER_PREFIX.length);
  if (markerEnd === -1) {
    return { isSpoiler: false, autoRehide: false, text: rawText };
  }

  const marker = rawText.slice(SPOILER_PREFIX.length, markerEnd).trim();
  const normalized = marker.toLowerCase();
  if (normalized !== "auto" && normalized !== "hold") {
    return { isSpoiler: false, autoRehide: false, text: rawText };
  }

  return {
    isSpoiler: true,
    autoRehide: normalized === "auto",
    text: rawText.slice(markerEnd + 2).trimStart(),
  };
}

function SpoilerShieldTextBase({
  rawText,
  compact = false,
}: {
  rawText: string;
  compact?: boolean;
}) {
  const parsed = useMemo(() => parseSpoilerShieldText(rawText), [rawText]);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setRevealed(false);
  }, [rawText]);

  useEffect(() => {
    if (!parsed.isSpoiler || !parsed.autoRehide || !revealed) {
      return;
    }
    const timer = setTimeout(() => setRevealed(false), DEFAULT_AUTO_REHIDE_MS);
    return () => clearTimeout(timer);
  }, [parsed.autoRehide, parsed.isSpoiler, revealed]);

  if (!parsed.isSpoiler) {
    return (
      <p
        style={{
          margin: 0,
          color: "#e9edef",
          fontSize: compact ? 13.5 : 14.5,
          lineHeight: 1.52,
          fontFamily: "-apple-system,sans-serif",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {parsed.text}
      </p>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setRevealed((prev) => !prev)}
        aria-pressed={revealed}
        style={{
          width: "100%",
          textAlign: "left",
          borderRadius: 10,
          border: revealed ? "1px solid rgba(83,189,235,0.55)" : "1px solid rgba(255,255,255,0.16)",
          background: revealed ? "rgba(83,189,235,0.12)" : "rgba(255,255,255,0.05)",
          cursor: "pointer",
          padding: compact ? "6px 8px" : "7px 9px",
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: revealed ? "#53bdeb" : "rgba(233,237,239,0.65)",
            marginBottom: 4,
            letterSpacing: "0.03em",
            textTransform: "uppercase",
            fontWeight: 700,
            fontFamily: "-apple-system,sans-serif",
          }}
        >
          {revealed ? "Spoiler Revealed" : "Spoiler Shield"}
          {parsed.autoRehide ? " • auto re-hide" : " • tap to hide"}
        </div>
        <p
          style={{
            margin: 0,
            color: "#e9edef",
            fontSize: compact ? 13.5 : 14.5,
            lineHeight: 1.52,
            fontFamily: "-apple-system,sans-serif",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            filter: revealed ? "none" : "blur(6px)",
            transition: "filter 0.18s ease",
          }}
        >
          {parsed.text}
        </p>
      </button>
    </div>
  );
}

const SpoilerShieldText = memo(SpoilerShieldTextBase);
SpoilerShieldText.displayName = "SpoilerShieldText";

export default SpoilerShieldText;
