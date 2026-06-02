import type { GameRound, GameSheet, RoundType, Suit } from './types.js';
import { ROOM_MIN_PLAYERS, ROOM_MAX_PLAYERS } from './types.js';

// ─── Display labels ───────────────────────────────────────────────────────────

export const ROUND_TYPE_LABELS: Record<RoundType, string> = {
  normal:      '',
  'no-trump':  'Без козиря',
  dark:        'Темна',
  misere:      'Мізер',
  golden:      'Золота',
};

export const TRUMP_SUIT_LABELS: Record<Suit, string> = {
  spades:   'Піка ♠',
  hearts:   'Чирва ♥',
  diamonds: 'Буба ♦',
  clubs:    'Хреста ♣',
};

// ─── Generator ────────────────────────────────────────────────────────────────

/**
 * Generates the full round list for a game.
 *
 * maxCards = Math.floor(33 / playerCount)
 *
 * Structure:
 *   ascending  : 1 … maxCards-1              (maxCards-1 rounds)
 *   flat       : maxCards × playerCount      (playerCount rounds)
 *   descending : maxCards-1 … 1              (maxCards-1 rounds)
 *   special    : Б×n  Т×n  М×n  З×n         (4 × playerCount rounds)
 *
 * Total = 2*(maxCards-1) + 5*playerCount
 *
 * Example — 4 players (maxCards = 8):
 *   1 2 3 4 5 6 7 | 8 8 8 8 | 7 6 5 4 3 2 1 | Б Б Б Б | Т Т Т Т | М М М М | З З З З
 */
export function generateGameSheet(playerCount: number): GameSheet {
  if (playerCount < ROOM_MIN_PLAYERS || playerCount > ROOM_MAX_PLAYERS) {
    throw new RangeError(
      `playerCount must be ${ROOM_MIN_PLAYERS}–${ROOM_MAX_PLAYERS}, received ${playerCount}`,
    );
  }

  const maxCards = Math.floor(33 / playerCount);
  const rounds: GameRound[] = [];

  const add = (type: RoundType, cards: number, label: string): void => {
    rounds.push({ index: rounds.length, type, cardsPerPlayer: cards, label });
  };

  // Ascending: 1 to maxCards-1
  for (let c = 1; c < maxCards; c++) add('normal', c, String(c));

  // Flat: playerCount rounds at maxCards
  for (let i = 0; i < playerCount; i++) add('normal', maxCards, String(maxCards));

  // Descending: maxCards-1 down to 1
  for (let c = maxCards - 1; c >= 1; c--) add('normal', c, String(c));

  // Special rounds: each type repeated playerCount times
  const specials: Array<[RoundType, string]> = [
    ['no-trump', 'Б'],
    ['dark',     'Т'],
    ['misere',   'М'],
    ['golden',   'З'],
  ];
  for (const [type, label] of specials) {
    for (let i = 0; i < playerCount; i++) add(type, maxCards, label);
  }

  return { rounds, scores: [], currentRoundIndex: 0 };
}

/** Returns the maximum cards per player for a given player count. */
export function maxCardsForCount(playerCount: number): number {
  return Math.floor(33 / playerCount);
}
