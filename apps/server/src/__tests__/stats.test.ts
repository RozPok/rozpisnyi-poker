import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { GameRoom, RoomPlayer } from '@rozpisnyi-poker/shared';
import {
  recordGameResult,
  getLeaderboard,
  computeWinnerIds,
  _setStatsFileForTest,
  _resetStatsForTest,
} from '../stats';

// ─── Fixtures ────────────────────────────────────────────────────────────────

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'poker-stats-'));
  file = join(dir, 'player-stats.json');
  _setStatsFileForTest(file);
});

afterEach(() => {
  _resetStatsForTest();
  rmSync(dir, { recursive: true, force: true });
});

function player(id: string, name: string, extra: Partial<RoomPlayer> = {}): RoomPlayer {
  return { id, name, isConnected: true, ...extra };
}

/** Build a finished room with the given player→total scores. */
function finishedRoom(
  totals: Record<string, number>,
  players: RoomPlayer[],
  mode: 'normal' | 'test' = 'normal',
): GameRoom {
  return {
    id: 'room1',
    code: 'CODE01',
    ownerId: players[0]!.id,
    players,
    status: 'finished',
    gameSheet: {
      rounds: [],
      scores: players.map(p => ({
        playerId: p.id,
        name: p.name,
        bids: [],
        scores: [],
        total: totals[p.id] ?? 0,
      })),
      currentRoundIndex: 0,
    },
    activeRound: null,
    createdAt: Date.now(),
    mode,
  };
}

// ─── computeWinnerIds ──────────────────────────────────────────────────────────

describe('computeWinnerIds', () => {
  it('returns the single highest-total player', () => {
    const room = finishedRoom({ a: 30, b: 10, c: 20 }, [
      player('a', 'A'), player('b', 'B'), player('c', 'C'),
    ]);
    expect(computeWinnerIds(room)).toEqual(['a']);
  });

  it('returns all players tied for the highest total', () => {
    const room = finishedRoom({ a: 30, b: 30, c: 20 }, [
      player('a', 'A'), player('b', 'B'), player('c', 'C'),
    ]);
    expect(computeWinnerIds(room).sort()).toEqual(['a', 'b']);
  });

  it('excludes bots from winner consideration', () => {
    const room = finishedRoom({ a: 10, bot: 99 }, [
      player('a', 'A'), player('bot', 'Bot', { isBot: true }),
    ]);
    expect(computeWinnerIds(room)).toEqual(['a']);
  });
});

// ─── recordGameResult ──────────────────────────────────────────────────────────

describe('recordGameResult', () => {
  it('increments games for everyone and wins for the winner', () => {
    const room = finishedRoom({ a: 30, b: 10, c: 20 }, [
      player('a', 'A'), player('b', 'B'), player('c', 'C'),
    ]);
    recordGameResult(room);

    const lb = getLeaderboard();
    const byId = Object.fromEntries(lb.map(e => [e.playerId, e]));
    expect(byId.a!.games).toBe(1);
    expect(byId.a!.wins).toBe(1);
    expect(byId.b!.games).toBe(1);
    expect(byId.b!.wins).toBe(0);
    expect(byId.c!.wins).toBe(0);
  });

  it('counts a win for all tied winners', () => {
    const room = finishedRoom({ a: 30, b: 30, c: 5 }, [
      player('a', 'A'), player('b', 'B'), player('c', 'C'),
    ]);
    recordGameResult(room);

    const byId = Object.fromEntries(getLeaderboard().map(e => [e.playerId, e]));
    expect(byId.a!.wins).toBe(1);
    expect(byId.b!.wins).toBe(1);
    expect(byId.c!.wins).toBe(0);
  });

  it('accumulates stats across multiple games', () => {
    const players = [player('a', 'A'), player('b', 'B')];
    recordGameResult(finishedRoom({ a: 30, b: 10 }, players)); // a wins
    recordGameResult(finishedRoom({ a: 5, b: 40 }, players));  // b wins
    recordGameResult(finishedRoom({ a: 50, b: 1 }, players));  // a wins

    const byId = Object.fromEntries(getLeaderboard().map(e => [e.playerId, e]));
    expect(byId.a!.games).toBe(3);
    expect(byId.a!.wins).toBe(2);
    expect(byId.b!.games).toBe(3);
    expect(byId.b!.wins).toBe(1);
  });

  it('does NOT count Test Lab (mode=test) games', () => {
    const room = finishedRoom({ a: 30, b: 10 }, [player('a', 'A'), player('b', 'B')], 'test');
    recordGameResult(room);
    expect(getLeaderboard()).toEqual([]);
  });

  it('does NOT count bots but still counts real players in a mixed game', () => {
    // (mixed only happens in test mode in practice, but the filter must hold regardless)
    const room = finishedRoom({ a: 30, bot: 30 }, [
      player('a', 'A'), player('bot', 'Bot', { isBot: true }),
    ]);
    recordGameResult(room);

    const lb = getLeaderboard();
    expect(lb.map(e => e.playerId)).toEqual(['a']);
    expect(lb[0]!.wins).toBe(1);
  });

  it('updates the stored nickname to the latest name', () => {
    recordGameResult(finishedRoom({ a: 10, b: 5 }, [player('a', 'OldName'), player('b', 'B')]));
    recordGameResult(finishedRoom({ a: 10, b: 5 }, [player('a', 'NewName'), player('b', 'B')]));

    const entry = getLeaderboard().find(e => e.playerId === 'a')!;
    expect(entry.name).toBe('NewName');
    expect(entry.games).toBe(2);
  });

  it('persists to disk and survives a reload (fresh cache)', () => {
    recordGameResult(finishedRoom({ a: 30, b: 10 }, [player('a', 'A'), player('b', 'B')]));
    expect(existsSync(file)).toBe(true);

    // Drop the in-memory cache and re-point at the same file → forces a reload.
    _setStatsFileForTest(file);

    const byId = Object.fromEntries(getLeaderboard().map(e => [e.playerId, e]));
    expect(byId.a!.games).toBe(1);
    expect(byId.a!.wins).toBe(1);
  });

  it('writes valid JSON keyed by playerId', () => {
    recordGameResult(finishedRoom({ a: 30, b: 10 }, [player('a', 'A'), player('b', 'B')]));
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    expect(parsed.a).toMatchObject({ playerId: 'a', name: 'A', games: 1, wins: 1 });
    expect(parsed.b).toMatchObject({ playerId: 'b', games: 1, wins: 0 });
  });
});

// ─── getLeaderboard ────────────────────────────────────────────────────────────

describe('getLeaderboard', () => {
  it('returns an empty array when no games have been played', () => {
    expect(getLeaderboard()).toEqual([]);
  });

  it('returns entries sorted by win rate with a computed status', () => {
    const players = [player('a', 'A'), player('b', 'B')];
    // a: 2 games 2 wins = 100%; b: 2 games 0 wins = 0%
    recordGameResult(finishedRoom({ a: 30, b: 10 }, players));
    recordGameResult(finishedRoom({ a: 30, b: 10 }, players));

    const lb = getLeaderboard();
    expect(lb[0]!.playerId).toBe('a');
    expect(lb[0]!.winRate).toBe(100);
    expect(lb[0]!.status).toBe('Злоєбучій Підорас');
    expect(lb[1]!.playerId).toBe('b');
    expect(lb[1]!.status).toBe('Лох');
  });
});
