/**
 * ConflictGuard — AI-Powered Pre-Send Tone Analysis
 *
 * Flags potentially harmful or escalatory message tone before sending.
 * Runs entirely client-side first (pattern matching); only escalates
 * to server-side inference when the user explicitly consents.
 *
 * Privacy model:
 *  - Level 1 (local): regex + keyword heuristics — zero network calls
 *  - Level 2 (consented): server-side sentiment analysis — user opts in per-thread
 *
 * Not a censor. Suggests rewrites — the user always has final say.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type ToneCategory =
  | 'neutral'
  | 'positive'
  | 'assertive'
  | 'aggressive'
  | 'passive-aggressive'
  | 'hostile';

export type RiskLevel = 'safe' | 'caution' | 'warning' | 'critical';

export interface ToneAnalysis {
  messageId: string;
  originalText: string;
  category: ToneCategory;
  riskLevel: RiskLevel;
  confidence: number;           // 0-1
  triggers: ToneTrigger[];
  suggestedRewrites: string[];
  analysisSource: 'local' | 'server';
}

export interface ToneTrigger {
  pattern: string;
  matchedText: string;
  severity: RiskLevel;
  explanation: string;
}

export interface ConflictGuardConfig {
  /** Enable local pattern matching (always on by default) */
  localAnalysisEnabled: boolean;
  /** Enable server-side inference (requires explicit per-thread consent) */
  serverInferenceEnabled: boolean;
  /** Minimum risk level at which to show suggestions */
  alertThreshold: RiskLevel;
  /** Thread IDs where server inference is consented */
  consentedThreadIds: Set<string>;
}

// ─── Pattern Banks ──────────────────────────────────────────────────────────

interface TonePattern {
  regex: RegExp;
  severity: RiskLevel;
  category: ToneCategory;
  explanation: string;
}

const TONE_PATTERNS: TonePattern[] = [
  // ── Hostile patterns ──────────────────────────────────────────────────
  {
    regex: /\b(shut\s*up|stfu|gtfo|go\s*to\s*hell)\b/i,
    severity: 'critical',
    category: 'hostile',
    explanation: 'Direct hostility — this may permanently damage the relationship',
  },
  {
    regex: /\b(idiot|stupid|moron|loser|pathetic)\b/i,
    severity: 'critical',
    category: 'hostile',
    explanation: 'Personal insult detected — consider addressing the issue, not the person',
  },
  {
    regex: /\b(hate\s+you|despise|disgusting)\b/i,
    severity: 'critical',
    category: 'hostile',
    explanation: 'Extreme negative sentiment — take a moment before sending',
  },

  // ── Aggressive patterns ───────────────────────────────────────────────
  {
    regex: /\b(you\s+always|you\s+never)\b/i,
    severity: 'warning',
    category: 'aggressive',
    explanation: '"Always" and "never" generalizations escalate conflicts — try specific examples',
  },
  {
    regex: /\b(your\s+fault|blame\s+you|you\s+caused)\b/i,
    severity: 'warning',
    category: 'aggressive',
    explanation: 'Blame language triggers defensiveness — try "I feel" statements instead',
  },
  {
    regex: /!{3,}/,
    severity: 'caution',
    category: 'aggressive',
    explanation: 'Excessive exclamation marks may read as shouting',
  },
  {
    regex: /\b[A-Z]{5,}\b/,
    severity: 'caution',
    category: 'aggressive',
    explanation: 'ALL CAPS sections may read as shouting',
  },

  // ── Passive-aggressive patterns ───────────────────────────────────────
  {
    regex: /\b(whatever|fine\.{2,}|if\s+you\s+say\s+so|sure,?\s+okay)\b/i,
    severity: 'caution',
    category: 'passive-aggressive',
    explanation: 'This may come across as dismissive — consider stating your feelings directly',
  },
  {
    regex: /\b(as\s+per\s+my\s+last|per\s+my\s+previous|as\s+I\s+already\s+said)\b/i,
    severity: 'caution',
    category: 'passive-aggressive',
    explanation: 'This implies the reader is not paying attention — try restating gently',
  },
  {
    regex: /\b(no\s+offense,?\s+but|don'?t\s+take\s+this\s+the\s+wrong\s+way)\b/i,
    severity: 'caution',
    category: 'passive-aggressive',
    explanation: 'Preamble disclaimers often signal the opposite — consider rephrasing the core message',
  },

  // ── Positive / de-escalation patterns (reduce risk) ───────────────────
  {
    regex: /\b(thank\s+you|appreciate|grateful|i\s+understand)\b/i,
    severity: 'safe',
    category: 'positive',
    explanation: 'Acknowledgment detected — this helps de-escalate',
  },
];

// ─── Rewrite Templates ─────────────────────────────────────────────────────

const REWRITE_SUGGESTIONS: Record<ToneCategory, string[]> = {
  'neutral': [],
  'positive': [],
  'assertive': [
    'Consider softening with "I think..." or "In my experience..."',
  ],
  'aggressive': [
    'Try: "I feel frustrated when [specific situation] because [impact]."',
    'Consider: "Can we find a middle ground on this?"',
    'Rephrase: "I\'d like to understand your perspective on..."',
  ],
  'passive-aggressive': [
    'Try being direct: "I\'m feeling [emotion] about [topic]. Can we discuss?"',
    'Consider: "I want to make sure we\'re aligned on [topic]."',
  ],
  'hostile': [
    '⚠️ This message may cause irreversible damage. Consider stepping away for 5 minutes.',
    'Try: "I\'m upset and need a moment. Can we talk about this later?"',
    'Consider: "I strongly disagree because [reason], and I\'d like to find a solution."',
  ],
};

// ─── Risk Level Scoring ─────────────────────────────────────────────────────

const RISK_SCORES: Record<RiskLevel, number> = {
  'safe': 0,
  'caution': 1,
  'warning': 2,
  'critical': 3,
};

const RISK_THRESHOLDS: { minScore: number; level: RiskLevel }[] = [
  { minScore: 3, level: 'critical' },
  { minScore: 2, level: 'warning' },
  { minScore: 1, level: 'caution' },
  { minScore: 0, level: 'safe' },
];

// ─── Engine ─────────────────────────────────────────────────────────────────

export class ConflictGuard {
  private config: ConflictGuardConfig;

  constructor(config?: Partial<ConflictGuardConfig>) {
    this.config = {
      localAnalysisEnabled: config?.localAnalysisEnabled ?? true,
      serverInferenceEnabled: config?.serverInferenceEnabled ?? false,
      alertThreshold: config?.alertThreshold ?? 'caution',
      consentedThreadIds: config?.consentedThreadIds ?? new Set(),
    };
  }

  /**
   * Analyze a message before sending.
   * Returns tone analysis with risk level and optional rewrites.
   */
  analyze(messageText: string, messageId?: string): ToneAnalysis {
    const id = messageId ?? `msg_${Date.now()}`;
    const triggers: ToneTrigger[] = [];

    if (this.config.localAnalysisEnabled) {
      for (const pattern of TONE_PATTERNS) {
        const match = messageText.match(pattern.regex);
        if (match) {
          triggers.push({
            pattern: pattern.regex.source,
            matchedText: match[0],
            severity: pattern.severity,
            explanation: pattern.explanation,
          });
        }
      }
    }

    // Determine overall risk from worst trigger
    const maxRisk = triggers.reduce<number>(
      (max, t) => Math.max(max, RISK_SCORES[t.severity]),
      0,
    );

    const riskLevel =
      RISK_THRESHOLDS.find((t) => maxRisk >= t.minScore)?.level ?? 'safe';

    // Determine dominant tone category
    const category = this.dominantCategory(triggers);

    // Generate confidence based on trigger density
    const wordCount = messageText.split(/\s+/).length;
    const triggerDensity = Math.min(1, triggers.length / Math.max(1, wordCount / 10));
    const confidence = triggers.length > 0
      ? Math.min(0.95, 0.5 + triggerDensity * 0.45)
      : 0.1;

    // Collect rewrite suggestions
    const suggestedRewrites = REWRITE_SUGGESTIONS[category] ?? [];

    return {
      messageId: id,
      originalText: messageText,
      category,
      riskLevel,
      confidence,
      triggers,
      suggestedRewrites,
      analysisSource: 'local',
    };
  }

  /**
   * Quick check — returns true if the message should show a warning.
   */
  shouldWarn(messageText: string): boolean {
    const result = this.analyze(messageText);
    return RISK_SCORES[result.riskLevel] >= RISK_SCORES[this.config.alertThreshold];
  }

  /**
   * Grant server-inference consent for a specific thread.
   */
  consentServerInference(threadId: string): void {
    this.config.consentedThreadIds.add(threadId);
    this.config.serverInferenceEnabled = true;
  }

  /**
   * Revoke server-inference consent.
   */
  revokeServerInference(threadId: string): void {
    this.config.consentedThreadIds.delete(threadId);
    if (this.config.consentedThreadIds.size === 0) {
      this.config.serverInferenceEnabled = false;
    }
  }

  /**
   * Check if server inference is consented for a thread.
   */
  isServerConsentedFor(threadId: string): boolean {
    return this.config.consentedThreadIds.has(threadId);
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private dominantCategory(triggers: ToneTrigger[]): ToneCategory {
    if (triggers.length === 0) return 'neutral';

    // Find the trigger with the highest severity
    const worst = triggers.reduce((best, t) =>
      RISK_SCORES[t.severity] > RISK_SCORES[best.severity] ? t : best,
    );

    // Map severity back to category from the matching pattern
    const matchingPattern = TONE_PATTERNS.find((p) =>
      p.regex.source === worst.pattern,
    );

    return matchingPattern?.category ?? 'neutral';
  }
}
