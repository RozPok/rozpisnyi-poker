import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { GameRoom } from '@rozpisnyi-poker/shared';
import { getLegalBids, getLegalCards } from '@rozpisnyi-poker/shared';
import * as rooms from '../rooms';
import * as game from '../game';
import { scheduleBotAction } from '../bots';
import { _clearHandsForTest } from '../game';

// ─── Mock io ─────────────────────────────────────────────────────────────────

function makeMockIo() {
  const emitFn = vi.fn();
  return {
    to: vi.fn().mockReturnValue({ emit: emitFn }),
    _emitFn: emitFn,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  rooms._reset();
  _clearHandsForTest();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function makeTestRoom(playerCount: number): GameRoom {
  const players = Array.from({ length: playerCount }, (_, i) =>
    i === 0
      ? { id: 'human', name: 'Human', isConnected: true }
      : { id: `bot${i}`, name: `🤖 Бот ${i}`, isConnected: true, isBot: true as const },
  );
  const room: GameRoom = {
    id: 'test-room',
    code: 'TLAB01',
    ownerId: 'human',
    players,
    status: 'in-progress',
    gameSheet: {
      rounds: [{ index: 0, type: 'normal', cardsPerPlayer: 3, label: '3' }],
      scores: players.map(p => ({
        playerId: p.id,
        name: p.name,
        bids: [null],
        scores: [null],
        total: 0,
      })),
      currentRoundIndex: 0,
    },
    activeRound: null,
    createdAt: Date.now(),
    mode: 'test',
    testRound: { type: 'normal', cardsPerPlayer: 3, label: '3' },
    testPlayerCount: playerCount,
  };
  const { activeRound } = game.dealRound(room);
  room.activeRound = activeRound;
  return room;
}

// ─── rooms.createTestRoom ────────────────────────────────────────────────────

describe('createTestRoom', () => {
  it('creates a room with mode=test and the correct testRound', () => {
    const room = rooms.createTestRoom('p1', 'Alice', 4, { type: 'normal', cardsPerPlayer: 8, label: '8' });
    expect(room.mode).toBe('test');
    expect(room.testRound).toEqual({ type: 'normal', cardsPerPlayer: 8, label: '8' });
    expect(room.testPlayerCount).toBe(4);
    expect(room.players).toHaveLength(1);
    expect(room.players[0]!.isBot).toBeUndefined();
  });
});

// ─── rooms.addBotToRoom ───────────────────────────────────────────────────────

describe('addBotToRoom', () => {
  it('adds a bot player to a test room', () => {
    const room = rooms.createTestRoom('p1', 'Alice', 4, { type: 'normal', cardsPerPlayer: 8, label: '8' });
    const result = rooms.addBotToRoom(room.id);
    expect(typeof result).not.toBe('string');
    const updated = result as GameRoom;
    expect(updated.players).toHaveLength(2);
    expect(updated.players[1]!.isBot).toBe(true);
    expect(updated.players[1]!.name).toContain('Бот');
  });

  it('rejects adding bots to a normal room', () => {
    const room = rooms.createRoom('p1', 'Alice');
    const result = rooms.addBotToRoom(room.id);
    expect(typeof result).toBe('string');
  });

  it('rejects adding bots beyond testPlayerCount', () => {
    const room = rooms.createTestRoom('p1', 'Alice', 3, { type: 'normal', cardsPerPlayer: 11, label: '11' });
    rooms.addBotToRoom(room.id);
    rooms.addBotToRoom(room.id);
    const result = rooms.addBotToRoom(room.id);
    expect(typeof result).toBe('string');
    expect(room.players).toHaveLength(3);
  });
});

// ─── rooms.fillBotsInRoom ─────────────────────────────────────────────────────

describe('fillBotsInRoom', () => {
  it('fills all seats with bots up to testPlayerCount', () => {
    const room = rooms.createTestRoom('p1', 'Alice', 5, { type: 'no-trump', cardsPerPlayer: 6, label: 'Б' });
    const result = rooms.fillBotsInRoom(room.id);
    expect(typeof result).not.toBe('string');
    const updated = result as GameRoom;
    expect(updated.players).toHaveLength(5);
    expect(updated.players.filter(p => p.isBot)).toHaveLength(4);
  });
});

// ─── scheduleBotAction — no-op for non-bot turn ───────────────────────────────

describe('scheduleBotAction', () => {
  it('does nothing when next player is human', () => {
    const room = makeTestRoom(3);
    room.activeRound!.currentTurnPlayerId = 'human';
    const io = makeMockIo();
    scheduleBotAction(room, io as any);
    vi.runAllTimers();
    expect(io._emitFn).not.toHaveBeenCalled();
  });

  it('schedules a bid for a bot during bidding phase', () => {
    const room = makeTestRoom(3);
    // Bot1 is second bidder (human hasn't bid yet, so bot1 is not last bidder)
    room.activeRound!.currentTurnPlayerId = 'bot1';
    room.activeRound!.phase = 'bidding';
    const io = makeMockIo();
    scheduleBotAction(room, io as any);
    vi.runAllTimers();
    // Bot should have placed a bid → room emitted
    expect(io.to).toHaveBeenCalledWith(room.id);
    expect(io._emitFn).toHaveBeenCalledWith('room:updated', room);
    expect('bot1' in room.activeRound!.bids).toBe(true);
  });

  it('bot bid is legal', () => {
    const room = makeTestRoom(3);
    // No bids yet, bot1 is not last bidder
    room.activeRound!.currentTurnPlayerId = 'bot1';
    room.activeRound!.phase = 'bidding';
    const io = makeMockIo();
    scheduleBotAction(room, io as any);
    vi.runAllTimers();

    const bid = room.activeRound!.bids['bot1'];
    expect(bid).toBeDefined();
    // isLastBidder=false since bids is empty (0 submitted, need playerCount-1=2 for last)
    const legal = getLegalBids(3, 0, false, []);
    expect(legal).toContain(bid);
  });

  it('schedules a card play for a bot during playing phase', () => {
    const room = makeTestRoom(3);
    // Force playing phase directly — avoids the total-sum constraint in last bidder
    const ar = room.activeRound!;
    ar.phase = 'playing';
    ar.bids = { human: 1, bot1: 1, bot2: 0 };
    ar.currentTurnPlayerId = 'bot1';
    const io = makeMockIo();
    scheduleBotAction(room, io as any);
    vi.runAllTimers();
    expect(io._emitFn).toHaveBeenCalledWith('room:updated', room);
  });

  it('bot card play is legal', () => {
    const room = makeTestRoom(3);
    // Force playing phase directly
    const ar = room.activeRound!;
    ar.phase = 'playing';
    ar.bids = { human: 1, bot1: 1, bot2: 0 };
    ar.currentTurnPlayerId = 'bot1';

    const bot1Hand = game.getHand(room.id, 'bot1')!;
    const handBefore = [...bot1Hand];
    const trumpSuit = ar.trumpSuit;
    const io = makeMockIo();
    scheduleBotAction(room, io as any);
    vi.runAllTimers();

    // One card should have been removed from bot1's hand
    const handAfter = game.getHand(room.id, 'bot1')!;
    expect(handAfter).toHaveLength(handBefore.length - 1);

    // The card played must have been in the legal set
    const played = handBefore.find(c => !handAfter.some(a => a.suit === c.suit && a.rank === c.rank));
    expect(played).toBeDefined();
    const legal = getLegalCards(handBefore, null, trumpSuit, undefined);
    expect(legal.some(c => c.suit === played!.suit && c.rank === played!.rank)).toBe(true);
  });
});

// ─── Normal room unchanged ────────────────────────────────────────────────────

describe('normal room', () => {
  it('createRoom produces mode=normal with no bots', () => {
    const room = rooms.createRoom('p1', 'Alice');
    expect(room.mode).toBe('normal');
    expect(room.testRound).toBeUndefined();
    expect(room.players.every(p => !p.isBot)).toBe(true);
  });

  it('addBotToRoom rejects normal rooms', () => {
    const room = rooms.createRoom('p1', 'Alice');
    expect(typeof rooms.addBotToRoom(room.id)).toBe('string');
  });

  it('scheduleBotAction is a no-op for normal rooms', () => {
    const players = [
      { id: 'p1', name: 'Alice', isConnected: true },
      { id: 'p2', name: 'Bob', isConnected: true },
      { id: 'p3', name: 'Carol', isConnected: true },
    ];
    const room: GameRoom = {
      id: 'normal-room',
      code: 'NORM01',
      ownerId: 'p1',
      players,
      status: 'in-progress',
      gameSheet: {
        rounds: [{ index: 0, type: 'normal', cardsPerPlayer: 3, label: '3' }],
        scores: players.map(p => ({ playerId: p.id, name: p.name, bids: [null], scores: [null], total: 0 })),
        currentRoundIndex: 0,
      },
      activeRound: null,
      createdAt: Date.now(),
      mode: 'normal',
    };
    const { activeRound } = game.dealRound(room);
    room.activeRound = activeRound;
    const io = makeMockIo();
    scheduleBotAction(room, io as any);
    vi.runAllTimers();
    expect(io._emitFn).not.toHaveBeenCalled();
  });
});
