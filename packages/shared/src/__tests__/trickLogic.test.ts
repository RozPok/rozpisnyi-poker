import { describe, it, expect } from 'vitest';
import type { Card, TrickPlay } from '../types';
import { cardBeats, determineTrickWinner, RANK_ORDER } from '../trickLogic';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function card(suit: Card['suit'], rank: Card['rank']): Card {
  return { suit, rank, isJoker: false, label: `${rank}${suit}` };
}

function joker(): Card {
  return { suit: 'spades', rank: '6', isJoker: true, label: 'Жопа' };
}

function play(id: string, c: Card): TrickPlay {
  return { playerId: id, playerName: id, card: c };
}

// ─── RANK_ORDER ───────────────────────────────────────────────────────────────

describe('RANK_ORDER', () => {
  it('A is the highest rank', () => {
    expect(RANK_ORDER['A']).toBeGreaterThan(RANK_ORDER['K']!);
  });

  it('6 is the lowest rank', () => {
    const values = Object.values(RANK_ORDER);
    expect(RANK_ORDER['6']).toBe(Math.min(...values));
  });

  it('ranks are strictly ascending 6<7<8<9<10<J<Q<K<A', () => {
    const order = ['6','7','8','9','10','J','Q','K','A'] as const;
    for (let i = 1; i < order.length; i++) {
      expect(RANK_ORDER[order[i]!]).toBeGreaterThan(RANK_ORDER[order[i - 1]!]!);
    }
  });
});

// ─── cardBeats ────────────────────────────────────────────────────────────────

describe('cardBeats', () => {
  it('joker beats any regular card', () => {
    expect(cardBeats(joker(), card('hearts', 'A'), 'hearts', null)).toBe(true);
  });

  it('regular card does not beat a joker', () => {
    expect(cardBeats(card('hearts', 'A'), joker(), 'hearts', null)).toBe(false);
  });

  it('trump beats non-trump lead card', () => {
    expect(cardBeats(card('spades', '7'), card('hearts', 'A'), 'hearts', 'spades')).toBe(true);
  });

  it('non-trump does not beat trump', () => {
    expect(cardBeats(card('hearts', 'A'), card('spades', '7'), 'hearts', 'spades')).toBe(false);
  });

  it('lead-suit card beats off-suit card when no trump', () => {
    expect(cardBeats(card('hearts', '7'), card('clubs', 'A'), 'hearts', null)).toBe(true);
  });

  it('off-suit card does not beat lead-suit card', () => {
    expect(cardBeats(card('clubs', 'A'), card('hearts', '7'), 'hearts', null)).toBe(false);
  });

  it('higher rank wins within same suit', () => {
    expect(cardBeats(card('hearts', 'K'), card('hearts', 'Q'), 'hearts', null)).toBe(true);
  });

  it('lower rank loses within same suit', () => {
    expect(cardBeats(card('hearts', 'Q'), card('hearts', 'K'), 'hearts', null)).toBe(false);
  });

  it('two trump cards — higher rank wins', () => {
    expect(cardBeats(card('spades', 'A'), card('spades', '7'), null, 'spades')).toBe(true);
    expect(cardBeats(card('spades', '7'), card('spades', 'A'), null, 'spades')).toBe(false);
  });

  it('equal card does not beat itself', () => {
    expect(cardBeats(card('hearts', 'K'), card('hearts', 'K'), 'hearts', null)).toBe(false);
  });

  // ── Joker rules ──────────────────────────────────────────────────────────────

  it('joker beats trump', () => {
    expect(cardBeats(joker(), card('spades', 'A'), 'hearts', 'spades')).toBe(true);
  });

  it('trump does not beat joker', () => {
    expect(cardBeats(card('spades', 'A'), joker(), 'hearts', 'spades')).toBe(false);
  });

  it('joker beats lead-suit ace', () => {
    expect(cardBeats(joker(), card('hearts', 'A'), 'hearts', null)).toBe(true);
  });

  it('lead-suit ace does not beat joker', () => {
    expect(cardBeats(card('hearts', 'A'), joker(), 'hearts', null)).toBe(false);
  });

  it('second joker does not beat first joker', () => {
    expect(cardBeats(joker(), joker(), null, null)).toBe(false);
  });

  it('second joker does not beat first joker even with trump set', () => {
    expect(cardBeats(joker(), joker(), 'hearts', 'spades')).toBe(false);
  });
});

// ─── determineTrickWinner ─────────────────────────────────────────────────────

describe('determineTrickWinner', () => {
  it('throws on empty trick', () => {
    expect(() => determineTrickWinner([], null, null)).toThrow();
  });

  it('single card wins trivially', () => {
    const trick = [play('p1', card('hearts', '7'))];
    expect(determineTrickWinner(trick, 'hearts', null)).toBe('p1');
  });

  it('highest lead-suit card wins with no trump', () => {
    const trick = [
      play('p1', card('hearts', '7')),
      play('p2', card('hearts', 'K')),
      play('p3', card('hearts', '9')),
    ];
    expect(determineTrickWinner(trick, 'hearts', null)).toBe('p2');
  });

  it('trump card beats higher lead-suit card', () => {
    const trick = [
      play('p1', card('hearts', 'A')),
      play('p2', card('spades', '7')), // trump
      play('p3', card('hearts', 'K')),
    ];
    expect(determineTrickWinner(trick, 'hearts', 'spades')).toBe('p2');
  });

  it('highest trump wins when multiple trumps played', () => {
    const trick = [
      play('p1', card('hearts', 'A')),
      play('p2', card('spades', '7')),
      play('p3', card('spades', 'K')), // higher trump
    ];
    expect(determineTrickWinner(trick, 'hearts', 'spades')).toBe('p3');
  });

  it('joker wins over trump and lead', () => {
    const trick = [
      play('p1', card('hearts', 'A')),
      play('p2', card('spades', 'A')), // highest trump
      play('p3', joker()),
    ];
    expect(determineTrickWinner(trick, 'hearts', 'spades')).toBe('p3');
  });

  it('off-suit non-trump card does not win even if high rank', () => {
    const trick = [
      play('p1', card('hearts', '7')),  // lead
      play('p2', card('clubs', 'A')),   // off-suit, high rank
    ];
    expect(determineTrickWinner(trick, 'hearts', null)).toBe('p1');
  });

  it('first player wins when all cards tie on rank/category', () => {
    const trick = [
      play('p1', card('hearts', 'K')),
      play('p2', card('hearts', 'K')), // same rank same suit — p1 stays best
    ];
    expect(determineTrickWinner(trick, 'hearts', null)).toBe('p1');
  });

  // ── Joker integration ─────────────────────────────────────────────────────────

  it('joker beats highest trump card', () => {
    const trick = [
      play('p1', card('spades', 'A')), // highest trump
      play('p2', joker()),
    ];
    expect(determineTrickWinner(trick, 'hearts', 'spades')).toBe('p2');
  });

  it('joker beats highest lead-suit card', () => {
    const trick = [
      play('p1', card('hearts', 'A')),
      play('p2', card('hearts', 'K')),
      play('p3', joker()),
    ];
    expect(determineTrickWinner(trick, 'hearts', null)).toBe('p3');
  });

  it('first joker wins when two jokers are played', () => {
    const trick = [
      play('p1', card('hearts', 'A')),
      play('p2', joker()),           // first joker
      play('p3', joker()),           // second joker — should NOT win
    ];
    expect(determineTrickWinner(trick, 'hearts', 'spades')).toBe('p2');
  });

  it('first joker wins even when it is the opening card', () => {
    const trick = [
      play('p1', joker()),           // leads the trick
      play('p2', card('spades', 'A')),
      play('p3', joker()),           // second joker
    ];
    // leadSuit is null because joker led — any card follows
    expect(determineTrickWinner(trick, null, 'spades')).toBe('p1');
  });

  it('single joker in trick always wins', () => {
    const trick = [
      play('p1', card('hearts', '7')),
      play('p2', joker()),
      play('p3', card('clubs', 'A')),
    ];
    expect(determineTrickWinner(trick, 'hearts', null)).toBe('p2');
  });
});

// ─── Joker declaration — highest-suit ────────────────────────────────────────

describe('determineTrickWinner — highest-suit', () => {
  it('Joker player wins regardless of other cards', () => {
    const trick = [
      play('p1', joker()),
      play('p2', card('hearts', 'A')),
      play('p3', card('hearts', 'K')),
    ];
    expect(determineTrickWinner(trick, 'hearts', null, { mode: 'highest-suit', suit: 'hearts' })).toBe('p1');
  });

  it('Joker player wins even when trump is played', () => {
    const trick = [
      play('p1', joker()),
      play('p2', card('spades', 'A')), // highest trump
    ];
    expect(determineTrickWinner(trick, 'hearts', 'spades', { mode: 'highest-suit', suit: 'hearts' })).toBe('p1');
  });

  it('Joker player wins when no other player has declared suit', () => {
    const trick = [
      play('p1', joker()),
      play('p2', card('clubs', 'A')),
      play('p3', card('diamonds', 'K')),
    ];
    expect(determineTrickWinner(trick, 'hearts', null, { mode: 'highest-suit', suit: 'hearts' })).toBe('p1');
  });
});

// ─── Joker declaration — lowest-suit ─────────────────────────────────────────

describe('determineTrickWinner — lowest-suit', () => {
  it('Joker is excluded; highest declared-suit card among others wins', () => {
    // declared suit = hearts, leadSuit = hearts; p2:A♥, p3:K♥ → A♥ wins
    const trick = [
      play('p1', joker()),
      play('p2', card('hearts', 'A')),
      play('p3', card('hearts', 'K')),
    ];
    expect(determineTrickWinner(trick, 'hearts', null, { mode: 'lowest-suit', suit: 'hearts' })).toBe('p2');
  });

  it('trump beats declared suit when a player without declared suit plays trump', () => {
    // p2 has no hearts, plays trump; p3 plays declared-suit card
    const trick = [
      play('p1', joker()),
      play('p2', card('spades', '7')),  // trump (played because no hearts)
      play('p3', card('hearts', 'A')),  // highest hearts
    ];
    expect(determineTrickWinner(trick, 'hearts', 'spades', { mode: 'lowest-suit', suit: 'hearts' })).toBe('p2');
  });

  it('highest trump wins when multiple trump cards played', () => {
    const trick = [
      play('p1', joker()),
      play('p2', card('spades', '7')),
      play('p3', card('spades', 'A')), // higher trump
    ];
    expect(determineTrickWinner(trick, 'hearts', 'spades', { mode: 'lowest-suit', suit: 'hearts' })).toBe('p3');
  });

  it('first non-Joker card wins when everyone plays off-suit non-trump', () => {
    // No hearts, no trump: first non-Joker card (p2) wins by default
    const trick = [
      play('p1', joker()),
      play('p2', card('clubs', 'Q')),
      play('p3', card('diamonds', 'J')),
    ];
    expect(determineTrickWinner(trick, 'hearts', null, { mode: 'lowest-suit', suit: 'hearts' })).toBe('p2');
  });
});

// ─── Joker declaration — lay-down ─────────────────────────────────────────────

describe('determineTrickWinner — lay-down', () => {
  it('Joker is excluded; normal winner by effective lead suit', () => {
    // Joker laid down; p2 plays K♠ (sets leadSuit=spades); p3 plays A♠ → A♠ wins
    const trick = [
      play('p1', joker()),
      play('p2', card('spades', 'K')),
      play('p3', card('spades', 'A')),
    ];
    expect(determineTrickWinner(trick, 'spades', null, { mode: 'lay-down' })).toBe('p3');
  });

  it('trump beats lead suit in lay-down', () => {
    const trick = [
      play('p1', joker()),
      play('p2', card('hearts', 'A')), // lead suit = hearts
      play('p3', card('spades', '7')), // trump
    ];
    expect(determineTrickWinner(trick, 'hearts', 'spades', { mode: 'lay-down' })).toBe('p3');
  });

  it('first non-Joker card wins when no one follows suit or plays trump', () => {
    const trick = [
      play('p1', joker()),
      play('p2', card('hearts', '7')),  // sets effective lead
      play('p3', card('clubs', 'A')),   // off-suit, cannot beat lead (no trump)
    ];
    expect(determineTrickWinner(trick, 'hearts', null, { mode: 'lay-down' })).toBe('p2');
  });

  it('throws when all non-Joker candidates are absent', () => {
    const trick = [play('p1', joker())];
    expect(() =>
      determineTrickWinner(trick, null, null, { mode: 'lay-down' }),
    ).toThrow();
  });
});

// ─── Non-leading Joker — take ─────────────────────────────────────────────────

describe('determineTrickWinner — non-leading Joker, take', () => {
  it('Joker wins over all previous cards', () => {
    // A♠, Joker(take), K♠, 8♠ → Joker wins
    const trick = [
      play('p1', card('spades', 'A')),
      play('p2', joker()),
      play('p3', card('spades', 'K')),
      play('p4', card('spades', '8')),
    ];
    expect(determineTrickWinner(trick, 'spades', null, { mode: 'take' })).toBe('p2');
  });

  it('Joker wins over lead-suit ace', () => {
    const trick = [
      play('p1', card('hearts', 'A')),
      play('p2', joker()),
    ];
    expect(determineTrickWinner(trick, 'hearts', null, { mode: 'take' })).toBe('p2');
  });

  it('Joker wins over trump', () => {
    const trick = [
      play('p1', card('hearts', '7')),   // lead
      play('p2', card('spades', 'A')),   // highest trump
      play('p3', joker()),               // Joker takes
    ];
    expect(determineTrickWinner(trick, 'hearts', 'spades', { mode: 'take' })).toBe('p3');
  });
});

// ─── Non-leading Joker — lay-down ────────────────────────────────────────────

describe('determineTrickWinner — non-leading Joker, lay-down', () => {
  it('Joker is ignored; highest lead-suit card wins', () => {
    // A♠, Joker(lay-down), K♠, 8♠ → A♠ wins
    const trick = [
      play('p1', card('spades', 'A')),
      play('p2', joker()),
      play('p3', card('spades', 'K')),
      play('p4', card('spades', '8')),
    ];
    expect(determineTrickWinner(trick, 'spades', null, { mode: 'lay-down' })).toBe('p1');
  });

  it('trump wins over lead suit when Joker is lay-down', () => {
    const trick = [
      play('p1', card('hearts', 'A')),   // lead suit
      play('p2', joker()),               // lay-down — ignored
      play('p3', card('spades', '7')),   // trump
    ];
    expect(determineTrickWinner(trick, 'hearts', 'spades', { mode: 'lay-down' })).toBe('p3');
  });

  it('highest trump wins when multiple trumps and Joker is lay-down', () => {
    const trick = [
      play('p1', card('hearts', 'A')),
      play('p2', joker()),
      play('p3', card('spades', '7')),
      play('p4', card('spades', 'K')),   // higher trump
    ];
    expect(determineTrickWinner(trick, 'hearts', 'spades', { mode: 'lay-down' })).toBe('p4');
  });

  it('first card wins when no one follows suit or plays trump and Joker is lay-down', () => {
    const trick = [
      play('p1', card('hearts', '7')),   // lead
      play('p2', joker()),               // ignored
      play('p3', card('clubs', 'A')),    // off-suit, cannot win
    ];
    expect(determineTrickWinner(trick, 'hearts', null, { mode: 'lay-down' })).toBe('p1');
  });
});
