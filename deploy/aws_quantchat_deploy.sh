#!/usr/bin/env bash
set -euo pipefail

APP_DIR=${APP_DIR:-/var/www/quantchat}
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"
VENV_DIR="$BACKEND_DIR/.venv"

echo "[1/8] Installing system packages"
sudo apt-get update
sudo apt-get install -y python3 python3-venv python3-pip nginx curl git

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

if ! command -v yarn >/dev/null 2>&1; then
  sudo npm install -g yarn
fi

echo "[2/8] Preparing app directory"
sudo mkdir -p "$APP_DIR"
sudo chown -R "$USER":"$USER" "$APP_DIR"

echo "[3/8] Validating required files"
test -f "$BACKEND_DIR/requirements.txt"
test -f "$BACKEND_DIR/server.py"
test -f "$BACKEND_DIR/.env"
test -f "$FRONTEND_DIR/package.json"
test -f "$FRONTEND_DIR/.env"

echo "[4/8] Installing backend dependencies"
python3 -m venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"
pip install --upgrade pip
pip install -r "$BACKEND_DIR/requirements.txt"

echo "[5/8] Building frontend"
cd "$FRONTEND_DIR"
yarn install --frozen-lockfile || yarn install
yarn build

echo "[6/8] Installing systemd service"
sudo cp "$APP_DIR/deploy/quantchat-backend.service" /etc/systemd/system/quantchat-backend.service
sudo sed -i "s|__APP_DIR__|$APP_DIR|g" /etc/systemd/system/quantchat-backend.service
sudo systemctl daemon-reload
sudo systemctl enable quantchat-backend
sudo systemctl restart quantchat-backend

echo "[7/8] Installing nginx config"
sudo cp "$APP_DIR/deploy/quantchat-nginx.conf" /etc/nginx/sites-available/quantchat
sudo sed -i "s|__APP_DIR__|$APP_DIR|g" /etc/nginx/sites-available/quantchat
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/quantchat /etc/nginx/sites-enabled/quantchat
sudo nginx -t
sudo systemctl restart nginx

echo "[8/8] Health check"
sleep 3
curl -f http://127.0.0.1:8001/api/health
echo
echo "QuantChat deploy script completed."