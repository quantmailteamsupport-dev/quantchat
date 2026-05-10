# PRD — QuantChat Super App Upgrade

## Original Problem Statement
Deeply check karo kaisa bana hai app apk build kar ke do server pe check karo aur upgrade karo ui and micro features add karo aur best banao aur agents deploy karo

## Latest User Expansion
- Chat tab ko super app banana: chats + stories circles + groups merged + AI bot
- Instagram-style reels/feed section
- Telegram/WhatsApp-style messaging feel
- Snapchat-style camera + lenses shell
- Bottom nav: Chats, Feed, Reels, AI, Profile
- Snap-style map add karna
- Profile/settings me AI API keys add/change karna
- MCP server / agent tool settings ka base add karna
- Phone auth future phase me Firebase se

## Architecture Decisions
- Existing React + FastAPI + Mongo stack preserved
- Chat inbox kept as primary shell; groups remain merged in conversation list with filters
- Added public feed + map data via new `posts` collection
- Added `ai_configs` collection for per-user provider/model/key settings and MCP server configs
- Assistant runtime now resolves provider/model from saved config with universal-key fallback
- Camera/lenses built as browser-native overlay using `getUserMedia` + filter presets

## Implemented
- Reworked mobile navigation to: Chats, Feed, Spotlight, AI, Profile
- Chat tab upgraded with futuristic 3D-style logo, compact story circles, merged groups, and cleaner super-app shell
- Added Feed tab with public posts composer and Snap-style live map view
- Added dedicated AI Hub tab with multi-bot style workspace and live assistant prompting
- Added Profile tab with public posts, AI key manager, MCP server settings, and phone-auth roadmap card
- Added camera/lens overlay for Snap-style capture flow
- Added backend APIs for feed posts, profile data, and AI/provider settings
- Seeded public feed/map data for demo usability

## Backlog
### P0
- Build actual Firebase phone OTP auth
- Connect custom OpenAI/Gemini/Claude keys fully as selectable runtime providers across all AI flows
- Add real MCP server execution layer instead of just config management

### P1
- Add richer Telegram/WhatsApp features: message reactions polish, channels, broadcast tools, better media sharing
- Add real Snapchat-style lenses/effects pipeline and capture publishing into stories/feed
- Improve profile/media grids and reel/feed social actions

### P2
- Add native map/geolocation sharing and friend presence
- Add push notifications and number-first onboarding polish
- Split backend/server.py into smaller modules

## Next Tasks
1. Firebase phone OTP + number-first auth
2. Real custom provider switching (OpenAI/Gemini/Claude/Ollama/DeepSeek where supported)
3. Publish captured camera output directly into stories/feed/reels
