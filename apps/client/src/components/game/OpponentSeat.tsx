import type { ActiveRound, PlayerScore, RoomPlayer, RoundType } from '@rozpisnyi-poker/shared';

interface Props {
  player: RoomPlayer;
  score: PlayerScore | undefined;
  ar: ActiveRound;
  isCurrentTurn: boolean;
  /** Brief winner-glow pulse after collecting a trick */
  isWinner?: boolean;
  roundType?: RoundType;
}

export default function OpponentSeat({ player, score, ar, isCurrentTurn, isWinner = false, roundType }: Props) {
  const bid       = ar.bids[player.id];
  const tricks    = ar.tricksWon[player.id] ?? 0;
  const cardCount = ar.playerCardCounts[player.id] ?? 0;
  const total     = score?.total ?? 0;
  const hasBid    = player.id in ar.bids;
  const exact     = hasBid && tricks === bid;
  const isDark    = ar.playerDarkFlags[player.id] ?? false;
  const isMisere  = roundType === 'misere';
  const isSpecial = roundType === 'misere' || roundType === 'golden';
  const misereWarn = isMisere && tricks > 0;
  const isVacant  = player.isVacant === true;

  let trickLabel: string;
  if (hasBid) {
    trickLabel = `${tricks}/${bid}${isDark ? 'Т' : ''}`;
  } else if (ar.phase === 'playing' && isSpecial) {
    trickLabel = String(tricks);
  } else if (ar.phase === 'bidding') {
    trickLabel = '…';
  } else {
    trickLabel = '—';
  }

  const trickClass = [
    'opp-bid-tricks',
    exact       ? 'opp-bid-tricks--exact' : '',
    misereWarn  ? 'opp-bid-tricks--warn'  : '',
  ].filter(Boolean).join(' ');

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
        isCurrentTurn       ? 'opp-seat--active'       : '',
        !player.isConnected ? 'opp-seat--disconnected' : '',
        isWinner            ? 'opp-seat--winner'        : '',
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
      <span className={trickClass}>{trickLabel}</span>

      {/* Cards remaining */}
      {cardCount > 0 && (
        <span className="opp-cards">{'▪'.repeat(Math.min(cardCount, 5))}</span>
      )}

    </div>
  );
}
