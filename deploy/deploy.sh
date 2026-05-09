#!/bin/bash
# QuantChat Azure Deployment Script
# Run this on your Azure VM: bash deploy.sh

set -e

echo "========================================="
echo "  QuantChat - Azure Deployment"
echo "========================================="

# 1. Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "[1/5] Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
else
    echo "[1/5] Docker already installed"
fi

# 2. Install Docker Compose if not present
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "[2/5] Installing Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
else
    echo "[2/5] Docker Compose already installed"
fi

# 3. Stop existing containers
echo "[3/5] Stopping existing containers..."
sudo docker compose down 2>/dev/null || sudo docker-compose down 2>/dev/null || true

# 4. Build and start
echo "[4/5] Building and starting QuantChat..."
sudo docker compose up -d --build 2>/dev/null || sudo docker-compose up -d --build

# 5. Verify
echo "[5/5] Verifying deployment..."
sleep 10

if curl -s http://localhost/api/health | grep -q "ok"; then
    echo ""
    echo "========================================="
    echo "  QuantChat DEPLOYED SUCCESSFULLY!"
    echo "========================================="
    echo ""
    echo "  URL: http://20.249.208.224"
    echo ""
    echo "  Demo Login:"
    echo "    Email: arjun@quantchat.com"
    echo "    Password: Demo@1234"
    echo ""
    echo "  Admin Login:"
    echo "    Email: admin@quantchat.com"
    echo "    Password: QuantChat@2026"
    echo ""
    echo "========================================="
else
    echo "WARNING: Health check failed. Check logs:"
    echo "  sudo docker compose logs backend"
    echo "  sudo docker compose logs frontend"
fi
