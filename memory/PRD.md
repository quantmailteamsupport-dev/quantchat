# PRD — QuantChat Upgrade

## Original Problem Statement
Deeply check karo kaisa bana hai app apk build kar ke do server pe check karo aur upgrade karo ui and micro features add karo aur best banao aur agents deploy karo

## User Choices / Priorities
- End-to-end improvements
- Focus: mobile UI polish, login/auth flow, main chat/product improvements, performance + micro interactions
- Style: Snapchat-style modern dark + premium minimal clean
- Add in-app AI assistant/chat assistant
- Add background automation-style workflows
- Create demo/test account
- Need AWS EC2 guidance as well

## Architecture Decisions
- Existing stack preserved: React frontend + FastAPI backend + MongoDB
- Repaired missing runtime env with explicit `.env` files
- Added AI assistant backend route using Emergent universal key with OpenAI GPT-5.2 via `emergentintegrations`
- Kept same-origin friendly API strategy and improved local loopback detection in frontend API resolver
- Added sessionStorage feed prefetch/cache to reduce mobile Spotlight/Stories latency
- Kept Capacitor Android project synced instead of rewriting mobile shell

## Implemented
- Fixed backend startup and auth usability by restoring required env config
- Added demo login flow and seeded demo users, conversations, messages, stories, and reels
- Upgraded login/register polish for mobile-first dark premium presentation
- Added QuantChat Copilot floating assistant with digest/reply/story modes and real AI responses
- Improved mobile shell styling, FAB interactions, unread indicators, and assistant bottom sheet
- Warm-prefetched Stories/Reels and added many missing `data-testid` attributes across core interactive surfaces
- Built production frontend successfully and synced Capacitor Android project
- Added `/app/deployment-guide.md` with EC2 + Nginx + Android build steps

## Backlog
### P0
- Build actual Android APK on a machine/container with Java + Android SDK available
- Add remaining `data-testid` coverage to every minor interactive control inside message bubble menus/modals
- Split backend `server.py` into modular routers/services

### P1
- Improve reels rendering performance further with virtualization/lazy media loading
- Add richer assistant memory, prompt presets, and contextual actions per chat/group/story
- Add optimistic UI for comments/likes and stronger error toasts

### P2
- Add push notifications / native device polish
- Add analytics for engagement across stories, spotlight, and assistant usage
- Add media compression pipeline for uploads

## Next Tasks
1. Produce debug/release APK once Java + Android SDK are available
2. Modularize backend into auth, chats, feeds, assistant, and realtime files
3. Expand AI assistant workflows into proactive automation cards and scheduled summaries
