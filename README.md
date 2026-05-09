# QuantChat

QuantChat is the Infinity Trinity secure messaging layer focused on low latency, privacy, encryption readiness, cross-device sync, WebRTC reliability, and consent-aware AI assistance.

## Structure

- `Nexus/`: Turborepo workspace.
- `Nexus/apps/web`: user-facing chat web app.
- `Nexus/apps/api-gateway`: messaging and realtime API gateway.
- `Nexus/packages/*`: shared database, security, UI, web3, and bridge packages.
- `task.md`: production backlog, release gates, and acceptance criteria.

## Local Setup

```bash
cd Nexus
npm install
npm run build
npm run lint
npm run check-types
```

## Deployment Notes

The root `docker-compose.yml` runs this app as the `quantchat` service. The expected health path is `/health`, and Traefik routes requests under `/api/chat`.

Do not commit `.env`, generated folders, local caches, archives, or secret-bearing logs. They should appear in inventory reports by path only.

## Production Focus

- Two-device revoke trace with no stale-session drift.
- Consent and privacy settings that fail safely.
- WebRTC reconnect reliability.
- AI smart replies that are opt-in and never auto-send.
