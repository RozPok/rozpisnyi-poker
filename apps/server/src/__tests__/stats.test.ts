import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
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

  it('returns entries ranked by points with computed win rate and dynamic status', () => {
    const players = [player('a', 'A'), player('b', 'B')];
    // a: 2 games 2 wins → 12 pts, 100% winRate; b: 2 games 0 wins → 2 pts, 0% winRate
    recordGameResult(finishedRoom({ a: 30, b: 10 }, players));
    recordGameResult(finishedRoom({ a: 30, b: 10 }, players));

    const lb = getLeaderboard();
    expect(lb[0]!.playerId).toBe('a');
    expect(lb[0]!.winRate).toBe(100);              // win rate still displayed
    expect(lb[0]!.status).toBe('Злоєбучій Підорас'); // only winner → top status
    expect(lb[1]!.playerId).toBe('b');
    expect(lb[1]!.status).toBe('Лох');             // 0 wins → Лох
    expect('points' in lb[0]!).toBe(false);        // points never exposed
  });
});

// ─── hidden points ─────────────────────────────────────────────────────────────

/** Read the persisted stats file (points live here, not on leaderboard entries). */
function readStored(): Record<string, { games: number; wins: number; points: number }> {
  return JSON.parse(readFileSync(file, 'utf8'));
}

describe('hidden points', () => {
  it('awards +6 to a winner and +1 to a loser on game completion', () => {
    recordGameResult(finishedRoom({ a: 30, b: 10 }, [player('a', 'A'), player('b', 'B')]));
    const s = readStored();
    expect(s.a).toMatchObject({ games: 1, wins: 1, points: 6 });
    expect(s.b).toMatchObject({ games: 1, wins: 0, points: 1 });
  });

  it('awards +6 to every tied winner', () => {
    recordGameResult(finishedRoom({ a: 30, b: 30, c: 5 }, [
      player('a', 'A'), player('b', 'B'), player('c', 'C'),
    ]));
    const s = readStored();
    expect(s.a.points).toBe(6);
    expect(s.b.points).toBe(6);
    expect(s.c.points).toBe(1);
  });

  it('accumulates points across games (== games + wins*5)', () => {
    const players = [player('a', 'A'), player('b', 'B')];
    recordGameResult(finishedRoom({ a: 30, b: 10 }, players)); // a wins: a+6, b+1
    recordGameResult(finishedRoom({ a: 5, b: 40 }, players));  // b wins: a+1, b+6
    const s = readStored();
    expect(s.a).toMatchObject({ games: 2, wins: 1, points: 7 });
    expect(s.b).toMatchObject({ games: 2, wins: 1, points: 7 });
  });

  it('does not award points for Test Lab games', () => {
    recordGameResult(finishedRoom({ a: 30, b: 10 }, [player('a', 'A'), player('b', 'B')], 'test'));
    expect(existsSync(file)).toBe(false);
    expect(getLeaderboard()).toEqual([]);
  });

  it('does not award points to bots', () => {
    recordGameResult(finishedRoom({ a: 10, bot: 99 }, [
      player('a', 'A'), player('bot', 'Bot', { isBot: true }),
    ]));
    const s = readStored();
    expect(Object.keys(s)).toEqual(['a']);
    expect(s.a.points).toBe(6); // a is the sole (real) winner
  });
});

// ─── legacy migration ────────────────────────────────────────────────────────────

describe('legacy migration (files without points)', () => {
  it('computes missing points on read as games + wins*5 and persists them', () => {
    // Write a legacy file with NO points field.
    writeFileSync(file, JSON.stringify({
      old1: { playerId: 'old1', name: 'Old1', games: 10, wins: 3 },
      old2: { playerId: 'old2', name: 'Old2', games: 4, wins: 0 },
    }), 'utf8');
    _setStatsFileForTest(file); // drop cache → next access reloads + migrates

    const lb = getLeaderboard(); // triggers load → migrate → persist

    // Points recomputed and written back to disk.
    const s = readStored();
    expect(s.old1.points).toBe(10 + 3 * 5); // 25
    expect(s.old2.points).toBe(4 + 0 * 5);  // 4

    // Ranked by the migrated points; 0-win player → Лох.
    expect(lb.map(e => e.playerId)).toEqual(['old1', 'old2']);
    expect(lb.find(e => e.playerId === 'old2')!.status).toBe('Лох');
    expect(lb.find(e => e.playerId === 'old1')!.status).toBe('Злоєбучій Підорас');
  });

  it('subsequent games build on migrated points', () => {
    writeFileSync(file, JSON.stringify({
      old1: { playerId: 'old1', name: 'Old1', games: 2, wins: 1 }, // → 7 pts after migration
    }), 'utf8');
    _setStatsFileForTest(file);
    getLeaderboard(); // migrate

    recordGameResult(finishedRoom({ old1: 30, b: 10 }, [player('old1', 'Old1'), player('b', 'B')])); // old1 wins → +6
    const s = readStored();
    expect(s.old1).toMatchObject({ games: 3, wins: 2, points: 13 }); // 7 + 6
  });
});
