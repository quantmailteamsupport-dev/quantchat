#!/usr/bin/env bash
set -euo pipefail

APP_DIR=${APP_DIR:-/home/ubuntu/quantchat}
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"
VENV_DIR="$BACKEND_DIR/.venv"
STATIC_DIR=${STATIC_DIR:-/var/www/quantchat/build}
BACKUP_DIR=${BACKUP_DIR:-/home/ubuntu/quantchat_backup_}
PUBLIC_APP_URL=${PUBLIC_APP_URL:-http://52.66.196.236}

echo "[1/8] Installing system packages"
sudo apt-get update
sudo apt-get install -y python3 python3-venv python3-pip nginx curl git rsync

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "[2/8] Preparing app directory"
test -d "$APP_DIR"
sudo mkdir -p "$STATIC_DIR"
sudo chown -R "$USER":"$USER" "$STATIC_DIR"

echo "[3/8] Validating required files"
test -f "$BACKEND_DIR/requirements.txt"
test -f "$BACKEND_DIR/server.py"
test -f "$FRONTEND_DIR/package.json"

if [[ ! -f "$BACKEND_DIR/.env" ]]; then
  echo "Backend .env missing, restoring from backup"
  cp "$BACKUP_DIR/backend/.env" "$BACKEND_DIR/.env"
fi

if [[ ! -f "$FRONTEND_DIR/.env" ]]; then
  cat > "$FRONTEND_DIR/.env" <<EOF
REACT_APP_BACKEND_URL=$PUBLIC_APP_URL
REACT_APP_NATIVE_BACKEND_URL=$PUBLIC_APP_URL
EOF
fi

if [[ ! -d "$BACKEND_DIR/emergentintegrations" && -d "$BACKUP_DIR/backend/emergentintegrations" ]]; then
  echo "Restoring local emergentintegrations runtime"
  cp -R "$BACKUP_DIR/backend/emergentintegrations" "$BACKEND_DIR/"
fi

echo "[4/8] Installing backend dependencies"
python3 -m venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"
pip install --upgrade pip
grep -v '^# Optional at runtime' "$BACKEND_DIR/requirements.txt" > /tmp/quantchat-requirements.txt
pip install -r /tmp/quantchat-requirements.txt

echo "[5/8] Building frontend"
cd "$FRONTEND_DIR"
npm install --legacy-peer-deps
npm run build
rsync -a --delete "$FRONTEND_DIR/build/" "$STATIC_DIR/"

echo "[6/8] Installing systemd service"
sudo cp "$APP_DIR/deploy/quantchat-backend.service" /etc/systemd/system/quantchat-backend.service
sudo sed -i "s|__APP_DIR__|$APP_DIR|g" /etc/systemd/system/quantchat-backend.service
sudo systemctl daemon-reload
sudo systemctl enable quantchat-backend
sudo systemctl restart quantchat-backend

echo "[7/8] Installing nginx config"
sudo cp "$APP_DIR/deploy/quantchat-nginx.conf" /etc/nginx/sites-available/quantchat
sudo sed -i "s|__APP_DIR__|$APP_DIR|g" /etc/nginx/sites-available/quantchat
sudo sed -i "s|__STATIC_DIR__|$STATIC_DIR|g" /etc/nginx/sites-available/quantchat
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/quantchat /etc/nginx/sites-enabled/quantchat
sudo nginx -t
sudo systemctl restart nginx

echo "[8/8] Health check"
sleep 3
curl -f http://127.0.0.1:8000/api/health
echo
echo "QuantChat deploy script completed."
