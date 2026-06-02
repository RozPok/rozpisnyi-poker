import { useState } from 'react';
import type { BidResult, Card, GameRoom, PlayResult } from '@rozpisnyi-poker/shared';
import { getLegalBids, getLegalCards } from '@rozpisnyi-poker/shared';
import { socket } from '../socket.ts';

interface Props {
  room: GameRoom;
  myId: string;
  hand: Card[];
}

export default function GameTable({ room, myId, hand }: Props) {
  const ar = room.activeRound!;

  return ar.phase === 'bidding'
    ? <BiddingPhase room={room} myId={myId} hand={hand} />
    : <PlayingPhase room={room} myId={myId} hand={hand} />;
}

// ─── Bidding phase ────────────────────────────────────────────────────────────

function BiddingPhase({ room, myId, hand }: Props) {
  const ar = room.activeRound!;
  const isMyTurn = ar.currentTurnPlayerId === myId;
  const [selected, setSelected] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Compute legal bids for the local player (used only when it's their turn)
  const playerScore = room.gameSheet?.scores.find(s => s.playerId === myId);
  const bidHistory: (number | null)[] = playerScore
    ? playerScore.bids.slice(0, ar.roundIndex)
    : [];
  const currentTotal = Object.values(ar.bids).reduce((s, b) => s + b, 0);
  const bidsSubmittedCount = Object.keys(ar.bids).length;
  const isLastBidder = isMyTurn && bidsSubmittedCount === room.players.length - 1;
  const legalBids = isMyTurn
    ? getLegalBids(ar.cardsPerPlayer, currentTotal, isLastBidder, bidHistory)
    : [];

  function handleBid() {
    if (!isMyTurn || submitting || selected === null) return;
    setSubmitting(true);
    setError('');
    socket.emit('bid:submit', selected, (result: BidResult) => {
      setSubmitting(false);
      if (!result.ok) {
        setError(result.error);
      } else {
        setSelected(null);
      }
    });
  }

  const currentPlayer = room.players.find(p => p.id === ar.currentTurnPlayerId);
  const isRed = (card: Card) => card.suit === 'hearts' || card.suit === 'diamonds';

  return (
    <div className="game-table">
      <div className="bidding-header">
        <span className="bidding-round-info">
          Раунд {ar.roundIndex + 1} · {ar.cardsPerPlayer} карт
        </span>
        <div className={`turn-banner${isMyTurn ? ' turn-banner--mine' : ''}`}>
          {isMyTurn ? 'Ваша ставка!' : `Ставить: ${currentPlayer?.name ?? '…'}`}
        </div>
      </div>

      {/* Per-player bid status */}
      <div className="bids-list">
        {room.players.map(p => {
          const hasBid = p.id in ar.bids;
          const isCurrent = p.id === ar.currentTurnPlayerId;
          return (
            <div
              key={p.id}
              className={[
                'bid-row',
                hasBid ? 'bid-row--done' : '',
                isCurrent && !hasBid ? 'bid-row--active' : '',
                p.id === myId ? 'bid-row--me' : '',
              ].filter(Boolean).join(' ')}
            >
              <span className="bid-row-name">{p.name}{p.id === myId ? ' (ви)' : ''}</span>
              <span className="bid-row-value">
                {hasBid ? ar.bids[p.id] : isCurrent ? '…' : '—'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Bid picker — only for the current bidder */}
      {isMyTurn && (
        <div className="bid-input-area">
          <p className="bid-prompt">
            Скільки взяток візьмете?
            {legalBids.length < ar.cardsPerPlayer + 1 && (
              <span className="bid-prompt-hint"> (деякі значення заборонені)</span>
            )}
          </p>
          <div className="bid-options">
            {legalBids.map(v => (
              <button
                key={v}
                className={`bid-option${selected === v ? ' bid-option--selected' : ''}`}
                onClick={() => setSelected(v)}
              >
                {v}
              </button>
            ))}
            {legalBids.length === 0 && (
              <p className="bid-no-options">Немає допустимих ставок</p>
            )}
          </div>
          {error && <p className="error">{error}</p>}
          <button
            className="btn btn-primary bid-submit"
            onClick={handleBid}
            disabled={submitting || selected === null}
          >
            {submitting ? 'Відправляємо…' : 'Підтвердити ставку'}
          </button>
        </div>
      )}

      {/* Read-only hand preview */}
      <div className="hand-area hand-area--preview">
        <p className="hand-label">Ваші карти ({hand.length})</p>
        <div className="hand-cards">
          {hand.map((card, idx) => (
            <span
              key={`${card.suit}:${card.rank}:${idx}`}
              className={[
                'hand-card',
                'hand-card--dim',
                card.isJoker ? 'hand-card--joker' : '',
                isRed(card) ? 'hand-card--red' : '',
              ].filter(Boolean).join(' ')}
            >
              {card.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Playing phase ────────────────────────────────────────────────────────────

function PlayingPhase({ room, myId, hand }: Props) {
  const ar = room.activeRound!;
  const isMyTurn = ar.currentTurnPlayerId === myId;
  const currentPlayer = room.players.find(p => p.id === ar.currentTurnPlayerId);

  const legalCards = isMyTurn
    ? getLegalCards(hand, ar.leadSuit, ar.trumpSuit)
    : [];

  function isLegal(card: Card): boolean {
    return legalCards.some(c => c.suit === card.suit && c.rank === card.rank);
  }

  function handlePlayCard(card: Card) {
    if (!isMyTurn || !isLegal(card)) return;
    socket.emit('card:play', card, (result: PlayResult) => {
      if (!result.ok) console.error('[card:play]', result.error);
    });
  }

  const isRed = (card: Card) => card.suit === 'hearts' || card.suit === 'diamonds';

  return (
    <div className="game-table">
      {/* Turn banner */}
      <div className={`turn-banner${isMyTurn ? ' turn-banner--mine' : ''}`}>
        {isMyTurn ? 'Ваш хід!' : `Хід: ${currentPlayer?.name ?? '…'}`}
      </div>

      {/* Bids summary + tricks won */}
      <div className="tricks-tally">
        {room.players.map(p => (
          <span
            key={p.id}
            className={`tricks-tally-item${p.id === myId ? ' tricks-tally-item--me' : ''}`}
            title={`Ставка: ${ar.bids[p.id] ?? '?'}`}
          >
            {p.name}: {ar.tricksWon[p.id] ?? 0}
            <span className="tally-bid">/{ar.bids[p.id] ?? '?'}</span>
          </span>
        ))}
      </div>

      {/* Current trick */}
      <div className="trick-area">
        {ar.currentTrick.length === 0 ? (
          <p className="trick-empty">Стіл порожній</p>
        ) : (
          ar.currentTrick.map(play => (
            <div
              key={play.playerId}
              className={[
                'table-card',
                play.card.isJoker ? 'table-card--joker' : '',
                isRed(play.card) ? 'table-card--red' : '',
              ].filter(Boolean).join(' ')}
            >
              <span className="table-card-label">{play.card.label}</span>
              <span className="table-card-player">{play.playerName}</span>
            </div>
          ))
        )}
      </div>

      {ar.isComplete && (
        <div className="round-complete-banner">Раунд завершено!</div>
      )}

      {/* Player's hand */}
      <div className="hand-area">
        <p className="hand-label">Ваші карти ({hand.length})</p>
        <div className="hand-cards">
          {hand.map((card, idx) => {
            const legal = isLegal(card);
            const playable = isMyTurn && legal && !ar.isComplete;
            return (
              <button
                key={`${card.suit}:${card.rank}:${idx}`}
                className={[
                  'hand-card',
                  !isMyTurn ? 'hand-card--dim' : !legal ? 'hand-card--illegal' : '',
                  card.isJoker ? 'hand-card--joker' : '',
                  isRed(card) ? 'hand-card--red' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => handlePlayCard(card)}
                disabled={!playable}
                title={
                  !isMyTurn
                    ? 'Зачекайте свого ходу'
                    : !legal
                      ? 'Порушення правила ходу'
                      : card.label
                }
              >
                {card.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
