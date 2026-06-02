import type { Card, Rank, Suit } from './types.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const SPADES_RANKS: Rank[] = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A']; // 8 cards (no 6)
const OTHER_RANKS: Rank[] = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A']; // 8 cards each
const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

const JOKER_SUIT: Suit = 'joker';
const JOKER_RANK: Rank = 'joker';
const JOKER_LABEL = 'Жопа';

const EXPECTED_DECK_SIZE = 33;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function suitLabel(suit: Suit): string {
  switch (suit) {
    case 'spades':   return '♠';
    case 'hearts':   return '♥';
    case 'diamonds': return '♦';
    case 'clubs':    return '♣';
    case 'joker':    return '';
  }
}

function isJokerCard(suit: Suit, rank: Rank): boolean {
  return suit === JOKER_SUIT && rank === JOKER_RANK;
}

function makeCard(suit: Suit, rank: Rank): Card {
  const joker = isJokerCard(suit, rank);
  return {
    suit,
    rank,
    isJoker: joker,
    label: joker ? JOKER_LABEL : `${rank}${suitLabel(suit)}`,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Returns an ordered (un-shuffled) 33-card deck: 32 normal cards + 1 dedicated Joker. */
export function createDeck(): Card[] {
  const deck: Card[] = [];

  for (const suit of SUITS) {
    const ranks = suit === 'spades' ? SPADES_RANKS : OTHER_RANKS;
    for (const rank of ranks) {
      deck.push(makeCard(suit, rank));
    }
  }

  // Dedicated Joker card — always last in the unshuffled deck (index 32)
  deck.push(makeCard(JOKER_SUIT, JOKER_RANK));
  return deck;
}

/** Fisher-Yates shuffle — returns a new shuffled array. */
export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export interface DeckValidationResult {
  valid: boolean;
  errors: string[];
}

/** Validates that a deck has exactly 33 unique cards with no duplicates. */
export function validateDeck(deck: Card[]): DeckValidationResult {
  const errors: string[] = [];

  if (deck.length !== EXPECTED_DECK_SIZE) {
    errors.push(`Expected ${EXPECTED_DECK_SIZE} cards, got ${deck.length}`);
  }

  const seen = new Set<string>();
  for (const card of deck) {
    const key = `${card.suit}:${card.rank}`;
    if (seen.has(key)) {
      errors.push(`Duplicate card: ${key}`);
    }
    seen.add(key);
  }

  const jokers = deck.filter(c => c.isJoker);
  if (jokers.length !== 1) {
    errors.push(`Expected exactly 1 Joker, found ${jokers.length}`);
  }

  return { valid: errors.length === 0, errors };
}

// ─── Dealing ──────────────────────────────────────────────────────────────────

export interface DealResult {
  /** One contiguous block of cardsPerPlayer cards per player. */
  hands: Card[][];
  /** Cards remaining after dealing — the "kitty". */
  kitty: Card[];
}

/**
 * Deals cards from an already-shuffled deck to `playerCount` players.
 * Each player receives a contiguous block of `cardsPerPlayer` cards
 * (not round-robin). The remaining cards go to the kitty.
 *
 * playerCount must be 3–8.
 * cardsPerPlayer must be 1–Math.floor(33 / playerCount).
 */
export function dealCards(
  deck: Card[],
  playerCount: number,
  cardsPerPlayer: number,
): DealResult {
  if (playerCount < 3 || playerCount > 8) {
    throw new RangeError(`playerCount must be 3–8, received ${playerCount}`);
  }

  const maxCardsPerPlayer = Math.floor(deck.length / playerCount);

  if (cardsPerPlayer < 1 || cardsPerPlayer > maxCardsPerPlayer) {
    throw new RangeError(
      `cardsPerPlayer must be 1–${maxCardsPerPlayer} for ${playerCount} players, received ${cardsPerPlayer}`,
    );
  }

  const hands: Card[][] = [];
  for (let p = 0; p < playerCount; p++) {
    const start = p * cardsPerPlayer;
    hands.push(deck.slice(start, start + cardsPerPlayer));
  }

  const kitty = deck.slice(playerCount * cardsPerPlayer);
  return { hands, kitty };
}

// ─── Trump determination ──────────────────────────────────────────────────────

/**
 * Determines the trump suit from the turn-up card (typically the last card
 * of the deck before dealing, or the kitty card).
 * Returns null if the card is the Joker — no automatic trump in that case.
 */
export function determineTrump(turnUpCard: Card): Suit | null {
  return turnUpCard.isJoker ? null : turnUpCard.suit;
}
