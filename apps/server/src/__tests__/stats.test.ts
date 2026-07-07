import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { GameRoom, RoomPlayer } from '@rozpisnyi-poker/shared';
import {
  recordGameResult,
  getLeaderboard,
  computeWinnerIds,
  placementPointsFor,
  RATING_VERSION,
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

/** Build a finished room from a playerId → final-total map. */
function finishedRoom(
  totals: Record<string, number>,
  players: RoomPlayer[],
  mode: 'normal' | 'test' = 'normal',
): GameRoom {
  return {
    id: 'room1', code: 'CODE01', ownerId: players[0]!.id, players,
    status: 'finished',
    gameSheet: {
      rounds: [],
      scores: players.map(p => ({ playerId: p.id, name: p.name, bids: [], scores: [], total: totals[p.id] ?? 0 })),
      currentRoundIndex: 0,
    },
    activeRound: null, createdAt: Date.now(), mode,
  };
}

/** N real players p1…pN with the given totals (index i → p{i+1}). */
function roomOf(totals: number[], mode: 'normal' | 'test' = 'normal'): GameRoom {
  const players = totals.map((_, i) => player(`p${i + 1}`, `P${i + 1}`));
  const map = Object.fromEntries(players.map((p, i) => [p.id, totals[i]!]));
  return finishedRoom(map, players, mode);
}

/** Read the persisted players map (new file format: { version, players }). */
function readStored(): Record<string, { games: number; wins: number; points: number; name: string; playerId: string }> {
  return JSON.parse(readFileSync(file, 'utf8')).players;
}

// ─── placementPointsFor (pure table) ─────────────────────────────────────────

describe('placementPointsFor', () => {
  it('3 players', () => expect([1, 2, 3].map(p => placementPointsFor(3, p))).toEqual([2, 1, -1]));
  it('4 players', () => expect([1, 2, 3, 4].map(p => placementPointsFor(4, p))).toEqual([2, 1, -1, -2]));
  it('5 players', () => expect([1, 2, 3, 4, 5].map(p => placementPointsFor(5, p))).toEqual([3, 2, 1, -1, -2]));
  it('6 players', () => expect([1, 2, 3, 4, 5, 6].map(p => placementPointsFor(6, p))).toEqual([3, 2, 1, -1, -2, -3]));
  it('7 players', () => expect([1, 2, 3, 4, 5, 6, 7].map(p => placementPointsFor(7, p))).toEqual([4, 3, 2, 1, -1, -2, -3]));
  it('8 players', () => expect([1, 2, 3, 4, 5, 6, 7, 8].map(p => placementPointsFor(8, p))).toEqual([4, 3, 2, 1, -1, -2, -3, -4]));

  it('returns 0 for out-of-range player counts or placements', () => {
    expect(placementPointsFor(2, 1)).toBe(0);
    expect(placementPointsFor(9, 1)).toBe(0);
    expect(placementPointsFor(3, 4)).toBe(0);
    expect(placementPointsFor(3, 0)).toBe(0);
  });
});

// ─── computeWinnerIds ────────────────────────────────────────────────────────

describe('computeWinnerIds', () => {
  it('returns the single highest-total player', () => {
    expect(computeWinnerIds(roomOf([30, 20, 10]))).toEqual(['p1']);
  });

  it('returns all players tied for the highest total', () => {
    expect(computeWinnerIds(roomOf([30, 30, 10])).sort()).toEqual(['p1', 'p2']);
  });

  it('excludes bots from winner consideration', () => {
    const room = finishedRoom({ a: 10, bot: 99 }, [player('a', 'A'), player('bot', 'Bot', { isBot: true })]);
    expect(computeWinnerIds(room)).toEqual(['a']);
  });
});

// ─── recordGameResult — placement points per player count ─────────────────────

describe('recordGameResult — placement points per player count', () => {
  it('3 players (no ties)', () => {
    recordGameResult(roomOf([30, 20, 10]));
    const s = readStored();
    expect(s.p1).toMatchObject({ games: 1, wins: 1, points: 2 });
    expect(s.p2).toMatchObject({ games: 1, wins: 0, points: 1 });
    expect(s.p3).toMatchObject({ games: 1, wins: 0, points: -1 });
  });

  it('4 players (no ties)', () => {
    recordGameResult(roomOf([40, 30, 20, 10]));
    const s = readStored();
    expect([s.p1.points, s.p2.points, s.p3.points, s.p4.points]).toEqual([2, 1, -1, -2]);
    expect(s.p1.wins).toBe(1);
    expect(s.p4.wins).toBe(0);
  });

  it('5 players (no ties)', () => {
    recordGameResult(roomOf([50, 40, 30, 20, 10]));
    const s = readStored();
    expect([s.p1, s.p2, s.p3, s.p4, s.p5].map(r => r.points)).toEqual([3, 2, 1, -1, -2]);
  });

  it('6 players (no ties)', () => {
    recordGameResult(roomOf([60, 50, 40, 30, 20, 10]));
    const s = readStored();
    expect([s.p1, s.p2, s.p3, s.p4, s.p5, s.p6].map(r => r.points)).toEqual([3, 2, 1, -1, -2, -3]);
  });

  it('7 players (no ties)', () => {
    recordGameResult(roomOf([70, 60, 50, 40, 30, 20, 10]));
    const s = readStored();
    expect([s.p1, s.p2, s.p3, s.p4, s.p5, s.p6, s.p7].map(r => r.points)).toEqual([4, 3, 2, 1, -1, -2, -3]);
  });

  it('8 players (no ties)', () => {
    recordGameResult(roomOf([80, 70, 60, 50, 40, 30, 20, 10]));
    const s = readStored();
    expect([s.p1, s.p2, s.p3, s.p4, s.p5, s.p6, s.p7, s.p8].map(r => r.points))
      .toEqual([4, 3, 2, 1, -1, -2, -3, -4]);
    expect(s.p1.wins).toBe(1);
    expect(s.p8.wins).toBe(0);
  });
});

// ─── recordGameResult — ties ─────────────────────────────────────────────────

describe('recordGameResult — ties', () => {
  it('tied for first: both get 1st points and a win', () => {
    recordGameResult(roomOf([30, 30, 10])); // p1 & p2 tie 1st; p3 is 3rd (two above)
    const s = readStored();
    expect(s.p1).toMatchObject({ points: 2, wins: 1 });
    expect(s.p2).toMatchObject({ points: 2, wins: 1 });
    expect(s.p3).toMatchObject({ points: -1, wins: 0 });
  });

  it('tie in the middle (4p): shared placement, following placement skipped', () => {
    recordGameResult(roomOf([40, 20, 20, 10])); // p1 1st, p2&p3 2nd, p4 4th
    const s = readStored();
    expect(s.p1.points).toBe(2);
    expect(s.p2.points).toBe(1); // 2nd
    expect(s.p3.points).toBe(1); // 2nd
    expect(s.p4.points).toBe(-2); // 4th (three above)
  });

  it('matches the spec example (4p: 100, 80, 80, 50 → +2, +1, +1, -2)', () => {
    recordGameResult(roomOf([100, 80, 80, 50]));
    const s = readStored();
    expect([s.p1.points, s.p2.points, s.p3.points, s.p4.points]).toEqual([2, 1, 1, -2]);
    expect(s.p1.wins).toBe(1);
    expect(s.p2.wins).toBe(0);
  });

  it('all tied (3p): everyone is 1st and gets a win', () => {
    recordGameResult(roomOf([10, 10, 10]));
    const s = readStored();
    for (const id of ['p1', 'p2', 'p3']) expect(s[id]).toMatchObject({ points: 2, wins: 1 });
  });

  it('tie for last (3p): both share 2nd, last-place penalty not applied', () => {
    recordGameResult(roomOf([30, 10, 10])); // p1 1st; p2 & p3 tie 2nd
    const s = readStored();
    expect(s.p1.points).toBe(2);
    expect(s.p2.points).toBe(1); // 2nd, NOT -1
    expect(s.p3.points).toBe(1);
    expect(s.p2.wins).toBe(0);
  });
});

// ─── recordGameResult — last-place penalties ─────────────────────────────────

describe('recordGameResult — last-place penalty', () => {
  it('applies the negative penalty only to the strictly last player', () => {
    recordGameResult(roomOf([50, 40, 30, 20, 10])); // 5p
    const s = readStored();
    expect(s.p5.points).toBe(-2); // 5th
    expect(s.p4.points).toBe(-1); // 4th
  });

  it('accumulates negative points across games', () => {
    recordGameResult(roomOf([30, 20, 10])); // p3 last → -1
    recordGameResult(roomOf([30, 20, 10])); // p3 last → -1
    expect(readStored().p3.points).toBe(-2);
  });
});

// ─── getLeaderboard — sorting & display ──────────────────────────────────────

describe('getLeaderboard', () => {
  it('is empty when no games have been played', () => {
    expect(getLeaderboard()).toEqual([]);
  });

  it('sorts by accumulated placement points descending', () => {
    recordGameResult(roomOf([30, 20, 10])); // p1 +2, p2 +1, p3 -1
    recordGameResult(roomOf([30, 20, 10])); // p1 +2, p2 +1, p3 -1
    const lb = getLeaderboard();
    expect(lb.map(e => e.playerId)).toEqual(['p1', 'p2', 'p3']);
    expect(lb.find(e => e.playerId === 'p1')!.status).toBe('Злоєбучій Підорас');
    expect(lb.find(e => e.playerId === 'p2')!.status).toBe('Лох'); // 0 wins
    expect(lb.find(e => e.playerId === 'p3')!.status).toBe('Лох'); // 0 wins
    expect('points' in lb[0]!).toBe(false); // points never exposed
  });

  it('reports win rate for display without affecting order', () => {
    recordGameResult(roomOf([30, 20, 10]));        // p1 1st
    recordGameResult(roomOf([10, 30, 20]));        // p2 1st (p1 last)
    const lb = getLeaderboard();
    const p1 = lb.find(e => e.playerId === 'p1')!;
    expect(p1.games).toBe(2);
    expect(p1.wins).toBe(1);
    expect(p1.winRate).toBe(50);
  });

  it('updates the stored nickname to the latest name', () => {
    recordGameResult(finishedRoom({ a: 30, b: 20, c: 10 }, [player('a', 'Old'), player('b', 'B'), player('c', 'C')]));
    recordGameResult(finishedRoom({ a: 30, b: 20, c: 10 }, [player('a', 'New'), player('b', 'B'), player('c', 'C')]));
    expect(readStored().a.name).toBe('New');
  });
});

// ─── exclusions ──────────────────────────────────────────────────────────────

describe('exclusions', () => {
  it('never counts Test Lab (mode=test) games', () => {
    recordGameResult(roomOf([30, 20, 10], 'test'));
    expect(existsSync(file)).toBe(false);
    expect(getLeaderboard()).toEqual([]);
  });

  it('excludes bots from ranking, points, and the leaderboard', () => {
    const players = [player('a', 'A'), player('b', 'B'), player('c', 'C'), player('bot', 'Bot', { isBot: true })];
    // Bot has the highest raw score but must be ignored entirely.
    recordGameResult(finishedRoom({ a: 30, b: 20, c: 10, bot: 99 }, players));
    const s = readStored();
    expect(Object.keys(s).sort()).toEqual(['a', 'b', 'c']);
    // 3 real players → 3-player table: a 1st (+2), b 2nd (+1), c 3rd (-1).
    expect(s.a.points).toBe(2);
    expect(s.b.points).toBe(1);
    expect(s.c.points).toBe(-1);
    expect(getLeaderboard().some(e => e.playerId === 'bot')).toBe(false);
  });
});

// ─── reset & persistence ─────────────────────────────────────────────────────

describe('reset & persistence', () => {
  it('starts empty when no file exists', () => {
    expect(getLeaderboard()).toEqual([]);
  });

  it('wipes an old-format (unversioned) file on first read — no migration', () => {
    // Legacy bare-map format with old points — must be discarded, not migrated.
    writeFileSync(file, JSON.stringify({
      old1: { playerId: 'old1', name: 'Old1', games: 10, wins: 5, points: 35 },
      old2: { playerId: 'old2', name: 'Old2', games: 4, wins: 0, points: 4 },
    }), 'utf8');
    _setStatsFileForTest(file); // drop cache

    expect(getLeaderboard()).toEqual([]); // full reset — nobody carries over

    // File recreated in the new versioned, empty format.
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    expect(parsed.version).toBe(RATING_VERSION);
    expect(parsed.players).toEqual({});
  });

  it('wipes a file whose version is too old / unknown', () => {
    writeFileSync(file, JSON.stringify({
      version: 1, // predates the migratable version → full reset
      players: { x: { playerId: 'x', name: 'X', games: 1, wins: 1, points: 8 } },
    }), 'utf8');
    _setStatsFileForTest(file);
    expect(getLeaderboard()).toEqual([]);
  });

  it('migrates a version-2 file: resets points to 0, preserves games/wins', () => {
    writeFileSync(file, JSON.stringify({
      version: 2,
      players: {
        alice: { playerId: 'alice', name: 'Alice', games: 10, wins: 4, points: 37 },
        bob: { playerId: 'bob', name: 'Bob', games: 6, wins: 0, points: -5 },
      },
    }), 'utf8');
    _setStatsFileForTest(file); // drop cache → triggers load + migration

    const lb = getLeaderboard();
    // games/wins/win% preserved; ranking falls to wins→games→name with points all 0.
    expect(lb.map(e => e.playerId)).toEqual(['alice', 'bob']);
    const alice = lb.find(e => e.playerId === 'alice')!;
    expect(alice).toMatchObject({ games: 10, wins: 4, winRate: 40 });
    expect(alice.status).toBe('Злоєбучій Підорас'); // only winner
    expect(lb.find(e => e.playerId === 'bob')!.status).toBe('Лох'); // 0 wins

    // Upgraded on disk to the current version with points zeroed.
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    expect(parsed.version).toBe(RATING_VERSION);
    expect(parsed.players.alice).toMatchObject({ games: 10, wins: 4, points: 0 });
    expect(parsed.players.bob).toMatchObject({ games: 6, wins: 0, points: 0 });
  });

  it('accrues new points from 0 after a v2 migration', () => {
    writeFileSync(file, JSON.stringify({
      version: 2,
      players: { p1: { playerId: 'p1', name: 'P1', games: 5, wins: 2, points: 20 } },
    }), 'utf8');
    _setStatsFileForTest(file);
    getLeaderboard(); // migrate → p1 points 0, games 5, wins 2

    recordGameResult(roomOf([30, 20, 10])); // p1 finishes 1st → +2
    const s = readStored();
    expect(s.p1).toMatchObject({ games: 6, wins: 3, points: 2 }); // 0 + 2
  });

  it('loads and persists across a restart at the current version', () => {
    recordGameResult(roomOf([30, 20, 10]));
    _setStatsFileForTest(file); // simulate restart: drop cache, same file

    const lb = getLeaderboard();
    expect(lb.map(e => e.playerId)).toEqual(['p1', 'p2', 'p3']);

    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    expect(parsed.version).toBe(RATING_VERSION);
    expect(parsed.players.p1).toMatchObject({ playerId: 'p1', games: 1, wins: 1, points: 2 });
  });

  it('writes the versioned file format', () => {
    recordGameResult(roomOf([30, 20, 10]));
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    expect(parsed).toHaveProperty('version', RATING_VERSION);
    expect(parsed.players.p1).toMatchObject({ playerId: 'p1', points: 2 });
  });
});
