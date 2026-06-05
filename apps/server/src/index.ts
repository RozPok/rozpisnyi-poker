import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import {
  ROOM_MIN_PLAYERS,
  generateGameSheet,
} from '@rozpisnyi-poker/shared';
import type { ClientToServerEvents, ServerToClientEvents } from '@rozpisnyi-poker/shared';
import * as rooms from './rooms';
import * as game from './game';
import { scheduleBotAction } from './bots.js';

const PORT          = process.env.PORT ?? 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';

// Grace period before a disconnected player is removed from their room.
// 10 minutes covers mobile browser suspension and Render free-tier cold starts.
const DISCONNECT_GRACE_MS = 600_000;

// How long (ms) to hold the completed-round state visible before calling finishRound.
// Clients display the last trick for 3 s; the extra 200 ms ensures the server
// advances only after every client's display window has closed.
const TRICK_REVEAL_MS = 3_200;

// ─── Express ──────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ─── Socket.io ────────────────────────────────────────────────────────────────

const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
});

io.on('connection', socket => {
  // Stable player ID supplied by the client via socket auth (persisted in localStorage).
  // Falls back to socket.id for clients that don't supply one (e.g. old versions).
  const auth = socket.handshake.auth as Record<string, unknown>;
  const stableId: string =
    typeof auth.playerId === 'string' && auth.playerId.length > 0
      ? auth.playerId
      : socket.id;

  console.log(`[+] ${socket.id} (player ${stableId})`);

  // Every socket joins a private room named after its stableId so we can
  // send hand:dealt to a specific player via io.to(stableId).emit(...)
  // regardless of which socket.id is currently connected.
  socket.join(stableId);

  // ── room:create ─────────────────────────────────────────────────────────────
  socket.on('room:create', (playerName, callback) => {
    const trimmed = playerName.trim();
    if (!trimmed) {
      callback({ ok: false, error: "Ім'я не може бути порожнім" });
      return;
    }
    if (rooms.getRoomByPlayerId(stableId)) {
      callback({ ok: false, error: 'Ви вже перебуваєте в кімнаті' });
      return;
    }
    const room = rooms.createRoom(stableId, trimmed);
    socket.join(room.id);
    console.log(`[room] created ${room.code} by "${trimmed}"`);
    callback({ ok: true, room });
  });

  // ── room:join ───────────────────────────────────────────────────────────────
  socket.on('room:join', ({ code, playerName }, callback) => {
    const trimmedName = playerName.trim();
    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedName || !trimmedCode) {
      callback({ ok: false, error: 'Заповніть всі поля' });
      return;
    }

    // Try regular lobby join first (status === 'waiting')
    const result = rooms.joinRoom(trimmedCode, stableId, trimmedName);
    if (typeof result !== 'string') {
      socket.join(result.id);
      io.to(result.id).emit('room:updated', result);
      console.log(`[room] "${trimmedName}" joined ${result.code}`);
      callback({ ok: true, room: result });
      return;
    }

    // Regular join failed — if game is in-progress with a vacant seat, try a takeover
    if (result === 'Гра вже розпочата') {
      const inProgress = rooms.joinInProgressRoom(trimmedCode, stableId, trimmedName);
      if (typeof inProgress === 'string') {
        callback({ ok: false, error: inProgress });
        return;
      }

      game.transferPlayerState(
        inProgress.room.id,
        inProgress.vacatedPlayerId,
        stableId,
        trimmedName,
        inProgress.room,
      );

      socket.join(inProgress.room.id);
      io.to(inProgress.room.id).emit('room:updated', inProgress.room);
      callback({ ok: true, room: inProgress.room });

      // Send current hand to the replacement player
      const hand = game.getHand(inProgress.room.id, stableId) ?? [];
      io.to(stableId).emit('hand:dealt', hand);

      console.log(
        `[room] "${trimmedName}" took vacant seat (was ${inProgress.vacatedPlayerId}) in ${trimmedCode}`,
      );
      return;
    }

    callback({ ok: false, error: result });
  });

  // ── room:leave ──────────────────────────────────────────────────────────────
  socket.on('room:leave', callback => {
    const current = rooms.getRoomByPlayerId(stableId);
    if (current) {
      const roomId = current.id;
      const { room } = rooms.leaveRoom(stableId);
      socket.leave(roomId);
      if (room) io.to(roomId).emit('room:updated', room);
      console.log(`[room] ${stableId} left ${current.code}`);
    }
    callback();
  });

  // ── room:reconnect ──────────────────────────────────────────────────────────
  socket.on('room:reconnect', ({ roomCode, playerName }, callback) => {
    const result = rooms.reconnectPlayer(roomCode, stableId, playerName);
    if (typeof result === 'string') {
      callback({ ok: false, error: result });
      return;
    }

    // Rejoin socket.io room so this socket receives future broadcasts.
    socket.join(result.id);

    // Re-send the current hand so the player can continue playing.
    const hand = game.getHand(result.id, stableId) ?? [];

    // Broadcast updated room (isConnected restored) to all players.
    io.to(result.id).emit('room:updated', result);

    console.log(`[room] ${stableId} reconnected to ${result.code}`);
    callback({ ok: true, room: result, hand });
  });

  // ── testlab:create ──────────────────────────────────────────────────────────
  socket.on('testlab:create', ({ playerName, playerCount, roundType, cardsPerPlayer, label }, callback) => {
    const trimmed = playerName.trim();
    if (!trimmed) {
      callback({ ok: false, error: "Ім'я не може бути порожнім" });
      return;
    }
    if (rooms.getRoomByPlayerId(stableId)) {
      callback({ ok: false, error: 'Ви вже перебуваєте в кімнаті' });
      return;
    }
    const room = rooms.createTestRoom(stableId, trimmed, playerCount, { type: roundType, cardsPerPlayer, label });
    socket.join(room.id);
    console.log(`[testlab] created ${room.code} by "${trimmed}" (${playerCount}p, ${label})`);
    callback({ ok: true, room });
  });

  // ── testlab:add-bot ─────────────────────────────────────────────────────────
  socket.on('testlab:add-bot', callback => {
    const room = rooms.getRoomByPlayerId(stableId);
    if (!room) { callback({ ok: false, error: 'Кімнату не знайдено' }); return; }
    const result = rooms.addBotToRoom(room.id);
    if (typeof result === 'string') { callback({ ok: false, error: result }); return; }
    io.to(room.id).emit('room:updated', result);
    callback({ ok: true, room: result });
  });

  // ── testlab:fill-bots ───────────────────────────────────────────────────────
  socket.on('testlab:fill-bots', callback => {
    const room = rooms.getRoomByPlayerId(stableId);
    if (!room) { callback({ ok: false, error: 'Кімнату не знайдено' }); return; }
    const result = rooms.fillBotsInRoom(room.id);
    if (typeof result === 'string') { callback({ ok: false, error: result }); return; }
    io.to(room.id).emit('room:updated', result);
    callback({ ok: true, room: result });
  });

  // ── game:start ──────────────────────────────────────────────────────────────
  socket.on('game:start', callback => {
    const room = rooms.getRoomByPlayerId(stableId);
    if (!room) {
      callback({ ok: false, error: 'Кімнату не знайдено' });
      return;
    }
    if (room.ownerId !== stableId) {
      callback({ ok: false, error: 'Тільки власник може розпочати гру' });
      return;
    }
    if (room.status !== 'waiting') {
      callback({ ok: false, error: 'Гра вже розпочата' });
      return;
    }
    if (room.players.length < ROOM_MIN_PLAYERS) {
      callback({ ok: false, error: `Потрібно мінімум ${ROOM_MIN_PLAYERS} гравців` });
      return;
    }

    const sheet = (() => {
      if (room.mode === 'test' && room.testRound) {
        const tr = room.testRound;
        return {
          rounds: [{ index: 0, type: tr.type, cardsPerPlayer: tr.cardsPerPlayer, label: tr.label }],
          scores: room.players.map(p => ({
            playerId: p.id,
            name: p.name,
            bids: new Array<number | null>(1).fill(null),
            scores: new Array<number | null>(1).fill(null),
            total: 0,
          })),
          currentRoundIndex: 0,
        };
      }
      const s = generateGameSheet(room.players.length);
      s.scores = room.players.map(p => ({
        playerId: p.id,
        name: p.name,
        bids: new Array<number | null>(s.rounds.length).fill(null),
        scores: new Array<number | null>(s.rounds.length).fill(null),
        total: 0,
      }));
      return s;
    })();

    room.status = 'in-progress';
    room.gameSheet = sheet;

    const { handsMap, activeRound } = game.dealRound(room);
    room.activeRound = activeRound;

    io.to(room.id).emit('room:updated', room);

    for (const player of room.players) {
      if (!player.isBot) {
        const hand = handsMap.get(player.id) ?? [];
        io.to(player.id).emit('hand:dealt', hand);
      }
    }

    console.log(`[game] started in ${room.code} — ${sheet.rounds.length} rounds, ${activeRound.cardsPerPlayer} cards/player${room.mode === 'test' ? ' [test]' : ''}`);
    callback({ ok: true, room });
    scheduleBotAction(room, io);
  });

  // ── bid:submit ──────────────────────────────────────────────────────────────
  socket.on('bid:submit', (tricks, isDark, callback) => {
    const room = rooms.getRoomByPlayerId(stableId);
    if (!room) {
      callback({ ok: false, error: 'Кімнату не знайдено' });
      return;
    }
    const result = game.placeBid(room, stableId, tricks, isDark);
    if (result.ok) {
      io.to(room.id).emit('room:updated', room);
      scheduleBotAction(room, io);
    }
    callback(result);
  });

  // ── card:play ───────────────────────────────────────────────────────────────
  socket.on('card:play', (card, declaration, callback) => {
    const room = rooms.getRoomByPlayerId(stableId);
    if (!room) {
      callback({ ok: false, error: 'Кімнату не знайдено' });
      return;
    }
    const result = game.playCard(room, stableId, card, declaration);
    if (!result.ok) {
      callback(result);
      return;
    }

    // Acknowledge before emitting room events so the client's onCardPlayed
    // callback (which removes the card from the local hand) fires before
    // hand:dealt arrives — otherwise hand:dealt sets the new hand and
    // onCardPlayed immediately strips one card from it.
    callback(result);

    if (room.activeRound?.isComplete) {
      // Broadcast the completed-round state first so every client can display
      // the last trick for TRICK_REVEAL_MS before the next round begins.
      // The room is in a valid (isComplete=true) state — no further card plays
      // are accepted, so there is no race condition during the delay.
      io.to(room.id).emit('room:updated', room);

      setTimeout(() => {
        if (!room.activeRound?.isComplete) return; // guard: already processed
        const { nextHandsMap } = game.finishRound(room);
        io.to(room.id).emit('room:updated', room);
        if (nextHandsMap) {
          for (const player of room.players) {
            if (!player.isBot) {
              io.to(player.id).emit('hand:dealt', nextHandsMap.get(player.id) ?? []);
            }
          }
          scheduleBotAction(room, io);
        }
      }, TRICK_REVEAL_MS);
    } else {
      io.to(room.id).emit('room:updated', room);
      scheduleBotAction(room, io);
    }
  });

  // ── disconnect ──────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[-] ${socket.id} (player ${stableId})`);
    const current = rooms.getRoomByPlayerId(stableId);
    if (!current) return;

    const roomId = current.id;
    const updated = rooms.markDisconnected(stableId);
    if (updated) io.to(roomId).emit('room:updated', updated);

    // Schedule removal after grace period so a brief mobile suspension
    // or page refresh does not kick the player from the game.
    const timer = setTimeout(() => {
      const { room } = rooms.leaveRoom(stableId);
      if (room) io.to(roomId).emit('room:updated', room);
      console.log(`[room] ${stableId} removed after grace period from ${current.code}`);
    }, DISCONNECT_GRACE_MS);

    rooms.setDisconnectTimer(stableId, timer);
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`Server  http://localhost:${PORT}`);
});
