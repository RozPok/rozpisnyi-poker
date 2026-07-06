import type { LeaderboardEntry, PlayerStatRecord } from './types.js';

/**
 * Status bands for players with at least one win, best → worst.
 * `Лох` (10th status) is intentionally excluded here — it is reserved for
 * players with zero wins and is applied separately.
 */
export const WINNING_STATUSES = [
  'Злоєбучій Підорас', // best
  'Хуєсос',
  'Уєбан',
  'Гніда',
  'Блядота',
  'Гандон',
  'Хуйло',
  'Мразь',
  'Чмо',               // lowest status a winning player can hold
] as const;

/** Status for players with zero wins — always the lowest. */
export const STATUS_LOSER = 'Лох';

/**
 * Maps a winning player's rank to a status band.
 *
 * @param rank        0-based position among winning players (0 = best)
 * @param winnerCount total number of winning players
 *
 * band = winnerCount <= 1 ? 0 : round(rank * 8 / (winnerCount - 1))
 *
 * so the best winner always gets the top band, the worst winning player always
 * gets `Чмо`, and everyone in between is spread proportionally across the 9
 * winning bands (bands are shared when there are more winners than bands).
 */
export function statusForWinnerRank(rank: number, winnerCount: number): string {
  if (winnerCount <= 1) return WINNING_STATUSES[0];
  const lastBand = WINNING_STATUSES.length - 1; // 8
  const band = Math.round((rank * lastBand) / (winnerCount - 1));
  return WINNING_STATUSES[band] ?? WINNING_STATUSES[lastBand];
}

/** Hidden rating points for a record (defensively treats a missing value as 0). */
function pointsOf(r: PlayerStatRecord): number {
  return typeof r.points === 'number' ? r.points : 0;
}

/**
 * Builds the ranked leaderboard from raw player records.
 *
 * Ranking (and display order):
 *   1. hidden points descending
 *   2. wins descending
 *   3. games descending
 *   4. nickname alphabetically (Ukrainian locale)
 *
 * Status is assigned by ranking position among winning players (see
 * statusForWinnerRank); players with zero wins always get `Лох`. Win rate is
 * still computed for display but does NOT affect ranking or status.
 *
 * Records with zero games are excluded. Points are never included in the output.
 */
export function buildLeaderboard(records: PlayerStatRecord[]): LeaderboardEntry[] {
  const sorted = records
    .filter(r => r.games > 0)
    .map(r => ({
      playerId: r.playerId,
      name: r.name,
      games: r.games,
      wins: r.wins,
      points: pointsOf(r),
      winRate: (r.wins / r.games) * 100,
    }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.wins - a.wins ||
        b.games - a.games ||
        a.name.localeCompare(b.name, 'uk'),
    );

  const winnerCount = sorted.filter(e => e.wins > 0).length;
  let winnerRank = 0;

  return sorted.map(e => {
    const status = e.wins > 0 ? statusForWinnerRank(winnerRank++, winnerCount) : STATUS_LOSER;
    return {
      playerId: e.playerId,
      name: e.name,
      games: e.games,
      wins: e.wins,
      winRate: e.winRate,
      status,
    };
  });
}
