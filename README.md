# QuantChat

Secure messaging layer focused on low-latency delivery, privacy, end-to-end
encryption readiness, cross-device sync, WebRTC voice/video reliability, and
consent-aware AI assistance.

## Repository Layout

```
/
├── Nexus/                 Live monorepo (npm workspaces + Turborepo)
│   ├── apps/
│   │   ├── web/           Next.js 16 user-facing chat app
│   │   ├── api-gateway/   Express + Socket.io realtime API
│   │   ├── admin/         Admin dashboard
│   │   └── docs/          Internal docs site
│   └── packages/          Shared libs (database, security, ui, web3, bridge)
├── infra/
│   ├── docker/            Dockerfiles + docker-compose.yml
│   ├── terraform/         AWS infrastructure as code
│   └── k8s/               Kubernetes manifests
├── deploy/
│   ├── aws/               AWS deploy scripts + nginx + systemd unit
│   └── azure/             Azure deploy scripts (legacy, kept for reference)
├── docs/                  Planning docs, architecture, runbooks
│   ├── SECRETS_REQUIRED.md  Every secret you need to deploy
│   └── archive/             Older notes
├── legacy/                Older code paths kept for reference
│   ├── python-backend/      FastAPI server (replaced by api-gateway)
│   ├── react-frontend/      Create-React-App frontend (replaced by Nexus/apps/web)
│   ├── nexus-acrctx/        Earlier monorepo variant
│   └── deploy-static/       Older flat deploy bundle
├── agents/                Agent role descriptions
├── memory/                Long-running notes / PRD
├── releases/              Published artifacts (e.g. Android APK)
├── tests/                 Top-level integration tests
├── .env.example           Template for local .env (gitignored)
└── .github/workflows/     CI / CD
```

## Local Setup

Prerequisites: Node 20+, Docker, optionally pnpm.

```bash
cp .env.example .env       # fill in values
cd Nexus
npm install
npm run build
```

To run the full stack locally (postgres + redis + api-gateway + nginx):

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

To run only the web app in dev mode:

```bash
cd Nexus
npm run dev --workspace @repo/web
```

## Deployment

We deploy to a single EC2 instance with Docker. See:

- **[deploy/aws/RUNBOOK.md](deploy/aws/RUNBOOK.md)** — step-by-step deploy.
- **[docs/SECRETS_REQUIRED.md](docs/SECRETS_REQUIRED.md)** — every secret you must set in GitHub Actions.
- **[infra/terraform/](infra/terraform/)** — `terraform apply` to provision AWS.

CI: pushes to `main` trigger `.github/workflows/deploy.yml`, which builds the
Docker image, pushes to GHCR, and runs `docker compose up -d` on the EC2 host.

## Security

- No secrets in source. All sensitive values go in `.env` (local, gitignored)
  or GitHub Actions Secrets (CI). See `docs/SECRETS_REQUIRED.md`.
- Report security issues per `SECURITY.md`.

## Production Focus

- Two-device revoke trace with no stale-session drift.
- Consent and privacy settings that fail safely.
- WebRTC reconnect reliability across mobile/desktop.
- AI smart replies that are opt-in and never auto-send.
