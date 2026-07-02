import type { LeaderboardEntry, PlayerStatRecord } from './types.js';

/**
 * Maps a win rate (percentage, 0–100) to a status label.
 *
 * Bands are lower-bound inclusive: exactly 90% → top band, exactly 10% → Чмо.
 * The mapping applies immediately, even for a player with a single game.
 */
export function winRateStatus(winRatePercent: number): string {
  if (winRatePercent >= 90) return 'Злоєбучій Підорас';
  if (winRatePercent >= 80) return 'Хуєсос';
  if (winRatePercent >= 70) return 'Уєбан';
  if (winRatePercent >= 60) return 'Гніда';
  if (winRatePercent >= 50) return 'Блядота';
  if (winRatePercent >= 40) return 'Гандон';
  if (winRatePercent >= 30) return 'Хуйло';
  if (winRatePercent >= 20) return 'Блядун';
  if (winRatePercent >= 10) return 'Чмо';
  return 'Лох';
}

/**
 * Builds a sorted leaderboard from raw player records.
 *
 * Sort order:
 *   1. win rate descending
 *   2. games played descending
 *   3. wins descending
 *   4. nickname alphabetically (Ukrainian locale)
 *
 * Records with zero games are excluded (they cannot have a meaningful win rate).
 */
export function buildLeaderboard(records: PlayerStatRecord[]): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = records
    .filter(r => r.games > 0)
    .map(r => {
      const winRate = (r.wins / r.games) * 100;
      return {
        playerId: r.playerId,
        name: r.name,
        games: r.games,
        wins: r.wins,
        winRate,
        status: winRateStatus(winRate),
      };
    });

  entries.sort(
    (a, b) =>
      b.winRate - a.winRate ||
      b.games - a.games ||
      b.wins - a.wins ||
      a.name.localeCompare(b.name, 'uk'),
  );

  return entries;
}
