# QuantChat - Product Requirements Document

## Original Problem Statement
User wants to continue the existing QuantChat app, finish the final polish and bug fixes, verify the live deployment, and complete permanent domain setup for `quantchat.online` on Azure/Hostinger.

## Architecture
- **Backend**: FastAPI + python-socketio + MongoDB (Motor async driver)
- **Frontend**: React 18 + Tailwind CSS + Socket.IO client + React Router v6
- **Database**: MongoDB (users, conversations, messages, stories, login_attempts)
- **Real-time**: Socket.IO for messaging, typing indicators, online status, read receipts
- **Auth**: JWT with demo seeded users and refresh-token support
- **Runtime**: Azure VM with nginx serving the React build and proxying `/api` to backend

## What's Been Implemented (2026-05-09)
- JWT authentication (register, login, logout, refresh, me)
- Brute force protection (5 attempts = 15 min lockout)
- Real-time 1-on-1 messaging via Socket.IO
- Conversation management (create, list, unread counts)
- Message sending, forwarding, reactions, editing, deleting, pinning, and reply support
- User search by name/email
- Profile management (name, bio, avatar)
- Stories/Status with 24-hour expiry
- Online/offline status tracking, typing indicators, and read receipts
- Fixed mixed-content production login issues by resolving API calls to same-origin on HTTPS deployments
- Fixed duplicate responsive DOM rendering that created duplicate `data-testid` selectors
- Rebuilt and synced the latest frontend bundle to the Azure VM live app
- Added nginx host config on the Azure VM for `quantchat.online` and `www.quantchat.online`
- Confirmed the permanent domain currently still points to Hostinger parking, not the app

## Test Results
- Backend API and messaging feature suites passed
- Public tunnel auth/chat regression tests passed
- Live browser verification for login, search, start chat, and send message passed
- Custom domain state check: `quantchat.online` currently shows Hostinger parking page

## Deployment Status
- **Working Live App**: https://get-painting-consumers-completing.trycloudflare.com
- **Current Preview**: https://app-check-deploy-1.preview.emergentagent.com
- **Previous Preview**: https://app-check-deploy-1.preview.emergentagent.com
- **Feature Preview**: https://app-check-deploy-1.preview.emergentagent.com
- **Azure VM**: 20.249.208.224
- **Deploy Archive**: /app/quantchat-deploy.tar.gz
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
- APK/PWA packaging improvements
