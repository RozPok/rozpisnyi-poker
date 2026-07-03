import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { buildLeaderboard } from '@rozpisnyi-poker/shared';
import type { GameRoom, LeaderboardEntry, PlayerStatRecord } from '@rozpisnyi-poker/shared';

// ─── Persistence location ──────────────────────────────────────────────────────

const DEFAULT_STATS_FILE = resolve(process.cwd(), 'data', 'player-stats.json');
let statsFile = process.env.PLAYER_STATS_FILE ?? DEFAULT_STATS_FILE;

// In-memory cache, loaded lazily on first access. `null` = not yet loaded.
let records: Map<string, PlayerStatRecord> | null = null;

// ─── Load / persist ─────────────────────────────────────────────────────────────

function load(): Map<string, PlayerStatRecord> {
  if (records) return records;

  const map = new Map<string, PlayerStatRecord>();
  let migrated = false;
  try {
    if (existsSync(statsFile)) {
      const raw = readFileSync(statsFile, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, Partial<PlayerStatRecord>>;
      for (const rec of Object.values(parsed)) {
        if (rec && typeof rec.playerId === 'string') {
          const games = rec.games ?? 0;
          const wins = rec.wins ?? 0;
          // Legacy files predate `points` — recompute (games + wins*5) and flag for re-persist.
          const hasPoints = typeof rec.points === 'number';
          if (!hasPoints) migrated = true;
          map.set(rec.playerId, {
            playerId: rec.playerId,
            name: rec.name ?? rec.playerId,
            games,
            wins,
            points: hasPoints ? rec.points! : games + wins * 5,
          });
        }
      }
    }
  } catch {
    // Corrupt or unreadable file → start empty so games keep working.
  }

  records = map;
  // Persist migrated points once so legacy files are upgraded on disk (safe atomic write).
  if (migrated) persist(map);
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
  const obj: Record<string, PlayerStatRecord> = {};
  for (const rec of map.values()) obj[rec.playerId] = rec;

  try {
    mkdirSync(dirname(statsFile), { recursive: true });
    const tmp = `${statsFile}.tmp`;
    writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
    renameSync(tmp, statsFile);
  } catch (err) {
    console.error('[stats] failed to persist player stats:', err);
  }
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
 * Record the result of a completed game.
 *
 * No-op for Test Lab (mode !== 'normal') games. Bots are never counted. Every
 * real player gets games+1 and points+1; each winner (all tied winners) also
 * gets wins+1 and points+5 (net +6). The stored nickname is refreshed to the
 * player's current name.
 */
export function recordGameResult(room: GameRoom): void {
  if (room.mode !== 'normal') return;
  if (!room.gameSheet) return;

  const real = room.players.filter(p => !p.isBot);
  if (real.length === 0) return;

  const map = load();
  const winnerIds = new Set(computeWinnerIds(room));

  for (const p of real) {
    const existing = map.get(p.id);
    const rec: PlayerStatRecord = existing ?? { playerId: p.id, name: p.name, games: 0, wins: 0, points: 0 };
    rec.name = p.name; // refresh to latest nickname
    rec.games += 1;
    rec.points += 1;   // participation
    if (winnerIds.has(p.id)) {
      rec.wins += 1;
      rec.points += 5; // winning bonus (net +6 for winners)
    }
    map.set(p.id, rec);
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
