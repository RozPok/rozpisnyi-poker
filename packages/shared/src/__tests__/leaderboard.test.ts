import { describe, it, expect } from 'vitest';
import type { PlayerStatRecord } from '../types';
import { buildLeaderboard, statusForWinnerRank, WINNING_STATUSES, STATUS_LOSER } from '../leaderboard';

// points == games + wins*5 (the incremental / migration formula)
function rec(playerId: string, name: string, games: number, wins: number): PlayerStatRecord {
  return { playerId, name, games, wins, points: games + wins * 5 };
}

const TOP = WINNING_STATUSES[0];                          // Злоєбучій Підорас
const BOTTOM_WIN = WINNING_STATUSES[WINNING_STATUSES.length - 1]; // Чмо
const MIDDLE = WINNING_STATUSES[4];                       // Блядота

// ─── statusForWinnerRank ────────────────────────────────────────────────────────

describe('statusForWinnerRank', () => {
  it('single winner gets the top band', () => {
    expect(statusForWinnerRank(0, 1)).toBe(TOP);
  });

  it('two winners: best top, worst Чмо (not Лох)', () => {
    expect(statusForWinnerRank(0, 2)).toBe(TOP);
    expect(statusForWinnerRank(1, 2)).toBe(BOTTOM_WIN);
  });

  it('three winners: top / middle / bottom', () => {
    expect(statusForWinnerRank(0, 3)).toBe(TOP);
    expect(statusForWinnerRank(1, 3)).toBe(MIDDLE);
    expect(statusForWinnerRank(2, 3)).toBe(BOTTOM_WIN);
  });

  it('nine winners fill all nine bands exactly', () => {
    const got = Array.from({ length: 9 }, (_, r) => statusForWinnerRank(r, 9));
    expect(got).toEqual([...WINNING_STATUSES]);
  });

  it('more winners than bands share bands but keep the extremes', () => {
    expect(statusForWinnerRank(0, 20)).toBe(TOP);
    expect(statusForWinnerRank(19, 20)).toBe(BOTTOM_WIN);
  });

  it('never returns Лох for a winner', () => {
    for (let n = 1; n <= 20; n++) {
      for (let r = 0; r < n; r++) {
        expect(statusForWinnerRank(r, n)).not.toBe(STATUS_LOSER);
      }
    }
  });
});

// ─── buildLeaderboard ──────────────────────────────────────────────────────────

describe('buildLeaderboard', () => {
  it('returns an empty array for no records', () => {
    expect(buildLeaderboard([])).toEqual([]);
  });

  it('excludes records with zero games', () => {
    expect(buildLeaderboard([rec('a', 'Ghost', 0, 0)])).toEqual([]);
  });

  it('ranks by hidden points, NOT by win rate', () => {
    // A: 2 games / 2 wins → 100% winRate, 12 points
    // B: 20 games / 3 wins → 15% winRate, 35 points
    // Points put B first even though A has the higher win rate.
    const lb = buildLeaderboard([rec('a', 'A', 2, 2), rec('b', 'B', 20, 3)]);
    expect(lb.map(e => e.playerId)).toEqual(['b', 'a']);
  });

  it('still computes win rate for display', () => {
    const lb = buildLeaderboard([rec('a', 'A', 4, 3)]);
    expect(lb[0]!.winRate).toBe(75);
  });

  it('does not expose points on entries', () => {
    const lb = buildLeaderboard([rec('a', 'A', 4, 3)]);
    expect('points' in lb[0]!).toBe(false);
  });

  it('a zero-win player always gets Лох, even ranked above winners by points', () => {
    // zero: 50 games / 0 wins → 50 points (ranks first)
    // winner: 1 game / 1 win → 6 points
    const lb = buildLeaderboard([rec('zero', 'Zero', 50, 0), rec('w', 'Winner', 1, 1)]);
    expect(lb.map(e => e.playerId)).toEqual(['zero', 'w']);
    expect(lb.find(e => e.playerId === 'zero')!.status).toBe(STATUS_LOSER);
    expect(lb.find(e => e.playerId === 'w')!.status).toBe(TOP);
  });

  it('distributes status dynamically for 1 winner', () => {
    const lb = buildLeaderboard([rec('a', 'A', 3, 2)]);
    expect(lb[0]!.status).toBe(TOP);
  });

  it('distributes status dynamically for 2 winners', () => {
    const lb = buildLeaderboard([rec('a', 'A', 10, 10), rec('b', 'B', 1, 1)]); // 60 vs 6 pts
    expect(lb.map(e => e.status)).toEqual([TOP, BOTTOM_WIN]);
  });

  it('distributes status dynamically for 3 winners', () => {
    const lb = buildLeaderboard([
      rec('a', 'A', 10, 10), // 60 pts
      rec('b', 'B', 5, 5),   // 30 pts
      rec('c', 'C', 1, 1),   // 6 pts
    ]);
    expect(lb.map(e => e.status)).toEqual([TOP, MIDDLE, BOTTOM_WIN]);
  });

  it('assigns winner status by position among winners, skipping 0-win players', () => {
    // Display order by points: hi(35,0-win), w1(30), lo(20,0-win), w2(6)
    const lb = buildLeaderboard([
      rec('w1', 'W1', 5, 5),    // 30 pts, winner rank 0 → TOP
      rec('hi', 'Hi', 35, 0),   // 35 pts, 0-win → Лох (ranks first overall)
      rec('w2', 'W2', 1, 1),    // 6 pts, winner rank 1 → Чмо
      rec('lo', 'Lo', 20, 0),   // 20 pts, 0-win → Лох
    ]);
    expect(lb.map(e => e.playerId)).toEqual(['hi', 'w1', 'lo', 'w2']);
    expect(lb.find(e => e.playerId === 'hi')!.status).toBe(STATUS_LOSER);
    expect(lb.find(e => e.playerId === 'lo')!.status).toBe(STATUS_LOSER);
    expect(lb.find(e => e.playerId === 'w1')!.status).toBe(TOP);
    expect(lb.find(e => e.playerId === 'w2')!.status).toBe(BOTTOM_WIN);
  });

  it('breaks point ties by wins, then games, then name', () => {
    // Equal points (20). Higher wins ranks first.
    const lb = buildLeaderboard([rec('a', 'A', 10, 2), rec('b', 'B', 5, 3)]);
    expect(lb.map(e => e.playerId)).toEqual(['b', 'a']); // b has 3 wins
    expect(lb.map(e => e.status)).toEqual([TOP, BOTTOM_WIN]);
  });

  it('falls back to games + wins*5 when a record lacks points', () => {
    const legacy = { playerId: 'x', name: 'X', games: 4, wins: 2 } as unknown as PlayerStatRecord;
    const lb = buildLeaderboard([legacy, rec('y', 'Y', 3, 1)]); // x: 14 pts, y: 8 pts
    expect(lb.map(e => e.playerId)).toEqual(['x', 'y']);
  });
});
