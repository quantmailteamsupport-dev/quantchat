# Quantchat Release Control Ledger

Updated: 2026-05-04

Rule: list each task once at its current highest confirmed status.

## Priority Order
1. `Two-device revoke proof`
2. `Session-authoritative companion auth`
3. `Smart-reply privacy controls`

## PRODUCTION LAUNCH BLOCKERS (2026-05-07)

### 🟢 COMPLETED TASKS
- [x] **Repo Connection**: Initialize and sync with `github.com/quantchat-yy/quantchat.git`
- [x] **Server Sync**: `git clone` the repository on the production Azure VM (`20.249.208.224`)
- [x] **Server Runtime**: Upgrade Node.js to v22.22.2 and install `pnpm` globally
- [ ] **BLOCKER-STORAGE**: Production server (`20.249.208.224`) disk full (100% used). Cleanup in progress.
- `BLOCKER-AUTH`: Replace hardcoded user IDs with real OAuth2/JWT authentication
  - Files: `Nexus/apps/web/app/chat/page.tsx` (line 18 - hardcoded userId)
  - Owner: BackendAgent
  - Effort: 40 hours
  - Acceptance: Users can login with Google/GitHub, sessions persist across page reloads
  
- `BLOCKER-S3`: Implement S3 file upload (presigned URLs only mock)
  - Files: `Nexus/apps/api-gateway/src/routes.ts` (presign endpoint)
  - Owner: BackendAgent
  - Effort: 50 hours
  - Acceptance: File attachments work end-to-end, CloudFront CDN configured
  
- `BLOCKER-METRICS`: Wire up real metrics (admin dashboard shows fake data)
  - Files: `Nexus/apps/admin/app/page.tsx` (static metrics)
  - Owner: FrontendAgent
  - Effort: 20 hours
  - Acceptance: Real user counts, message rates, latency visible
  
- `BLOCKER-ENV-CONFIG`: Setup production environment configuration
  - Files: Missing `.env.production`, production database, Redis config
  - Owner: DeployAgent
  - Effort: 30 hours
  - Acceptance: Production RDS, Redis, S3 configured and tested

### 🟠 HIGH PRIORITY - Fix After Blockers (Week 3-4)
- `SOCKET-HANDLERS`: Complete missing WebRTC, vault, consent Socket.io handlers
  - Files: `Nexus/apps/api-gateway/src/socket.ts`
  - Owner: BackendAgent
  - Effort: 30 hours
  
- `FRONTEND-ROUTING`: Remove design canvas mode, implement real routing
  - Files: `Nexus/apps/web/app/chat/page.tsx`
  - Owner: FrontendAgent
  - Effort: 35 hours
  
- `E2EE-CLIENT`: Implement client-side message encryption/decryption
  - Files: `Nexus/apps/web/lib/`
  - Owner: SecurityAgent
  - Effort: 40 hours
  
- `BUILD-ERRORS`: Fix Next.js EPERM unlink errors and TypeScript errors
  - Files: `Nexus/apps/web`, `Nexus/apps/docs`
  - Owner: FrontendAgent + DeployAgent
  - Effort: 10 hours

## Pending
- `Two-device revoke proof`: Record one repeatable login, send, reconnect, revoke, and smart-reply deletion trace with p95 conversation-open, local-echo, and duplicate-delivery evidence.
- `Session-authoritative companion auth`: Make `Nexus/apps/api-gateway/src/middleware/auth.ts`, companion-session rotation, revoke propagation, and receipt timing server-authoritative across primary and linked devices.
- `Smart-reply privacy controls`: Keep smart replies thread-scoped, removable, and consented at the point of generation inside the main chat flow.

## In Progress
- `BLOCKER-AUTH`: OAuth2 implementation (BackendAgent - STARTED)
- `BLOCKER-S3`: S3 file upload (BackendAgent - QUEUED)
- `BLOCKER-METRICS`: Real metrics dashboard (FrontendAgent - QUEUED)
- `BLOCKER-ENV-CONFIG`: Production setup (DeployAgent - QUEUED)

## Completed
- `Quantmail session bridge foundation`: Repo inspection shows the Quantmail-backed session bridge is present in the current chat surface.
- `Linked-device trust surfaces`: Chat and settings already expose linked-device and account-state surfaces that can carry the final revoke and consent flow.

## Verified
- None.

## Deployed
- None.

## Control Notes
- Removed the micro-innovation backlog from this ledger; it now tracks release control only.
- Do not add new chat features until the first two-device revoke trace is captured without stale-session drift.

## Production Automation Plan (2026-05-01)

### Product Vision
QuantChat is the secure low-latency messaging layer for the ecosystem, with encryption readiness, cross-device sync, and AI assistance that respects consent.

### Current Repository Status
- Exists: root `task.md`, `.gitignore`, Dockerfile, agent docs, roadmap, and a Nexus monorepo with Next apps, API gateway, shared packages, and Dockerfiles.
- Missing or weak: root `README.md`, root `.env.example`, dedicated root `SECURITY.md`, root-level test strategy, and release smoke notes.
- Benchmark note: WhatsApp, Telegram, and Snapchat are inspiration for messaging speed, privacy, and social loops; no live competitor testing is claimed in this update.

### P0 Tasks
- [ ] P0 Backend/API: Capture a two-device revoke trace that proves stale sessions lose access immediately. Acceptance: command/manual trace includes device A, device B, revoke action, denied stale request, and timestamped result.
- [ ] P0 Security/Privacy: Add root `.env.example` and `SECURITY.md` covering SSO bridge, session storage, consent routes, encryption readiness, and WebRTC privacy. Acceptance: no real secret values are committed.
- [ ] P0 Testing/QA: Run Nexus `build`, `lint`, and `check-types` or document exact blockers. Acceptance: this file records command summaries honestly.

### P1 Tasks
- [ ] P1 Frontend: Verify receipt privacy ladder, consent settings, and AI smart reply states on mobile and desktop widths. Acceptance: loading, empty, disabled, and error states are present.
- [ ] P1 Database/Storage: Confirm session/device records persist through restart and cleanup stale records safely. Acceptance: migration or storage contract is documented.
- [ ] P1 Performance: Define message send and receive latency budgets for local and deployed modes. Acceptance: p95 target and measurement steps are recorded.

### P2 Tasks
- [ ] P2 AI/Automation: Keep AI smart replies opt-in and visibly attributed. Acceptance: suggestions never send automatically and can be disabled per user.
- [ ] P2 Deployment: Add root deployment notes for Nexus apps and API gateway. Acceptance: local, Docker, and rollback steps are documented.

### Verification Run (2026-05-01)
- Commands run: Nexus `build`, `lint`, `check-types`, plus web `build` and `check-types`.
- Result: Nexus commands failed because `turbo` is not available in the local install; web checks failed; API gateway was blocked because its package `node_modules` is missing.
- Evidence: full output stored in `system/verification-report.json`.
- Next action: repair/install Nexus workspace dependencies, then rerun monorepo build, lint, and type checks before claiming cross-device sync verification.

### Verification Run (2026-05-02)
- Command run: `node system/run-verification.mjs --write --timeout-ms=60000`.
- Result: `Nexus` `build`, `lint`, and `check-types` plus `Nexus/apps/web` `build` and `check-types` all failed before package script execution with `spawnSync cmd.exe EPERM` (`exitCode: null`). `Nexus/apps/api-gateway` stayed blocked because its `node_modules` directory is missing.
- Evidence: this run wrote `system/verification-report.json` with five failed QuantChat script entries showing the same EPERM spawn failure and one blocked API-gateway package entry.
- Next action: rerun verification where child `cmd.exe` execution is allowed, then restore/install the blocked workspace dependencies and rerun the monorepo checks.

## Automation Run (2026-05-02T03:15Z) — dependency-recovery-agent

- Role: restore missing verification capability; fix Nexus .bin toolchain.
- Prior state: Nexus root node_modules present but `.bin` was empty (0 items); `turbo`, `tsc` absent.
- Command run: `npm ci --ignore-scripts` in `Quantchat-quantchat/Quantchat-quantchat/Nexus`.
- Result: succeeded. `.bin` now has 135 items; `turbo` and `tsc` available.
- Note: `--ignore-scripts` was required because `sharp@0.34.5` and `unrs-resolver@1.11.1` postinstall scripts fail on Windows (npm 10.9.3 bug: `ERR_INVALID_ARG_TYPE` during native binary setup). JS tools unaffected.
- Command run: `node_modules/.bin/turbo run check-types` in Nexus root.
- Result: `@repo/api-gateway#check-types` PASS. `web#check-types` FAIL — `next typegen` + `tsc --noEmit` returned exit 2 (pre-existing web app type errors). 2 tasks succeeded, 1 failed.
- Next action: fix type errors in `Nexus/apps/web`; `build` and `lint` scripts not yet run in this session.

## Automation Run (2026-05-02T09:41:26+05:30) â€” qa-agent

- Role: run honest verification.
- Command run: `node system/run-verification.mjs --write --timeout-ms=60000` from workspace root.
- Result: the verification runner wrote `system/verification-report.json` with `generatedAt: 2026-05-02T04:06:03.134Z` and workspace summary `3 passed, 20 failed, 15 blocked, 1 skipped`. The outer Codex shell wrapper later timed out after about 471s, so the written JSON report and captured runner output are the source of truth for this QA pass.
- QuantChat evidence: `Nexus build` failed. Turbo output showed `docs#build` failing in `Nexus/apps/docs` on `next build` with `EPERM unlink C:\infinity trinity apps motive\Quantchat-quantchat\Quantchat-quantchat\Nexus\apps\docs\.next\types\cache-life.d.ts`.
- QuantChat evidence: `Nexus lint` passed with exit 0 in 50756 ms.
- QuantChat evidence: `Nexus check-types` failed with exit 2. Turbo output showed `web#check-types` failing on `next-auth` export mismatches (`getServerSession`, `NextAuthOptions`), missing `@prisma/client` `PrismaClient`, undefined `isHandshakeVerified` and `onInitiateHandshake`, `BiometricHandshake` event typing/nullability errors, and shared-kernel nullability/import diagnostics.
- QuantChat evidence: `Nexus/apps/web build` failed with `EPERM unlink C:\infinity trinity apps motive\Quantchat-quantchat\Quantchat-quantchat\Nexus\apps\web\out\trace`.
- QuantChat evidence: `Nexus/apps/web check-types` stayed blocked because the script uses shell operators and the sandbox-safe runner does not invoke a shell.
- QuantChat evidence: `Nexus/apps/api-gateway` stayed blocked because `node_modules` is missing and install was not run in this QA pass.
- Next action: clear the Windows/Next output-cache `EPERM` artifacts under `Nexus/apps/docs/.next` and `Nexus/apps/web/out`, then fix the `web#check-types` type errors before claiming two-device revoke or cross-device verification.

## Automation Run (2026-05-02T14:41:30+05:30) - qa-agent

- Role: run honest verification.
- Command run: `node system/run-verification.mjs --write --timeout-ms=60000` from workspace root.
- Result: failed overall with exit 1 after about 471s. The runner rewrote `system/verification-report.json` with `generatedAt: 2026-05-02T09:02:52.988Z` and workspace summary `4 passed, 17 failed, 17 blocked, 1 skipped`.
- QuantChat evidence: `Nexus build` failed with exit 1 in 17658 ms. Turbo failed on `docs#build` because `next build` hit `EPERM unlink C:\infinity trinity apps motive\Quantchat-quantchat\Quantchat-quantchat\Nexus\apps\docs\.next\trace`.
- QuantChat evidence: `Nexus lint` passed with exit 0 in 53151 ms, but Turbo surfaced warnings in `packages/security` and `apps/web`.
- QuantChat evidence: `Nexus check-types` failed with exit 2 in 50102 ms. Turbo failed on `web#check-types` after `next typegen` with `next-auth` export mismatches (`getServerSession`, `NextAuthOptions`), missing `@prisma/client` `PrismaClient`, missing `isHandshakeVerified` and `onInitiateHandshake`, `BiometricHandshake` event/nullability errors, session typing errors in `lib/useQuantchatIdentity.ts`, and shared-kernel nullability diagnostics in `AuthenticationService.ts` and `EcosystemSharedKernel.ts`.
- QuantChat evidence: `Nexus/apps/web build` failed with exit 1 in 3388 ms on `EPERM unlink C:\infinity trinity apps motive\Quantchat-quantchat\Quantchat-quantchat\Nexus\apps\web\out\trace`.
- QuantChat evidence: `Nexus/apps/web check-types` stayed blocked in the manifest runner because the script contains shell operators and the sandbox-safe runner does not invoke a shell.
- QuantChat evidence: `Nexus/apps/api-gateway` stayed blocked because `node_modules` is missing and install was not run in this QA pass.
- Next action: clear the locked Next output artifacts under `Nexus/apps/docs/.next` and `Nexus/apps/web/out`, then fix `web#check-types`; if API gateway verification is required, restore its `node_modules` in a dependency-recovery run before rerunning QA.

## Automation Run (2026-05-04T13:05:59+05:30) - production-autopilot

- Target: repair QuantChat Nexus config/package-boundary resolution after the workspace reorg left `node_modules/@repo/*` junctions pointing at the old `Quantchat-quantchat/...` path.
- Files changed: `Nexus/apps/api-gateway/tsconfig.json`, `Nexus/apps/docs/eslint.config.js`, `Nexus/apps/docs/tsconfig.json`, `Nexus/apps/web/eslint.config.js`, `Nexus/apps/web/tsconfig.json`, `Nexus/apps/web/lib/auth.ts`, `Nexus/packages/database/tsconfig.json`, `Nexus/packages/security/eslint.config.mjs`, `Nexus/packages/security/tsconfig.json`, `Nexus/packages/ui/eslint.config.mjs`, `Nexus/packages/ui/tsconfig.json`, `Nexus/packages/vampire-bridge/eslint.config.mjs`, `Nexus/packages/web3/eslint.config.mjs`, and `Nexus/packages/web3/tsconfig.json`.
- Fix completed: Nexus app/package TS configs now extend the real local `packages/typescript-config` files directly; ESLint configs import the real local `packages/eslint-config` modules directly; docs/web TS configs resolve `@repo/ui`, `@repo/security`, and `@repo/database` through local source paths; web auth now imports shared-kernel through `@infinity-trinity/shared-kernel/AuthenticationService` mapped to built `shared-kernel/dist`.
- Command run: `node system\production-audit.mjs --write` from workspace root.
  - Result: passed; inventory recorded 39 top-level entries, 23 env files, 0 archives, 177 generated folders, and 71 deployment files with 0 warnings and 0 critical structure issues.
- Command run: `node system\run-verification.mjs --write --timeout-ms=60000` from workspace root.
  - Result: wrote `system/verification-report.json` with 7 passed, 15 failed, 16 blocked, and 1 skipped, then the outer shell timed out after the report was written. QuantChat failures before this patch included missing `@repo/eslint-config` imports and `@repo/typescript-config/react-library.json`.
- Command run: direct ESLint config imports for `packages/security`, `packages/vampire-bridge`, `packages/web3`, `packages/ui`, `apps/docs`, and `apps/web`.
  - Result: each reached the expected config load output; several processes stayed open until the wrapper timeout, so the targeted lint commands below are the source of truth.
- Command run: `node ..\..\node_modules\typescript\bin\tsc --noEmit --pretty false` in `Nexus/packages/ui`.
  - Result: passed.
- Commands run: direct ESLint CLI in `Nexus/packages/security`, `Nexus/packages/vampire-bridge`, `Nexus/packages/web3`, and `Nexus/packages/ui`.
  - Result: all exited 0. `packages/security` still reports 7 warnings, but the previous missing `@repo/eslint-config` import error is gone.
- Command run: `npm.cmd run lint` in `Nexus`.
  - Result: failed in Turbo on `@repo/ui#lint` with npm child exit `3221226505`; direct `npm.cmd run lint` inside `Nexus/packages/ui` passed immediately afterward, so this appears to be local Turbo/npm process instability rather than a remaining config import error.
- Command run: `npm.cmd run check-types` in `Nexus`.
  - Result: failed on `web#check-types`, but `@repo/ui#check-types` and `docs#check-types` passed. The previous `@repo/typescript-config` and `@repo/ui/button` resolution errors are gone.
  - Remaining web diagnostics: `next-auth` export mismatches (`getServerSession`, `NextAuthOptions`), missing `@prisma/client` `PrismaClient`, `next-auth` route import shape, missing `isHandshakeVerified`/`onInitiateHandshake`, `BiometricHandshake` nullability/event typing, `lib/auth.ts` callback implicit-any types, and `lib/useQuantchatIdentity.ts` session augmentation/operator errors.
- Command run: `npm.cmd run build` in `Nexus`.
  - Result: failed on `docs#build` with `EPERM unlink C:\infinity trinity apps motive\QuantChat\Nexus\apps\docs\.next\trace`.
- QuantChat is not verified or deployed by this slice.
- Next action: fix `apps/web` NextAuth/Prisma/session augmentation diagnostics, then rerun `npm.cmd run check-types`; separately clear or isolate locked Next output artifacts before retrying `npm.cmd run build`.

## Automation Run (2026-05-04T07:19:12Z) - qa-agent

- Role: run honest verification.
- Command run: `node system/run-verification.mjs --write --timeout-ms=60000` from workspace root.
- Result: failed overall with exit 1 after about 391s. The runner rewrote `system/verification-report.json` with `generatedAt: 2026-05-04T07:19:12.334Z` and workspace summary `6 passed, 16 failed, 16 blocked, 1 skipped`.
- QuantChat evidence: `Nexus build` failed with exit 1 in 14062 ms. Turbo failed on `docs#build` because `next build` hit `EPERM unlink C:\infinity trinity apps motive\QuantChat\Nexus\apps\docs\.next\trace`.
- QuantChat evidence: `Nexus lint` failed with exit 2 in 6746 ms. ESLint in `@repo/vampire-bridge`, `@repo/security`, and `@repo/ui` could not resolve package `@repo/eslint-config` from each package `eslint.config.mjs`.
- QuantChat evidence: `Nexus check-types` failed with exit 2 in 25981 ms. `@repo/ui#check-types` reported `TS17004` JSX flag errors in `src/button.tsx`, `src/card.tsx`, and `src/code.tsx`, and `packages/ui/tsconfig.json` could not find `@repo/typescript-config/react-library.json`.
- QuantChat evidence: `Nexus/apps/web build` failed with exit 1 in 4094 ms on `EPERM unlink C:\infinity trinity apps motive\QuantChat\Nexus\apps\web\out\trace`.
- QuantChat evidence: `Nexus/apps/web check-types` stayed blocked in the manifest runner because the script contains shell operators and the sandbox-safe runner does not invoke a shell.
- QuantChat evidence: `Nexus/apps/api-gateway` stayed blocked because `node_modules` is missing and install was not run in this QA pass.
- Next action: clear the locked Next trace outputs under `Nexus/apps/docs/.next` and `Nexus/apps/web/out`, restore the missing workspace package resolution for `@repo/eslint-config` and `@repo/typescript-config`, and if API gateway verification is required run dependency recovery for `Nexus/apps/api-gateway` before rerunning QA.
