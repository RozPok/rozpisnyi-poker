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
  console.log(`[+] ${socket.id}`);

  // ── room:create ─────────────────────────────────────────────────────────────
  socket.on('room:create', (playerName, callback) => {
    const trimmed = playerName.trim();
    if (!trimmed) {
      callback({ ok: false, error: "Ім'я не може бути порожнім" });
      return;
    }
    if (rooms.getRoomByPlayerId(socket.id)) {
      callback({ ok: false, error: 'Ви вже перебуваєте в кімнаті' });
      return;
    }
    const room = rooms.createRoom(socket.id, trimmed);
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
    const result = rooms.joinRoom(trimmedCode, socket.id, trimmedName);
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
    const current = rooms.getRoomByPlayerId(socket.id);
    if (current) {
      const roomId = current.id;
      const { room } = rooms.leaveRoom(socket.id);
      socket.leave(roomId);
      if (room) io.to(roomId).emit('room:updated', room);
      console.log(`[room] ${socket.id} left ${current.code}`);
    }
    callback();
  });

  // ── game:start ──────────────────────────────────────────────────────────────
  socket.on('game:start', callback => {
    const room = rooms.getRoomByPlayerId(socket.id);
    if (!room) {
      callback({ ok: false, error: 'Кімнату не знайдено' });
      return;
    }
    if (room.ownerId !== socket.id) {
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
    const room = rooms.getRoomByPlayerId(socket.id);
    if (!room) {
      callback({ ok: false, error: 'Кімнату не знайдено' });
      return;
    }
    const result = game.placeBid(room, socket.id, tricks, isDark);
    if (result.ok) {
      io.to(room.id).emit('room:updated', room);
    }
    callback(result);
  });

  // ── card:play ───────────────────────────────────────────────────────────────
  socket.on('card:play', (card, declaration, callback) => {
    const room = rooms.getRoomByPlayerId(socket.id);
    if (!room) {
      callback({ ok: false, error: 'Кімнату не знайдено' });
      return;
    }
    const result = game.playCard(room, socket.id, card, declaration);
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
    console.log(`[-] ${socket.id}`);
    const current = rooms.getRoomByPlayerId(socket.id);
    if (current) {
      const roomId = current.id;
      const { room } = rooms.leaveRoom(socket.id);
      if (room) io.to(roomId).emit('room:updated', room);
    }
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`Server  http://localhost:${PORT}`);
});
