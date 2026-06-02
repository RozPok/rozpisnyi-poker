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

const PORT          = process.env.PORT ?? 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';

// Grace period before a disconnected player is removed from their room.
const DISCONNECT_GRACE_MS = 60_000;

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
    const result = rooms.joinRoom(trimmedCode, stableId, trimmedName);
    if (typeof result === 'string') {
      callback({ ok: false, error: result });
      return;
    }
    socket.join(result.id);
    io.to(result.id).emit('room:updated', result);
    console.log(`[room] "${trimmedName}" joined ${result.code}`);
    callback({ ok: true, room: result });
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

    const sheet = generateGameSheet(room.players.length);
    sheet.scores = room.players.map(p => ({
      playerId: p.id,
      name: p.name,
      bids: new Array<number | null>(sheet.rounds.length).fill(null),
      scores: new Array<number | null>(sheet.rounds.length).fill(null),
      total: 0,
    }));

    room.status = 'in-progress';
    room.gameSheet = sheet;

    const { handsMap, activeRound } = game.dealRound(room);
    room.activeRound = activeRound;

    io.to(room.id).emit('room:updated', room);

    for (const player of room.players) {
      const hand = handsMap.get(player.id) ?? [];
      io.to(player.id).emit('hand:dealt', hand);
    }

    console.log(`[game] started in ${room.code} — ${sheet.rounds.length} rounds, ${activeRound.cardsPerPlayer} cards/player`);
    callback({ ok: true, room });
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
      const { nextHandsMap } = game.finishRound(room);
      io.to(room.id).emit('room:updated', room);
      if (nextHandsMap) {
        for (const player of room.players) {
          io.to(player.id).emit('hand:dealt', nextHandsMap.get(player.id) ?? []);
        }
      }
    } else {
      io.to(room.id).emit('room:updated', room);
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
