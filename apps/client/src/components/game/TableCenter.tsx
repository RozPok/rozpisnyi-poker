import type { RoomPlayer, TrickPlay } from '@rozpisnyi-poker/shared';
import GraphicCard from './GraphicCard.tsx';

export interface BiddingEntry {
  playerId: string;
  name: string;
  bid: number | undefined;
  isCurrentBidder: boolean;
  isDark: boolean;
}

interface Props {
  plays: TrickPlay[] | null;
  /** non-null = showing completed trick, this player won it */
  winnerId: string | null;
  players: RoomPlayer[];
  /** Present during bidding phase — shows center bid board instead of empty dot */
  biddingEntries?: BiddingEntry[];
}

export default function TableCenter({ plays, winnerId, players, biddingEntries }: Props) {
  const winnerName = winnerId
    ? (players.find(p => p.id === winnerId)?.name ?? null)
    : null;

  const showBiddingBoard = biddingEntries && biddingEntries.length > 0 && plays === null;

  return (
    <div className="tc-root">

      {showBiddingBoard ? (
        <div className="bb-root">
          {biddingEntries!.map(entry => (
            <div
              key={entry.playerId}
              className={[
                'bb-row',
                entry.isCurrentBidder ? 'bb-row--active' : '',
                entry.bid !== undefined ? 'bb-row--done' : '',
              ].filter(Boolean).join(' ')}
            >
              <span className="bb-name">{entry.name}</span>
              <span className={`bb-bid${entry.bid === undefined ? ' bb-bid--pending' : ''}`}>
                {entry.bid !== undefined
                  ? `${entry.bid}${entry.isDark ? 'Т' : ''}`
                  : '—'}
              </span>
            </div>
          ))}
        </div>
      ) : plays === null || plays.length === 0 ? (
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
