# Required Secrets for Deployment

QuantChat does not store any secrets in source code. For local development you
populate a gitignored `.env` (use `.env.example` as a template). For production
deploys via GitHub Actions, set every secret below under:

**GitHub repo → Settings → Secrets and variables → Actions → New repository secret**

## Required for AWS Deploy GitHub Action

| Secret name | Purpose |
|---|---|
| `EC2_HOST` | Public IP or DNS of the target EC2 instance. Output from `terraform apply`. |
| `EC2_USER` | SSH user on the EC2 instance (typically `ubuntu` or `ec2-user`). |
| `EC2_SSH_KEY` | Private SSH key (PEM contents) matching the public key registered on the EC2 instance. |
| `DB_PASSWORD` | PostgreSQL password used by docker-compose on the host. |
| `REDIS_PASSWORD` | Redis password used by docker-compose on the host. |
| `JWT_SECRET` | Long random string used to sign JWTs. Generate with `openssl rand -hex 32`. |
| `NEXTAUTH_SECRET` | Long random string for NextAuth session signing. Generate with `openssl rand -hex 32`. |
| `ADMIN_EMAIL` | Email for the seeded admin account. |
| `ADMIN_PASSWORD` | Password for the seeded admin account. **No default — backend refuses to start without this.** |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID. |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret. |
| `FIREBASE_PROJECT_ID` | Firebase project ID. |
| `FIREBASE_WEB_API_KEY` | Firebase Web API key. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | **Full contents** of the Firebase admin service-account JSON, pasted as a single secret. |
| `OPENAI_API_KEY` | OpenAI API key (for AI suggestions). |
| `MONGO_URL` | MongoDB connection string (legacy Python backend only). |
| `DB_NAME` | MongoDB database name (legacy Python backend only). |

## Required for Terraform

You don't add these to GitHub Secrets — you supply them at `terraform apply` time
or via `terraform.tfvars` (which is gitignored).

| Variable | Purpose |
|---|---|
| `aws_access_key_id` | Via `AWS_ACCESS_KEY_ID` env var, or `aws configure`. |
| `aws_secret_access_key` | Via `AWS_SECRET_ACCESS_KEY` env var, or `aws configure`. |
| `ssh_pubkey` | Contents of your local `~/.ssh/id_ed25519.pub` (or RSA equivalent). |
| `aws_region` | Defaults to `us-east-1`. |
| `instance_type` | Defaults to `t3.medium`. |

## Rotating Already-Compromised Credentials

The following credentials previously appeared in source code in this repo and
must be rotated by you, because git history (per your decision) is not being
rewritten:

1. **Firebase service-account key** for project `quantchat-4c1f7` — go to the
   Firebase Console → Project Settings → Service Accounts → revoke the old key
   and generate a new one. Paste the new JSON into the `FIREBASE_SERVICE_ACCOUNT_JSON`
   GitHub Secret.
2. **SSH password** for server `20.249.208.224` user `kundan1792008` —
   change it on the server (`passwd`) and prefer switching to SSH-key auth.
3. **Admin seed password** `QuantChat@2026` — set a new value in the
   `ADMIN_PASSWORD` GitHub Secret. On next startup the backend will rotate
   the admin's stored hash to match.
