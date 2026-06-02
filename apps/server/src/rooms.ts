import { randomUUID } from 'crypto';
import { ROOM_MAX_PLAYERS } from '@rozpisnyi-poker/shared';
import type { GameRoom, RoomPlayer } from '@rozpisnyi-poker/shared';

// ─── Code generation ─────────────────────────────────────────────────────────

// Omits ambiguous chars (I, O, 0, 1) so codes are easy to read aloud
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;

function generateCode(): string {
  let code: string;
  do {
    code = Array.from(
      { length: CODE_LEN },
      () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)],
    ).join('');
  } while (byCode.has(code));
  return code;
}

// ─── In-memory store ─────────────────────────────────────────────────────────

const byId = new Map<string, GameRoom>();
const byCode = new Map<string, string>();     // code  → roomId
const playerRoom = new Map<string, string>(); // socketId → roomId

// ─── Public API ───────────────────────────────────────────────────────────────

export function createRoom(ownerId: string, ownerName: string): GameRoom {
  const code = generateCode();
  const room: GameRoom = {
    id: randomUUID(),
    code,
    ownerId,
    players: [makePlayer(ownerId, ownerName)],
    status: 'waiting',
    gameSheet: null,
    activeRound: null,
    createdAt: Date.now(),
  };
  byId.set(room.id, room);
  byCode.set(code, room.id);
  playerRoom.set(ownerId, room.id);
  return room;
}

export function joinRoom(
  code: string,
  playerId: string,
  playerName: string,
): GameRoom | string {
  const roomId = byCode.get(code.toUpperCase().trim());
  if (!roomId) return 'Кімнату не знайдено';

  const room = byId.get(roomId);
  if (!room) return 'Кімнату не знайдено';

  if (room.status !== 'waiting') return 'Гра вже розпочата';
  if (room.players.length >= ROOM_MAX_PLAYERS) return 'Кімната заповнена (максимум 8 гравців)';
  if (playerRoom.has(playerId)) return 'Ви вже перебуваєте в кімнаті';

  room.players.push(makePlayer(playerId, playerName));
  playerRoom.set(playerId, room.id);
  return room;
}

export function leaveRoom(playerId: string): { roomId: string; room: GameRoom | null } {
  const roomId = playerRoom.get(playerId);
  if (!roomId) return { roomId: '', room: null };

  const room = byId.get(roomId);
  if (!room) {
    playerRoom.delete(playerId);
    return { roomId, room: null };
  }

  room.players = room.players.filter(p => p.id !== playerId);
  playerRoom.delete(playerId);

  if (room.players.length === 0) {
    byId.delete(roomId);
    byCode.delete(room.code);
    return { roomId, room: null };
  }

  // Transfer ownership when the owner leaves
  if (room.ownerId === playerId) {
    room.ownerId = room.players[0].id;
  }

  return { roomId, room };
}

export function getRoomByPlayerId(playerId: string): GameRoom | undefined {
  const roomId = playerRoom.get(playerId);
  return roomId ? byId.get(roomId) : undefined;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePlayer(id: string, name: string): RoomPlayer {
  return { id, name, isConnected: true };
}
