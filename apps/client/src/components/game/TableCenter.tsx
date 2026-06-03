import type { RoomPlayer, TrickPlay } from '@rozpisnyi-poker/shared';
import GraphicCard from './GraphicCard.tsx';

interface Props {
  plays: TrickPlay[] | null;
  /** non-null = showing completed trick, this player won it */
  winnerId: string | null;
  players: RoomPlayer[];
}

export default function TableCenter({ plays, winnerId, players }: Props) {
  const winnerName = winnerId
    ? (players.find(p => p.id === winnerId)?.name ?? null)
    : null;

  return (
    <div className="tc-root">

      {/* Cards in play */}
      {plays === null || plays.length === 0 ? (
        <div className="tc-empty">
          <span className="tc-empty-dot">●</span>
        </div>
      ) : (
        <div className="tc-cards">
          {plays.map(play => (
            <div
              key={play.playerId}
              className={`tc-play${winnerId && play.playerId === winnerId ? ' tc-play--winner' : ''}`}
            >
              <GraphicCard card={play.card} size="md" />
              <span className="tc-player-label">{play.playerName}</span>
            </div>
          ))}
        </div>
      )}

      {/* Winner banner (shown while snapshot is displayed) */}
      {winnerName && (
        <div className="tc-winner-banner">
          Взятку забирає: <strong>{winnerName}</strong>
        </div>
      )}

    </div>
  );
}
