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
      return scoreDark(bid ?? 0, actualTricks);
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

function scoreDark(bid: number, actualTricks: number): number {
  // Undertrick: -20 per missing trick
  if (actualTricks < bid) return -20 * (bid - actualTricks);
  // Exact: 0T→+5; NT→20×N
  if (actualTricks === bid) return bid === 0 ? 5 : bid * 20;
  // Overtrick: score exactly as a normal round (no multiplier)
  return scoreNormal(bid, actualTricks);
}
