# QuantChat - Azure Deployment Guide

## Quick Deploy (One Command)

SSH into your Azure VM and run:

```bash
ssh kundan1792008@20.249.208.224
# Password: kundan854410@

# Upload the archive (from your local machine):
# scp quantchat-deploy.tar.gz kundan1792008@20.249.208.224:~/

# On the server:
tar -xzf quantchat-deploy.tar.gz
cd deploy
bash deploy.sh
```

## What Gets Deployed

| Service  | Port | Description |
|----------|------|-------------|
| Frontend | 80   | React app via Nginx |
| Backend  | 8001 | FastAPI + Socket.IO |
| MongoDB  | 27017| Database |

## Access After Deploy

- **URL**: http://20.249.208.224
- **Demo Login**: arjun@quantchat.com / Demo@1234
- **Admin Login**: admin@quantchat.com / QuantChat@2026

## Manual Commands

```bash
# Check status
sudo docker compose ps

# View logs
sudo docker compose logs -f backend
sudo docker compose logs -f frontend

# Restart
sudo docker compose restart

# Stop
sudo docker compose down

# Rebuild
sudo docker compose up -d --build
```

## Azure NSG Rules

Make sure your Azure Network Security Group allows:
- Port 80 (HTTP) - Inbound
- Port 443 (HTTPS) - If using SSL later
