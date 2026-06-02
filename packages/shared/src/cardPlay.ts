import type { Card, Suit } from './types.js';

/**
 * Returns the subset of `hand` that the player is legally allowed to play.
 *
 * Rules (applied in priority order):
 *  1. No lead suit yet (first card of trick) → any card.
 *  2. Player has lead-suit cards → must play one of them.
 *     The Joker may always be played regardless.
 *  3. Player has no lead-suit cards but has trump (non-null trumpSuit) → must
 *     play trump. The Joker may always be played regardless.
 *  4. Player has neither → any card.
 *
 * No-trump rounds: pass `trumpSuit = null`. Rule 3 is skipped, so the player
 * may play any card when they cannot follow suit.
 *
 * Joker: always included in the legal set (no special behavior yet).
 */
export function getLegalCards(
  hand: Card[],
  leadSuit: Suit | null,
  trumpSuit: Suit | null,
): Card[] {
  // First card of trick — no constraint
  if (leadSuit === null) return [...hand];

  const hasLeadSuit = hand.some(c => !c.isJoker && c.suit === leadSuit);

  if (hasLeadSuit) {
    // Must follow suit; Joker always legal
    return hand.filter(c => c.isJoker || c.suit === leadSuit);
  }

  // No lead-suit cards; check for trump (only when a trump suit exists)
  if (trumpSuit !== null) {
    const hasTrump = hand.some(c => !c.isJoker && c.suit === trumpSuit);
    if (hasTrump) {
      // Must play trump; Joker always legal
      return hand.filter(c => c.isJoker || c.suit === trumpSuit);
    }
  }

  // No lead suit, no trump (or no-trump round) — any card
  return [...hand];
}

/**
 * Returns true if `card` is a legal play given the player's current `hand`,
 * the trick's lead suit, and the round's trump suit.
 *
 * Delegates to `getLegalCards` so the rules stay in one place.
 */
export function canPlayCard(
  hand: Card[],
  card: Card,
  leadSuit: Suit | null,
  trumpSuit: Suit | null,
): boolean {
  return getLegalCards(hand, leadSuit, trumpSuit).some(
    c => c.suit === card.suit && c.rank === card.rank,
  );
}
