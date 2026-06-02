# Розписний Покер

Online multiplayer card game — monorepo.

## Structure

```
rozpisnyi-poker/
├── apps/
│   ├── client/          # React + TypeScript + Vite (port 5173)
│   └── server/          # Node.js + Express + Socket.io (port 3001)
└── packages/
    └── shared/          # Game types & card engine (shared by both apps)
```

## Prerequisites

- Node.js 20+
- npm 10+ (workspaces support)

## First-time setup

```bash
# Install all dependencies across all workspaces
npm install
```

## Development

Run everything simultaneously (recommended):

```bash
npm run dev
```

Or run each app individually in separate terminals:

```bash
# Terminal 1 — shared package (watch mode for type changes)
npm run dev -w packages/shared

# Terminal 2 — backend
npm run dev -w apps/server

# Terminal 3 — frontend
npm run dev -w apps/client
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Production build

```bash
npm run build
```

Artifacts:
- `apps/server/dist/` — compiled server (run with `node dist/index.js`)
- `apps/client/dist/` — static frontend (serve with any HTTP server)

## API

| Method | Path      | Response                |
|--------|-----------|-------------------------|
| GET    | `/health` | `{ "status": "ok" }` |

## Socket.io events

| Direction        | Event          | Payload                                              |
|------------------|----------------|------------------------------------------------------|
| client → server  | `room:create`  | `playerName: string` → callback `GameRoom`           |
| client → server  | `room:join`    | `{ roomId, playerName }` → callback `GameRoom\|null` |
| server → client  | `room:updated` | `GameRoom`                                           |
| server → client  | `game:error`   | `string`                                             |

## Card deck

The game uses a 33-card deck:

| Suit     | Ranks                    | Count |
|----------|--------------------------|-------|
| Spades   | 7, 8, 9, 10, J, Q, K, A | 8     |
| Hearts   | 7, 8, 9, 10, J, Q, K, A | 8     |
| Diamonds | 7, 8, 9, 10, J, Q, K, A | 8     |
| Clubs    | 7, 8, 9, 10, J, Q, K, A | 8     |
| —        | Joker (dedicated card)   | 1     |

**Special card:** A dedicated Joker card labelled **"Жопа"** (`suit: 'joker'`, `rank: 'joker'`).

## Deployment (Render)

### Backend — Web Service

| Setting       | Value                                                                 |
|---------------|-----------------------------------------------------------------------|
| Root dir      | `apps/server`                                                         |
| Build command | `npm install --prefix ../.. && npm run build -w packages/shared && npm run build` |
| Start command | `npm start`                                                           |
| Node version  | 20                                                                    |

**Environment variables:**

| Variable        | Description                                          | Example                          |
|-----------------|------------------------------------------------------|----------------------------------|
| `PORT`          | Port Render assigns automatically                    | set by Render                    |
| `CLIENT_ORIGIN` | Exact URL of the deployed frontend (no trailing `/`) | `https://rozpisnyi-poker.onrender.com` |

> CORS is restricted to `CLIENT_ORIGIN`. Without it the server falls back to `http://localhost:5173` (development only).

### Frontend — Static Site

| Setting       | Value                                                          |
|---------------|----------------------------------------------------------------|
| Root dir      | `apps/client`                                                  |
| Build command | `npm install --prefix ../.. && npm run build -w packages/shared && npm run build` |
| Publish dir   | `apps/client/dist`                                             |

**Environment variables:**

| Variable       | Description                  | Example                                    |
|----------------|------------------------------|--------------------------------------------|
| `VITE_SERVER_URL` | URL of the deployed backend | `https://rozpisnyi-poker-api.onrender.com` |

Update `apps/client/src/socket.ts` to read this variable:
```ts
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';
export const socket = io(SERVER_URL, { autoConnect: false });
```

## Typecheck

```bash
npm run typecheck --workspaces --if-present
```
