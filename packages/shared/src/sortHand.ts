import type { Card, Suit } from './types.js';

// Display order for non-trump suits (left → right in hand)
const SUIT_ORDER_BASE: Suit[] = ['hearts', 'clubs', 'spades', 'diamonds'];

const RANK_VALUE: Record<string, number> = {
  '6':  0, '7':  1, '8':  2, '9':  3, '10': 4,
  'J':  5, 'Q':  6, 'K':  7, 'A':  8,
};

/**
 * Returns a new sorted hand array.
 *
 * Order:
 *   1. Non-trump suits in base order: hearts → clubs → spades → diamonds
 *      (with the trump suit removed from its natural position)
 *   2. Trump suit (if any) — last normal group
 *   3. Joker — always rightmost
 *
 * Within each suit, cards are sorted lowest → highest rank (7 … A).
 */
export function sortHand(hand: Card[], trumpSuit: Suit | null): Card[] {
  const nonTrumpOrder = SUIT_ORDER_BASE.filter(s => s !== trumpSuit);

  const suitRank = (suit: Suit): number => {
    if (suit === 'joker') return nonTrumpOrder.length + 2; // always last
    if (suit === trumpSuit) return nonTrumpOrder.length;   // after non-trump suits
    const idx = nonTrumpOrder.indexOf(suit);
    return idx >= 0 ? idx : nonTrumpOrder.length + 1;
  };

  return [...hand].sort((a, b) => {
    const suitDiff = suitRank(a.suit) - suitRank(b.suit);
    if (suitDiff !== 0) return suitDiff;
    return (RANK_VALUE[a.rank] ?? 0) - (RANK_VALUE[b.rank] ?? 0);
  });
}
