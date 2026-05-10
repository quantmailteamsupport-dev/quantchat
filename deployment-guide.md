# QuantChat EC2 + Android Guide

## 1) AWS EC2 SSH

Example from your instance screen:

```bash
chmod 400 quantchat.pem
ssh -i "quantchat.pem" ubuntu@ec2-52-66-196-236.ap-south-1.compute.amazonaws.com
```

## 2) EC2 server setup

```bash
sudo apt update
sudo apt install -y nginx python3-pip python3-venv mongodb
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g yarn
```

## 3) App setup

```bash
git clone <your-repo>
cd <your-repo>
cd frontend && yarn install && yarn build && cd ..
cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && cd ..
```

## 4) Backend env

Create `backend/.env`:

```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=quantchat
JWT_SECRET=replace-with-strong-secret
FRONTEND_URL=http://YOUR_DOMAIN_OR_IP
EMERGENT_LLM_KEY=your-universal-key
```

## 5) Frontend env

Create `frontend/.env`:

```env
REACT_APP_BACKEND_URL=http://YOUR_DOMAIN_OR_IP
```

## 6) Run backend with supervisor/systemd

Important: keep backend on port `8001` and reverse proxy `/api` to it.

Example command:

```bash
cd backend
source .venv/bin/activate
uvicorn server:app --host 0.0.0.0 --port 8001
```

## 7) Nginx reverse proxy

Use same-origin setup so frontend and `/api` stay on one domain/IP.

```nginx
server {
    listen 80;
    server_name _;

    root /home/ubuntu/<your-repo>/frontend/build;
    index index.html;

    location / {
        try_files $uri /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8001/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:8001/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

Then:

```bash
sudo nginx -t
sudo systemctl restart nginx
```

## 8) Android / APK flow

The Android Capacitor project is already synced in `frontend/android`.

To build APK on a machine with Java + Android SDK installed:

```bash
cd frontend
yarn build
npx cap sync android
cd android
chmod +x gradlew
./gradlew assembleDebug
```

APK output path:

```bash
frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

## 9) Notes

- Keep frontend and backend under the same domain/IP for stable auth + assistant calls.
- AI assistant uses the Emergent universal LLM key.
- If reels feel slow on first open, keep the prefetch enabled and avoid disabling session storage.