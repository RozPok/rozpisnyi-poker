import { describe, it, expect } from 'vitest';
import type { PlayerStatRecord } from '../types';
import { buildLeaderboard, statusForWinnerRank, WINNING_STATUSES, STATUS_LOSER } from '../leaderboard';

function rec(playerId: string, name: string, games: number, wins: number, points: number): PlayerStatRecord {
  return { playerId, name, games, wins, points };
}

const TOP = WINNING_STATUSES[0];                                 // Злоєбучій Підорас
const BOTTOM_WIN = WINNING_STATUSES[WINNING_STATUSES.length - 1]; // Чмо
const MIDDLE = WINNING_STATUSES[4];                             // Блядота

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

  it('nine winners fill all nine bands exactly (incl. Мразь at #8)', () => {
    const got = Array.from({ length: 9 }, (_, r) => statusForWinnerRank(r, 9));
    expect(got).toEqual([...WINNING_STATUSES]);
    expect(got[7]).toBe('Мразь');
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
    expect(buildLeaderboard([rec('a', 'Ghost', 0, 0, 0)])).toEqual([]);
  });

  it('ranks by hidden points, NOT by win rate', () => {
    // A: 100% win rate but only 12 points; B: 15% win rate but 35 points → B first.
    const lb = buildLeaderboard([rec('a', 'A', 2, 2, 12), rec('b', 'B', 20, 3, 35)]);
    expect(lb.map(e => e.playerId)).toEqual(['b', 'a']);
  });

  it('still computes win rate for display', () => {
    const lb = buildLeaderboard([rec('a', 'A', 4, 3, 8)]);
    expect(lb[0]!.winRate).toBe(75);
  });

  it('does not expose points on entries', () => {
    const lb = buildLeaderboard([rec('a', 'A', 4, 3, 8)]);
    expect('points' in lb[0]!).toBe(false);
  });

  it('a zero-win player always gets Лох, even ranked above winners by points', () => {
    const lb = buildLeaderboard([rec('zero', 'Zero', 50, 0, 50), rec('w', 'Winner', 1, 1, 6)]);
    expect(lb.map(e => e.playerId)).toEqual(['zero', 'w']);
    expect(lb.find(e => e.playerId === 'zero')!.status).toBe(STATUS_LOSER);
    expect(lb.find(e => e.playerId === 'w')!.status).toBe(TOP);
  });

  it('distributes status dynamically for 1 winner', () => {
    const lb = buildLeaderboard([rec('a', 'A', 3, 2, 10)]);
    expect(lb[0]!.status).toBe(TOP);
  });

  it('distributes status dynamically for 2 winners', () => {
    const lb = buildLeaderboard([rec('a', 'A', 10, 10, 60), rec('b', 'B', 1, 1, 6)]);
    expect(lb.map(e => e.status)).toEqual([TOP, BOTTOM_WIN]);
  });

  it('distributes status dynamically for 3 winners', () => {
    const lb = buildLeaderboard([
      rec('a', 'A', 10, 10, 60),
      rec('b', 'B', 5, 5, 30),
      rec('c', 'C', 1, 1, 6),
    ]);
    expect(lb.map(e => e.status)).toEqual([TOP, MIDDLE, BOTTOM_WIN]);
  });

  it('assigns winner status by position among winners, skipping 0-win players', () => {
    // Display order by points: hi(35,0-win), w1(30), lo(20,0-win), w2(6)
    const lb = buildLeaderboard([
      rec('w1', 'W1', 5, 5, 30),   // winner rank 0 → TOP
      rec('hi', 'Hi', 35, 0, 35),  // 0-win → Лох (ranks first overall)
      rec('w2', 'W2', 1, 1, 6),    // winner rank 1 → Чмо
      rec('lo', 'Lo', 20, 0, 20),  // 0-win → Лох
    ]);
    expect(lb.map(e => e.playerId)).toEqual(['hi', 'w1', 'lo', 'w2']);
    expect(lb.find(e => e.playerId === 'hi')!.status).toBe(STATUS_LOSER);
    expect(lb.find(e => e.playerId === 'lo')!.status).toBe(STATUS_LOSER);
    expect(lb.find(e => e.playerId === 'w1')!.status).toBe(TOP);
    expect(lb.find(e => e.playerId === 'w2')!.status).toBe(BOTTOM_WIN);
  });

  it('breaks point ties by wins, then games, then name', () => {
    // Equal points (20). Higher wins ranks first.
    const lb = buildLeaderboard([rec('a', 'A', 10, 2, 20), rec('b', 'B', 5, 3, 20)]);
    expect(lb.map(e => e.playerId)).toEqual(['b', 'a']); // b has 3 wins
    expect(lb.map(e => e.status)).toEqual([TOP, BOTTOM_WIN]);
  });

  it('handles negative points (last-place penalties) in the ranking', () => {
    const lb = buildLeaderboard([
      rec('win', 'Win', 1, 1, 6),
      rec('mid', 'Mid', 1, 0, 0),
      rec('last', 'Last', 1, 0, -2),
    ]);
    expect(lb.map(e => e.playerId)).toEqual(['win', 'mid', 'last']);
    expect(lb.find(e => e.playerId === 'mid')!.status).toBe(STATUS_LOSER);  // 0 wins
    expect(lb.find(e => e.playerId === 'last')!.status).toBe(STATUS_LOSER); // 0 wins
  });

  it('treats a record without points as 0', () => {
    const noPoints = { playerId: 'x', name: 'X', games: 4, wins: 2 } as unknown as PlayerStatRecord;
    const lb = buildLeaderboard([noPoints, rec('y', 'Y', 3, 1, 5)]); // x:0pts, y:5pts
    expect(lb.map(e => e.playerId)).toEqual(['y', 'x']);
  });
});
