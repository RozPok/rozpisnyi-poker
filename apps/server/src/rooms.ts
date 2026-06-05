import { randomUUID } from 'crypto';
import { ROOM_MAX_PLAYERS } from '@rozpisnyi-poker/shared';
import type { GameRoom, RoomPlayer, RoundType } from '@rozpisnyi-poker/shared';

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
    mode: 'normal',
  };
  byId.set(room.id, room);
  byCode.set(code, room.id);
  playerRoom.set(ownerId, room.id);
  return room;
}

export function createTestRoom(
  ownerId: string,
  ownerName: string,
  playerCount: number,
  testRound: { type: RoundType; cardsPerPlayer: number; label: string },
): GameRoom {
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
    mode: 'test',
    testRound,
    testPlayerCount: playerCount,
  };
  byId.set(room.id, room);
  byCode.set(code, room.id);
  playerRoom.set(ownerId, room.id);
  return room;
}

export function addBotToRoom(roomId: string): GameRoom | string {
  const room = byId.get(roomId);
  if (!room) return 'Кімнату не знайдено';
  if (room.mode !== 'test') return 'Боти доступні лише в тестовому режимі';
  if (room.status !== 'waiting') return 'Гра вже розпочата';
  const targetCount = room.testPlayerCount ?? ROOM_MAX_PLAYERS;
  if (room.players.length >= targetCount) return 'Кімната вже заповнена';

  const botCount = room.players.filter(p => p.isBot).length;
  const bot: RoomPlayer = {
    id: `bot-${randomUUID().replace(/-/g, '')}`,
    name: `🤖 Бот ${botCount + 1}`,
    isConnected: true,
    isBot: true,
  };
  room.players.push(bot);
  return room;
}

export function fillBotsInRoom(roomId: string): GameRoom | string {
  const room = byId.get(roomId);
  if (!room) return 'Кімнату не знайдено';
  if (room.mode !== 'test') return 'Боти доступні лише в тестовому режимі';
  if (room.status !== 'waiting') return 'Гра вже розпочата';

  const targetCount = room.testPlayerCount ?? ROOM_MAX_PLAYERS;
  while (room.players.length < targetCount) {
    const result = addBotToRoom(roomId);
    if (typeof result === 'string') return result;
  }
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

  // During an active game, vacate the seat rather than removing it so the
  // slot can be reclaimed by the original player (room:reconnect) or taken
  // by a new player (joinInProgressRoom / room:join).
  if (room.status === 'in-progress') {
    const player = room.players.find(p => p.id === playerId);
    if (player) {
      player.isConnected = false;
      player.isVacant    = true;   // explicit leave — seat is now replaceable
    }
    // Remove mapping so original player must go through room:join or room:reconnect.
    playerRoom.delete(playerId);
    return { roomId, room };
  }

  // Waiting lobby or finished: remove player entirely.
  room.players = room.players.filter(p => p.id !== playerId);
  playerRoom.delete(playerId);

  if (room.players.length === 0) {
    byId.delete(roomId);
    byCode.delete(room.code);
    return { roomId, room: null };
  }

  if (room.ownerId === playerId) {
    room.ownerId = room.players[0]!.id;
  }

  return { roomId, room };
}

/**
 * Let a new player take over a vacant seat in an already-started game.
 * Prefers a seat whose existing ID matches newPlayerId (same device reconnect).
 * The caller must also invoke game.transferPlayerState() to migrate hand / round state.
 * Returns the room and the old player ID whose seat was taken, or an error string.
 */
export function joinInProgressRoom(
  code: string,
  newPlayerId: string,
  newPlayerName: string,
): { room: GameRoom; vacatedPlayerId: string } | string {
  const roomId = byCode.get(code.toUpperCase().trim());
  if (!roomId) return 'Кімнату не знайдено';

  const room = byId.get(roomId);
  if (!room) return 'Кімнату не знайдено';
  if (room.status !== 'in-progress') return 'Гра ще не почалась';

  if (playerRoom.has(newPlayerId)) {
    return playerRoom.get(newPlayerId) === roomId
      ? 'Ви вже в цій кімнаті'
      : 'Ви вже перебуваєте в кімнаті';
  }

  // Only seats explicitly vacated (isVacant=true) are replaceable.
  // Temporarily-disconnected seats (TCP drop / grace period) have
  // isConnected=false but isVacant=false and must NOT be replaced.
  //
  // Prefer the seat whose ID matches the joining player (same-device reconnect);
  // fall back to any other vacant seat.
  const vacantPlayer =
    room.players.find(p => p.id === newPlayerId && p.isVacant === true) ??
    room.players.find(p => p.isVacant === true);

  if (!vacantPlayer) return 'Гра вже почалась і вільних місць немає';

  const vacatedPlayerId = vacantPlayer.id;
  cancelDisconnectTimer(vacatedPlayerId);
  playerRoom.delete(vacatedPlayerId);

  vacantPlayer.id          = newPlayerId;
  vacantPlayer.name        = newPlayerName;
  vacantPlayer.isConnected = true;
  vacantPlayer.isVacant    = false;
  playerRoom.set(newPlayerId, roomId);

  return { room, vacatedPlayerId };
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
  player.isVacant    = false;  // reclaiming the seat — no longer replaceable

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
  return { id, name, isConnected: true, isVacant: false };
}
