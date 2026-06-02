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

| Suit     | Ranks                        | Count |
|----------|------------------------------|-------|
| Spades   | 6, 7, 8, 9, 10, J, Q, K, A  | 9     |
| Hearts   | 7, 8, 9, 10, J, Q, K, A     | 8     |
| Diamonds | 7, 8, 9, 10, J, Q, K, A     | 8     |
| Clubs    | 7, 8, 9, 10, J, Q, K, A     | 8     |

**Special rule:** The 6 of Spades is the Joker, labelled **"Жопа"**.

## Typecheck

```bash
npm run typecheck --workspaces --if-present
```
