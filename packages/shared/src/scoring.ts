import type { RoundType } from './types.js';

/**
 * Computes the score earned by one player at the end of a round.
 *
 * @param roundType    - variant of the round being scored
 * @param bid          - bid the player submitted; null for misere/golden (no bidding)
 * @param actualTricks - tricks actually won by the player this round
 */
export function computeScore(
  roundType: RoundType,
  bid: number | null,
  actualTricks: number,
): number {
  switch (roundType) {
    case 'normal':
    case 'no-trump':
      return scoreNormal(bid ?? 0, actualTricks);
    case 'dark':
      return scoreNormal(bid ?? 0, actualTricks) * 2;
    case 'misere':
      return actualTricks === 0 ? 50 : -10 * actualTricks;
    case 'golden':
      return actualTricks === 0 ? -50 : 10 * actualTricks;
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function scoreNormal(bid: number, actualTricks: number): number {
  if (bid === 0) {
    return actualTricks === 0 ? 5 : actualTricks;
  }
  if (actualTricks === bid) return 10 * bid;
  if (actualTricks > bid) return actualTricks;
  return -10 * (bid - actualTricks);
}
