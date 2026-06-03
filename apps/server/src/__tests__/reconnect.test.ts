import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { GameRoom } from '@rozpisnyi-poker/shared';
import * as rooms from '../rooms';
import { dealRound, getHand, transferPlayerState, _clearHandsForTest } from '../game';

const GRACE_MS = 600_000; // 10 minutes — must match DISCONNECT_GRACE_MS in index.ts

beforeEach(() => {
  rooms._reset();
  _clearHandsForTest();
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Create a minimal in-progress room with N connected players and dealt hands.
 * The room is NOT registered in the rooms module — useful for game.ts unit tests.
 */
function makeInProgressRoom(playerIds: string[]): GameRoom {
  const players = playerIds.map(id => ({ id, name: id, isConnected: true }));
  const room: GameRoom = {
    id: `room-${playerIds.join('-')}`,
    code: 'TCODE1',
    ownerId: playerIds[0]!,
    players,
    status: 'in-progress',
    gameSheet: {
      rounds: [{ index: 0, type: 'normal', cardsPerPlayer: 5, label: '5' }],
      scores: players.map(p => ({
        playerId: p.id, name: p.name,
        bids: [null], scores: [null], total: 0,
      })),
      currentRoundIndex: 0,
    },
    activeRound: null,
    createdAt: Date.now(),
  };
  const { activeRound } = dealRound(room);
  room.activeRound = activeRound;
  return room;
}

// ─── reconnectPlayer ─────────────────────────────────────────────────────────

describe('reconnectPlayer', () => {
  it('returns the room when player exists', () => {
    const room = rooms.createRoom('p1', 'Alice');
    const result = rooms.reconnectPlayer(room.code, 'p1', 'Alice');
    expect(typeof result).not.toBe('string');
    expect((result as ReturnType<typeof rooms.createRoom>).id).toBe(room.id);
  });

  it('does not duplicate the player', () => {
    const room = rooms.createRoom('p1', 'Alice');
    rooms.reconnectPlayer(room.code, 'p1', 'Alice');
    expect(room.players).toHaveLength(1);
  });

  it('restores isConnected after markDisconnected', () => {
    const room = rooms.createRoom('p1', 'Alice');
    rooms.markDisconnected('p1');
    expect(room.players[0]!.isConnected).toBe(false);

    rooms.reconnectPlayer(room.code, 'p1', 'Alice');
    expect(room.players[0]!.isConnected).toBe(true);
  });

  it('returns error when room does not exist', () => {
    const result = rooms.reconnectPlayer('XXXXXX', 'p1', 'Alice');
    expect(result).toBe('Кімнату не знайдено');
  });

  it('returns error when player is not in the room', () => {
    const room = rooms.createRoom('p1', 'Alice');
    const result = rooms.reconnectPlayer(room.code, 'p2', 'Bob');
    expect(result).toBe('Гравця не знайдено в кімнаті');
  });

  it('room state (activeRound, gameSheet, status) is preserved', () => {
    const room = rooms.createRoom('p1', 'Alice');
    room.status = 'in-progress';
    room.gameSheet = {
      rounds: [],
      scores: [],
      currentRoundIndex: 0,
    };

    rooms.markDisconnected('p1');
    const result = rooms.reconnectPlayer(room.code, 'p1', 'Alice');

    expect(typeof result).not.toBe('string');
    const restored = result as ReturnType<typeof rooms.createRoom>;
    expect(restored.status).toBe('in-progress');
    expect(restored.gameSheet).not.toBeNull();
  });

  it('reconnect after 9 minutes succeeds (within 10-min grace)', () => {
    vi.useFakeTimers();
    const room = rooms.createRoom('p1', 'Alice');
    rooms.markDisconnected('p1');

    const timer = setTimeout(() => rooms.leaveRoom('p1'), GRACE_MS);
    rooms.setDisconnectTimer('p1', timer);

    // Advance 9 minutes — player is still in the room
    vi.advanceTimersByTime(9 * 60 * 1000);

    const result = rooms.reconnectPlayer(room.code, 'p1', 'Alice');
    expect(typeof result).not.toBe('string');
    expect((result as ReturnType<typeof rooms.createRoom>).players).toHaveLength(1);
  });
});

// ─── markDisconnected ─────────────────────────────────────────────────────────

describe('markDisconnected', () => {
  it('sets isConnected to false without removing the player', () => {
    const room = rooms.createRoom('p1', 'Alice');
    const updated = rooms.markDisconnected('p1');
    expect(updated).not.toBeNull();
    expect(updated!.players).toHaveLength(1);
    expect(updated!.players[0]!.isConnected).toBe(false);
    expect(rooms.getRoomByPlayerId('p1')).toBeDefined();
  });

  it('returns null when player is not in any room', () => {
    const result = rooms.markDisconnected('nobody');
    expect(result).toBeNull();
  });
});

// ─── Grace period timer (10 minutes) ─────────────────────────────────────────

describe('disconnect grace period — 10 minutes', () => {
  it('does not remove player before 10 minutes', () => {
    vi.useFakeTimers();
    rooms.createRoom('p1', 'Alice');
    rooms.markDisconnected('p1');

    const timer = setTimeout(() => rooms.leaveRoom('p1'), GRACE_MS);
    rooms.setDisconnectTimer('p1', timer);

    vi.advanceTimersByTime(GRACE_MS - 1);
    expect(rooms.getRoomByPlayerId('p1')).toBeDefined();
  });

  it('removes player after 10-minute grace period expires', () => {
    vi.useFakeTimers();
    rooms.createRoom('p1', 'Alice');
    rooms.markDisconnected('p1');

    const timer = setTimeout(() => rooms.leaveRoom('p1'), GRACE_MS);
    rooms.setDisconnectTimer('p1', timer);

    vi.advanceTimersByTime(GRACE_MS + 1);
    expect(rooms.getRoomByPlayerId('p1')).toBeUndefined();
  });

  it('reconnect before 10-minute timeout cancels the removal timer', () => {
    vi.useFakeTimers();
    const room = rooms.createRoom('p1', 'Alice');
    rooms.markDisconnected('p1');

    const timer = setTimeout(() => rooms.leaveRoom('p1'), GRACE_MS);
    rooms.setDisconnectTimer('p1', timer);

    // Reconnect before timer fires — should cancel removal
    rooms.reconnectPlayer(room.code, 'p1', 'Alice');

    vi.advanceTimersByTime(GRACE_MS + 1);
    expect(rooms.getRoomByPlayerId('p1')).toBeDefined();
  });

  it('cancelDisconnectTimer returns true when timer existed', () => {
    vi.useFakeTimers();
    rooms.createRoom('p1', 'Alice');
    rooms.markDisconnected('p1');

    const timer = setTimeout(() => rooms.leaveRoom('p1'), GRACE_MS);
    rooms.setDisconnectTimer('p1', timer);

    expect(rooms.cancelDisconnectTimer('p1')).toBe(true);
  });

  it('cancelDisconnectTimer returns false when no timer exists', () => {
    expect(rooms.cancelDisconnectTimer('nobody')).toBe(false);
  });

  it('failed network attempt (no socket connection) does not touch session — server-side player stays', () => {
    // When a socket never connects, the server never receives room:reconnect.
    // The player remains in the room with isConnected=false until the grace expires.
    vi.useFakeTimers();
    const room = rooms.createRoom('p1', 'Alice');
    rooms.markDisconnected('p1');

    const timer = setTimeout(() => rooms.leaveRoom('p1'), GRACE_MS);
    rooms.setDisconnectTimer('p1', timer);

    // 5 minutes pass without any reconnect attempt
    vi.advanceTimersByTime(5 * 60 * 1000);

    // Player is still there — session is still valid on the server side
    expect(rooms.getRoomByPlayerId('p1')).toBeDefined();
  });
});

// ─── leaveRoom (intentional) ──────────────────────────────────────────────────

describe('leaveRoom (intentional)', () => {
  it('removes the player immediately', () => {
    rooms.createRoom('p1', 'Alice');
    rooms.leaveRoom('p1');
    expect(rooms.getRoomByPlayerId('p1')).toBeUndefined();
  });

  it('cancels any pending disconnect timer on explicit leave', () => {
    vi.useFakeTimers();
    const room = rooms.createRoom('p1', 'Alice');
    rooms.markDisconnected('p1');

    const timer = setTimeout(() => {
      rooms.leaveRoom('p1');
    }, GRACE_MS);
    rooms.setDisconnectTimer('p1', timer);

    // Explicit leave — cancels the timer and removes immediately
    rooms.leaveRoom('p1');
    expect(rooms.getRoomByPlayerId('p1')).toBeUndefined();

    // Advance time — no double-removal errors
    vi.advanceTimersByTime(GRACE_MS + 1);
    expect(rooms.getRoomByPlayerId('p1')).toBeUndefined();
  });

  it('transfers ownership when owner leaves', () => {
    const room = rooms.createRoom('p1', 'Alice');
    rooms.joinRoom(room.code, 'p2', 'Bob');
    rooms.leaveRoom('p1');
    expect(room.ownerId).toBe('p2');
  });
});

// ─── leaveRoom during active game (Issue 2) ───────────────────────────────────

describe('leaveRoom during active game (status=in-progress)', () => {
  it('marks seat disconnected AND vacant instead of removing it', () => {
    const room = rooms.createRoom('p1', 'Alice');
    rooms.joinRoom(room.code, 'p2', 'Bob');
    room.status = 'in-progress';
    rooms.leaveRoom('p2');
    expect(room.players).toHaveLength(2);
    const p2 = room.players.find(p => p.id === 'p2');
    expect(p2?.isConnected).toBe(false);
    expect(p2?.isVacant).toBe(true);
  });

  it('removes playerRoom mapping so reconnect is not automatic', () => {
    const room = rooms.createRoom('p1', 'Alice');
    rooms.joinRoom(room.code, 'p2', 'Bob');
    room.status = 'in-progress';
    rooms.leaveRoom('p2');
    expect(rooms.getRoomByPlayerId('p2')).toBeUndefined();
  });

  it('does not remove seat when game finishes — keeps lobby removal behaviour', () => {
    const room = rooms.createRoom('p1', 'Alice');
    rooms.joinRoom(room.code, 'p2', 'Bob');
    room.status = 'finished';          // already finished
    rooms.leaveRoom('p2');
    expect(room.players).toHaveLength(1); // removed normally
    expect(rooms.getRoomByPlayerId('p2')).toBeUndefined();
  });
});

// ─── joinInProgressRoom ───────────────────────────────────────────────────────

describe('joinInProgressRoom', () => {
  it('allows joining a room that has a vacant seat', () => {
    const room = rooms.createRoom('p1', 'Alice');
    rooms.joinRoom(room.code, 'p2', 'Bob');
    room.status = 'in-progress';
    rooms.leaveRoom('p2'); // vacancy created
    const result = rooms.joinInProgressRoom(room.code, 'p3', 'Charlie');
    expect(typeof result).not.toBe('string');
  });

  it('replacement player sits at the same position as the vacated player', () => {
    const room = rooms.createRoom('p1', 'Alice');
    rooms.joinRoom(room.code, 'p2', 'Bob');
    room.status = 'in-progress';
    const vacatedIdx = room.players.findIndex(p => p.id === 'p2');
    rooms.leaveRoom('p2');
    rooms.joinInProgressRoom(room.code, 'p3', 'Charlie');
    expect(room.players[vacatedIdx]!.id).toBe('p3');
    expect(room.players).toHaveLength(2);
  });

  it('rejects join when all seats are connected (no vacancy)', () => {
    const room = rooms.createRoom('p1', 'Alice');
    rooms.joinRoom(room.code, 'p2', 'Bob');
    room.status = 'in-progress';
    const result = rooms.joinInProgressRoom(room.code, 'p3', 'Charlie');
    expect(result).toBe('Гра вже почалась і вільних місць немає');
  });

  it('active connected player is never replaced', () => {
    const room = rooms.createRoom('p1', 'Alice');
    rooms.joinRoom(room.code, 'p2', 'Bob');
    rooms.joinRoom(room.code, 'p3', 'Carol');
    room.status = 'in-progress';
    // p2 is active and connected — must not be replaced
    const result = rooms.joinInProgressRoom(room.code, 'p4', 'Dave');
    expect(result).toBe('Гра вже почалась і вільних місць немає');
    expect(room.players.find(p => p.id === 'p2')).toBeDefined();
    expect(room.players.find(p => p.id === 'p4')).toBeUndefined();
  });

  it('disconnected player within grace period is NOT replaceable', () => {
    const room = rooms.createRoom('p1', 'Alice');
    rooms.joinRoom(room.code, 'p2', 'Bob');
    room.status = 'in-progress';
    // Simulate TCP disconnect: isConnected=false, isVacant stays false
    rooms.markDisconnected('p2');
    expect(room.players.find(p => p.id === 'p2')?.isVacant).toBeFalsy();
    const result = rooms.joinInProgressRoom(room.code, 'p3', 'Charlie');
    expect(result).toBe('Гра вже почалась і вільних місць немає');
    // p2 still holds their seat
    expect(room.players.find(p => p.id === 'p2')).toBeDefined();
  });

  it('only explicit leave creates a replaceable vacant seat', () => {
    const room = rooms.createRoom('p1', 'Alice');
    rooms.joinRoom(room.code, 'p2', 'Bob');
    room.status = 'in-progress';
    rooms.markDisconnected('p2');       // TCP drop — NOT replaceable
    rooms.leaveRoom('p1');              // explicit leave — replaceable
    const result = rooms.joinInProgressRoom(room.code, 'p3', 'Charlie');
    // Should take p1's seat (isVacant=true), not p2's (isVacant=false)
    expect(typeof result).not.toBe('string');
    expect(room.players.find(p => p.id === 'p3')?.id).toBe('p3');
    expect(room.players.find(p => p.id === 'p2')).toBeDefined(); // p2 untouched
  });

  it('reconnect after explicit leave resets isVacant', () => {
    const room = rooms.createRoom('p1', 'Alice');
    rooms.joinRoom(room.code, 'p2', 'Bob');
    room.status = 'in-progress';
    rooms.leaveRoom('p2');
    expect(room.players.find(p => p.id === 'p2')?.isVacant).toBe(true);
    rooms.reconnectPlayer(room.code, 'p2', 'Bob');
    const p2 = room.players.find(p => p.id === 'p2');
    expect(p2?.isConnected).toBe(true);
    expect(p2?.isVacant).toBe(false);
  });

  it('rejects join when room is not in-progress', () => {
    const room = rooms.createRoom('p1', 'Alice');
    rooms.joinRoom(room.code, 'p2', 'Bob');
    // status still 'waiting'
    const result = rooms.joinInProgressRoom(room.code, 'p3', 'Charlie');
    expect(result).toBe('Гра ще не почалась');
  });

  it('original player can reconnect via reconnectPlayer if seat not yet taken', () => {
    const room = rooms.createRoom('p1', 'Alice');
    rooms.joinRoom(room.code, 'p2', 'Bob');
    room.status = 'in-progress';
    rooms.leaveRoom('p2');
    // p2 comes back before anyone else takes the seat
    const result = rooms.reconnectPlayer(room.code, 'p2', 'Bob');
    expect(typeof result).not.toBe('string');
    expect((result as typeof room).players.find(p => p.id === 'p2')?.isConnected).toBe(true);
  });

  it('original player cannot reclaim seat after replacement took it', () => {
    const room = rooms.createRoom('p1', 'Alice');
    rooms.joinRoom(room.code, 'p2', 'Bob');
    room.status = 'in-progress';
    rooms.leaveRoom('p2');
    rooms.joinInProgressRoom(room.code, 'p3', 'Charlie');
    // p2 tries to reconnect — seat no longer exists under their id
    const result = rooms.reconnectPlayer(room.code, 'p2', 'Bob');
    expect(result).toBe('Гравця не знайдено в кімнаті');
    // No duplicate: room still has exactly 2 players (p1, p3)
    expect(room.players).toHaveLength(2);
    expect(room.players.every(p => p.id !== 'p2')).toBe(true);
  });
});

// ─── transferPlayerState ──────────────────────────────────────────────────────

describe('transferPlayerState', () => {
  it('replacement player receives the vacated player\'s hand', () => {
    const room = makeInProgressRoom(['p1', 'p2', 'p3']);
    const oldHand = [...getHand(room.id, 'p2')!];

    // Simulate seat takeover: update player identity in room then transfer state
    room.players[1]!.id = 'p4';
    room.players[1]!.name = 'Dave';
    transferPlayerState(room.id, 'p2', 'p4', 'Dave', room);

    expect(getHand(room.id, 'p4')).toEqual(oldHand);
    expect(getHand(room.id, 'p2')).toBeUndefined();
  });

  it('is a no-op when old and new ids are identical (reconnect to own seat)', () => {
    const room = makeInProgressRoom(['p1', 'p2', 'p3']);
    const hand = [...getHand(room.id, 'p2')!];
    transferPlayerState(room.id, 'p2', 'p2', 'Bob', room);
    expect(getHand(room.id, 'p2')).toEqual(hand);
  });

  it('updates currentTurnPlayerId when vacated player had the turn', () => {
    const room = makeInProgressRoom(['p1', 'p2', 'p3']);
    // Pin current turn to p2
    room.activeRound!.currentTurnPlayerId = 'p2';
    room.players[1]!.id = 'p4';
    transferPlayerState(room.id, 'p2', 'p4', 'Dave', room);
    expect(room.activeRound!.currentTurnPlayerId).toBe('p4');
  });

  it('updates gameSheet scores entry to the new player id', () => {
    const room = makeInProgressRoom(['p1', 'p2', 'p3']);
    room.players[1]!.id = 'p4';
    transferPlayerState(room.id, 'p2', 'p4', 'Dave', room);
    const score = room.gameSheet!.scores.find(s => s.playerId === 'p4');
    expect(score).toBeDefined();
    expect(room.gameSheet!.scores.find(s => s.playerId === 'p2')).toBeUndefined();
  });
});
