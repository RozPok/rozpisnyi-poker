import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { buildLeaderboard } from '@rozpisnyi-poker/shared';
import type { GameRoom, LeaderboardEntry, PlayerStatRecord } from '@rozpisnyi-poker/shared';

// ─── Persistence location & schema version ───────────────────────────────────────

const DEFAULT_STATS_FILE = resolve(process.cwd(), 'data', 'player-stats.json');
let statsFile = process.env.PLAYER_STATS_FILE ?? DEFAULT_STATS_FILE;

/**
 * Rating schema version. Bumped whenever the rating rules change in a way that
 * invalidates stored points.
 *
 * On load:
 *   - version === RATING_VERSION        → loaded as-is.
 *   - version === POINTS_RESET_VERSION  → migrated: games/wins preserved, points
 *     reset to 0. The placement table changed and, with no stored game history,
 *     historical points cannot be recalculated, so they are zeroed rather than
 *     fabricated. Win % (derived from games/wins) is unaffected.
 *   - anything older / unversioned      → full reset.
 */
export const RATING_VERSION = 3;

/** Previous version whose points are reset (games/wins preserved) on load. */
const POINTS_RESET_VERSION = 2;

interface StatsFile {
  version: number;
  players: Record<string, PlayerStatRecord>;
}

// In-memory cache, loaded lazily on first access. `null` = not yet loaded.
let records: Map<string, PlayerStatRecord> | null = null;

// ─── Placement points ─────────────────────────────────────────────────────────────

/**
 * Hidden rating points awarded by finishing placement (1-based), keyed by the
 * number of real players in the game. Index 0 = 1st place … last = last place.
 */
export const PLACEMENT_POINTS: Record<number, readonly number[]> = {
  3: [2, 1, -1],
  4: [2, 1, -1, -2],
  5: [3, 2, 1, -1, -2],
  6: [3, 2, 1, -1, -2, -3],
  7: [4, 3, 2, 1, -1, -2, -3],
  8: [4, 3, 2, 1, -1, -2, -3, -4],
};

/** Points for `placement` (1-based) at a table of `playerCount`; 0 if out of range. */
export function placementPointsFor(playerCount: number, placement: number): number {
  return PLACEMENT_POINTS[playerCount]?.[placement - 1] ?? 0;
}

// ─── Load / persist ─────────────────────────────────────────────────────────────

function load(): Map<string, PlayerStatRecord> {
  if (records) return records;

  const map = new Map<string, PlayerStatRecord>();
  let needsPersist = false; // rewrite the file after a reset or points migration
  try {
    if (existsSync(statsFile)) {
      const parsed = JSON.parse(readFileSync(statsFile, 'utf8')) as Partial<StatsFile>;
      const version = parsed?.version;
      if (parsed && parsed.players && (version === RATING_VERSION || version === POINTS_RESET_VERSION)) {
        // v2 → v3: placement table changed and points can't be recalculated from
        // aggregate stats, so keep games/wins but reset points to 0.
        const resetPoints = version === POINTS_RESET_VERSION;
        for (const rec of Object.values(parsed.players)) {
          if (rec && typeof rec.playerId === 'string') {
            map.set(rec.playerId, {
              playerId: rec.playerId,
              name: rec.name ?? rec.playerId,
              games: rec.games ?? 0,
              wins: rec.wins ?? 0,
              points: resetPoints ? 0 : (rec.points ?? 0),
            });
          }
        }
        if (resetPoints) needsPersist = true; // persist the upgraded (v3) file
      } else {
        // Older / unknown / unversioned format → complete reset (no migration).
        needsPersist = true;
      }
    }
  } catch {
    // Corrupt or unreadable file → start empty so games keep working.
    needsPersist = true;
  }

  records = map;
  // Rewrite the file in the current format after a reset or a points migration.
  if (needsPersist) persist(map);
  return map;
}

/**
 * Persist the in-memory cache to disk.
 *
 * Synchronous write-to-temp + atomic rename. Because the write is synchronous it
 * blocks the (single-threaded) event loop, so two games finishing close together
 * cannot interleave partial writes and corrupt the file.
 */
function persist(map: Map<string, PlayerStatRecord>): void {
  const players: Record<string, PlayerStatRecord> = {};
  for (const rec of map.values()) players[rec.playerId] = rec;
  const payload: StatsFile = { version: RATING_VERSION, players };

  try {
    mkdirSync(dirname(statsFile), { recursive: true });
    const tmp = `${statsFile}.tmp`;
    writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
    renameSync(tmp, statsFile);
  } catch (err) {
    console.error('[stats] failed to persist player stats:', err);
  }
}

/**
 * Eagerly load stats at startup. If the on-disk file predates the current rating
 * version it is wiped and recreated empty here, so the first boot after a deploy
 * resets the leaderboard for everyone.
 */
export function init(): void {
  load();
}

// ─── Winner computation ─────────────────────────────────────────────────────────

/**
 * Returns the ids of the winning player(s) — those with the maximum total.
 * When several players tie for the highest total, all of them are winners.
 */
export function computeWinnerIds(room: GameRoom): string[] {
  const gs = room.gameSheet;
  if (!gs) return [];
  const real = room.players.filter(p => !p.isBot);
  if (real.length === 0) return [];

  const totals = real.map(p => ({
    id: p.id,
    total: gs.scores.find(s => s.playerId === p.id)?.total ?? 0,
  }));
  const max = Math.max(...totals.map(t => t.total));
  return totals.filter(t => t.total === max).map(t => t.id);
}

// ─── Public API ──────────────────────────────────────────────────────────────────

/**
 * Record the result of a completed game using placement-based points.
 *
 * No-op for Test Lab (mode !== 'normal') games. Bots are never counted. Every
 * real player gets games+1 and their placement points (see PLACEMENT_POINTS);
 * players finishing 1st (all tied leaders) also get wins+1. Placement uses
 * standard competition ranking: placement = 1 + (players scoring strictly higher),
 * so tied players share a placement and its points. Nicknames are refreshed.
 */
export function recordGameResult(room: GameRoom): void {
  if (room.mode !== 'normal') return;
  const gs = room.gameSheet;
  if (!gs) return;

  const real = room.players.filter(p => !p.isBot);
  if (real.length === 0) return;

  const totals = real.map(p => ({
    id: p.id,
    name: p.name,
    total: gs.scores.find(s => s.playerId === p.id)?.total ?? 0,
  }));

  const map = load();

  for (const t of totals) {
    const placement = 1 + totals.filter(o => o.total > t.total).length;
    const pts = placementPointsFor(real.length, placement);

    const existing = map.get(t.id);
    const rec: PlayerStatRecord = existing ?? { playerId: t.id, name: t.name, games: 0, wins: 0, points: 0 };
    rec.name = t.name; // refresh to latest nickname
    rec.games += 1;
    if (placement === 1) rec.wins += 1;
    rec.points += pts;
    map.set(t.id, rec);
  }

  persist(map);
}

/** Returns the sorted, status-annotated leaderboard. */
export function getLeaderboard(): LeaderboardEntry[] {
  return buildLeaderboard([...load().values()]);
}

// ─── Test helpers ────────────────────────────────────────────────────────────────

/** Point the module at a specific file and drop the cache. Test-only. */
export function _setStatsFileForTest(file: string): void {
  statsFile = file;
  records = null;
}

/** Reset to the default file and drop the cache. Test-only. */
export function _resetStatsForTest(): void {
  statsFile = process.env.PLAYER_STATS_FILE ?? DEFAULT_STATS_FILE;
  records = null;
}
