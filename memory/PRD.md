# QuantChat - Product Requirements Document

## Original Problem Statement
User wants to deploy QuantChat (Nexus) - a social messaging app like WhatsApp/Telegram/Instagram. The original Nexus codebase was a Turborepo monorepo at ~30% completion. Rebuilt as a clean, production-ready app on Emergent platform (React + FastAPI + MongoDB).

## Architecture
- **Backend**: FastAPI + python-socketio + MongoDB (Motor async driver)
- **Frontend**: React 18 + Tailwind CSS + Socket.IO client + React Router v6
- **Database**: MongoDB (users, conversations, messages, stories, login_attempts)
- **Real-time**: Socket.IO for messaging, typing indicators, online status, read receipts
- **Auth**: JWT (access + refresh tokens) with bcrypt password hashing
- **Deployment**: Docker Compose (MongoDB + Backend + Frontend/Nginx)

## What's Been Implemented (2026-05-09)
- JWT authentication (register, login, logout, refresh, me)
- Brute force protection (5 attempts = 15 min lockout)
- Real-time 1-on-1 messaging via Socket.IO
- Conversation management (create, list, with unread counts)
- Message sending with delivery timestamps
- User search by name/email
- Profile management (name, bio, avatar)
- Stories/Status (24hr auto-expiry via MongoDB TTL)
- Online/offline status tracking
- Typing indicators
- Read receipts
- Dark theme UI (Swiss high-contrast design)
- 4 demo users + admin seeded on startup
- Deployment package (Docker Compose) for Azure VM

## Test Results
- Backend: 24/24 tests passed (100%)
- Frontend: 9/9 tests passed (100%)
- All features verified working

## Deployment
- **Preview**: https://web-chat-gateway.preview.emergentagent.com
- **Azure Target**: 20.249.208.224
- **Deploy Archive**: /app/quantchat-deploy.tar.gz

## Prioritized Backlog

### P0 (Next)
- Deploy to Azure VM via Docker Compose
- Open Azure NSG port 80 for HTTP access

### P1
- Group chat creation UI
- Image/file sharing via upload
- Push notifications
- Voice messages

### P2
- Video/voice calls (WebRTC)
- End-to-end encryption (Signal Protocol)
- Disappearing messages
- User blocking
- Message reactions
- APK build (React Native or PWA)
