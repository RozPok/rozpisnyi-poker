import { useState } from 'react';
import type { BidResult, Card, GameRoom, JokerDeclaration, PlayResult, Suit } from '@rozpisnyi-poker/shared';
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

type JokerModalState =
  | { step: 'mode'; card: Card }
  | { step: 'suit'; card: Card; mode: 'highest-suit' | 'lowest-suit' };

function PlayingPhase({ room, myId, hand }: Props) {
  const ar = room.activeRound!;
  const isMyTurn = ar.currentTurnPlayerId === myId;
  const currentPlayer = room.players.find(p => p.id === ar.currentTurnPlayerId);
  const [jokerModal, setJokerModal] = useState<JokerModalState | null>(null);

  const legalCards = isMyTurn
    ? getLegalCards(hand, ar.leadSuit, ar.trumpSuit, ar.jokerDeclaration ?? undefined)
    : [];

  function isLegal(card: Card): boolean {
    return legalCards.some(c => c.suit === card.suit && c.rank === card.rank);
  }

  function emit(card: Card, declaration: JokerDeclaration | null) {
    socket.emit('card:play', card, declaration, (result: PlayResult) => {
      if (!result.ok) console.error('[card:play]', result.error);
    });
  }

  function handleCardClick(card: Card) {
    if (!isMyTurn || !isLegal(card)) return;
    // Joker leading a trick → show declaration modal
    if (card.isJoker && ar.currentTrick.length === 0) {
      setJokerModal({ step: 'mode', card });
      return;
    }
    emit(card, null);
  }

  const isRed = (card: Card) => card.suit === 'hearts' || card.suit === 'diamonds';

  return (
    <div className="game-table">
      <div className={`turn-banner${isMyTurn ? ' turn-banner--mine' : ''}`}>
        {isMyTurn ? 'Ваш хід!' : `Хід: ${currentPlayer?.name ?? '…'}`}
      </div>

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

      {ar.jokerDeclaration && (
        <div className="joker-declaration-banner">
          Жопа: {jokerDeclarationLabel(ar.jokerDeclaration)}
        </div>
      )}

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
                onClick={() => handleCardClick(card)}
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

      {/* Joker declaration modal */}
      {jokerModal && (
        <JokerModal
          state={jokerModal}
          onSelectMode={mode => {
            if (mode === 'lay-down') {
              emit(jokerModal.card, { mode: 'lay-down' });
              setJokerModal(null);
            } else {
              setJokerModal({ step: 'suit', card: jokerModal.card, mode });
            }
          }}
          onSelectSuit={suit => {
            if (jokerModal.step === 'suit') {
              emit(jokerModal.card, { mode: jokerModal.mode, suit });
            }
            setJokerModal(null);
          }}
          onBack={() => setJokerModal({ step: 'mode', card: jokerModal.card })}
          onClose={() => setJokerModal(null)}
        />
      )}
    </div>
  );
}

// ─── Joker declaration modal ──────────────────────────────────────────────────

const SUITS: { suit: Suit; label: string; red: boolean }[] = [
  { suit: 'spades',   label: '♠ Піки',   red: false },
  { suit: 'hearts',   label: '♥ Чирви',  red: true  },
  { suit: 'diamonds', label: '♦ Буби',   red: true  },
  { suit: 'clubs',    label: '♣ Хрести', red: false },
];

interface JokerModalProps {
  state: JokerModalState;
  onSelectMode: (mode: 'highest-suit' | 'lowest-suit' | 'lay-down') => void;
  onSelectSuit: (suit: Suit) => void;
  onBack: () => void;
  onClose: () => void;
}

function JokerModal({ state, onSelectMode, onSelectSuit, onBack, onClose }: JokerModalProps) {
  return (
    <div className="joker-modal-overlay" onClick={onClose}>
      <div className="joker-modal" onClick={e => e.stopPropagation()}>
        <p className="joker-modal-title">Жопа — оберіть режим</p>

        {state.step === 'mode' && (
          <div className="joker-modal-options">
            <button className="joker-mode-btn" onClick={() => onSelectMode('highest-suit')}>
              <span className="jmb-name">Стара масть</span>
              <span className="jmb-desc">Усі кладуть найстаршу картку масті</span>
            </button>
            <button className="joker-mode-btn" onClick={() => onSelectMode('lowest-suit')}>
              <span className="jmb-name">Молодша масть</span>
              <span className="jmb-desc">Усі кладуть наймолодшу картку масті</span>
            </button>
            <button className="joker-mode-btn" onClick={() => onSelectMode('lay-down')}>
              <span className="jmb-name">Підкладання</span>
              <span className="jmb-desc">Наступна не-Жопа визначає масть</span>
            </button>
          </div>
        )}

        {state.step === 'suit' && (
          <>
            <p className="joker-modal-sub">Оберіть масть</p>
            <div className="joker-suit-options">
              {SUITS.map(({ suit, label, red }) => (
                <button
                  key={suit}
                  className={`joker-suit-btn${red ? ' joker-suit-btn--red' : ''}`}
                  onClick={() => onSelectSuit(suit)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button className="joker-back-btn" onClick={onBack}>← Назад</button>
          </>
        )}

        <button className="joker-close-btn" onClick={onClose}>✕</button>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jokerDeclarationLabel(d: JokerDeclaration): string {
  const suitNames: Record<string, string> = {
    spades: 'піки', hearts: 'чирви', diamonds: 'буби', clubs: 'хрести',
  };
  const suit = d.suit ? ` — ${suitNames[d.suit] ?? d.suit}` : '';
  switch (d.mode) {
    case 'highest-suit': return `Стара масть${suit}`;
    case 'lowest-suit':  return `Молодша масть${suit}`;
    case 'lay-down':     return 'Підкладання';
  }
}
