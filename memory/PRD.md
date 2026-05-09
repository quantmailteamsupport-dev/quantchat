# QuantChat - Product Requirements Document

## Original Problem Statement
User asked to continue the existing QuantChat app, do final polish + bug fixes, verify the live link, and complete permanent domain setup for `quantchat.online` on Azure/Hostinger.

## Architecture
- **Backend**: FastAPI + python-socketio + MongoDB (Motor async driver)
- **Frontend**: React 18 + Tailwind CSS + Socket.IO client + React Router v6
- **Database**: MongoDB (users, conversations, messages, stories, login_attempts)
- **Real-time**: Socket.IO for messaging, typing indicators, online status, read receipts
- **Auth**: JWT with demo seeded users
- **Runtime**: Azure VM with nginx serving the React build and proxying `/api` to backend

## What's Been Implemented (2026-05-09)
- Fixed the mixed-content production login issue by resolving API calls to same-origin on HTTPS deployments
- Rebuilt and synced the latest frontend bundle to the Azure VM live app
- Verified tunnel login, authenticated shell load, search, start-chat, and send-message flow
- Fixed duplicate responsive DOM rendering issue that created duplicate `data-testid` selectors
- Added nginx host config on the Azure VM for `quantchat.online` and `www.quantchat.online`
- Confirmed the permanent domain currently still points to Hostinger parking, not the app

## Test Results
- Public tunnel auth/chat API regression tests: passed
- Live browser verification: login, search, start chat, send message: passed
- Custom domain state check: `quantchat.online` currently shows Hostinger parking page

## Deployment Status
- **Working Live App**: https://get-painting-consumers-completing.trycloudflare.com
- **Preview**: https://web-chat-gateway.preview.emergentagent.com
- **Azure VM**: 20.249.208.224
- **Custom Domain**: https://quantchat.online (currently parked at Hostinger)

## Prioritized Backlog

### P0 (Next)
- Open Azure public inbound 80/443 so the VM can receive web traffic
- Update Hostinger DNS away from parking and point `quantchat.online` to the Azure app target
- Issue HTTPS certificate for `quantchat.online` after DNS cutover

### P1
- Split oversized `backend/server.py` into smaller route/service modules
- Remove backend URL fallbacks and enforce env-only fail-fast config
- Harden production cookie settings for HTTPS domain traffic

### P2
- Group chat creation UI improvements
- Image/file sharing via upload
- Push notifications
- Voice/video calling
- Message reactions and richer delivery insights
