import { describe, it, expect, beforeEach } from 'vitest';
import type { GameRoom, GameRound, RoomPlayer, RoundType } from '@rozpisnyi-poker/shared';
import { getLegalCards } from '@rozpisnyi-poker/shared';
import { dealRound, finishRound, getHand, placeBid, playCard } from '../game';

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
  };

  const { activeRound } = dealRound(room);
  room.activeRound = activeRound;
  return room;
}

/**
 * Room positioned at `roundIndex` with pre-populated bid history per player.
 * bidHistoryByPlayer maps playerId → array of bids for rounds 0..roundIndex-1.
 */
function makeRoomAtRound(
  playerCount: number,
  cardsPerPlayer: number,
  roundIndex: number,
  bidHistoryByPlayer: Record<string, (number | null)[]>,
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
  // Joker leading a trick requires a declaration; default to lay-down
  const declaration =
    card.isJoker && ar.currentTrick.length === 0
      ? { mode: 'lay-down' as const }
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
  it('forbids bidding 0 when the previous two rounds were both 0', () => {
    const room = makeRoomAtRound(3, 5, 2, { p1: [0, 0], p2: [1, 1], p3: [1, 1] });
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
    const room = makeRoomAtRound(3, 5, 2, { p1: [0, 0], p2: [0, 0], p3: [1, 1] });
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
    // cardsPerPlayer=2, history=[0,0] → zero-banned; total=1 → forbidden bid=1 (1+1=2)
    // legal = [0,1,2] minus 0 (zero-ban) minus 1 (total rule) = [2]
    const room = makeRoomAtRound(3, 2, 2, { p1: [1, 1], p2: [1, 1], p3: [0, 0] });
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
    const cardToPlay = hand[0]!;
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
    expect(playCard(room, 'p1', { suit: 'hearts', rank: 'A', isJoker: false, label: 'A♥' })).toEqual({
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

  it('applies dark-round ×2 multiplier', () => {
    const room = makeRoomWithScores(3, 5, 'dark');
    forceComplete(room, { p1: 2, p2: 2, p3: 0 }, { p1: 2, p2: 0, p3: 3 });
    finishRound(room);
    const gs = room.gameSheet!;
    expect(gs.scores.find(s => s.playerId === 'p1')!.scores[0]).toBe(40);   // 20×2
    expect(gs.scores.find(s => s.playerId === 'p2')!.scores[0]).toBe(-40);  // -20×2
    expect(gs.scores.find(s => s.playerId === 'p3')!.scores[0]).toBe(6);    // 3×2
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
});

// ─── Joker integration ────────────────────────────────────────────────────────

const JOKER_CARD = { suit: 'spades' as const, rank: '6' as const, isJoker: true, label: 'Жопа' };

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

    playCard(room, 'p1', h1[0]!);  // trump ace leads
    playCard(room, 'p2', JOKER_CARD); // Joker overrides
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
    playCard(room, 'p2', h2[0]!); // second Joker — Jokers are always legal, but p1 wins
    playLegalCard(room, 'p3');

    expect(ar.tricksWon['p1']).toBe(1); // first Joker (declarant) wins
    expect(ar.tricksWon['p2']).toBe(0);
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
    // Give p2 two hearts; only the highest should be accepted
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
    h1[0] = JOKER_CARD;

    playCard(room, 'p1', JOKER_CARD, { mode: 'lay-down' });
    expect(ar.leadSuit).toBeNull(); // not yet set

    const h2 = getHand(room.id, 'p2')!;
    // Save the card BEFORE playing — splice removes it from the array
    const p2Card = h2[0]!;
    playCard(room, 'p2', p2Card); // first non-Joker establishes lead
    expect(ar.leadSuit).toBe(p2Card.suit);
  });

  it('Joker does not win; normal trick winner among non-Joker cards', () => {
    const room = makePlayingRoom();
    const ar = room.activeRound!;
    const h1 = getHand(room.id, 'p1')!;
    const h2 = getHand(room.id, 'p2')!;
    const h3 = getHand(room.id, 'p3')!;
    h1[0] = JOKER_CARD;
    // Set up controlled cards for p2/p3 to make a clear winner
    const suit = h2[0]!.suit;
    // Ensure p3 has a higher card of the same suit than p2
    h3[0] = { suit, rank: 'A', isJoker: false, label: `A${suit}` };
    // Make sure p2's card is not A
    if (h2[0]!.rank === 'A') {
      h2[0] = { suit, rank: 'K', isJoker: false, label: `K${suit}` };
    }

    playCard(room, 'p1', JOKER_CARD, { mode: 'lay-down' });
    playCard(room, 'p2', h2[0]!);    // establishes leadSuit = suit
    playCard(room, 'p3', h3[0]!);    // plays A of same suit → wins

    expect(ar.tricksWon['p3']).toBe(1);
    expect(ar.tricksWon['p1']).toBe(0); // Joker does not win
  });
});
