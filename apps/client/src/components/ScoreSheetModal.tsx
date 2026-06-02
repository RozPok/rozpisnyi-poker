import type { GameSheet, RoomPlayer } from '@rozpisnyi-poker/shared';
import { ROUND_TYPE_LABELS } from '@rozpisnyi-poker/shared';

interface Props {
  gameSheet: GameSheet;
  players: RoomPlayer[];
  myId: string;
  onClose: () => void;
}

export default function ScoreSheetModal({ gameSheet, players, myId, onClose }: Props) {
  const { rounds, scores } = gameSheet;

  return (
    <div className="score-sheet-overlay" onClick={onClose}>
      <div className="score-sheet-modal" onClick={e => e.stopPropagation()}>
        <div className="score-sheet-header">
          <h2 className="score-sheet-title">Лист рахунку</h2>
          <button className="btn btn-secondary score-sheet-close" onClick={onClose}>
            Закрити
          </button>
        </div>

        <div className="score-sheet-table-wrap">
          <table className="score-sheet-table">
            <thead>
              <tr>
                <th className="sst-label">Раунд</th>
                {players.map(p => (
                  <th key={p.id} className={`sst-player-col${p.id === myId ? ' sst-player-col--me' : ''}`}>
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rounds.map(r => {
                const isCurrent = r.index === gameSheet.currentRoundIndex;
                const isDone = r.index < gameSheet.currentRoundIndex;
                return (
                  <tr
                    key={r.index}
                    className={[
                      isDone    ? 'sst-row--done'    : '',
                      isCurrent ? 'sst-row--current' : '',
                      r.type !== 'normal' ? 'sst-row--special' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <td className="sst-label">
                      <span className="sst-round-badge">{r.label}</span>
                      {r.type !== 'normal' && (
                        <span className="sst-round-type">{ROUND_TYPE_LABELS[r.type]}</span>
                      )}
                    </td>

                    {players.map(p => {
                      const ps = scores.find(s => s.playerId === p.id);
                      const bid   = ps?.bids[r.index]   ?? null;
                      const score = ps?.scores[r.index] ?? null;
                      const isMe  = p.id === myId;

                      return (
                        <td
                          key={p.id}
                          className={[
                            'sst-cell',
                            isMe ? 'sst-cell--me' : '',
                            score !== null && score >= 0 ? 'sst-cell--pos' : '',
                            score !== null && score < 0  ? 'sst-cell--neg' : '',
                          ].filter(Boolean).join(' ')}
                        >
                          {score !== null ? (
                            <span className="sst-score-wrap">
                              {bid !== null && <span className="sst-bid">↑{bid}</span>}
                              <span className="sst-score">
                                {score > 0 ? `+${score}` : score}
                              </span>
                            </span>
                          ) : bid !== null ? (
                            <span className="sst-bid-only">↑{bid}</span>
                          ) : (
                            <span className="sst-empty">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>

            <tfoot>
              <tr className="sst-total-row">
                <td className="sst-label">Σ</td>
                {players.map(p => {
                  const ps    = scores.find(s => s.playerId === p.id);
                  const total = ps?.total ?? 0;
                  return (
                    <td
                      key={p.id}
                      className={`sst-total-cell${p.id === myId ? ' sst-cell--me' : ''}`}
                    >
                      {total}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
