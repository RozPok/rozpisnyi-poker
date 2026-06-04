import { useState } from 'react';
import type { ActiveRound, BidResult, GameRoom, GameRound } from '@rozpisnyi-poker/shared';
import { getLegalBids } from '@rozpisnyi-poker/shared';
import { socket } from '../../socket.ts';
import { impactLight, selectionChanged } from '../../telegramHaptics.ts';

interface Props {
  room: GameRoom;
  myId: string;
  roundDef: GameRound;
  ar: ActiveRound;
  /** Lifted to parent so HandArea can compute card visibility */
  darkChoice: 'dark' | 'not-dark' | null;
  onSetDarkChoice: (v: 'dark' | 'not-dark' | null) => void;
}

export default function BidPanel({
  room,
  myId,
  roundDef,
  ar,
  darkChoice,
  onSetDarkChoice,
}: Props) {
  const [selected,   setSelected]   = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');

  const isMyTurn     = ar.currentTurnPlayerId === myId;
  const isDarkRound  = roundDef.type === 'dark';
  const isNormalRound = roundDef.type === 'normal';

  const currentTotal       = Object.values(ar.bids).reduce((s, b) => s + b, 0);
  const bidsSubmittedCount = Object.keys(ar.bids).length;
  const isLastBidder       = isMyTurn && bidsSubmittedCount === room.players.length - 1;

  const playerScore = room.gameSheet?.scores.find(s => s.playerId === myId);
  const bidHistory  = playerScore ? playerScore.bids.slice(0, ar.roundIndex) : [];

  const legalBids = isMyTurn
    ? getLegalBids(ar.cardsPerPlayer, currentTotal, isLastBidder, bidHistory)
    : [];

  const showBidInput = isMyTurn && (isDarkRound || (isNormalRound && darkChoice !== null));
  const currentPlayer = room.players.find(p => p.id === ar.currentTurnPlayerId);

  function handleBid() {
    if (!isMyTurn || submitting || selected === null) return;
    impactLight();
    setSubmitting(true);
    setError('');
    const isDark = isDarkRound || darkChoice === 'dark';
    socket.emit('bid:submit', selected, isDark, (result: BidResult) => {
      setSubmitting(false);
      if (!result.ok) {
        setError(result.error);
      } else {
        setSelected(null);
        onSetDarkChoice(null);
      }
    });
  }

  return (
    <div className="bp-root">

      {/* Turn indicator */}
      <div className={`bp-turn${isMyTurn ? ' bp-turn--mine' : ''}`}>
        {isDarkRound && <span className="bp-dark-badge">Темна</span>}
        <span>
          {isMyTurn ? 'Ваша ставка!' : `Ставить: ${currentPlayer?.name ?? '…'}`}
        </span>
      </div>

      {/* Bids summary row */}
      <div className="bp-bids-row">
        {room.players.map(p => {
          const hasBid   = p.id in ar.bids;
          const isCurr   = p.id === ar.currentTurnPlayerId;
          return (
            <span
              key={p.id}
              className={[
                'bp-bid-chip',
                hasBid          ? 'bp-bid-chip--done'   : '',
                isCurr && !hasBid ? 'bp-bid-chip--active' : '',
                p.id === myId   ? 'bp-bid-chip--me'     : '',
              ].filter(Boolean).join(' ')}
            >
              <span className="bp-chip-name">{p.name.slice(0, 4)}</span>
              <span className="bp-chip-val">
                {hasBid ? ar.bids[p.id] : isCurr ? '…' : '—'}
              </span>
            </span>
          );
        })}
      </div>

      {/* Dark / not-dark choice (normal rounds only) */}
      {isNormalRound && isMyTurn && darkChoice === null && (
        <div className="bp-dark-choice">
          <button
            className="bp-choice-btn bp-choice-btn--dark"
            onClick={() => onSetDarkChoice('dark')}
          >
            Темна
          </button>
          <button
            className="bp-choice-btn"
            onClick={() => onSetDarkChoice('not-dark')}
          >
            Відкрита
          </button>
        </div>
      )}

      {/* Bid number picker */}
      {showBidInput && (
        <div className="bp-bid-area">
          <div className="bp-bid-options">
            {legalBids.map(v => (
              <button
                key={v}
                className={`bp-bid-btn${selected === v ? ' bp-bid-btn--selected' : ''}`}
                onClick={() => { selectionChanged(); setSelected(v); }}
              >
                {v}
              </button>
            ))}
            {legalBids.length === 0 && (
              <span className="bp-no-options">Немає допустимих ставок</span>
            )}
          </div>
          {error && <p className="bp-error">{error}</p>}
          <button
            className="bp-submit"
            onClick={handleBid}
            disabled={submitting || selected === null}
          >
            {submitting ? '…' : 'Підтвердити'}
          </button>
        </div>
      )}

    </div>
  );
}
