import type { ActiveRound, PlayerScore, RoomPlayer } from '@rozpisnyi-poker/shared';

interface Props {
  player: RoomPlayer;
  score: PlayerScore | undefined;
  ar: ActiveRound;
  isCurrentTurn: boolean;
}

export default function OpponentSeat({ player, score, ar, isCurrentTurn }: Props) {
  const bid       = ar.bids[player.id];
  const tricks    = ar.tricksWon[player.id] ?? 0;
  const cardCount = ar.playerCardCounts[player.id] ?? 0;
  const total     = score?.total ?? 0;
  const hasBid    = player.id in ar.bids;
  const exact     = hasBid && tricks === bid;
  const isVacant  = player.isVacant === true;

  if (isVacant) {
    return (
      <div className="opp-seat opp-seat--vacant">
        <div className="opp-avatar opp-avatar--vacant">?</div>
        <span className="opp-name opp-name--vacant">Вільне місце</span>
        <span className="opp-total">{total}</span>
      </div>
    );
  }

  return (
    <div
      className={[
        'opp-seat',
        isCurrentTurn      ? 'opp-seat--active'       : '',
        !player.isConnected ? 'opp-seat--disconnected' : '',
      ].filter(Boolean).join(' ')}
    >

      {/* Avatar: initials */}
      <div className="opp-avatar">
        {player.name.slice(0, 2).toUpperCase()}
      </div>

      {/* Name (truncated) */}
      <span className="opp-name" title={player.name}>
        {player.name.slice(0, 8)}
        {!player.isConnected && <span className="opp-offline"> ✕</span>}
      </span>

      {/* Total score */}
      <span className="opp-total">{total}</span>

      {/* Tricks taken / bid */}
      <span className={`opp-bid-tricks${exact ? ' opp-bid-tricks--exact' : ''}`}>
        {hasBid ? `${tricks}/${bid}` : ar.phase === 'bidding' ? '…' : '—'}
      </span>

      {/* Cards remaining */}
      {cardCount > 0 && (
        <span className="opp-cards">{'▪'.repeat(Math.min(cardCount, 5))}</span>
      )}

    </div>
  );
}
