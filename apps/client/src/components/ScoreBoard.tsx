import type { GameSheet, RoomPlayer } from '@rozpisnyi-poker/shared';
import { ROUND_TYPE_LABELS } from '@rozpisnyi-poker/shared';

interface Props {
  gameSheet: GameSheet;
  players: RoomPlayer[];
  myId: string;
  /** When true renders a compact single-line-per-player view. */
  compact?: boolean;
}

export default function ScoreBoard({ gameSheet, players, myId, compact = false }: Props) {
  if (compact) return <CompactScoreBoard gameSheet={gameSheet} players={players} myId={myId} />;
  return <FullScoreBoard gameSheet={gameSheet} players={players} myId={myId} />;
}

// ─── Compact (used during active play) ───────────────────────────────────────

function CompactScoreBoard({ gameSheet, players, myId }: Omit<Props, 'compact'>) {
  const sorted = [...players].sort((a, b) => {
    const sa = gameSheet.scores.find(s => s.playerId === a.id)?.total ?? 0;
    const sb = gameSheet.scores.find(s => s.playerId === b.id)?.total ?? 0;
    return sb - sa;
  });

  return (
    <div className="scoreboard-compact">
      {sorted.map(p => {
        const ps = gameSheet.scores.find(s => s.playerId === p.id);
        const total = ps?.total ?? 0;
        // Score for the most-recently completed round
        const lastIdx = gameSheet.currentRoundIndex - 1;
        const lastScore = lastIdx >= 0 ? (ps?.scores[lastIdx] ?? null) : null;
        return (
          <div
            key={p.id}
            className={`scoreboard-compact-row${p.id === myId ? ' scoreboard-compact-row--me' : ''}`}
          >
            <span className="sbc-name">{p.name}</span>
            {lastScore !== null && (
              <span className={`sbc-delta${lastScore >= 0 ? ' sbc-delta--pos' : ' sbc-delta--neg'}`}>
                {lastScore > 0 ? `+${lastScore}` : lastScore}
              </span>
            )}
            <span className="sbc-total">{total}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Full (used on finished screen) ──────────────────────────────────────────

function FullScoreBoard({ gameSheet, players, myId }: Omit<Props, 'compact'>) {
  const { rounds, scores } = gameSheet;
  const completedRounds = rounds.filter((_, i) => i < gameSheet.currentRoundIndex);

  // Sort players by total descending
  const sorted = [...players].sort((a, b) => {
    const sa = scores.find(s => s.playerId === a.id)?.total ?? 0;
    const sb = scores.find(s => s.playerId === b.id)?.total ?? 0;
    return sb - sa;
  });

  return (
    <div className="scoreboard-full">
      <div className="scoreboard-table-wrap">
        <table className="scoreboard-table">
          <thead>
            <tr>
              <th className="sbt-player">Гравець</th>
              {completedRounds.map(r => (
                <th key={r.index} className="sbt-round" title={ROUND_TYPE_LABELS[r.type] || 'normal'}>
                  {r.label}
                </th>
              ))}
              <th className="sbt-total">Σ</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => {
              const ps = scores.find(s => s.playerId === p.id);
              return (
                <tr key={p.id} className={p.id === myId ? 'sbt-row--me' : ''}>
                  <td className="sbt-player">{p.name}</td>
                  {completedRounds.map(r => {
                    const val = ps?.scores[r.index] ?? null;
                    return (
                      <td
                        key={r.index}
                        className={`sbt-cell${val === null ? '' : val >= 0 ? ' sbt-cell--pos' : ' sbt-cell--neg'}`}
                      >
                        {val === null ? '—' : val > 0 ? `+${val}` : val}
                      </td>
                    );
                  })}
                  <td className="sbt-total">{ps?.total ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
