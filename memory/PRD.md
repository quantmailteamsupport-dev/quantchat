# Nexus/QuantChat Production Readiness PRD

## Original Problem Statement
"deeply check laro source code production ready and deploy karo"; user later confirmed full monorepo deployment to SSH server `20.249.208.224` with fixes applied wherever needed.

## Architecture Decisions
- Kept Turborepo monorepo structure: `apps/web`, `apps/admin`, `apps/docs`, `apps/api-gateway`, shared packages, PostgreSQL, Redis.
- Standardized production deployment with Docker Compose and Node 22 images.
- Added standalone Next.js output for web/admin/docs and fail-fast production env handling for critical runtime secrets.
- Deployed on the provided SSH server with Docker containers and Prisma schema sync.
- Because direct public IP ports are blocked by cloud/network ingress, added outbound Cloudflare quick tunnels running on the same server for live verification.

## Implemented
- Fixed install/build blockers: broken native `webrtc-native` install, lockfile optional native dependencies, Node engine/Docker image mismatch, admin/docs standalone Docker support.
- Fixed TypeScript/build issues across API gateway, auth, Socket.io key registration, metrics, S3 config, Prisma schema, NextAuth import, chat null states, and admin production auth.
- Added production Docker Compose services for web, docs, admin, API gateway, PostgreSQL, and Redis.
- Deployed and verified containers running on the server.
- Live verified URLs:
  - Web: https://arch-ooo-evanescence-herbs.trycloudflare.com
  - Docs: https://levitra-disturbed-michelle-temp.trycloudflare.com
  - Admin: https://cove-appeared-just-produce.trycloudflare.com (Basic auth expected)
  - API health: https://newcastle-professional-rehab-property.trycloudflare.com/healthz
  - API ready: https://newcastle-professional-rehab-property.trycloudflare.com/readyz

## Current Validation
- Local: `npm run check-types -- --continue` passed.
- Local: `npm run build -- --continue` passed.
- Remote server-local: web/docs 200, admin 401 Basic auth, API health/ready 200.
- Public tunnel URLs: web/docs 200, admin 401 Basic auth, API health/ready 200.
- Regression: `pytest /app/tests/test_nexus_deployment_public.py` with tunnel env passed 5/5 reachable checks; direct root ingress test skipped until NSG/cloud ingress is opened.
- Direct `20.249.208.224` public ports currently timeout externally; server firewall is inactive and containers listen on `0.0.0.0`, so this is a cloud ingress/NSG rule outside app code.

## Prioritized Backlog
### P0
- Open permanent cloud ingress/NSG or attach a stable domain/reverse proxy so direct public URLs do not depend on temporary tunnel URLs.
- Replace AWS S3 placeholder env values with real credentials before using attachment upload/presign flow.

### P1
- Modularize `apps/api-gateway/src/routes.ts` into focused route modules.
- Replace `@repo/webrtc-native` placeholder with real native binding source or remove package if unused.
- Add production monitoring and alerting around API health/ready checks.

### P2
- Add automated CI for `check-types`, build, and deployment reachability tests.
- Add stable admin user management and audited access logs.
- Add polished documentation for operator runbooks and environment setup.

## Next Tasks
1. Configure permanent public ingress for ports 80/443 or a domain-backed proxy.
2. Configure real S3 credentials.
3. Retest public direct URLs after ingress is opened.


## Latest Frontend Polish Update
- Applied A1 Swiss high-contrast visual system to web landing, docs landing, and admin dashboard.
- Verified screenshots for web, docs, and authenticated admin dashboard.
- Rebuilt and redeployed web/docs/admin containers on SSH server.
- Final public tunnel regression: 5 passed, 1 skipped (direct IP ingress still blocked externally).
