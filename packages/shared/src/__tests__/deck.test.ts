import { describe, it, expect } from 'vitest';
import {
  createDeck,
  shuffleDeck,
  validateDeck,
  dealCards,
  determineTrump,
} from '../deck';

// ─── createDeck ───────────────────────────────────────────────────────────────

describe('createDeck', () => {
  it('returns exactly 33 cards', () => {
    expect(createDeck()).toHaveLength(33);
  });

  it('spades has 9 cards (6 through A)', () => {
    const spades = createDeck().filter(c => c.suit === 'spades');
    expect(spades).toHaveLength(9);
  });

  it('hearts, diamonds, clubs each have 8 cards (7 through A)', () => {
    const deck = createDeck();
    for (const suit of ['hearts', 'diamonds', 'clubs'] as const) {
      expect(deck.filter(c => c.suit === suit)).toHaveLength(8);
    }
  });

  it('all suit+rank combinations are unique', () => {
    const keys = createDeck().map(c => `${c.suit}:${c.rank}`);
    expect(new Set(keys).size).toBe(33);
  });

  it('contains exactly 1 Joker', () => {
    expect(createDeck().filter(c => c.isJoker)).toHaveLength(1);
  });

  it('Joker is the 6 of spades', () => {
    const joker = createDeck().find(c => c.isJoker)!;
    expect(joker.suit).toBe('spades');
    expect(joker.rank).toBe('6');
  });

  it('Joker label is "Жопа"', () => {
    const joker = createDeck().find(c => c.isJoker)!;
    expect(joker.label).toBe('Жопа');
  });

  it('all non-Joker cards have isJoker = false', () => {
    const nonJokers = createDeck().filter(c => !c.isJoker);
    expect(nonJokers).toHaveLength(32);
    nonJokers.forEach(c => expect(c.isJoker).toBe(false));
  });

  it('non-Joker card labels include rank and suit symbol', () => {
    const ace = createDeck().find(c => c.rank === 'A' && c.suit === 'hearts')!;
    expect(ace.label).toBe('A♥');
  });
});

// ─── shuffleDeck ──────────────────────────────────────────────────────────────

describe('shuffleDeck', () => {
  it('returns a new array, does not mutate the input', () => {
    const original = createDeck();
    const shuffled = shuffleDeck(original);
    expect(shuffled).not.toBe(original);
  });

  it('keeps all 33 cards', () => {
    expect(shuffleDeck(createDeck())).toHaveLength(33);
  });

  it('contains the same cards as the source deck', () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck);
    const sortKey = (c: (typeof deck)[0]) => `${c.suit}:${c.rank}`;
    expect(shuffled.map(sortKey).sort()).toEqual(deck.map(sortKey).sort());
  });

  it('shuffled deck passes validation', () => {
    expect(validateDeck(shuffleDeck(createDeck())).valid).toBe(true);
  });
});

// ─── validateDeck ─────────────────────────────────────────────────────────────

describe('validateDeck', () => {
  it('returns valid = true for a correct deck', () => {
    const result = validateDeck(createDeck());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('detects wrong card count', () => {
    const result = validateDeck(createDeck().slice(0, 32));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('32'))).toBe(true);
  });

  it('detects duplicate cards', () => {
    const deck = createDeck();
    deck[2] = { ...deck[0] };
    const result = validateDeck(deck);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.toLowerCase().includes('duplicate'))).toBe(true);
  });

  it('detects missing Joker (replaced by a duplicate regular card)', () => {
    const deck = createDeck();
    const jokerIdx = deck.findIndex(c => c.isJoker);
    deck[jokerIdx] = { ...deck[jokerIdx === 0 ? 1 : 0], isJoker: false };
    const result = validateDeck(deck);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Joker'))).toBe(true);
  });
});

// ─── dealCards ────────────────────────────────────────────────────────────────

describe('dealCards', () => {
  // maxCardsPerPlayer = Math.floor(33 / playerCount)
  // kittySize         = 33 - playerCount × maxCardsPerPlayer
  it.each([
    [3, 11, 0],
    [4,  8, 1],
    [5,  6, 3],
    [6,  5, 3],
    [7,  4, 5],
    [8,  4, 1],
  ] as const)(
    '%i players × %i cards → %i kitty cards',
    (players, cards, expectedKitty) => {
      const { hands, kitty } = dealCards(createDeck(), players, cards);
      expect(hands).toHaveLength(players);
      hands.forEach(h => expect(h).toHaveLength(cards));
      expect(kitty).toHaveLength(expectedKitty);
    },
  );

  it('all 33 cards distributed with no losses (4 players)', () => {
    const { hands, kitty } = dealCards(createDeck(), 4, 8);
    const total = hands.reduce((sum, h) => sum + h.length, 0) + kitty.length;
    expect(total).toBe(33);
  });

  it('each card appears exactly once across hands and kitty', () => {
    const { hands, kitty } = dealCards(shuffleDeck(createDeck()), 4, 8);
    const keys = [...hands.flat(), ...kitty].map(c => `${c.suit}:${c.rank}`);
    expect(new Set(keys).size).toBe(33);
  });

  it('deals contiguous blocks, not round-robin', () => {
    const deck = createDeck();
    const { hands } = dealCards(deck, 4, 8);
    expect(hands[0]).toEqual(deck.slice(0, 8));
    expect(hands[1]).toEqual(deck.slice(8, 16));
    expect(hands[2]).toEqual(deck.slice(16, 24));
    expect(hands[3]).toEqual(deck.slice(24, 32));
  });

  it('kitty contains the correct leftover cards', () => {
    const deck = createDeck();
    const { kitty } = dealCards(deck, 4, 8);
    expect(kitty).toEqual(deck.slice(32));
  });

  it('accepts cardsPerPlayer less than maximum (4 players × 5 cards → 13 kitty)', () => {
    const { hands, kitty } = dealCards(createDeck(), 4, 5);
    hands.forEach(h => expect(h).toHaveLength(5));
    expect(kitty).toHaveLength(13);
  });

  it('throws RangeError for playerCount < 3', () => {
    expect(() => dealCards(createDeck(), 2, 11)).toThrow(RangeError);
  });

  it('throws RangeError for playerCount > 8', () => {
    expect(() => dealCards(createDeck(), 9, 3)).toThrow(RangeError);
  });

  it('throws RangeError when cardsPerPlayer exceeds maximum for player count', () => {
    expect(() => dealCards(createDeck(), 4, 9)).toThrow(RangeError); // max is 8
  });

  it('throws RangeError for cardsPerPlayer < 1', () => {
    expect(() => dealCards(createDeck(), 4, 0)).toThrow(RangeError);
  });
});

// ─── determineTrump ───────────────────────────────────────────────────────────

describe('determineTrump', () => {
  it('returns the suit of a regular card', () => {
    const deck = createDeck();
    const card = deck.find(c => c.suit === 'hearts' && !c.isJoker)!;
    expect(determineTrump(card)).toBe('hearts');
  });

  it('returns null when the turn-up card is the Joker', () => {
    const joker = createDeck().find(c => c.isJoker)!;
    expect(determineTrump(joker)).toBeNull();
  });

  it('returns "spades" for a non-Joker spades card', () => {
    const spades7 = createDeck().find(c => c.suit === 'spades' && c.rank === '7')!;
    expect(determineTrump(spades7)).toBe('spades');
  });

  it('returns "clubs" for a clubs card', () => {
    const clubsK = createDeck().find(c => c.suit === 'clubs' && c.rank === 'K')!;
    expect(determineTrump(clubsK)).toBe('clubs');
  });
});
