import { describe, it, expect } from 'vitest';
import type { Card, Suit } from '../types';
import { sortHand } from '../sortHand';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function c(suit: Suit, rank: Card['rank']): Card {
  return { suit, rank, isJoker: suit === 'joker', label: `${rank}${suit}` };
}

const JOKER: Card = { suit: 'joker', rank: 'joker', isJoker: true, label: 'Жопа' };

// ─── sortHand ─────────────────────────────────────────────────────────────────

describe('sortHand — Joker placement', () => {
  it('Joker is always rightmost (no trump)', () => {
    const hand = [JOKER, c('hearts', '7'), c('spades', 'A')];
    const sorted = sortHand(hand, null);
    expect(sorted[sorted.length - 1]).toEqual(JOKER);
  });

  it('Joker is always rightmost (with trump)', () => {
    const hand = [JOKER, c('diamonds', 'K'), c('hearts', '8')];
    const sorted = sortHand(hand, 'diamonds');
    expect(sorted[sorted.length - 1]).toEqual(JOKER);
  });

  it('Joker stays rightmost even when trump suit matches joker suit (unreachable in practice)', () => {
    const hand = [JOKER, c('clubs', '9')];
    const sorted = sortHand(hand, null);
    expect(sorted[sorted.length - 1]).toEqual(JOKER);
  });
});

describe('sortHand — trump suit placement', () => {
  it('trump suit comes after all non-trump suits', () => {
    const hand = [
      c('spades', '7'), c('hearts', '7'), c('diamonds', '7'), c('clubs', '7'),
    ];
    const sorted = sortHand(hand, 'diamonds');
    const suits = sorted.map(c => c.suit);
    expect(suits.indexOf('diamonds')).toBeGreaterThan(suits.indexOf('hearts'));
    expect(suits.indexOf('diamonds')).toBeGreaterThan(suits.indexOf('clubs'));
    expect(suits.indexOf('diamonds')).toBeGreaterThan(suits.indexOf('spades'));
  });

  it('hearts as trump is moved to end of normal suits', () => {
    const hand = [c('hearts', 'A'), c('clubs', '7'), c('spades', '8'), c('diamonds', '9')];
    const sorted = sortHand(hand, 'hearts');
    expect(sorted[sorted.length - 1].suit).toBe('hearts');
    expect(sorted[0].suit).toBe('clubs');
  });

  it('spades as trump is moved to end of normal suits', () => {
    const hand = [c('spades', 'A'), c('hearts', '7'), c('clubs', '8')];
    const sorted = sortHand(hand, 'spades');
    expect(sorted[sorted.length - 1].suit).toBe('spades');
  });

  it('no-trump hand: all four suits in base order hearts→clubs→spades→diamonds', () => {
    const hand = [
      c('diamonds', '7'), c('spades', '7'), c('clubs', '7'), c('hearts', '7'),
    ];
    const sorted = sortHand(hand, null);
    expect(sorted.map(c => c.suit)).toEqual(['hearts', 'clubs', 'spades', 'diamonds']);
  });
});

describe('sortHand — rank ordering within a suit', () => {
  it('ranks sorted 7 → A (low to high) within a suit', () => {
    const hand = [
      c('hearts', 'A'), c('hearts', '7'), c('hearts', 'K'),
      c('hearts', '8'), c('hearts', 'J'), c('hearts', '9'),
    ];
    const sorted = sortHand(hand, null);
    const ranks = sorted.map(c => c.rank);
    expect(ranks).toEqual(['7', '8', '9', 'J', 'K', 'A']);
  });

  it('rank ordering is correct for 10 between 9 and J', () => {
    const hand = [c('clubs', 'J'), c('clubs', '10'), c('clubs', '9')];
    const sorted = sortHand(hand, null);
    expect(sorted.map(c => c.rank)).toEqual(['9', '10', 'J']);
  });
});

describe('sortHand — full hand integration', () => {
  it('trump=diamonds: hearts→clubs→spades→diamonds→joker', () => {
    const hand = [
      JOKER,
      c('diamonds', '7'), c('diamonds', 'A'),
      c('spades', 'K'),
      c('clubs', '8'),
      c('hearts', '9'), c('hearts', 'J'),
    ];
    const sorted = sortHand(hand, 'diamonds');
    const suits = sorted.map(c => c.suit);
    // hearts first
    expect(suits[0]).toBe('hearts');
    // clubs after hearts
    const heartsEnd = suits.lastIndexOf('hearts');
    const clubsStart = suits.indexOf('clubs');
    expect(clubsStart).toBeGreaterThan(heartsEnd);
    // spades after clubs
    const clubsEnd = suits.lastIndexOf('clubs');
    const spadesStart = suits.indexOf('spades');
    expect(spadesStart).toBeGreaterThan(clubsEnd);
    // diamonds (trump) after spades
    const spadesEnd = suits.lastIndexOf('spades');
    const diamondsStart = suits.indexOf('diamonds');
    expect(diamondsStart).toBeGreaterThan(spadesEnd);
    // joker last
    expect(suits[suits.length - 1]).toBe('joker');
  });

  it('does not mutate the original hand', () => {
    const hand = [JOKER, c('hearts', '7'), c('spades', 'A')];
    const original = [...hand];
    sortHand(hand, null);
    expect(hand).toEqual(original);
  });

  it('empty hand returns empty array', () => {
    expect(sortHand([], null)).toEqual([]);
    expect(sortHand([], 'hearts')).toEqual([]);
  });

  it('single card hand is unchanged', () => {
    const hand = [c('clubs', 'K')];
    expect(sortHand(hand, null)).toEqual(hand);
  });
});
