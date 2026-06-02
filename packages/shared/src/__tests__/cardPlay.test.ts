import { describe, it, expect } from 'vitest';
import type { Card } from '../types';
import { canPlayCard, getLegalCards } from '../cardPlay';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function card(suit: Card['suit'], rank: Card['rank']): Card {
  return { suit, rank, isJoker: false, label: `${rank}${suit}` };
}

const joker: Card = { suit: 'spades', rank: '6', isJoker: true, label: 'Жопа' };

// Fixed hands used across multiple tests
const mixedHand = [
  card('hearts', 'A'),
  card('hearts', 'K'),
  card('spades', '7'),
  card('clubs', 'Q'),
];

// ─── getLegalCards — first card of trick ──────────────────────────────────────

describe('getLegalCards — first card of trick (leadSuit = null)', () => {
  it('any card is legal when leadSuit is null', () => {
    const legal = getLegalCards(mixedHand, null, 'spades');
    expect(legal).toHaveLength(mixedHand.length);
  });

  it('returns a copy, not the same reference', () => {
    const legal = getLegalCards(mixedHand, null, null);
    expect(legal).not.toBe(mixedHand);
  });
});

// ─── getLegalCards — must follow suit ─────────────────────────────────────────

describe('getLegalCards — must follow suit', () => {
  it('returns only lead-suit cards when player has them', () => {
    // hand: A♥ K♥ 7♠ Q♣ | leadSuit=♥ → only hearts legal
    const legal = getLegalCards(mixedHand, 'hearts', 'spades');
    expect(legal).toEqual([card('hearts', 'A'), card('hearts', 'K')]);
  });

  it('includes joker when player must follow suit', () => {
    const hand = [card('hearts', 'A'), card('clubs', 'Q'), joker];
    const legal = getLegalCards(hand, 'hearts', 'spades');
    expect(legal).toContainEqual(joker);
    expect(legal).toContainEqual(card('hearts', 'A'));
    expect(legal).not.toContainEqual(card('clubs', 'Q'));
  });

  it('excludes trump cards when player has lead suit', () => {
    // player has lead AND trump — must follow suit, not trump
    const hand = [card('hearts', 'A'), card('spades', 'K'), card('clubs', '9')];
    const legal = getLegalCards(hand, 'hearts', 'spades');
    expect(legal).toHaveLength(1);
    expect(legal[0]).toEqual(card('hearts', 'A'));
  });

  it('only joker is legal when hand contains lead-suit but only joker bypasses', () => {
    // hand: only joker + non-lead non-trump; technically hasLeadSuit=false so falls to "any"
    // but let's test: hand has lead suit — must follow
    const hand = [card('hearts', '7'), joker];
    const legal = getLegalCards(hand, 'hearts', 'spades');
    expect(legal).toEqual([card('hearts', '7'), joker]);
  });
});

// ─── getLegalCards — must play trump ─────────────────────────────────────────

describe('getLegalCards — must play trump when no lead suit', () => {
  it('returns only trump cards when player lacks lead suit but has trump', () => {
    // hand: 7♠(trump) Q♣; leadSuit=♥ → no hearts, has trump
    const hand = [card('spades', '7'), card('clubs', 'Q')];
    const legal = getLegalCards(hand, 'hearts', 'spades');
    expect(legal).toEqual([card('spades', '7')]);
  });

  it('includes joker when must play trump', () => {
    const hand = [card('spades', '7'), card('clubs', 'Q'), joker];
    const legal = getLegalCards(hand, 'hearts', 'spades');
    expect(legal).toContainEqual(joker);
    expect(legal).toContainEqual(card('spades', '7'));
    expect(legal).not.toContainEqual(card('clubs', 'Q'));
  });

  it('returns all trump cards when multiple trump in hand', () => {
    const hand = [card('spades', '7'), card('spades', 'K'), card('diamonds', '9')];
    const legal = getLegalCards(hand, 'hearts', 'spades');
    expect(legal).toEqual([card('spades', '7'), card('spades', 'K')]);
  });
});

// ─── getLegalCards — no lead suit and no trump ────────────────────────────────

describe('getLegalCards — any card when no lead suit and no trump', () => {
  it('returns full hand when player has neither lead suit nor trump', () => {
    // hand: Q♣ J♦; leadSuit=♥, trump=♠ — no hearts, no spades
    const hand = [card('clubs', 'Q'), card('diamonds', 'J')];
    const legal = getLegalCards(hand, 'hearts', 'spades');
    expect(legal).toHaveLength(2);
  });

  it('includes joker in any-card result', () => {
    const hand = [card('clubs', 'Q'), joker];
    const legal = getLegalCards(hand, 'hearts', 'spades');
    expect(legal).toContainEqual(joker);
    expect(legal).toContainEqual(card('clubs', 'Q'));
  });
});

// ─── getLegalCards — no-trump round (trumpSuit = null) ───────────────────────

describe('getLegalCards — no-trump round', () => {
  it('returns full hand when player lacks lead suit in a no-trump round', () => {
    // No trump round: rule 3 is skipped → any card
    const hand = [card('spades', '7'), card('clubs', 'Q')];
    const legal = getLegalCards(hand, 'hearts', null);
    expect(legal).toHaveLength(2);
  });

  it('still requires following suit when player has lead suit in no-trump round', () => {
    const hand = [card('hearts', 'K'), card('spades', 'A'), card('clubs', '9')];
    const legal = getLegalCards(hand, 'hearts', null);
    expect(legal).toEqual([card('hearts', 'K')]);
  });

  it('joker is always legal in no-trump round', () => {
    const hand = [card('spades', '7'), joker];
    const legal = getLegalCards(hand, 'hearts', null);
    // no hearts → any card (trumpSuit=null skips rule 3)
    expect(legal).toContainEqual(joker);
    expect(legal).toContainEqual(card('spades', '7'));
  });
});

// ─── getLegalCards — joker ────────────────────────────────────────────────────

describe('getLegalCards — joker always legal', () => {
  it('joker is legal when must follow suit', () => {
    const hand = [card('hearts', 'A'), joker];
    const legal = getLegalCards(hand, 'hearts', 'spades');
    expect(legal).toContainEqual(joker);
  });

  it('joker is legal when must play trump', () => {
    const hand = [card('spades', 'K'), card('clubs', 'Q'), joker];
    const legal = getLegalCards(hand, 'hearts', 'spades');
    expect(legal).toContainEqual(joker);
  });

  it('joker is legal in any-card situation', () => {
    const hand = [card('clubs', '8'), joker];
    const legal = getLegalCards(hand, 'hearts', 'spades');
    expect(legal).toContainEqual(joker);
  });

  it('joker alone is legal when no other options', () => {
    const legal = getLegalCards([joker], 'hearts', 'spades');
    expect(legal).toEqual([joker]);
  });
});

// ─── canPlayCard ─────────────────────────────────────────────────────────────

describe('canPlayCard', () => {
  it('returns true for a legal lead-suit card', () => {
    const hand = [card('hearts', 'A'), card('spades', '7')];
    expect(canPlayCard(hand, card('hearts', 'A'), 'hearts', 'spades')).toBe(true);
  });

  it('returns false for an illegal off-suit card when must follow suit', () => {
    const hand = [card('hearts', 'A'), card('spades', '7')];
    expect(canPlayCard(hand, card('spades', '7'), 'hearts', 'spades')).toBe(false);
  });

  it('returns true for trump when must play trump', () => {
    const hand = [card('spades', '7'), card('clubs', 'Q')];
    expect(canPlayCard(hand, card('spades', '7'), 'hearts', 'spades')).toBe(true);
  });

  it('returns false for off-suit non-trump when must play trump', () => {
    const hand = [card('spades', '7'), card('clubs', 'Q')];
    expect(canPlayCard(hand, card('clubs', 'Q'), 'hearts', 'spades')).toBe(false);
  });

  it('returns true for any card when no lead suit and no trump available', () => {
    const hand = [card('clubs', 'Q'), card('diamonds', 'J')];
    expect(canPlayCard(hand, card('clubs', 'Q'), 'hearts', 'spades')).toBe(true);
    expect(canPlayCard(hand, card('diamonds', 'J'), 'hearts', 'spades')).toBe(true);
  });

  it('returns true for joker regardless of constraints', () => {
    const hand = [card('hearts', 'A'), joker];
    // Even when must follow suit, joker is legal
    expect(canPlayCard(hand, joker, 'hearts', 'spades')).toBe(true);
  });

  it('returns false for a card not in hand', () => {
    const hand = [card('hearts', 'A')];
    expect(canPlayCard(hand, card('clubs', 'K'), 'hearts', 'spades')).toBe(false);
  });

  it('returns true for first card of trick (leadSuit=null)', () => {
    const hand = [card('clubs', '8'), card('spades', '7')];
    expect(canPlayCard(hand, card('clubs', '8'), null, 'spades')).toBe(true);
    expect(canPlayCard(hand, card('spades', '7'), null, 'spades')).toBe(true);
  });
});

// ─── Joker declaration modes ──────────────────────────────────────────────────

describe('getLegalCards — highest-suit declaration', () => {
  it('forces the highest card of declared suit', () => {
    // hand: A♥ K♥ 7♠ Q♣ — declared hearts → only A♥ (highest) is legal
    const legal = getLegalCards(mixedHand, 'hearts', 'spades', { mode: 'highest-suit', suit: 'hearts' });
    expect(legal).toEqual([card('hearts', 'A')]);
  });

  it('forces correct highest when multiple declared-suit cards present', () => {
    const hand = [card('hearts', '7'), card('hearts', 'K'), card('hearts', 'Q'), card('clubs', 'A')];
    const legal = getLegalCards(hand, null, null, { mode: 'highest-suit', suit: 'hearts' });
    expect(legal).toHaveLength(1);
    expect(legal[0]).toEqual(card('hearts', 'K'));
  });

  it('allows any card when player lacks the declared suit', () => {
    const hand = [card('clubs', 'Q'), card('diamonds', 'J')];
    const legal = getLegalCards(hand, null, null, { mode: 'highest-suit', suit: 'hearts' });
    expect(legal).toHaveLength(2);
  });

  it('includes joker alongside highest declared-suit card', () => {
    const hand = [card('hearts', 'K'), card('hearts', '7'), joker];
    const legal = getLegalCards(hand, null, null, { mode: 'highest-suit', suit: 'hearts' });
    expect(legal).toContainEqual(joker);
    expect(legal).toContainEqual(card('hearts', 'K'));
    expect(legal).not.toContainEqual(card('hearts', '7'));
    expect(legal).toHaveLength(2);
  });
});

describe('getLegalCards — lowest-suit declaration', () => {
  it('forces the lowest card of declared suit', () => {
    // hand: A♥ K♥ 7♠ Q♣ — declared hearts → only K♥ is the only heart... wait.
    // Actually declared hearts from mixedHand: A♥ K♥. Lowest = K♥.
    const legal = getLegalCards(mixedHand, 'hearts', 'spades', { mode: 'lowest-suit', suit: 'hearts' });
    expect(legal).toEqual([card('hearts', 'K')]);
  });

  it('forces correct lowest when multiple declared-suit cards present', () => {
    const hand = [card('hearts', '7'), card('hearts', 'K'), card('hearts', 'Q'), card('clubs', 'A')];
    const legal = getLegalCards(hand, null, null, { mode: 'lowest-suit', suit: 'hearts' });
    expect(legal).toHaveLength(1);
    expect(legal[0]).toEqual(card('hearts', '7'));
  });

  it('allows any card when player lacks the declared suit', () => {
    const hand = [card('clubs', 'Q'), card('diamonds', 'J')];
    const legal = getLegalCards(hand, null, null, { mode: 'lowest-suit', suit: 'hearts' });
    expect(legal).toHaveLength(2);
  });

  it('includes joker alongside lowest declared-suit card', () => {
    const hand = [card('hearts', 'K'), card('hearts', '7'), joker];
    const legal = getLegalCards(hand, null, null, { mode: 'lowest-suit', suit: 'hearts' });
    expect(legal).toContainEqual(joker);
    expect(legal).toContainEqual(card('hearts', '7'));
    expect(legal).not.toContainEqual(card('hearts', 'K'));
    expect(legal).toHaveLength(2);
  });
});

describe('getLegalCards — lay-down declaration', () => {
  it('any card is legal before first non-Joker (leadSuit=null)', () => {
    const hand = [card('spades', 'K'), card('clubs', '9'), joker];
    const legal = getLegalCards(hand, null, null, { mode: 'lay-down' });
    expect(legal).toHaveLength(3);
  });

  it('normal suit-following rules apply once leadSuit is set', () => {
    // Effective lead: spades (first non-Joker set it)
    const hand = [card('spades', 'A'), card('clubs', '9'), joker];
    const legal = getLegalCards(hand, 'spades', null, { mode: 'lay-down' });
    // Has spades → must follow
    expect(legal).toContainEqual(card('spades', 'A'));
    expect(legal).toContainEqual(joker);
    expect(legal).not.toContainEqual(card('clubs', '9'));
  });

  it('any card when no lead suit and no trump in lay-down (no-trump round)', () => {
    const hand = [card('clubs', '8'), card('diamonds', 'J')];
    const legal = getLegalCards(hand, 'hearts', null, { mode: 'lay-down' });
    // No hearts, no trump → any card
    expect(legal).toHaveLength(2);
  });
});
