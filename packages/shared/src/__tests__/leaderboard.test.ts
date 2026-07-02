import { describe, it, expect } from 'vitest';
import type { PlayerStatRecord } from '../types';
import { winRateStatus, buildLeaderboard } from '../leaderboard';

// ─── winRateStatus ─────────────────────────────────────────────────────────────

describe('winRateStatus', () => {
  it('maps each band to the correct status', () => {
    expect(winRateStatus(100)).toBe('Злоєбучій Підорас');
    expect(winRateStatus(95)).toBe('Злоєбучій Підорас');
    expect(winRateStatus(85)).toBe('Хуєсос');
    expect(winRateStatus(75)).toBe('Уєбан');
    expect(winRateStatus(65)).toBe('Гніда');
    expect(winRateStatus(55)).toBe('Блядота');
    expect(winRateStatus(45)).toBe('Гандон');
    expect(winRateStatus(35)).toBe('Хуйло');
    expect(winRateStatus(25)).toBe('Блядун');
    expect(winRateStatus(15)).toBe('Чмо');
    expect(winRateStatus(5)).toBe('Лох');
    expect(winRateStatus(0)).toBe('Лох');
  });

  it('treats band boundaries as lower-bound inclusive', () => {
    expect(winRateStatus(90)).toBe('Злоєбучій Підорас');
    expect(winRateStatus(80)).toBe('Хуєсос');
    expect(winRateStatus(70)).toBe('Уєбан');
    expect(winRateStatus(60)).toBe('Гніда');
    expect(winRateStatus(50)).toBe('Блядота');
    expect(winRateStatus(40)).toBe('Гандон');
    expect(winRateStatus(30)).toBe('Хуйло');
    expect(winRateStatus(20)).toBe('Блядун');
    expect(winRateStatus(10)).toBe('Чмо');
  });

  it('applies the mapping to a single-game player (no "Новачок")', () => {
    expect(winRateStatus(100)).toBe('Злоєбучій Підорас'); // 1 game, 1 win
    expect(winRateStatus(0)).toBe('Лох');                  // 1 game, 0 wins
  });
});

// ─── buildLeaderboard ──────────────────────────────────────────────────────────

function rec(playerId: string, name: string, games: number, wins: number): PlayerStatRecord {
  return { playerId, name, games, wins };
}

describe('buildLeaderboard', () => {
  it('returns an empty array for no records', () => {
    expect(buildLeaderboard([])).toEqual([]);
  });

  it('computes win rate and status for each entry', () => {
    const [e] = buildLeaderboard([rec('a', 'Alice', 4, 3)]);
    expect(e!.winRate).toBe(75);
    expect(e!.status).toBe('Уєбан');
  });

  it('sorts by win rate descending', () => {
    const lb = buildLeaderboard([
      rec('a', 'Low', 10, 1),   // 10%
      rec('b', 'High', 10, 9),  // 90%
      rec('c', 'Mid', 10, 5),   // 50%
    ]);
    expect(lb.map(e => e.playerId)).toEqual(['b', 'c', 'a']);
  });

  it('breaks win-rate ties by games played descending', () => {
    const lb = buildLeaderboard([
      rec('a', 'Few', 2, 1),    // 50%, 2 games
      rec('b', 'Many', 10, 5),  // 50%, 10 games
    ]);
    expect(lb.map(e => e.playerId)).toEqual(['b', 'a']);
  });

  it('breaks win-rate + games ties by wins descending', () => {
    // Same rate is impossible with same games but different wins; construct a
    // rate tie via different games where games also tie is impossible, so verify
    // wins tiebreak using identical rate and games via equal totals:
    const lb = buildLeaderboard([
      rec('a', 'A', 4, 2), // 50%, 4 games, 2 wins
      rec('b', 'B', 4, 2), // 50%, 4 games, 2 wins — falls through to name
    ]);
    expect(lb.map(e => e.playerId)).toEqual(['a', 'b']); // name A before B
  });

  it('breaks full ties by nickname alphabetically', () => {
    const lb = buildLeaderboard([
      rec('z', 'Ярема', 3, 2),
      rec('a', 'Андрій', 3, 2),
      rec('m', 'Марія', 3, 2),
    ]);
    expect(lb.map(e => e.name)).toEqual(['Андрій', 'Марія', 'Ярема']);
  });

  it('excludes records with zero games', () => {
    expect(buildLeaderboard([rec('a', 'Ghost', 0, 0)])).toEqual([]);
  });

  it('ranks a 100% single-game player above a 50% veteran', () => {
    const lb = buildLeaderboard([
      rec('vet', 'Vet', 100, 50),  // 50%
      rec('new', 'New', 1, 1),     // 100%
    ]);
    expect(lb[0]!.playerId).toBe('new');
    expect(lb[0]!.status).toBe('Злоєбучій Підорас');
  });
});
