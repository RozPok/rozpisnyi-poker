import type { Card, JokerDeclaration, Suit } from './types.js';
import { RANK_ORDER } from './trickLogic.js';

/**
 * Returns the subset of `hand` that the player is legally allowed to play.
 *
 * When `jokerDeclaration` is provided (Joker has already led the current trick):
 *
 *   highest-suit / lowest-suit
 *     If the player holds the declared suit they must play their highest / lowest
 *     card of that suit.  Joker is always also legal.
 *     If they hold no card of the declared suit they may play any card.
 *
 *   lay-down
 *     Before the first non-Joker has been played (leadSuit === null): any card.
 *     After the first non-Joker has established a lead suit: normal suit-following
 *     rules apply (same as if that card had led the trick normally).
 *
 * Without a Joker declaration the standard rules apply:
 *   1. No lead suit yet → any card.
 *   2. Player has lead-suit cards → must follow suit (Joker always legal).
 *   3. No lead suit but has trump → must play trump (Joker always legal).
 *   4. Neither → any card.
 */
export function getLegalCards(
  hand: Card[],
  leadSuit: Suit | null,
  trumpSuit: Suit | null,
  jokerDeclaration?: JokerDeclaration | null,
): Card[] {
  if (jokerDeclaration?.mode === 'highest-suit' && jokerDeclaration.suit) {
    return legalForDeclaredSuit(hand, jokerDeclaration.suit, 'highest');
  }

  if (jokerDeclaration?.mode === 'lowest-suit' && jokerDeclaration.suit) {
    return legalForDeclaredSuit(hand, jokerDeclaration.suit, 'lowest');
  }

  // lay-down (or no declaration): normal rules driven by leadSuit
  if (leadSuit === null) return [...hand];

  const hasLeadSuit = hand.some(c => !c.isJoker && c.suit === leadSuit);

  if (hasLeadSuit) {
    return hand.filter(c => c.isJoker || c.suit === leadSuit);
  }

  if (trumpSuit !== null) {
    const hasTrump = hand.some(c => !c.isJoker && c.suit === trumpSuit);
    if (hasTrump) {
      return hand.filter(c => c.isJoker || c.suit === trumpSuit);
    }
  }

  return [...hand];
}

/**
 * Returns true if `card` is a legal play given the player's `hand`,
 * lead suit, trump suit, and optional Joker declaration.
 */
export function canPlayCard(
  hand: Card[],
  card: Card,
  leadSuit: Suit | null,
  trumpSuit: Suit | null,
  jokerDeclaration?: JokerDeclaration | null,
): boolean {
  return getLegalCards(hand, leadSuit, trumpSuit, jokerDeclaration).some(
    c => c.suit === card.suit && c.rank === card.rank,
  );
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function legalForDeclaredSuit(
  hand: Card[],
  suit: Suit,
  target: 'highest' | 'lowest',
): Card[] {
  const suitCards = hand.filter(c => !c.isJoker && c.suit === suit);

  if (suitCards.length === 0) {
    // Player has none of the declared suit → free to play anything
    return [...hand];
  }

  // Find extreme card of the declared suit
  const extreme = suitCards.reduce((best, c) => {
    const cv = RANK_ORDER[c.rank] ?? 0;
    const bv = RANK_ORDER[best.rank] ?? 0;
    return target === 'highest' ? (cv > bv ? c : best) : (cv < bv ? c : best);
  });

  // Must play that specific card; Joker is always also legal
  return [extreme, ...hand.filter(c => c.isJoker)];
}
