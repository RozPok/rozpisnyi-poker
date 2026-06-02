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
});
