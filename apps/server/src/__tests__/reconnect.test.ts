import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as rooms from '../rooms';

beforeEach(() => {
  rooms._reset();
});

afterEach(() => {
  vi.useRealTimers();
});

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

// ─── Grace period timer ───────────────────────────────────────────────────────

describe('disconnect grace period', () => {
  it('does not remove player before the timer fires', () => {
    vi.useFakeTimers();
    const room = rooms.createRoom('p1', 'Alice');
    rooms.markDisconnected('p1');

    const timer = setTimeout(() => rooms.leaveRoom('p1'), 60_000);
    rooms.setDisconnectTimer('p1', timer);

    vi.advanceTimersByTime(59_999);
    expect(rooms.getRoomByPlayerId('p1')).toBeDefined();
  });

  it('removes player after the timer fires', () => {
    vi.useFakeTimers();
    const room = rooms.createRoom('p1', 'Alice');
    rooms.markDisconnected('p1');

    const timer = setTimeout(() => rooms.leaveRoom('p1'), 60_000);
    rooms.setDisconnectTimer('p1', timer);

    vi.advanceTimersByTime(60_001);
    expect(rooms.getRoomByPlayerId('p1')).toBeUndefined();
  });

  it('reconnect before timeout cancels the removal timer', () => {
    vi.useFakeTimers();
    const room = rooms.createRoom('p1', 'Alice');
    rooms.markDisconnected('p1');

    const timer = setTimeout(() => rooms.leaveRoom('p1'), 60_000);
    rooms.setDisconnectTimer('p1', timer);

    // Reconnect before timer fires — should cancel removal
    rooms.reconnectPlayer(room.code, 'p1', 'Alice');

    vi.advanceTimersByTime(60_001);
    expect(rooms.getRoomByPlayerId('p1')).toBeDefined();
  });

  it('cancelDisconnectTimer returns true when timer existed', () => {
    vi.useFakeTimers();
    rooms.createRoom('p1', 'Alice');
    rooms.markDisconnected('p1');

    const timer = setTimeout(() => rooms.leaveRoom('p1'), 60_000);
    rooms.setDisconnectTimer('p1', timer);

    expect(rooms.cancelDisconnectTimer('p1')).toBe(true);
  });

  it('cancelDisconnectTimer returns false when no timer exists', () => {
    expect(rooms.cancelDisconnectTimer('nobody')).toBe(false);
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
      // This should never run because leaveRoom cancels it
      rooms.leaveRoom('p1');
    }, 60_000);
    rooms.setDisconnectTimer('p1', timer);

    // Explicit leave — should cancel the timer and remove immediately
    rooms.leaveRoom('p1');
    expect(rooms.getRoomByPlayerId('p1')).toBeUndefined();

    // Advance time — no double-removal errors
    vi.advanceTimersByTime(60_001);
    expect(rooms.getRoomByPlayerId('p1')).toBeUndefined();
  });

  it('transfers ownership when owner leaves', () => {
    const room = rooms.createRoom('p1', 'Alice');
    rooms.joinRoom(room.code, 'p2', 'Bob');
    rooms.leaveRoom('p1');
    expect(room.ownerId).toBe('p2');
  });
});
