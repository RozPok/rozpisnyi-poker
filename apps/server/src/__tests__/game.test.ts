import { describe, it, expect, beforeEach } from 'vitest';
import type { GameRoom, GameRound, RoomPlayer, RoundType } from '@rozpisnyi-poker/shared';
import { createDeck, getLegalCards } from '@rozpisnyi-poker/shared';
import { dealRound, finishRound, getHand, getRoundStarterIndex, pickTrumpCard, placeBid, playCard } from '../game';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePlayer(id: string): RoomPlayer {
  return { id, name: id, isConnected: true };
}

/** Room at round 0 with no bid history (scores array is empty). */
function makeRoom(playerCount: number, cardsPerPlayer: number): GameRoom {
  const players = Array.from({ length: playerCount }, (_, i) => makePlayer(`p${i + 1}`));

  const room: GameRoom = {
    id: `room-${playerCount}-${cardsPerPlayer}`,
    code: 'TEST01',
    ownerId: 'p1',
    players,
    status: 'in-progress',
    gameSheet: {
      rounds: [{ index: 0, type: 'normal', cardsPerPlayer, label: String(cardsPerPlayer) }],
      scores: [],
      currentRoundIndex: 0,
    },
    activeRound: null,
    createdAt: Date.now(),
    mode: 'normal',
  };

  const { activeRound } = dealRound(room);
  room.activeRound = activeRound;
  return room;
}

/**
 * Room positioned at `roundIndex` with pre-populated bid history per player.
 * bidHistoryByPlayer maps playerId → array of bids for rounds 0..roundIndex-1.
 *
 * `overrideStarterId` forces currentTurnPlayerId for testing bid-validation rules
 * in isolation from turn-order rotation (defaults to p1 for backward compat).
 */
function makeRoomAtRound(
  playerCount: number,
  cardsPerPlayer: number,
  roundIndex: number,
  bidHistoryByPlayer: Record<string, (number | null)[]>,
  overrideStarterId?: string,
): GameRoom {
  const players = Array.from({ length: playerCount }, (_, i) => makePlayer(`p${i + 1}`));
  const totalRounds = roundIndex + 1;

  const rounds = Array.from({ length: totalRounds }, (_, i) => ({
    index: i,
    type: 'normal' as const,
    cardsPerPlayer,
    label: String(cardsPerPlayer),
  }));

  const scores = players.map(p => {
    const history = bidHistoryByPlayer[p.id] ?? [];
    const bids: (number | null)[] = Array.from({ length: totalRounds }, (_, i) =>
      i < history.length ? (history[i] ?? null) : null,
    );
    return {
      playerId: p.id,
      name: p.name,
      bids,
      scores: new Array<number | null>(totalRounds).fill(null),
      total: 0,
    };
  });

  const room: GameRoom = {
    id: `room-r${roundIndex}-${playerCount}-${cardsPerPlayer}`,
    code: 'HIST01',
    ownerId: 'p1',
    players,
    status: 'in-progress',
    gameSheet: { rounds, scores, currentRoundIndex: roundIndex },
    activeRound: null,
    createdAt: Date.now(),
    mode: 'normal',
  };

  const { activeRound } = dealRound(room);
  // Pin the starting player so bid-restriction tests are not affected by rotation
  const starterId = overrideStarterId ?? players[0]!.id;
  activeRound.currentTurnPlayerId = starterId;
  activeRound.trickLeadPlayerId  = starterId;
  room.activeRound = activeRound;
  return room;
}

/**
 * Minimal room at a specific roundIndex for testing turn-order rotation.
 * Does NOT override currentTurnPlayerId — uses the real rotation logic.
 */
function makeRoomForDeal(playerCount: number, cardsPerPlayer: number, roundIndex: number): GameRoom {
  const players = Array.from({ length: playerCount }, (_, i) => makePlayer(`p${i + 1}`));
  const rounds = Array.from({ length: roundIndex + 1 }, (_, i) => ({
    index: i,
    type: 'normal' as const,
    cardsPerPlayer,
    label: String(cardsPerPlayer),
  }));
  const room: GameRoom = {
    id: `room-deal-${playerCount}-${roundIndex}`,
    code: 'ROT01',
    ownerId: 'p1',
    players,
    status: 'in-progress',
    gameSheet: {
      rounds,
      scores: players.map(p => ({
        playerId: p.id,
        name: p.name,
        bids:   new Array<number | null>(rounds.length).fill(null),
        scores: new Array<number | null>(rounds.length).fill(null),
        total: 0,
      })),
      currentRoundIndex: roundIndex,
    },
    activeRound: null,
    createdAt: Date.now(),
    mode: 'normal',
  };
  const { activeRound } = dealRound(room);
  room.activeRound = activeRound;
  return room;
}

/**
 * Plays the first *legal* card for `playerId` according to the current trick
 * state (including any active Joker declaration). Throws if no legal card
 * is found or the play is rejected.
 */
function playLegalCard(room: GameRoom, playerId: string): void {
  const ar = room.activeRound!;
  const hand = getHand(room.id, playerId)!;
  const legal = getLegalCards(hand, ar.leadSuit, ar.trumpSuit, ar.jokerDeclaration ?? undefined);
  if (legal.length === 0) throw new Error(`No legal card for ${playerId}`);
  const card = legal[0]!;
  // Joker always requires a declaration; choose lay-down when leading, take when not
  const declaration = card.isJoker
    ? ar.currentTrick.length === 0
      ? { mode: 'lay-down' as const }
      : { mode: 'take' as const }
    : null;
  const result = playCard(room, playerId, card, declaration);
  if (!result.ok) throw new Error(`playLegalCard failed: ${result.error}`);
}

// ─── placeBid — basic validation ─────────────────────────────────────────────

describe('placeBid', () => {
  let room: GameRoom;

  beforeEach(() => {
    room = makeRoom(3, 5);
  });

  it('rejects bid when there is no active round', () => {
    room.activeRound = null;
    expect(placeBid(room, 'p1', 2)).toEqual({ ok: false, error: expect.any(String) });
  });

  it('rejects bid outside range (negative)', () => {
    expect(placeBid(room, 'p1', -1)).toEqual({ ok: false, error: expect.any(String) });
  });

  it('rejects bid above cardsPerPlayer', () => {
    expect(placeBid(room, 'p1', 6)).toEqual({ ok: false, error: expect.any(String) });
  });

  it('rejects non-integer bid', () => {
    expect(placeBid(room, 'p1', 1.5)).toEqual({ ok: false, error: expect.any(String) });
  });

  it('rejects bid when it is not the player\'s turn', () => {
    expect(placeBid(room, 'p2', 2)).toEqual({ ok: false, error: expect.any(String) });
  });

  it('accepts bid of 0', () => {
    expect(placeBid(room, 'p1', 0)).toEqual({ ok: true });
  });

  it('accepts bid equal to cardsPerPlayer', () => {
    expect(placeBid(room, 'p1', 5)).toEqual({ ok: true });
  });

  it('stores bid in activeRound.bids', () => {
    placeBid(room, 'p1', 3);
    expect(room.activeRound!.bids['p1']).toBe(3);
  });

  it('advances turn to next player after bid', () => {
    placeBid(room, 'p1', 2);
    expect(room.activeRound!.currentTurnPlayerId).toBe('p2');
  });

  it('advances turn sequentially through all players', () => {
    placeBid(room, 'p1', 1);
    placeBid(room, 'p2', 2);
    expect(room.activeRound!.currentTurnPlayerId).toBe('p3');
  });

  it('transitions to playing phase after all bids submitted', () => {
    placeBid(room, 'p1', 1);
    placeBid(room, 'p2', 2);
    placeBid(room, 'p3', 3);
    expect(room.activeRound!.phase).toBe('playing');
  });

  it('current turn resets to first player when playing phase begins', () => {
    placeBid(room, 'p1', 1);
    placeBid(room, 'p2', 2);
    placeBid(room, 'p3', 3);
    expect(room.activeRound!.currentTurnPlayerId).toBe('p1');
  });

  it('stores all bids after full round of bidding', () => {
    placeBid(room, 'p1', 1);
    placeBid(room, 'p2', 0);
    placeBid(room, 'p3', 5);
    expect(room.activeRound!.bids).toEqual({ p1: 1, p2: 0, p3: 5 });
  });

  it('rejects bid in playing phase', () => {
    placeBid(room, 'p1', 1);
    placeBid(room, 'p2', 2);
    placeBid(room, 'p3', 3);
    expect(room.activeRound!.phase).toBe('playing');
    expect(placeBid(room, 'p1', 1)).toEqual({ ok: false, error: expect.any(String) });
  });
});

// ─── placeBid — last-player restriction ──────────────────────────────────────

describe('placeBid — last-player restriction', () => {
  it('forbids last bidder from making total equal cardsPerPlayer', () => {
    // p1=2, p2=1 → total=3; forbidden bid for p3 is 2 (3+2=5)
    const room = makeRoom(3, 5);
    placeBid(room, 'p1', 2);
    placeBid(room, 'p2', 1);
    expect(placeBid(room, 'p3', 2)).toEqual({ ok: false, error: expect.any(String) });
  });

  it('allows last bidder to place a bid that does not violate the total', () => {
    const room = makeRoom(3, 5);
    placeBid(room, 'p1', 2);
    placeBid(room, 'p2', 1);
    // forbidden=2 (3+2=5), so 3 is legal (3+3=6≠5)
    expect(placeBid(room, 'p3', 3)).toEqual({ ok: true });
  });

  it('applies restriction when the forbidden bid is 0', () => {
    // p1=3, p2=2 → total=5; forbidden bid for p3 is 0 (5+0=5)
    const room = makeRoom(3, 5);
    placeBid(room, 'p1', 3);
    placeBid(room, 'p2', 2);
    expect(placeBid(room, 'p3', 0)).toEqual({ ok: false, error: expect.any(String) });
  });

  it('does not apply restriction to non-last bidders', () => {
    // p1 bidding 5 (0+5=5=cardsPerPlayer) is fine because p1 is not last
    const room = makeRoom(3, 5);
    expect(placeBid(room, 'p1', 5)).toEqual({ ok: true });
  });

  it('allows last bidder to bid 0 when it does not violate the total', () => {
    // p1=1, p2=1 → total=2; forbidden=3 (2+3=5); 0 is legal
    const room = makeRoom(3, 5);
    placeBid(room, 'p1', 1);
    placeBid(room, 'p2', 1);
    expect(placeBid(room, 'p3', 0)).toEqual({ ok: true });
  });
});

// ─── placeBid — three-zero restriction ───────────────────────────────────────

describe('placeBid — three-zero restriction', () => {
  it('forbids bidding 0 when the previous three rounds were all 0', () => {
    const room = makeRoomAtRound(3, 5, 3, { p1: [0, 0, 0], p2: [1, 1, 1], p3: [1, 1, 1] });
    expect(placeBid(room, 'p1', 0)).toEqual({ ok: false, error: expect.any(String) });
  });

  it('allows bidding 0 after zero then non-zero', () => {
    const room = makeRoomAtRound(3, 5, 2, { p1: [0, 1], p2: [1, 1], p3: [1, 1] });
    expect(placeBid(room, 'p1', 0)).toEqual({ ok: true });
  });

  it('allows bidding 0 after non-zero then zero', () => {
    const room = makeRoomAtRound(3, 5, 2, { p1: [1, 0], p2: [1, 1], p3: [1, 1] });
    expect(placeBid(room, 'p1', 0)).toEqual({ ok: true });
  });

  it('allows bidding 0 with only one prior-round zero', () => {
    const room = makeRoomAtRound(3, 5, 1, { p1: [0], p2: [1], p3: [1] });
    expect(placeBid(room, 'p1', 0)).toEqual({ ok: true });
  });

  it('restriction applies only to the player with the zero streak, not others', () => {
    const room = makeRoomAtRound(3, 5, 3, { p1: [0, 0, 0], p2: [0, 0, 0], p3: [1, 1, 1] });
    // p1 cannot bid 0
    expect(placeBid(room, 'p1', 0)).toEqual({ ok: false, error: expect.any(String) });
    // p1 bids 1 to advance turn
    placeBid(room, 'p1', 1);
    // p2 cannot bid 0 either (own streak)
    expect(placeBid(room, 'p2', 0)).toEqual({ ok: false, error: expect.any(String) });
    // p2 can bid 1
    expect(placeBid(room, 'p2', 1)).toEqual({ ok: true });
  });

  it('null history entries do not count as zeros', () => {
    // History has nulls mixed with zeros — only real zeros count
    const room = makeRoomAtRound(3, 5, 2, {
      p1: [null as unknown as number, 0],
      p2: [1, 1],
      p3: [1, 1],
    });
    // Only one real zero in completed history → can still bid 0
    expect(placeBid(room, 'p1', 0)).toEqual({ ok: true });
  });

  it('persists bid into gameSheet.scores.bids for future rounds', () => {
    const room = makeRoomAtRound(3, 5, 2, { p1: [1, 1], p2: [1, 1], p3: [1, 1] });
    placeBid(room, 'p1', 2);
    const score = room.gameSheet!.scores.find(s => s.playerId === 'p1')!;
    expect(score.bids[2]).toBe(2);
  });
});

// ─── placeBid — edge cases ────────────────────────────────────────────────────

describe('placeBid — edge cases', () => {
  it('only one legal bid remains when both rules apply simultaneously', () => {
    // cardsPerPlayer=2, history=[0,0,0] → zero-banned; total=1 → forbidden bid=1 (1+1=2)
    // legal = [0,1,2] minus 0 (zero-ban) minus 1 (total rule) = [2]
    const room = makeRoomAtRound(3, 2, 3, { p1: [1, 1, 1], p2: [1, 1, 1], p3: [0, 0, 0] });
    placeBid(room, 'p1', 1);
    placeBid(room, 'p2', 0);
    // p3: forbidden by total → 1; forbidden by zero-ban → 0; only 2 remains
    expect(placeBid(room, 'p3', 1)).toEqual({ ok: false, error: expect.any(String) });
    expect(placeBid(room, 'p3', 0)).toEqual({ ok: false, error: expect.any(String) });
    expect(placeBid(room, 'p3', 2)).toEqual({ ok: true });
  });
});

// ─── playCard ─────────────────────────────────────────────────────────────────

describe('playCard', () => {
  let room: GameRoom;

  beforeEach(() => {
    room = makeRoom(3, 3);
    // p1=1, p2=1, total=2; p3 cannot bid 1 (2+1=3=cardsPerPlayer), so bid 0
    placeBid(room, 'p1', 1);
    placeBid(room, 'p2', 1);
    placeBid(room, 'p3', 0);
  });

  it('is in playing phase after all bids', () => {
    expect(room.activeRound!.phase).toBe('playing');
  });

  it('rejects play during bidding phase', () => {
    const freshRoom = makeRoom(3, 3); // still in bidding phase
    const hand = getHand(freshRoom.id, 'p1')!;
    expect(playCard(freshRoom, 'p1', hand[0]!)).toEqual({ ok: false, error: expect.any(String) });
  });

  it('rejects play when not the current player', () => {
    const hand = getHand(room.id, 'p2')!;
    expect(playCard(room, 'p2', hand[0]!)).toEqual({ ok: false, error: expect.any(String) });
  });

  it('accepts playing a card from hand', () => {
    const hand = getHand(room.id, 'p1')!;
    // Use a non-Joker card: leading with the Joker would require a declaration
    const card = hand.find(c => !c.isJoker) ?? hand[0]!;
    expect(playCard(room, 'p1', card)).toEqual({ ok: true });
  });

  it('removes played card from hand', () => {
    const hand = getHand(room.id, 'p1')!;
    const cardToPlay = hand.find(c => !c.isJoker) ?? hand[0]!;
    const sizeBefore = hand.length;
    playCard(room, 'p1', cardToPlay);
    expect(getHand(room.id, 'p1')!.length).toBe(sizeBefore - 1);
  });

  it('decrements playerCardCounts', () => {
    const hand = getHand(room.id, 'p1')!;
    const card = hand.find(c => !c.isJoker) ?? hand[0]!;
    playCard(room, 'p1', card);
    expect(room.activeRound!.playerCardCounts['p1']).toBe(2);
  });

  it('adds play to currentTrick', () => {
    const hand = getHand(room.id, 'p1')!;
    const card = hand.find(c => !c.isJoker) ?? hand[0]!;
    playCard(room, 'p1', card);
    expect(room.activeRound!.currentTrick).toHaveLength(1);
    expect(room.activeRound!.currentTrick[0]!.card).toEqual(card);
  });

  it('advances turn to next player', () => {
    const hand = getHand(room.id, 'p1')!;
    const card = hand.find(c => !c.isJoker) ?? hand[0]!;
    playCard(room, 'p1', card);
    expect(room.activeRound!.currentTurnPlayerId).toBe('p2');
  });

  it('rejects playing a card not in hand', () => {
    // Use a card from p2's hand — guaranteed absent from p1's hand (deck has unique cards)
    const p2Hand = getHand(room.id, 'p2')!;
    const cardNotInP1Hand = p2Hand.find(c => !c.isJoker) ?? p2Hand[0]!;
    expect(playCard(room, 'p1', cardNotInP1Hand)).toEqual({
      ok: false,
      error: expect.any(String),
    });
  });

  it('clears trick and sets winner as next turn leader after full trick', () => {
    playLegalCard(room, 'p1');
    playLegalCard(room, 'p2');
    playLegalCard(room, 'p3');
    expect(room.activeRound!.currentTrick).toHaveLength(0);
    expect(room.activeRound!.currentTrickIndex).toBe(1);
  });

  it('lastTrick includes all played cards and a winner after trick completes', () => {
    playLegalCard(room, 'p1');
    playLegalCard(room, 'p2');
    playLegalCard(room, 'p3');
    const last = room.activeRound!.lastTrick;
    expect(last).not.toBeNull();
    expect(last!.plays).toHaveLength(3);              // all 3 players' cards
    expect(last!.plays.every(p => p.card !== undefined)).toBe(true);
    expect(last!.winnerId).toMatch(/^p[123]$/);        // a valid player id
    expect(last!.trickIndex).toBe(0);                  // first trick
  });

  it('marks round complete when all cards played', () => {
    for (let t = 0; t < 3; t++) {
      const leader = room.activeRound!.currentTurnPlayerId;
      const leaderIdx = room.players.findIndex(p => p.id === leader);
      for (let i = 0; i < 3; i++) {
        const pid = `p${((leaderIdx + i) % 3) + 1}`;
        playLegalCard(room, pid);
      }
    }
    expect(room.activeRound!.isComplete).toBe(true);
  });
});

// ─── finishRound helpers ──────────────────────────────────────────────────────

/**
 * Room with proper PlayerScore entries and configurable rounds.
 * The first round is always round 0 and matches `roundType`.
 */
function makeRoomWithScores(
  playerCount: number,
  cardsPerPlayer: number,
  roundType: RoundType,
  extraRounds: GameRound[] = [],
): GameRoom {
  const players = Array.from({ length: playerCount }, (_, i) => makePlayer(`p${i + 1}`));
  const rounds: GameRound[] = [
    { index: 0, type: roundType, cardsPerPlayer, label: '1' },
    ...extraRounds.map((r, i) => ({ ...r, index: i + 1 })),
  ];

  const room: GameRoom = {
    id: `room-ws-${playerCount}-${cardsPerPlayer}-${roundType}`,
    code: 'WSTEST',
    ownerId: 'p1',
    players,
    status: 'in-progress',
    gameSheet: {
      rounds,
      scores: players.map(p => ({
        playerId: p.id,
        name: p.name,
        bids: new Array<number | null>(rounds.length).fill(null),
        scores: new Array<number | null>(rounds.length).fill(null),
        total: 0,
      })),
      currentRoundIndex: 0,
    },
    activeRound: null,
    createdAt: Date.now(),
    mode: 'normal',
  };

  const { activeRound } = dealRound(room);
  room.activeRound = activeRound;
  return room;
}

/** Directly force an active round into the "complete" state for testing. */
function forceComplete(
  room: GameRoom,
  bids: Record<string, number>,
  tricksWon: Record<string, number>,
): void {
  const ar = room.activeRound!;
  ar.phase = 'playing';
  ar.bids = bids;
  ar.tricksWon = tricksWon;
  ar.playerCardCounts = Object.fromEntries(Object.keys(tricksWon).map(id => [id, 0]));
  ar.isComplete = true;
}

// ─── finishRound ─────────────────────────────────────────────────────────────

describe('finishRound — scoring', () => {
  it('saves computed score for each player', () => {
    const room = makeRoomWithScores(3, 5, 'normal');
    // p1: bid=1 actual=1 → +10; p2: bid=1 actual=0 → -10; p3: bid=0 actual=4 → +4
    forceComplete(room, { p1: 1, p2: 1, p3: 0 }, { p1: 1, p2: 0, p3: 4 });
    finishRound(room);
    const gs = room.gameSheet!;
    expect(gs.scores.find(s => s.playerId === 'p1')!.scores[0]).toBe(10);
    expect(gs.scores.find(s => s.playerId === 'p2')!.scores[0]).toBe(-10);
    expect(gs.scores.find(s => s.playerId === 'p3')!.scores[0]).toBe(4);
  });

  it('updates running total', () => {
    const room = makeRoomWithScores(3, 5, 'normal');
    forceComplete(room, { p1: 3, p2: 0, p3: 0 }, { p1: 3, p2: 0, p3: 2 });
    finishRound(room);
    const gs = room.gameSheet!;
    expect(gs.scores.find(s => s.playerId === 'p1')!.total).toBe(30);
    expect(gs.scores.find(s => s.playerId === 'p2')!.total).toBe(5);
    expect(gs.scores.find(s => s.playerId === 'p3')!.total).toBe(2);
  });

  it('applies dark-round scoring correctly', () => {
    const room = makeRoomWithScores(3, 5, 'dark');
    forceComplete(room, { p1: 2, p2: 2, p3: 0 }, { p1: 2, p2: 0, p3: 3 });
    finishRound(room);
    const gs = room.gameSheet!;
    expect(gs.scores.find(s => s.playerId === 'p1')!.scores[0]).toBe(40);   // bid=2 exact → 20×2
    expect(gs.scores.find(s => s.playerId === 'p2')!.scores[0]).toBe(-40);  // bid=2 undertrick 2 → -20×2
    expect(gs.scores.find(s => s.playerId === 'p3')!.scores[0]).toBe(3);    // bid=0 overtrick → +actual (no multiplier)
  });

  it('scores misere correctly (no bids)', () => {
    const room = makeRoomWithScores(3, 5, 'misere');
    // misere starts directly in playing phase — no bids submitted
    forceComplete(room, {}, { p1: 0, p2: 0, p3: 2 });
    finishRound(room);
    const gs = room.gameSheet!;
    expect(gs.scores.find(s => s.playerId === 'p1')!.scores[0]).toBe(50);
    expect(gs.scores.find(s => s.playerId === 'p2')!.scores[0]).toBe(50);
    expect(gs.scores.find(s => s.playerId === 'p3')!.scores[0]).toBe(-20);
  });

  it('scores golden correctly (no bids)', () => {
    const room = makeRoomWithScores(3, 5, 'golden');
    forceComplete(room, {}, { p1: 5, p2: 0, p3: 0 });
    finishRound(room);
    const gs = room.gameSheet!;
    expect(gs.scores.find(s => s.playerId === 'p1')!.scores[0]).toBe(50);
    expect(gs.scores.find(s => s.playerId === 'p2')!.scores[0]).toBe(-50);
    expect(gs.scores.find(s => s.playerId === 'p3')!.scores[0]).toBe(-50);
  });
});

describe('finishRound — round progression', () => {
  it('advances currentRoundIndex after scoring', () => {
    const room = makeRoomWithScores(3, 3, 'normal', [
      { index: 1, type: 'normal', cardsPerPlayer: 3, label: '2' },
    ]);
    forceComplete(room, { p1: 1, p2: 1, p3: 0 }, { p1: 1, p2: 1, p3: 1 });
    finishRound(room);
    expect(room.gameSheet!.currentRoundIndex).toBe(1);
  });

  it('deals cards for the next round and returns hands', () => {
    const room = makeRoomWithScores(3, 3, 'normal', [
      { index: 1, type: 'normal', cardsPerPlayer: 3, label: '2' },
    ]);
    forceComplete(room, { p1: 1, p2: 1, p3: 0 }, { p1: 1, p2: 1, p3: 1 });
    const { nextHandsMap } = finishRound(room);
    expect(nextHandsMap).not.toBeNull();
    expect(nextHandsMap!.size).toBe(3);
    room.players.forEach(p => {
      expect(nextHandsMap!.get(p.id)!.length).toBe(3);
    });
  });

  it('next round starts in bidding phase for normal', () => {
    const room = makeRoomWithScores(3, 3, 'normal', [
      { index: 1, type: 'normal', cardsPerPlayer: 3, label: '2' },
    ]);
    forceComplete(room, { p1: 1, p2: 1, p3: 0 }, { p1: 1, p2: 1, p3: 1 });
    finishRound(room);
    expect(room.activeRound!.phase).toBe('bidding');
  });

  it('next round starts in playing phase for misere', () => {
    const room = makeRoomWithScores(3, 3, 'normal', [
      { index: 1, type: 'misere', cardsPerPlayer: 3, label: 'М' },
    ]);
    forceComplete(room, { p1: 1, p2: 1, p3: 0 }, { p1: 1, p2: 1, p3: 1 });
    finishRound(room);
    expect(room.activeRound!.phase).toBe('playing');
  });

  it('next round starts in playing phase for golden', () => {
    const room = makeRoomWithScores(3, 3, 'normal', [
      { index: 1, type: 'golden', cardsPerPlayer: 3, label: 'З' },
    ]);
    forceComplete(room, { p1: 1, p2: 1, p3: 0 }, { p1: 1, p2: 1, p3: 1 });
    finishRound(room);
    expect(room.activeRound!.phase).toBe('playing');
  });

  it('sets status=finished and activeRound=null after last round', () => {
    const room = makeRoomWithScores(3, 3, 'normal');  // single round
    forceComplete(room, { p1: 1, p2: 1, p3: 0 }, { p1: 1, p2: 1, p3: 1 });
    const { nextHandsMap } = finishRound(room);
    expect(room.status).toBe('finished');
    expect(room.activeRound).toBeNull();
    expect(nextHandsMap).toBeNull();
  });

  it('throws when round is not complete', () => {
    const room = makeRoomWithScores(3, 3, 'normal');
    expect(() => finishRound(room)).toThrow();
  });

  it('does not end game after dark round when misere/golden rounds remain', () => {
    const room = makeRoomWithScores(3, 3, 'dark', [
      { index: 1, type: 'misere' as const,  cardsPerPlayer: 3, label: 'М' },
      { index: 2, type: 'golden' as const,  cardsPerPlayer: 3, label: 'З' },
    ]);
    forceComplete(room, { p1: 1, p2: 1, p3: 1 }, { p1: 1, p2: 1, p3: 1 });
    finishRound(room);
    expect(room.status).not.toBe('finished');
    expect(room.activeRound).not.toBeNull();
    expect(room.activeRound!.phase).toBe('playing');  // misere skips bidding
    expect(room.activeRound!.roundIndex).toBe(1);
  });

  it('does not end game after no-trump round when misere rounds remain', () => {
    const room = makeRoomWithScores(3, 3, 'no-trump', [
      { index: 1, type: 'misere' as const, cardsPerPlayer: 3, label: 'М' },
    ]);
    forceComplete(room, { p1: 0, p2: 1, p3: 2 }, { p1: 0, p2: 2, p3: 1 });
    const { nextHandsMap } = finishRound(room);
    expect(room.status).not.toBe('finished');
    expect(nextHandsMap).not.toBeNull();
    expect(room.activeRound!.phase).toBe('playing');
    expect(room.activeRound!.roundIndex).toBe(1);
  });

  it('full 5-type sequence completes all rounds without premature game end', () => {
    const room = makeRoomWithScores(3, 3, 'normal', [
      { index: 1, type: 'no-trump' as const, cardsPerPlayer: 3, label: 'Б' },
      { index: 2, type: 'dark'     as const, cardsPerPlayer: 3, label: 'Т' },
      { index: 3, type: 'misere'   as const, cardsPerPlayer: 3, label: 'М' },
      { index: 4, type: 'golden'   as const, cardsPerPlayer: 3, label: 'З' },
    ]);

    // Round 0: normal (bidding)
    expect(room.activeRound!.phase).toBe('bidding');
    forceComplete(room, { p1: 1, p2: 1, p3: 1 }, { p1: 1, p2: 1, p3: 1 });
    finishRound(room);
    expect(room.status).not.toBe('finished');

    // Round 1: no-trump (bidding)
    expect(room.activeRound!.roundIndex).toBe(1);
    expect(room.activeRound!.phase).toBe('bidding');
    forceComplete(room, { p1: 0, p2: 1, p3: 2 }, { p1: 0, p2: 2, p3: 1 });
    finishRound(room);
    expect(room.status).not.toBe('finished');

    // Round 2: dark (bidding)
    expect(room.activeRound!.roundIndex).toBe(2);
    expect(room.activeRound!.phase).toBe('bidding');
    forceComplete(room, { p1: 1, p2: 1, p3: 1 }, { p1: 1, p2: 1, p3: 1 });
    finishRound(room);
    expect(room.status).not.toBe('finished');

    // Round 3: misere (playing — skips bidding)
    expect(room.activeRound!.roundIndex).toBe(3);
    expect(room.activeRound!.phase).toBe('playing');
    forceComplete(room, {}, { p1: 0, p2: 0, p3: 3 });
    finishRound(room);
    expect(room.status).not.toBe('finished');

    // Round 4: golden (playing — skips bidding, last round)
    expect(room.activeRound!.roundIndex).toBe(4);
    expect(room.activeRound!.phase).toBe('playing');
    forceComplete(room, {}, { p1: 3, p2: 0, p3: 0 });
    const { nextHandsMap } = finishRound(room);
    expect(room.status).toBe('finished');
    expect(nextHandsMap).toBeNull();
  });
});

// ─── Hand sizes across round progression ─────────────────────────────────────

describe('finishRound — hand sizes', () => {
  it('every player receives exactly cardsPerPlayer cards for the next round', () => {
    // Round 0: 3 cards → Round 1: 4 cards
    const room = makeRoomWithScores(3, 3, 'normal', [
      { index: 1, type: 'normal', cardsPerPlayer: 4, label: '4' },
    ]);
    forceComplete(room, { p1: 1, p2: 1, p3: 0 }, { p1: 1, p2: 1, p3: 1 });
    const { nextHandsMap } = finishRound(room);

    expect(nextHandsMap).not.toBeNull();
    for (const player of room.players) {
      expect(nextHandsMap!.get(player.id)!.length).toBe(4);
      expect(getHand(room.id, player.id)!.length).toBe(4);
    }
  });

  it.each([1, 2, 3, 4])(
    '3-player game: %i cards per player are dealt at round start',
    (cardsPerPlayer) => {
      const room = makeRoomWithScores(3, cardsPerPlayer, 'normal');
      for (const player of room.players) {
        expect(getHand(room.id, player.id)!.length).toBe(cardsPerPlayer);
      }
    },
  );

  it('hand sizes are correct for rounds 1→2→3 in sequence for 3 players', () => {
    const roundDefs = [
      { index: 0, type: 'normal' as const, cardsPerPlayer: 1, label: '1' },
      { index: 1, type: 'normal' as const, cardsPerPlayer: 2, label: '2' },
      { index: 2, type: 'normal' as const, cardsPerPlayer: 3, label: '3' },
    ];
    const players = Array.from({ length: 3 }, (_, i) => makePlayer(`p${i + 1}`));
    const room: GameRoom = {
      id: 'room-hand-size-seq',
      code: 'HSIZE',
      ownerId: 'p1',
      players,
      status: 'in-progress',
      gameSheet: {
        rounds: roundDefs,
        scores: players.map(p => ({
          playerId: p.id, name: p.name,
          bids:   new Array<number | null>(3).fill(null),
          scores: new Array<number | null>(3).fill(null),
          total: 0,
        })),
        currentRoundIndex: 0,
      },
      activeRound: null,
      createdAt: Date.now(),
      mode: 'normal',
    };
    const { activeRound: ar0 } = dealRound(room);
    room.activeRound = ar0;
    for (const p of players) expect(getHand(room.id, p.id)!.length).toBe(1);

    forceComplete(room, { p1: 0, p2: 0, p3: 0 }, { p1: 0, p2: 1, p3: 0 });
    const { nextHandsMap: m1 } = finishRound(room);
    expect(m1).not.toBeNull();
    for (const p of players) expect(m1!.get(p.id)!.length).toBe(2);

    forceComplete(room, { p1: 1, p2: 0, p3: 0 }, { p1: 1, p2: 1, p3: 0 });
    const { nextHandsMap: m2 } = finishRound(room);
    expect(m2).not.toBeNull();
    for (const p of players) expect(m2!.get(p.id)!.length).toBe(3);
  });
});

// ─── Joker integration ────────────────────────────────────────────────────────

const JOKER_CARD = { suit: 'joker' as const, rank: 'joker' as const, isJoker: true, label: 'Жопа' };

describe('playCard — Joker wins trick', () => {
  it('player who plays Joker wins the trick', () => {
    const room = makeRoomWithScores(3, 3, 'normal');
    const ar = room.activeRound!;
    ar.phase = 'playing';
    ar.bids = { p1: 1, p2: 1, p3: 0 };

    // Inject Joker as p1's first card
    const h1 = getHand(room.id, 'p1')!;
    h1[0] = JOKER_CARD;

    playCard(room, 'p1', JOKER_CARD, { mode: 'highest-suit', suit: 'hearts' });
    playLegalCard(room, 'p2');
    playLegalCard(room, 'p3');

    expect(ar.tricksWon['p1']).toBe(1);
    expect(ar.tricksWon['p2']).toBe(0);
    expect(ar.tricksWon['p3']).toBe(0);
  });

  it('Joker beats highest trump card', () => {
    const room = makeRoomWithScores(3, 3, 'normal');
    const ar = room.activeRound!;
    ar.phase = 'playing';
    ar.bids = { p1: 1, p2: 1, p3: 0 };
    ar.trumpSuit = 'spades';

    // p2 plays Joker; p1 leads with a trump ace to set up a strong current winner
    const h1 = getHand(room.id, 'p1')!;
    const h2 = getHand(room.id, 'p2')!;

    h1[0] = { suit: 'spades', rank: 'A', isJoker: false, label: 'A♠' }; // highest trump
    h2[0] = JOKER_CARD;

    playCard(room, 'p1', h1[0]!);                         // trump ace leads
    playCard(room, 'p2', JOKER_CARD, { mode: 'take' });   // non-leading Joker takes
    playLegalCard(room, 'p3');

    expect(ar.tricksWon['p2']).toBe(1);
    expect(ar.tricksWon['p1']).toBe(0);
  });

  it('requires declaration when Joker leads a trick', () => {
    const room = makeRoomWithScores(3, 3, 'normal');
    const ar = room.activeRound!;
    ar.phase = 'playing';
    ar.bids = { p1: 1, p2: 1, p3: 0 };
    const h1 = getHand(room.id, 'p1')!;
    h1[0] = JOKER_CARD;
    const result = playCard(room, 'p1', JOKER_CARD); // no declaration
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('rejects highest/lowest-suit declaration without a suit', () => {
    const room = makeRoomWithScores(3, 3, 'normal');
    const ar = room.activeRound!;
    ar.phase = 'playing';
    ar.bids = { p1: 1, p2: 1, p3: 0 };
    const h1 = getHand(room.id, 'p1')!;
    h1[0] = JOKER_CARD;
    const result = playCard(room, 'p1', JOKER_CARD, { mode: 'highest-suit' });
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('first Joker beats second Joker', () => {
    const room = makeRoomWithScores(3, 3, 'normal');
    const ar = room.activeRound!;
    ar.phase = 'playing';
    ar.bids = { p1: 1, p2: 1, p3: 0 };

    // Give both p1 and p2 Jokers
    const h1 = getHand(room.id, 'p1')!;
    const h2 = getHand(room.id, 'p2')!;
    h1[0] = JOKER_CARD;
    h2[0] = { ...JOKER_CARD }; // second Joker (copy so !== same ref)

    // highest-suit: p1 (Joker declarant) wins unconditionally regardless of other Jokers
    playCard(room, 'p1', h1[0]!, { mode: 'highest-suit', suit: 'hearts' });
    playCard(room, 'p2', h2[0]!, { mode: 'take' }); // second Joker (non-leading) — p1 still wins
    playLegalCard(room, 'p3');

    expect(ar.tricksWon['p1']).toBe(1); // first Joker (declarant) wins
    expect(ar.tricksWon['p2']).toBe(0);
  });
});

// ─── Non-leading Joker integration ───────────────────────────────────────────

describe('playCard — non-leading Joker validation', () => {
  it('rejects non-leading Joker without a declaration', () => {
    const room = makeRoomWithScores(3, 3, 'normal');
    const ar = room.activeRound!;
    ar.phase = 'playing';
    ar.bids = { p1: 1, p2: 1, p3: 0 };
    const h1 = getHand(room.id, 'p1')!;
    const h2 = getHand(room.id, 'p2')!;
    h1[0] = { suit: 'hearts', rank: 'A', isJoker: false, label: 'A♥' };
    h2[0] = JOKER_CARD;
    playCard(room, 'p1', h1[0]!); // normal lead
    expect(playCard(room, 'p2', JOKER_CARD)).toEqual({ ok: false, error: expect.any(String) });
  });

  it('rejects non-leading Joker with a leading-only mode', () => {
    const room = makeRoomWithScores(3, 3, 'normal');
    const ar = room.activeRound!;
    ar.phase = 'playing';
    ar.bids = { p1: 1, p2: 1, p3: 0 };
    const h1 = getHand(room.id, 'p1')!;
    const h2 = getHand(room.id, 'p2')!;
    h1[0] = { suit: 'hearts', rank: 'A', isJoker: false, label: 'A♥' };
    h2[0] = JOKER_CARD;
    playCard(room, 'p1', h1[0]!);
    expect(playCard(room, 'p2', JOKER_CARD, { mode: 'highest-suit', suit: 'hearts' }))
      .toEqual({ ok: false, error: expect.any(String) });
  });

  it('accepts take and lay-down for non-leading Joker', () => {
    for (const mode of ['take', 'lay-down'] as const) {
      const room = makeRoomWithScores(3, 3, 'normal');
      const ar = room.activeRound!;
      ar.phase = 'playing';
      ar.bids = { p1: 1, p2: 1, p3: 0 };
      const h1 = getHand(room.id, 'p1')!;
      const h2 = getHand(room.id, 'p2')!;
      h1[0] = { suit: 'hearts', rank: 'A', isJoker: false, label: 'A♥' };
      h2[0] = JOKER_CARD;
      playCard(room, 'p1', h1[0]!);
      expect(playCard(room, 'p2', JOKER_CARD, { mode })).toEqual({ ok: true });
    }
  });
});

describe('playCard — non-leading Joker modes', () => {
  function setupNonLeadingJoker() {
    const room = makeRoomWithScores(3, 3, 'normal');
    const ar = room.activeRound!;
    ar.phase = 'playing';
    ar.bids = { p1: 1, p2: 1, p3: 0 };
    // Fix trump to hearts so trick-winner tests are deterministic regardless of deal
    ar.trumpSuit = 'hearts';
    const h1 = getHand(room.id, 'p1')!;
    const h2 = getHand(room.id, 'p2')!;
    const h3 = getHand(room.id, 'p3')!;
    // p1 leads with spades ace; p2 has the Joker; p3 has only clubs (no spades/hearts)
    h1[0] = { suit: 'spades', rank: 'A', isJoker: false, label: 'A♠' };
    h2[0] = JOKER_CARD;
    for (let i = 0; i < h3.length; i++) h3[i] = { suit: 'clubs', rank: '7', isJoker: false, label: '7♣' };
    return { room, ar, h1, h2 };
  }

  it('take: Joker wins the trick over lead-suit ace', () => {
    const { room, ar, h1, h2 } = setupNonLeadingJoker();
    playCard(room, 'p1', h1[0]!);                        // A♠ leads
    playCard(room, 'p2', h2[0]!, { mode: 'take' });      // Joker takes
    playLegalCard(room, 'p3');
    expect(ar.tricksWon['p2']).toBe(1);
    expect(ar.tricksWon['p1']).toBe(0);
  });

  it('lay-down: A♠ wins when Joker is ignored', () => {
    const { room, ar, h1, h2 } = setupNonLeadingJoker();
    playCard(room, 'p1', h1[0]!);                          // A♠ leads
    playCard(room, 'p2', h2[0]!, { mode: 'lay-down' });   // Joker laid down
    playLegalCard(room, 'p3');
    expect(ar.tricksWon['p1']).toBe(1); // A♠ is the best non-Joker card
    expect(ar.tricksWon['p2']).toBe(0);
  });

  it('lay-down: sets jokerDeclaration so winner logic excludes Joker', () => {
    const { room, ar, h1, h2 } = setupNonLeadingJoker();
    playCard(room, 'p1', h1[0]!);
    playCard(room, 'p2', h2[0]!, { mode: 'lay-down' });
    expect(ar.jokerDeclaration).toEqual({ mode: 'lay-down' });
  });

  it('take: does not set jokerDeclaration (Joker wins via normal path)', () => {
    const { room, ar, h1, h2 } = setupNonLeadingJoker();
    playCard(room, 'p1', h1[0]!);
    playCard(room, 'p2', h2[0]!, { mode: 'take' });
    expect(ar.jokerDeclaration).toBeNull();
  });

  it('jokerDeclaration is cleared after trick completes', () => {
    const { room, ar, h1, h2 } = setupNonLeadingJoker();
    playCard(room, 'p1', h1[0]!);
    playCard(room, 'p2', h2[0]!, { mode: 'lay-down' });
    playLegalCard(room, 'p3');
    expect(ar.jokerDeclaration).toBeNull();
  });
});

// ─── Joker declaration mode integration ──────────────────────────────────────

function makePlayingRoom() {
  const room = makeRoomWithScores(3, 5, 'normal');
  const ar = room.activeRound!;
  ar.phase = 'playing';
  ar.bids = { p1: 2, p2: 1, p3: 0 };
  return room;
}

describe('Joker declaration — highest-suit', () => {
  it('Joker player wins the trick', () => {
    const room = makePlayingRoom();
    const ar = room.activeRound!;
    const h1 = getHand(room.id, 'p1')!;
    h1[0] = JOKER_CARD;

    // p1 leads with Joker declaring highest hearts
    playCard(room, 'p1', JOKER_CARD, { mode: 'highest-suit', suit: 'hearts' });

    // jokerDeclaration is stored; leadSuit = hearts
    expect(ar.jokerDeclaration).toEqual({ mode: 'highest-suit', suit: 'hearts' });
    expect(ar.leadSuit).toBe('hearts');

    playLegalCard(room, 'p2');
    playLegalCard(room, 'p3');

    expect(ar.tricksWon['p1']).toBe(1);
    expect(ar.tricksWon['p2']).toBe(0);
    expect(ar.tricksWon['p3']).toBe(0);
  });

  it('jokerDeclaration is cleared after the trick completes', () => {
    const room = makePlayingRoom();
    const ar = room.activeRound!;
    const h1 = getHand(room.id, 'p1')!;
    h1[0] = JOKER_CARD;
    playCard(room, 'p1', JOKER_CARD, { mode: 'highest-suit', suit: 'hearts' });
    playLegalCard(room, 'p2');
    playLegalCard(room, 'p3');
    expect(ar.jokerDeclaration).toBeNull();
  });

  it('followers with the declared suit must play their highest card', () => {
    const room = makePlayingRoom();
    const ar = room.activeRound!;
    const h1 = getHand(room.id, 'p1')!;
    const h2 = getHand(room.id, 'p2')!;
    h1[0] = JOKER_CARD;
    // Replace the entire hand so K♥ is definitively the highest heart present
    for (let i = 0; i < h2.length; i++) h2[i] = { suit: 'clubs', rank: '8', isJoker: false, label: '8♣' };
    h2[0] = { suit: 'hearts', rank: 'K', isJoker: false, label: 'K♥' };
    h2[1] = { suit: 'hearts', rank: '7', isJoker: false, label: '7♥' };

    playCard(room, 'p1', JOKER_CARD, { mode: 'highest-suit', suit: 'hearts' });

    // K♥ is the highest → legal; 7♥ is not
    expect(playCard(room, 'p2', h2[1]!)).toEqual({ ok: false, error: expect.any(String) });
    expect(playCard(room, 'p2', h2[0]!)).toEqual({ ok: true });
  });
});

describe('Joker declaration — lowest-suit', () => {
  it('the highest declared-suit card wins, not the Joker', () => {
    const room = makePlayingRoom();
    const ar = room.activeRound!;
    const h1 = getHand(room.id, 'p1')!;
    const h2 = getHand(room.id, 'p2')!;
    const h3 = getHand(room.id, 'p3')!;
    h1[0] = JOKER_CARD;
    h2[0] = { suit: 'hearts', rank: 'A', isJoker: false, label: 'A♥' };
    h3[0] = { suit: 'hearts', rank: 'K', isJoker: false, label: 'K♥' };
    // Remove other hearts from h2/h3 to avoid multiple-option ambiguity
    for (let i = 1; i < h2.length; i++) {
      if (!h2[i]!.isJoker && h2[i]!.suit === 'hearts') h2[i] = { suit: 'clubs', rank: '8', isJoker: false, label: '8♣' };
    }
    for (let i = 1; i < h3.length; i++) {
      if (!h3[i]!.isJoker && h3[i]!.suit === 'hearts') h3[i] = { suit: 'clubs', rank: '9', isJoker: false, label: '9♣' };
    }

    playCard(room, 'p1', JOKER_CARD, { mode: 'lowest-suit', suit: 'hearts' });
    expect(ar.leadSuit).toBe('hearts');

    playCard(room, 'p2', h2[0]!); // A♥
    playCard(room, 'p3', h3[0]!); // K♥

    expect(ar.tricksWon['p2']).toBe(1); // A♥ wins (highest hearts)
    expect(ar.tricksWon['p1']).toBe(0); // Joker does not win
  });

  it('followers with the declared suit must play their lowest card', () => {
    const room = makePlayingRoom();
    const ar = room.activeRound!;
    const h1 = getHand(room.id, 'p1')!;
    const h2 = getHand(room.id, 'p2')!;
    h1[0] = JOKER_CARD;
    // Replace the entire hand so 7♥ is definitively the lowest heart present
    for (let i = 0; i < h2.length; i++) h2[i] = { suit: 'clubs', rank: '8', isJoker: false, label: '8♣' };
    h2[0] = { suit: 'hearts', rank: 'A', isJoker: false, label: 'A♥' };
    h2[1] = { suit: 'hearts', rank: '7', isJoker: false, label: '7♥' };

    playCard(room, 'p1', JOKER_CARD, { mode: 'lowest-suit', suit: 'hearts' });

    // A♥ is not the lowest → illegal; 7♥ is the lowest → legal
    expect(playCard(room, 'p2', h2[0]!)).toEqual({ ok: false, error: expect.any(String) });
    expect(playCard(room, 'p2', h2[1]!)).toEqual({ ok: true });
  });
});

describe('Joker declaration — lay-down', () => {
  it('first non-Joker sets effective lead suit', () => {
    const room = makePlayingRoom();
    const ar = room.activeRound!;
    const h1 = getHand(room.id, 'p1')!;
    const h2 = getHand(room.id, 'p2')!;
    h1[0] = JOKER_CARD;
    // Inject a known non-Joker card so the test is not affected by random deal
    h2[0] = { suit: 'clubs', rank: '8', isJoker: false, label: '8♣' };

    playCard(room, 'p1', JOKER_CARD, { mode: 'lay-down' });
    expect(ar.leadSuit).toBeNull(); // not yet set

    const p2Card = h2[0]!; // saved before splice
    playCard(room, 'p2', p2Card); // first non-Joker establishes lead
    expect(ar.leadSuit).toBe('clubs');
  });

  it('Joker does not win; normal trick winner among non-Joker cards', () => {
    const room = makePlayingRoom();
    const ar = room.activeRound!;
    const h1 = getHand(room.id, 'p1')!;
    const h2 = getHand(room.id, 'p2')!;
    const h3 = getHand(room.id, 'p3')!;
    h1[0] = JOKER_CARD;
    // Inject controlled cards so p2 establishes clubs as lead and p3's A♣ wins
    h2[0] = { suit: 'clubs', rank: '7', isJoker: false, label: '7♣' };
    h3[0] = { suit: 'clubs', rank: 'A', isJoker: false, label: 'A♣' };

    playCard(room, 'p1', JOKER_CARD, { mode: 'lay-down' });
    playCard(room, 'p2', h2[0]!);    // 7♣ establishes leadSuit = clubs
    playCard(room, 'p3', h3[0]!);    // A♣ wins

    expect(ar.tricksWon['p3']).toBe(1);
    expect(ar.tricksWon['p1']).toBe(0); // Joker does not win
  });
});

// ─── Round starter rotation ───────────────────────────────────────────────────

describe('getRoundStarterIndex', () => {
  it('returns 0 for round 0 regardless of player count', () => {
    expect(getRoundStarterIndex(0, 3)).toBe(0);
    expect(getRoundStarterIndex(0, 4)).toBe(0);
    expect(getRoundStarterIndex(0, 8)).toBe(0);
  });

  it('increments by 1 each round', () => {
    expect(getRoundStarterIndex(1, 4)).toBe(1);
    expect(getRoundStarterIndex(2, 4)).toBe(2);
    expect(getRoundStarterIndex(3, 4)).toBe(3);
  });

  it('wraps back to 0 after reaching playerCount', () => {
    expect(getRoundStarterIndex(4, 4)).toBe(0);
    expect(getRoundStarterIndex(5, 4)).toBe(1);
    expect(getRoundStarterIndex(8, 4)).toBe(0);
  });

  it('wraps correctly for 3 players', () => {
    expect(getRoundStarterIndex(3, 3)).toBe(0);
    expect(getRoundStarterIndex(4, 3)).toBe(1);
    expect(getRoundStarterIndex(5, 3)).toBe(2);
  });

  it('wraps correctly for 5 players', () => {
    expect(getRoundStarterIndex(5, 5)).toBe(0);
    expect(getRoundStarterIndex(9, 5)).toBe(4);
  });

  it('wraps correctly for 8 players', () => {
    expect(getRoundStarterIndex(8, 8)).toBe(0);
    expect(getRoundStarterIndex(15, 8)).toBe(7);
    expect(getRoundStarterIndex(16, 8)).toBe(0);
  });
});

describe('dealRound — round starter rotation', () => {
  it.each([
    [3, 0, 'p1'],
    [3, 1, 'p2'],
    [3, 2, 'p3'],
    [3, 3, 'p1'],
    [4, 0, 'p1'],
    [4, 1, 'p2'],
    [4, 3, 'p4'],
    [4, 4, 'p1'],
    [5, 0, 'p1'],
    [5, 4, 'p5'],
    [5, 5, 'p1'],
    [8, 0, 'p1'],
    [8, 7, 'p8'],
    [8, 8, 'p1'],
  ])(
    '%i players round %i → starter %s',
    (players, roundIdx, expectedStarter) => {
      const room = makeRoomForDeal(players, 3, roundIdx);
      expect(room.activeRound!.currentTurnPlayerId).toBe(expectedStarter);
      expect(room.activeRound!.trickLeadPlayerId).toBe(expectedStarter);
    },
  );

  it('bidding for round 1 (3 players) starts with p2, not p1', () => {
    const room = makeRoomForDeal(3, 3, 1);
    expect(placeBid(room, 'p1', 1)).toEqual({ ok: false, error: expect.any(String) });
    expect(placeBid(room, 'p2', 1)).toEqual({ ok: true });
  });

  it('bidding order wraps around from the rotation starter', () => {
    // round 2, 3 players → p3 starts; order: p3 → p1 → p2
    const room = makeRoomForDeal(3, 3, 2);
    expect(room.activeRound!.currentTurnPlayerId).toBe('p3');
    placeBid(room, 'p3', 1);
    expect(room.activeRound!.currentTurnPlayerId).toBe('p1');
    placeBid(room, 'p1', 1);
    expect(room.activeRound!.currentTurnPlayerId).toBe('p2');
  });

  it('after all bids, playing phase starts from the rotation starter', () => {
    // round 1, 3 players → p2 starts bidding and first trick
    const room = makeRoomForDeal(3, 3, 1);
    // bidding order: p2 → p3 → p1
    placeBid(room, 'p2', 1);
    placeBid(room, 'p3', 1);
    placeBid(room, 'p1', 0);
    expect(room.activeRound!.phase).toBe('playing');
    expect(room.activeRound!.currentTurnPlayerId).toBe('p2');
  });

  it('trick winner leads next trick, overriding the rotation starter', () => {
    // round 0, p1 starts; force p2 to win trick 1; p2 should lead trick 2
    const room = makeRoomForDeal(3, 3, 0);
    expect(room.activeRound!.currentTurnPlayerId).toBe('p1');
    const ar = room.activeRound!;
    ar.phase = 'playing';
    ar.bids = { p1: 1, p2: 1, p3: 0 };
    // Pin trump to hearts so p3 cannot play an off-suit trump that beats A♥
    ar.trumpSuit = 'hearts';

    const h1 = getHand(room.id, 'p1')!;
    const h2 = getHand(room.id, 'p2')!;
    const h3 = getHand(room.id, 'p3')!;
    h1[0] = { suit: 'hearts', rank: '6', isJoker: false, label: '6♥' };
    h2[0] = { suit: 'hearts', rank: 'A', isJoker: false, label: 'A♥' };
    // Give p3 only clubs so they have no hearts (lead/trump) and cannot beat A♥
    for (let i = 0; i < h3.length; i++) h3[i] = { suit: 'clubs', rank: '7', isJoker: false, label: '7♣' };

    playCard(room, 'p1', h1[0]!);  // p1 leads low hearts
    playCard(room, 'p2', h2[0]!);  // p2 plays A♥ — wins
    playLegalCard(room, 'p3');

    expect(ar.trickLeadPlayerId).toBe('p2');
    expect(ar.currentTurnPlayerId).toBe('p2');
  });
});

// ─── Trump determination ──────────────────────────────────────────────────────

describe('pickTrumpCard', () => {
  it('returns the first kitty card when cards remain after dealing', () => {
    const deck = createDeck(); // unshuffled, deterministic
    // 4 players × 8 cards = 32 dealt; kitty starts at index 32
    const trump = pickTrumpCard(deck, 4, 8);
    expect(trump).toEqual(deck[32]);
  });

  it('returns deck[0] when all cards are dealt (no kitty)', () => {
    const deck = createDeck();
    // 3 players × 11 cards = 33 dealt; kitty empty → deck[0]
    const trump = pickTrumpCard(deck, 3, 11);
    expect(trump).toEqual(deck[0]);
  });

  it('returns deck[N] matching kittyStart for various player counts', () => {
    const deck = createDeck();
    expect(pickTrumpCard(deck, 3, 5)).toEqual(deck[15]); // 3×5=15
    expect(pickTrumpCard(deck, 5, 6)).toEqual(deck[30]); // 5×6=30
    expect(pickTrumpCard(deck, 8, 4)).toEqual(deck[32]); // 8×4=32
  });
});

describe('dealRound — trump determination', () => {
  it('normal round: trumpCard is set before bidding phase begins', () => {
    const room = makeRoomWithScores(4, 8, 'normal');
    const ar = room.activeRound!;
    expect(ar.phase).toBe('bidding');
    expect(ar.trumpCard).not.toBeNull();
  });

  it('normal round: trumpSuit matches trumpCard suit', () => {
    const room = makeRoomWithScores(4, 8, 'normal');
    const ar = room.activeRound!;
    if (!ar.trumpCard!.isJoker) {
      expect(ar.trumpSuit).toBe(ar.trumpCard!.suit);
    } else {
      expect(ar.trumpSuit).toBeNull();
    }
  });

  it('no-trump round: both trumpCard and trumpSuit are null', () => {
    const room = makeRoomWithScores(4, 8, 'no-trump');
    const ar = room.activeRound!;
    expect(ar.trumpCard).toBeNull();
    expect(ar.trumpSuit).toBeNull();
  });

  it('misere round: has trump card and trump suit before playing', () => {
    const room = makeRoomWithScores(4, 8, 'misere');
    const ar = room.activeRound!;
    expect(ar.trumpCard).not.toBeNull();
    expect(ar.trumpSuit).toBe(ar.trumpCard!.isJoker ? null : ar.trumpCard!.suit);
  });

  it('golden round: has trump card and trump suit before playing', () => {
    const room = makeRoomWithScores(4, 8, 'golden');
    const ar = room.activeRound!;
    expect(ar.trumpCard).not.toBeNull();
    expect(ar.trumpSuit).toBe(ar.trumpCard!.isJoker ? null : ar.trumpCard!.suit);
  });

  it('4 players × 8 cards: trump card is the kitty card (not in any hand)', () => {
    const room = makeRoomWithScores(4, 8, 'normal');
    const ar = room.activeRound!;
    expect(ar.trumpCard).not.toBeNull();
    // 4×8=32 dealt → trumpCard = deck[32] → absent from all player hands
    const allCards = ['p1', 'p2', 'p3', 'p4'].flatMap(id => getHand(room.id, id) ?? []);
    const foundInHand = allCards.some(
      c => c.suit === ar.trumpCard!.suit && c.rank === ar.trumpCard!.rank,
    );
    expect(foundInHand).toBe(false);
  });

  it('3 players × 11 cards: trump card is deck[0] and lives in p1\'s hand', () => {
    const room = makeRoomWithScores(3, 11, 'normal');
    const ar = room.activeRound!;
    expect(ar.trumpCard).not.toBeNull();
    // 3×11=33 = full deck → trumpCard = deck[0] → goes to hands[0][0] = p1's first card
    const p1Hand = getHand(room.id, 'p1')!;
    const foundInP1Hand = p1Hand.some(
      c => c.suit === ar.trumpCard!.suit && c.rank === ar.trumpCard!.rank,
    );
    expect(foundInP1Hand).toBe(true);
  });

  it('Joker as trump card sets trumpSuit to null', () => {
    // Build a deck with Joker at position 32 (kitty for 4×8=32 dealt)
    const deck = createDeck();
    const jokerIdx = deck.findIndex(c => c.isJoker);
    const kittyPos = 32;
    [deck[kittyPos], deck[jokerIdx]] = [deck[jokerIdx]!, deck[kittyPos]!];

    const room = makeRoomWithScores(4, 8, 'normal');
    const { activeRound } = dealRound(room, deck);
    room.activeRound = activeRound;

    expect(room.activeRound.trumpCard).not.toBeNull();
    expect(room.activeRound.trumpCard!.isJoker).toBe(true);
    expect(room.activeRound.trumpSuit).toBeNull();
  });

  it('dark round: trump is determined the same as a normal round', () => {
    const room = makeRoomWithScores(4, 8, 'dark');
    const ar = room.activeRound!;
    expect(ar.trumpCard).not.toBeNull();
  });

  it('misere round: starts in playing phase (no bidding)', () => {
    const room = makeRoomWithScores(4, 8, 'misere');
    expect(room.activeRound!.phase).toBe('playing');
  });

  it('golden round: starts in playing phase (no bidding)', () => {
    const room = makeRoomWithScores(4, 8, 'golden');
    expect(room.activeRound!.phase).toBe('playing');
  });
});

// ─── Dark bid mechanics ───────────────────────────────────────────────────────

describe('placeBid — dark flag', () => {
  it('stores isDark=true in playerDarkFlags when dark bid submitted', () => {
    const room = makeRoom(3, 5);
    placeBid(room, 'p1', 2, true);
    expect(room.activeRound!.playerDarkFlags['p1']).toBe(true);
  });

  it('stores isDark=false in playerDarkFlags when non-dark bid submitted', () => {
    const room = makeRoom(3, 5);
    placeBid(room, 'p1', 2, false);
    expect(room.activeRound!.playerDarkFlags['p1']).toBe(false);
  });

  it('default isDark=false when param omitted', () => {
    const room = makeRoom(3, 5);
    placeBid(room, 'p1', 2);
    expect(room.activeRound!.playerDarkFlags['p1']).toBe(false);
  });
});

describe('finishRound — dark bid scoring', () => {
  // ── normal round, player selected dark ─────────────────────────────────────
  //
  // Uses the same scoreDark function as the dark round type:
  //   bid=0 exact → +5;  bid=0 overtrick → +taken
  //   bid>0 exact → +20×bid;  bid>0 overtrick → +taken;  undertrick → -20×missing

  it('normal round: dark player uses dark scoring rules', () => {
    const room = makeRoomWithScores(3, 5, 'normal');
    room.activeRound!.playerDarkFlags['p1'] = true;
    // p1 dark: bid=2 exact → +40;  p2 not dark: bid=2 undertrick → -20;  p3 not dark: bid=0 overtrick → +3
    forceComplete(room, { p1: 2, p2: 2, p3: 0 }, { p1: 2, p2: 0, p3: 3 });
    finishRound(room);
    const gs = room.gameSheet!;
    expect(gs.scores.find(s => s.playerId === 'p1')!.scores[0]).toBe(40);
    expect(gs.scores.find(s => s.playerId === 'p2')!.scores[0]).toBe(-20);
    expect(gs.scores.find(s => s.playerId === 'p3')!.scores[0]).toBe(3);
  });

  it('normal round dark: 0T → 0 = +5', () => {
    const room = makeRoomWithScores(3, 5, 'normal');
    room.activeRound!.playerDarkFlags['p1'] = true;
    forceComplete(room, { p1: 0, p2: 1, p3: 1 }, { p1: 0, p2: 1, p3: 4 });
    finishRound(room);
    expect(room.gameSheet!.scores.find(s => s.playerId === 'p1')!.scores[0]).toBe(5);
  });

  it('normal round dark: 0T → 1 = +1', () => {
    const room = makeRoomWithScores(3, 5, 'normal');
    room.activeRound!.playerDarkFlags['p1'] = true;
    forceComplete(room, { p1: 0, p2: 1, p3: 1 }, { p1: 1, p2: 1, p3: 3 });
    finishRound(room);
    expect(room.gameSheet!.scores.find(s => s.playerId === 'p1')!.scores[0]).toBe(1);
  });

  it('normal round dark: 1T → 1 = +20', () => {
    const room = makeRoomWithScores(3, 5, 'normal');
    room.activeRound!.playerDarkFlags['p1'] = true;
    forceComplete(room, { p1: 1, p2: 1, p3: 1 }, { p1: 1, p2: 2, p3: 2 });
    finishRound(room);
    expect(room.gameSheet!.scores.find(s => s.playerId === 'p1')!.scores[0]).toBe(20);
  });

  it('normal round dark: 1T → 2 = +2 (overtrick, no multiplier)', () => {
    const room = makeRoomWithScores(3, 5, 'normal');
    room.activeRound!.playerDarkFlags['p1'] = true;
    forceComplete(room, { p1: 1, p2: 1, p3: 1 }, { p1: 2, p2: 1, p3: 2 });
    finishRound(room);
    expect(room.gameSheet!.scores.find(s => s.playerId === 'p1')!.scores[0]).toBe(2);
  });

  it('normal round dark: 2T → 2 = +40', () => {
    const room = makeRoomWithScores(3, 5, 'normal');
    room.activeRound!.playerDarkFlags['p1'] = true;
    forceComplete(room, { p1: 2, p2: 1, p3: 1 }, { p1: 2, p2: 1, p3: 2 });
    finishRound(room);
    expect(room.gameSheet!.scores.find(s => s.playerId === 'p1')!.scores[0]).toBe(40);
  });

  it('normal round dark: 2T → 3 = +3 (overtrick, no multiplier)', () => {
    const room = makeRoomWithScores(3, 5, 'normal');
    room.activeRound!.playerDarkFlags['p1'] = true;
    forceComplete(room, { p1: 2, p2: 1, p3: 0 }, { p1: 3, p2: 1, p3: 1 });
    finishRound(room);
    expect(room.gameSheet!.scores.find(s => s.playerId === 'p1')!.scores[0]).toBe(3);
  });

  it('normal round dark: 2T → 1 = -20 (undertrick)', () => {
    const room = makeRoomWithScores(3, 5, 'normal');
    room.activeRound!.playerDarkFlags['p1'] = true;
    forceComplete(room, { p1: 2, p2: 1, p3: 1 }, { p1: 1, p2: 1, p3: 3 });
    finishRound(room);
    expect(room.gameSheet!.scores.find(s => s.playerId === 'p1')!.scores[0]).toBe(-20);
  });

  it('normal round non-dark score is unchanged (normal scoring)', () => {
    const room = makeRoomWithScores(3, 5, 'normal');
    // no dark flags set
    forceComplete(room, { p1: 2, p2: 2, p3: 0 }, { p1: 2, p2: 0, p3: 3 });
    finishRound(room);
    const gs = room.gameSheet!;
    expect(gs.scores.find(s => s.playerId === 'p1')!.scores[0]).toBe(20);
    expect(gs.scores.find(s => s.playerId === 'p2')!.scores[0]).toBe(-20);
    expect(gs.scores.find(s => s.playerId === 'p3')!.scores[0]).toBe(3);
  });

  // ── dark round type (Т) ────────────────────────────────────────────────────

  it('dark round type: 0T → 0 = +5', () => {
    const room = makeRoomWithScores(3, 5, 'dark');
    forceComplete(room, { p1: 0, p2: 1, p3: 1 }, { p1: 0, p2: 1, p3: 4 });
    finishRound(room);
    expect(room.gameSheet!.scores.find(s => s.playerId === 'p1')!.scores[0]).toBe(5);
  });

  it('dark round type: 0T → 1 = +1', () => {
    const room = makeRoomWithScores(3, 5, 'dark');
    forceComplete(room, { p1: 0, p2: 1, p3: 1 }, { p1: 1, p2: 1, p3: 3 });
    finishRound(room);
    expect(room.gameSheet!.scores.find(s => s.playerId === 'p1')!.scores[0]).toBe(1);
  });

  it('dark round type: 1T → 1 = +20', () => {
    const room = makeRoomWithScores(3, 5, 'dark');
    forceComplete(room, { p1: 1, p2: 1, p3: 1 }, { p1: 1, p2: 2, p3: 2 });
    finishRound(room);
    expect(room.gameSheet!.scores.find(s => s.playerId === 'p1')!.scores[0]).toBe(20);
  });

  it('dark round type: 1T → 2 = +2 (overtrick, no multiplier)', () => {
    const room = makeRoomWithScores(3, 5, 'dark');
    forceComplete(room, { p1: 1, p2: 1, p3: 1 }, { p1: 2, p2: 1, p3: 2 });
    finishRound(room);
    expect(room.gameSheet!.scores.find(s => s.playerId === 'p1')!.scores[0]).toBe(2);
  });

  it('dark round type: 2T → 2 = +40', () => {
    const room = makeRoomWithScores(3, 5, 'dark');
    forceComplete(room, { p1: 2, p2: 2, p3: 0 }, { p1: 2, p2: 0, p3: 3 });
    finishRound(room);
    const gs = room.gameSheet!;
    expect(gs.scores.find(s => s.playerId === 'p1')!.scores[0]).toBe(40);
    expect(gs.scores.find(s => s.playerId === 'p2')!.scores[0]).toBe(-40);
    expect(gs.scores.find(s => s.playerId === 'p3')!.scores[0]).toBe(3);
  });

  it('dark round type: 2T → 3 = +3 (overtrick, no multiplier)', () => {
    const room = makeRoomWithScores(3, 5, 'dark');
    forceComplete(room, { p1: 2, p2: 1, p3: 0 }, { p1: 3, p2: 1, p3: 1 });
    finishRound(room);
    expect(room.gameSheet!.scores.find(s => s.playerId === 'p1')!.scores[0]).toBe(3);
  });

  it('dark round type: 2T → 1 = -20 (undertrick)', () => {
    const room = makeRoomWithScores(3, 5, 'dark');
    forceComplete(room, { p1: 2, p2: 1, p3: 1 }, { p1: 1, p2: 1, p3: 3 });
    finishRound(room);
    expect(room.gameSheet!.scores.find(s => s.playerId === 'p1')!.scores[0]).toBe(-20);
  });

  it('playerDarkFlags in a dark round type has no additional effect', () => {
    const room = makeRoomWithScores(3, 5, 'dark');
    room.activeRound!.playerDarkFlags['p1'] = true;
    forceComplete(room, { p1: 2, p2: 2, p3: 0 }, { p1: 2, p2: 0, p3: 3 });
    finishRound(room);
    // scoreType resolves to 'dark' regardless of playerDarkFlags (which only applies to 'normal' rounds)
    expect(room.gameSheet!.scores.find(s => s.playerId === 'p1')!.scores[0]).toBe(40);
  });
});

// ─── Special round types — bidding phase regression ───────────────────────────
//
// Regression: the no-trump round bidding phase was completely blocked in the UI
// because BidPanel only showed bid buttons for 'dark' and 'normal' rounds.
// These server-side tests verify that placeBid accepts bids in all round types
// that have a bidding phase, so the server never silently rejects a valid bid.

describe('placeBid — no-trump round', () => {
  it('enters bidding phase (not playing) when the round starts', () => {
    const room = makeRoomWithScores(3, 5, 'no-trump');
    expect(room.activeRound!.phase).toBe('bidding');
  });

  it('has no trump card in a no-trump round', () => {
    const room = makeRoomWithScores(3, 5, 'no-trump');
    expect(room.activeRound!.trumpSuit).toBeNull();
    expect(room.activeRound!.trumpCard).toBeNull();
  });

  it('accepts any bid in range for first bidder', () => {
    const room = makeRoomWithScores(3, 5, 'no-trump');
    const ar = room.activeRound!;
    const firstBidder = ar.currentTurnPlayerId;
    expect(placeBid(room, firstBidder, 2)).toEqual({ ok: true });
  });

  it('accepts bid 0 for first bidder with clean history', () => {
    const room = makeRoomWithScores(3, 5, 'no-trump');
    const firstBidder = room.activeRound!.currentTurnPlayerId;
    expect(placeBid(room, firstBidder, 0)).toEqual({ ok: true });
  });

  it('accepts bid equal to cardsPerPlayer for first bidder', () => {
    const room = makeRoomWithScores(3, 5, 'no-trump');
    const firstBidder = room.activeRound!.currentTurnPlayerId;
    expect(placeBid(room, firstBidder, 5)).toEqual({ ok: true });
  });

  it('transitions to playing phase after all players bid', () => {
    const room = makeRoomWithScores(3, 5, 'no-trump');
    const ar = room.activeRound!;
    const [p1, p2, p3] = room.players.map(p => p.id);
    ar.currentTurnPlayerId = p1!;
    placeBid(room, p1!, 1);
    placeBid(room, p2!, 2);
    placeBid(room, p3!, 3);
    expect(ar.phase).toBe('playing');
  });

  it('enforces last-bidder total rule the same as a normal round', () => {
    const room = makeRoomWithScores(3, 5, 'no-trump');
    const ar = room.activeRound!;
    const [p1, p2, p3] = room.players.map(p => p.id);
    ar.currentTurnPlayerId = p1!;
    placeBid(room, p1!, 2);
    placeBid(room, p2!, 1);
    // total=3; forbidden for p3 is 2 (3+2=5=cardsPerPlayer)
    expect(placeBid(room, p3!, 2)).toEqual({ ok: false, error: expect.any(String) });
    expect(placeBid(room, p3!, 3)).toEqual({ ok: true });
  });
});

describe('placeBid — dark round', () => {
  it('enters bidding phase when the round starts', () => {
    const room = makeRoomWithScores(3, 5, 'dark');
    expect(room.activeRound!.phase).toBe('bidding');
  });

  it('has a trump card in a dark round', () => {
    const room = makeRoomWithScores(3, 5, 'dark');
    expect(room.activeRound!.trumpSuit).not.toBeNull();
  });

  it('accepts bid with isDark=true and stores flag', () => {
    const room = makeRoomWithScores(3, 5, 'dark');
    const firstBidder = room.activeRound!.currentTurnPlayerId;
    expect(placeBid(room, firstBidder, 2, true)).toEqual({ ok: true });
    expect(room.activeRound!.playerDarkFlags[firstBidder]).toBe(true);
  });

  it('accepts bid with isDark=false', () => {
    const room = makeRoomWithScores(3, 5, 'dark');
    const firstBidder = room.activeRound!.currentTurnPlayerId;
    expect(placeBid(room, firstBidder, 2, false)).toEqual({ ok: true });
  });

  it('transitions to playing phase after all bids', () => {
    const room = makeRoomWithScores(3, 5, 'dark');
    const ar = room.activeRound!;
    const [p1, p2, p3] = room.players.map(p => p.id);
    ar.currentTurnPlayerId = p1!;
    placeBid(room, p1!, 1, false);
    placeBid(room, p2!, 2, true);
    placeBid(room, p3!, 3, false);
    expect(ar.phase).toBe('playing');
  });
});

describe('misere and golden rounds skip bidding', () => {
  it('misere round starts directly in playing phase', () => {
    const room = makeRoomWithScores(3, 5, 'misere');
    expect(room.activeRound!.phase).toBe('playing');
  });

  it('golden round starts directly in playing phase', () => {
    const room = makeRoomWithScores(3, 5, 'golden');
    expect(room.activeRound!.phase).toBe('playing');
  });

  it('placeBid is rejected for misere (already in playing phase)', () => {
    const room = makeRoomWithScores(3, 5, 'misere');
    const firstPlayer = room.activeRound!.currentTurnPlayerId;
    expect(placeBid(room, firstPlayer, 0)).toEqual({ ok: false, error: expect.any(String) });
  });

  it('placeBid is rejected for golden (already in playing phase)', () => {
    const room = makeRoomWithScores(3, 5, 'golden');
    const firstPlayer = room.activeRound!.currentTurnPlayerId;
    expect(placeBid(room, firstPlayer, 5)).toEqual({ ok: false, error: expect.any(String) });
  });
});
