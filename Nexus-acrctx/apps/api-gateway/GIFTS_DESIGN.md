# Gifts & Attention Token Economy — Design Notes

This document explains **what issue #37 asked for, what this PR actually builds, and what was deliberately left out — and why.** If you revisit this area, please read this before re-scoping.

## Issue #37 (verbatim excerpts)

> *"Reciprocity is the strongest social obligation… users can never leave."*
>
> *"If you don't reciprocate within 24h, the sender sees 'Gift not returned' with a sad indicator."*
>
> *"'Most Attentive Friends This Week' — ranks friends by total call time. Creates competition to be #1."*
>
> *"If someone views your profile but doesn't call, you get 'Someone just visited your profile 👀' — creates curiosity and callback."*
>
> *"You and Zane have a 15-day call streak! Don't break it."*

The issue itself describes these as an *"Addiction Engine"*. They are textbook dark patterns.

## Regulatory context

Several of the mechanics in #37 fall inside active regulatory scope for any product distributed to EU / UK / US / India users:

| Mechanic in #37                              | Regulatory concern |
| -------------------------------------------- | ------------------ |
| "Gift not returned" shaming signal to sender | EU DSA Art. 25 ("designs that impair ability to make free, informed choices"); FTC staff report on dark patterns (Sep 2022) §III.B |
| Friend leaderboard ranking attention         | UK AADC ("detrimental to wellbeing"); Calif. SB-976 (addictive feeds for minors) |
| Silent profile-view pings to drive callbacks | EU DSA Art. 25; DE6 pattern ("forced action" / "manufactured urgency") |
| "Don't break it" streak loss-aversion        | documented harm in Snapchat streaks research; relevant to AADC §1.5 |
| Uncapped earn-through-time-on-app            | gambling-like engagement loops reviewed under DSA §34 risk assessments |

Even the parts not per-se-illegal everywhere are the kind of thing that triggers App Store rejection, EU "risk assessment" disclosure obligations, and platform bans. "Beating Meta legally" means **not** reproducing the exact behaviours Meta has been fined for — it means shipping the 3D gift UI and the transparent token balance without the coercion layer.

## What this PR implements (and where it lives)

### Backend (`apps/api-gateway`)
* **`services/AttentionTokenService.ts`** — append-only ledger of every credit/debit, atomic debit with locked balance check, `InsufficientBalanceError` typed error, opt-in call-minute earning with a hard **60 tokens/day** cap.
* **`services/GiftSystem.ts`** — catalog + sending logic. Recipient consent check (`GiftPreferences.acceptGifts`), anti-harassment rate limit (max **10 gifts/hour** per recipient, **60 gifts/hour** total per sender), atomic send within a single DB transaction so the sender can never be double-charged.
* **`services/ReciprocityEngine.ts`** — **ethics-first rewrite.** Only exposes `getThankYouSuggestionsForRecipient` (to the recipient, opt-in), `getCallStreak` (to the user, opt-in, no break-notifications), and `getSelfEngagementSummary` (for self-reflection, no cross-user data).
* **Socket events** (`socket.ts`): `send-gift`, `gift-received`, `gift-sent`, `gift-error`, `record-call-minute`, `call-minute-recorded`, `get-gift-insights`, `gift-insights` — all with auth-guard, per-user rate limiting, and payload validation.
* **REST routes** (`routes.ts`): `GET /api/gifts/catalog`, `GET /api/gifts/balance`, `GET /api/gifts/history`, `POST /api/gifts/send`, `GET|POST /api/gifts/preferences`, `GET /api/gifts/insights`.

### Schema (`packages/database/prisma/schema.prisma`)
* `AttentionTokenLedger` (append-only), `CallMinuteLog` (with unique `(userId, callId, minuteBucket)` for idempotent crediting), `Gift` (catalog), `GiftTransaction` (immutable record), `GiftPreferences` (user-controlled opt-ins).

### Frontend (`apps/web`)
* **`components/gifts/GiftRenderer3D.tsx`** — Three.js renderer for rose / heart / bolt / crown, procedurally generated meshes, CPU-driven particle system with gravity, proper WebGL disposal on unmount.
* **`components/gifts/GiftPicker.tsx`** — Framer Motion picker modal. Always shows cost upfront; disabled "Not enough tokens" state instead of an upsell dialog; never shows a "you owe someone a gift" prompt.
* **`components/gifts/GiftOverlay.tsx`** — FIFO queue of incoming gifts rendered as overlays; dedupes by `transactionId`.
* **`lib/gifts/useGiftSocket.ts`** — client hook managing socket lifecycle, catalog cache, balance, and incoming-gift queue.

## What this PR deliberately does *not* implement

These are listed so future PRs don't silently re-add them thinking they were oversights:

1. **Sender-facing "gift not returned" signal.** The sender sees `DELIVERED` or `BLOCKED`/error. Nothing else.
2. **Any friend leaderboard ranking attention, call-time, gifts, or reciprocity.** Only per-user self-reflection data exists, and only accessible to that user.
3. **Silent "someone viewed your profile" pings.** Profile views are not logged for the purpose of notifying the viewee.
4. **Streak loss-aversion notifications.** `getCallStreak` is read-only and opt-in. There is no push/email on streak break.
5. **Uncapped earning from call minutes.** Hard-capped at 60/day; opt-in per user.
6. **Growth-style default-on.** All engagement preferences (`earnFromCalls`, `thankYouSuggestions`, `showCallStreakCounter`) default to **off**. `acceptGifts` defaults to on but is one toggle away from off.
7. **Redemption of tokens for cash or regulated assets.** Tokens are a closed-loop in-app currency; no cash-out path exists. This keeps the system outside MSB/VASP scope.

If a future product request wants any of (1)–(6), it should go through a wellbeing / legal review first, not be filed as an implementation bug.

## Operational safety

* Every balance mutation writes to `AttentionTokenLedger`. You can audit any user's full history with `SELECT * FROM "AttentionTokenLedger" WHERE "userId" = ... ORDER BY "createdAt"`.
* Refunds are automatic on any post-debit failure (Postgres transaction rollback + compensating ledger entry).
* `AttentionTokenService.adminAdjust` is the only way to mutate balance outside the normal flow, and it always leaves a ledger entry with `reason = ADMIN_ADJUST` and the acting admin's id embedded in the note.
