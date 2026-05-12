#!/bin/bash
# QuantChat Server Recovery Script
# Run on EC2: bash server_recovery.sh
set -e

EC2_REPO="/home/ubuntu/quantchat"
BACKUP_REPO="/home/ubuntu/quantchat_backup_"
NGINX_ROOT="/var/www/quantchat/build"

echo "====== QuantChat Server Recovery ======"
echo "Step 1: Backend status check"
sudo systemctl status quantchat-backend --no-pager -l || true
echo ""
echo "Step 2: Port 8000 check"
ss -tulpn | grep 8000 || echo "Nothing on 8000"
echo ""
echo "Step 3: Health check"
curl -s --max-time 3 http://127.0.0.1:8000/api/health || echo "Backend not responding"
echo ""

echo "====== Fixing Backend ======"
cd "$EC2_REPO/backend"

# .env check
if [ ! -f .env ]; then
  echo "ERROR: .env missing! Trying to copy from backup..."
  if [ -f /home/ubuntu/deploy_backups/backend_20260510_172339/.env ]; then
    cp /home/ubuntu/deploy_backups/backend_20260510_172339/.env .env
    echo "Copied from deploy_backups"
  elif [ -f "$BACKUP_REPO/backend/.env" ]; then
    cp "$BACKUP_REPO/backend/.env" .env
    echo "Copied from backup repo"
  else
    echo "CRITICAL: No .env backup found! Create manually with:"
    echo "  MONGO_URL=<your-mongo-url>"
    echo "  DB_NAME=quantchat"
    echo "  JWT_SECRET=<secret>"
    echo "  FRONTEND_URL=http://52.66.196.236"
    exit 1
  fi
fi

# venv check
if [ ! -f .venv/bin/uvicorn ]; then
  echo "venv missing or incomplete, recreating..."
  python3 -m venv .venv
  .venv/bin/pip install --upgrade pip

  # emergentintegrations from local copy
  if [ -f /home/ubuntu/emergentintegrations_pkg.tar.gz ]; then
    cd /tmp && tar -xzf /home/ubuntu/emergentintegrations_pkg.tar.gz
    "$EC2_REPO/backend/.venv/bin/pip" install /tmp/emergentintegrations --no-deps 2>/dev/null || \
    "$EC2_REPO/backend/.venv/bin/pip" install /tmp/emergentintegrations
    cd "$EC2_REPO/backend"
  elif [ -d "$BACKUP_REPO/backend/emergentintegrations" ]; then
    "$EC2_REPO/backend/.venv/bin/pip" install "$BACKUP_REPO/backend/emergentintegrations"
    echo "Installed emergentintegrations from backup"
  fi

  # Install rest of requirements (skip emergentintegrations line)
  grep -v "emergentintegrations" requirements.txt > /tmp/requirements_filtered.txt
  .venv/bin/pip install -r /tmp/requirements_filtered.txt
  echo "Backend deps installed"
fi

echo "Backend venv OK"
echo ""

echo "====== Rebuilding Frontend ======"
cd "$EC2_REPO/frontend"

if [ ! -f .env ]; then
  echo "frontend .env missing, creating minimal..."
  cat > .env << 'ENVEOF'
REACT_APP_BACKEND_URL=http://52.66.196.236
REACT_APP_WS_URL=ws://52.66.196.236
ENVEOF
fi

npm install --legacy-peer-deps
npm run build

echo "Syncing build to nginx root..."
sudo mkdir -p "$NGINX_ROOT"
sudo rsync -a --delete "$EC2_REPO/frontend/build/" "$NGINX_ROOT/"
echo "Frontend done"
echo ""

echo "====== Restarting Services ======"
sudo systemctl daemon-reload
sudo systemctl restart quantchat-backend
sleep 3
sudo systemctl restart nginx
sleep 2

echo ""
echo "====== Final Status ======"
sudo systemctl status quantchat-backend --no-pager | head -10
curl -s --max-time 5 http://127.0.0.1:8000/api/health && echo "" && echo "Backend HEALTHY"
curl -s --max-time 5 -o /dev/null -w "Nginx HTTP %{http_code}\n" http://127.0.0.1
echo ""
echo "Public check: curl http://52.66.196.236/api/health"
