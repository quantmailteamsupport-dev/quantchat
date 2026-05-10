# PRD — QuantChat Super App Upgrade

## Original Problem Statement
Deeply check karo kaisa bana hai app apk build kar ke do server pe check karo aur upgrade karo ui and micro features add karo aur best banao aur agents deploy karo

## Latest Implemented Phase
- Demo phone-number OTP auth flow structure added (Firebase-ready later)
- Camera capture can now publish toward snap/story/feed/reel actions
- Saved messages, starred chats, schedule-send backend flow, and saved-space UI added
- Messaging shell got deeper WhatsApp/Telegram-style utility controls

## Architecture Decisions
- Phone auth is currently demo backend flow using generated OTPs so UI and full journey can be tested before Firebase credentials arrive
- Scheduled messages are stored in Mongo and delivered when due during conversation fetch/send cycles
- Saved messages are stored per user in dedicated collection and surfaced in Saved Space
- Camera overlay publishes via existing stories/posts/reels/chat message APIs

## Implemented
- `/api/auth/phone/request` and `/api/auth/phone/verify` demo OTP endpoints
- Login screen phone auth modal with login/signup/recovery/link flows
- Chat header starred chat toggle
- Save message backend + Saved Space UI
- Schedule send backend + composer quick schedule action
- Camera publish actions: Snap streak / Story / Feed / Reel

## Backlog
### P0
- Real Firebase phone OTP integration with provided project credentials
- Deliver scheduled messages via worker/background job instead of fetch-cycle delivery
- Add proper saved/starred filters and message jump anchors in chat UI

### P1
- Full channels/broadcast/admin tools
- Real camera publishing confirmation flows and story/reel composer polish
- Better media sharing, contact sync, and voice/video polish

### P2
- Full custom provider runtime switching for Ollama/DeepSeek where supported
- Push notifications and number-first onboarding refinements
- Backend modularization

## Next Tasks
1. Wire real Firebase config and enable true SMS OTP
2. Add direct captured media composer for story/feed/reel with captions
3. Expand channels, admin tools, and messaging controls further
