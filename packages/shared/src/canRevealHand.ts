import type { RoundType } from './types.js';

/**
 * Returns true when the player's hand should be visible in the bidding phase.
 *
 * @param roundType  - type of the current round
 * @param myId       - socket ID of the viewing player
 * @param bids       - bids already submitted this round (playerId → number)
 * @param isMyTurn   - whether it is currently this player's bidding turn
 * @param darkChoice - the player's dark/not-dark choice for this turn
 *                     ('dark' | 'not-dark' | null = not yet chosen)
 */
export function canRevealHand(
  roundType: RoundType,
  myId: string,
  bids: Record<string, number>,
  isMyTurn: boolean,
  darkChoice: string | null,
): boolean {
  // Special dark round (Т): hand is always hidden during bidding for everyone
  if (roundType === 'dark') return false;

  // Rounds without a dark option (no-trump, misere, golden): always visible
  if (roundType !== 'normal') return true;

  // Normal round: visible only if this player has already submitted a bid …
  if (myId in bids) return true;

  // … or it is their turn AND they have explicitly chosen "not dark"
  return isMyTurn && darkChoice === 'not-dark';
}
