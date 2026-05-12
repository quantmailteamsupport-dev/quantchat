# QuantChat — AWS Deploy Runbook

End-to-end deploy from zero to a live `https://your-domain/` in roughly 30
minutes. Everything you do here, you do once. After that, pushing to `main`
deploys automatically.

---

## What gets created

- 1× EC2 instance (`t3.medium` Ubuntu 22.04) running Docker.
- 1× Elastic IP (so the public IP doesn't change on reboot).
- 1× VPC, public subnet, internet gateway, security group (22/80/443).
- The app stack: PostgreSQL 15, Redis 7, the API gateway, and Nginx — all
  via `docker compose` on the EC2 host.

PostgreSQL and Redis run inside Docker on the same EC2 host. This is intentionally
simple. Later, when you outgrow it, swap to managed Aurora + ElastiCache using
the future-state Terraform in `infra/terraform/main.ecs-future.tf.txt`.

---

## Prerequisites

- An AWS account with billing enabled.
- AWS CLI installed locally and configured (`aws configure`) with an IAM
  user that has permissions for VPC, EC2, EIP, and KeyPair (the
  `AdministratorAccess` policy works, or a tighter custom one).
- Terraform 1.5+.
- An SSH keypair on your local machine. If you don't have one:
  ```bash
  ssh-keygen -t ed25519 -f ~/.ssh/quantchat -C "quantchat-deployer"
  ```

---

## Step 1 — Provision infrastructure

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars: paste your SSH public key contents into `ssh_pubkey`.
# Restrict ssh_cidr_blocks to your IP if you can.

terraform init
terraform plan          # review changes
terraform apply         # type 'yes' to confirm
```

Output will show `app_public_ip`. Note it down — you'll need it in step 2.

To destroy later: `terraform destroy`.

---

## Step 2 — Set GitHub Actions secrets

Go to **GitHub repo → Settings → Secrets and variables → Actions → New repository secret**.

Add each secret listed in [`docs/SECRETS_REQUIRED.md`](../../docs/SECRETS_REQUIRED.md).

The non-obvious ones:

- `EC2_HOST` — the Elastic IP from `terraform output app_public_ip` (or the
  public IPv4 of an existing EC2 instance you already own).
- `EC2_USER` — `ubuntu` for Ubuntu AMIs, `ec2-user` for Amazon Linux.
- `EC2_PASSWORD` — the SSH password for that user. **Only set this if you've
  enabled password auth on the EC2 host** (see "Enabling password SSH" below).
  Prefer key-based auth if you can — see `EC2_SSH_KEY` instead.
- `EC2_SSH_KEY` *(preferred over password)* — the **private** key matching
  `ssh_pubkey` you put in Terraform. Paste the entire PEM contents including
  `-----BEGIN ...` lines. The workflow currently uses `EC2_PASSWORD`; to switch
  back to key auth, replace `password:` with `key:` in `.github/workflows/deploy.yml`.
- `EC2_PORT` *(optional)* — defaults to `22`.
- `FIREBASE_SERVICE_ACCOUNT_JSON` — paste the entire JSON contents from your
  Firebase service-account key file as one big secret.

### Enabling password SSH on the EC2 host

By default, Ubuntu EC2 AMIs disable password auth. If you intend to use
`EC2_PASSWORD`, SSH into the host once (using EC2 Instance Connect or the
launch key pair) and run:

```bash
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config
# Some AMIs also have a drop-in that overrides this — check and edit if present:
sudo grep -RIl PasswordAuthentication /etc/ssh/sshd_config.d/ 2>/dev/null \
  | xargs -r sudo sed -i 's/^PasswordAuthentication.*/PasswordAuthentication yes/'
sudo systemctl restart ssh
# Set/rotate the password for the deploy user:
sudo passwd ubuntu
```

Then verify locally: `ssh ubuntu@<EC2_HOST>` — it should prompt for the password.

For the random-string secrets (`JWT_SECRET`, `NEXTAUTH_SECRET`), generate fresh:

```bash
openssl rand -hex 32
```

---

## Step 3 — Trigger the deploy

Either push to `main`, or run the workflow manually:

**GitHub repo → Actions → Build & Deploy → Run workflow → main**.

The workflow:
1. Builds the api-gateway Docker image.
2. Pushes it to GHCR (`ghcr.io/<owner>/<repo>/api-gateway`).
3. SSHs to the EC2 host, writes `.env` from secrets, pulls the new image, runs
   `docker compose up -d`.
4. Runs a health check against `http://localhost:3000/healthz` on the host.

If the health check fails, the action prints the last 100 lines of api-gateway
logs and fails red.

---

## Step 4 — Verify

```bash
# From your laptop
curl http://<EC2_HOST>/healthz
# expected: {"status":"ok"}

# Or SSH in to look around
ssh -i ~/.ssh/quantchat ubuntu@<EC2_HOST>
cd /opt/quantchat
docker compose ps
docker compose logs api-gateway --tail 50
```

---

## DNS + TLS (when you're ready)

1. Point your domain's `A` record at the Elastic IP from `terraform output app_public_ip`.
2. SSH in, install Certbot, get a cert:
   ```bash
   sudo snap install --classic certbot
   sudo certbot --nginx -d your-domain.com -d www.your-domain.com
   ```
3. Update the `NEXTAUTH_URL` GitHub Secret to `https://your-domain.com`.
4. Re-run the deploy workflow.

---

## Rolling back

Every deploy tags an image with the git SHA. To roll back to the previous
commit:

```bash
ssh ubuntu@<EC2_HOST>
cd /opt/quantchat
# replace <sha> with the previous successful commit SHA
docker pull ghcr.io/<owner>/<repo>/api-gateway:<sha>
API_GATEWAY_IMAGE=ghcr.io/<owner>/<repo>/api-gateway:<sha> docker compose up -d
```

---

## Common issues

| Symptom | Likely cause | Fix |
|---|---|---|
| `Health: HTTP 502` | API gateway crashed on startup | `docker compose logs api-gateway` — usually a missing env var. Re-check Step 2 secrets. |
| `Permission denied (publickey)` in CI | Wrong `EC2_SSH_KEY` format | Paste the *private* key, full PEM including header/footer. No extra whitespace. |
| Terraform `Error: no matching ami found` | Old AMI filter | `terraform apply` retries usually fix it; AWS sometimes lags Ubuntu releases. |
| `docker: command not found` on host | EC2 user-data hasn't finished | Wait 2 minutes after `terraform apply` for cloud-init to complete. |
| GHCR `denied: permission` | Image is private | Repo Settings → Packages → make the image public, or the action's `GITHUB_TOKEN` needs `packages:write` (it does by default in the workflow). |
