# Deploying `graphic-ui` as a second instance

Run the experimental **graphic-ui** branch alongside stable **master** on the same
server, fully isolated: its own folder, port, PM2 process, stats file, and domain.
Nothing here touches production — `master` keeps running untouched.

| Aspect        | master (production)              | graphic-ui (experimental)                       |
|---------------|----------------------------------|-------------------------------------------------|
| Folder        | `/var/www/rozpisnyi`             | `/var/www/rozpisnyi-graphic`                     |
| Backend port  | `3001` (default)                 | `3002` (`PORT=3002`)                             |
| PM2 process   | `rozpisnyi-api`                  | `rozpisnyi-graphic-api`                          |
| Stats file    | default `apps/server/data/player-stats.json` | `STATS_FILE=.../data/player-stats-graphic.json` |
| Domain        | `rozpisnyi.example.com`          | `graphic.example.com`                            |

The two instances never share state: separate folders, separate `STATS_FILE`.

---

## 1. Separate folder

Clone the repo again (or add a second worktree) and check out `graphic-ui`:

```bash
git clone <repo-url> /var/www/rozpisnyi-graphic
cd /var/www/rozpisnyi-graphic
git checkout graphic-ui

npm install
```

## 2. Build

Build the client pointing at the graphic backend, then build the server:

```bash
# Frontend must know the graphic backend URL at build time
VITE_SERVER_URL=https://graphic.example.com npm run build -w packages/shared
VITE_SERVER_URL=https://graphic.example.com npm run build -w apps/client

# Backend
npm run build -w apps/server
```

(`npm run build` builds everything; the `VITE_SERVER_URL` above only matters for the client bundle.)

## 3. Separate port + stats file + PM2 process

Start the backend under its own PM2 name with the isolating env vars:

```bash
cd /var/www/rozpisnyi-graphic/apps/server

PORT=3002 \
STATS_FILE=/var/www/rozpisnyi-graphic/apps/server/data/player-stats-graphic.json \
CLIENT_ORIGIN=https://graphic.example.com \
pm2 start dist/index.js --name rozpisnyi-graphic-api

pm2 save
```

Environment variables:

| Variable        | Value                                                                 | Purpose                                  |
|-----------------|-----------------------------------------------------------------------|------------------------------------------|
| `PORT`          | `3002`                                                                | Second backend port (default is 3001)    |
| `STATS_FILE`    | `/var/www/rozpisnyi-graphic/apps/server/data/player-stats-graphic.json` | Separate leaderboard storage           |
| `CLIENT_ORIGIN` | `https://graphic.example.com`                                         | CORS allow-list for the graphic frontend |

> The graphic instance gets its **own** leaderboard. Because `STATS_FILE` is separate,
> its player stats never mix with production.

## 4. Separate Nginx domain

Add a server block for `graphic.example.com` that serves the graphic client build
and proxies Socket.io/API traffic to port **3002**:

```nginx
server {
    listen 80;
    server_name graphic.example.com;

    # Static frontend (graphic build)
    root /var/www/rozpisnyi-graphic/apps/client/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend: Socket.io + health/API → graphic instance on :3002
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    location /health {
        proxy_pass http://127.0.0.1:3002;
    }
}
```

Enable and reload:

```bash
ln -s /etc/nginx/sites-available/graphic.example.com /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

Add TLS afterwards (e.g. `certbot --nginx -d graphic.example.com`).

## 5. Verify

```bash
pm2 list                       # rozpisnyi-graphic-api is online on :3002
curl https://graphic.example.com/health   # {"status":"ok"}
```

Open `https://graphic.example.com` — it talks to the `:3002` backend and writes to
`player-stats-graphic.json`, leaving production on `master` completely unaffected.

## Updating the graphic instance

```bash
cd /var/www/rozpisnyi-graphic
git pull
git checkout graphic-ui
npm install
VITE_SERVER_URL=https://graphic.example.com npm run build
pm2 restart rozpisnyi-graphic-api
```
