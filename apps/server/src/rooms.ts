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
const byCode = new Map<string, string>();       // roomCode  → roomId
const playerRoom = new Map<string, string>();   // stablePlayerId → roomId
const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>(); // stablePlayerId → timer

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
  cancelDisconnectTimer(playerId);

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
    room.ownerId = room.players[0]!.id;
  }

  return { roomId, room };
}

export function getRoomByPlayerId(playerId: string): GameRoom | undefined {
  const roomId = playerRoom.get(playerId);
  return roomId ? byId.get(roomId) : undefined;
}

// ─── Reconnect / grace-period disconnect ─────────────────────────────────────

/**
 * Mark a player as disconnected (sets isConnected = false) without removing
 * them from the room. Returns the room for broadcasting, or null if not found.
 */
export function markDisconnected(playerId: string): GameRoom | null {
  const roomId = playerRoom.get(playerId);
  if (!roomId) return null;
  const room = byId.get(roomId);
  if (!room) return null;
  const player = room.players.find(p => p.id === playerId);
  if (player) player.isConnected = false;
  return room;
}

/**
 * Store a timer that will remove the player after the grace period.
 * Should be called after markDisconnected.
 */
export function setDisconnectTimer(
  playerId: string,
  timer: ReturnType<typeof setTimeout>,
): void {
  const existing = disconnectTimers.get(playerId);
  if (existing) clearTimeout(existing);
  disconnectTimers.set(playerId, timer);
}

/**
 * Cancel the pending removal timer for a player.
 * Returns true if a timer was cancelled, false otherwise.
 */
export function cancelDisconnectTimer(playerId: string): boolean {
  const timer = disconnectTimers.get(playerId);
  if (!timer) return false;
  clearTimeout(timer);
  disconnectTimers.delete(playerId);
  return true;
}

/**
 * Reconnect an existing player to a room they were previously in.
 * - Cancels any pending removal timer.
 * - Marks the player as connected.
 * - Does NOT add a duplicate player.
 * Returns the room on success, or an error string.
 */
export function reconnectPlayer(
  roomCode: string,
  playerId: string,
  _playerName: string,
): GameRoom | string {
  const roomId = byCode.get(roomCode.toUpperCase().trim());
  if (!roomId) return 'Кімнату не знайдено';

  const room = byId.get(roomId);
  if (!room) return 'Кімнату не знайдено';

  const player = room.players.find(p => p.id === playerId);
  if (!player) return 'Гравця не знайдено в кімнаті';

  cancelDisconnectTimer(playerId);
  player.isConnected = true;

  // Ensure playerRoom mapping is intact (may have been cleared by an expired timer)
  playerRoom.set(playerId, roomId);

  return room;
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

/** Clear all in-memory state. Only for use in tests. */
export function _reset(): void {
  byId.clear();
  byCode.clear();
  playerRoom.clear();
  disconnectTimers.forEach(t => clearTimeout(t));
  disconnectTimers.clear();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePlayer(id: string, name: string): RoomPlayer {
  return { id, name, isConnected: true };
}
