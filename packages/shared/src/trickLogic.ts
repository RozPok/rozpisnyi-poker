import type { Card, Suit, TrickPlay } from './types.js';

export const RANK_ORDER: Record<string, number> = {
  '6': 0, '7': 1, '8': 2, '9': 3, '10': 4,
  'J': 5, 'Q': 6, 'K': 7, 'A': 8,
};

/**
 * Returns true if `challenger` beats `current` given the lead and trump suits.
 * Rules (in priority order):
 *   1. Joker always wins; if both are jokers the current holder wins (no change).
 *   2. Trump beats non-trump.
 *   3. Lead-suit beats off-suit.
 *   4. Higher rank wins within the same category.
 */
export function cardBeats(
  challenger: Card,
  current: Card,
  leadSuit: Suit | null,
  trumpSuit: Suit | null,
): boolean {
  if (challenger.isJoker) return true;
  if (current.isJoker) return false;

  const challengerIsTrump = trumpSuit !== null && challenger.suit === trumpSuit;
  const currentIsTrump = trumpSuit !== null && current.suit === trumpSuit;

  if (challengerIsTrump && !currentIsTrump) return true;
  if (!challengerIsTrump && currentIsTrump) return false;

  const challengerFollowsLead = leadSuit !== null && challenger.suit === leadSuit;
  const currentFollowsLead = leadSuit !== null && current.suit === leadSuit;

  if (challengerFollowsLead && !currentFollowsLead) return true;
  if (!challengerFollowsLead && currentFollowsLead) return false;

  return (RANK_ORDER[challenger.rank] ?? 0) > (RANK_ORDER[current.rank] ?? 0);
}

/** Returns the playerId of the winner of a completed trick. */
export function determineTrickWinner(
  trick: TrickPlay[],
  leadSuit: Suit | null,
  trumpSuit: Suit | null,
): string {
  if (trick.length === 0) throw new Error('Cannot determine winner of an empty trick');

  let best = trick[0]!;
  for (let i = 1; i < trick.length; i++) {
    const play = trick[i]!;
    if (cardBeats(play.card, best.card, leadSuit, trumpSuit)) {
      best = play;
    }
  }
  return best.playerId;
}
