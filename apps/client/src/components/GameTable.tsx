import { useState, useEffect, useRef } from 'react';
import type { BidResult, Card, GameRoom, JokerDeclaration, LastTrick, PlayResult, Suit } from '@rozpisnyi-poker/shared';
import { canRevealHand, getLegalBids, getLegalCards, sortHand, TRUMP_SUIT_LABELS } from '@rozpisnyi-poker/shared';
import { socket } from '../socket.ts';

interface Props {
  room: GameRoom;
  myId: string;
  hand: Card[];
  onCardPlayed?: (card: Card) => void;
}

export default function GameTable({ room, myId, hand, onCardPlayed }: Props) {
  const ar = room.activeRound!;

  return ar.phase === 'bidding'
    ? <BiddingPhase room={room} myId={myId} hand={hand} />
    : <PlayingPhase room={room} myId={myId} hand={hand} onCardPlayed={onCardPlayed} />;
}

// ─── Bidding phase ────────────────────────────────────────────────────────────

function BiddingPhase({ room, myId, hand }: Props) {
  const ar = room.activeRound!;
  const roundDef = room.gameSheet?.rounds[ar.roundIndex];
  const isDarkRound  = roundDef?.type === 'dark';
  const isNormalRound = roundDef?.type === 'normal';

  const isMyTurn = ar.currentTurnPlayerId === myId;
  const [selected, setSelected] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Per-turn dark choice (null = not yet chosen, only relevant for normal rounds)
  const [darkChoice, setDarkChoice] = useState<'dark' | 'not-dark' | null>(null);

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

  // canRevealHand covers all cases: dark round, waiting-for-turn peeking, per-player choice
  const showHand    = canRevealHand(roundDef?.type ?? 'normal', myId, ar.bids, isMyTurn, darkChoice);
  // Bid input shown when it is my turn AND (dark round always, or normal after choice made)
  const showBidInput = isMyTurn && (isDarkRound || (isNormalRound && darkChoice !== null));

  function handleBid() {
    if (!isMyTurn || submitting || selected === null) return;
    setSubmitting(true);
    setError('');
    const isDark = isDarkRound || darkChoice === 'dark';
    socket.emit('bid:submit', selected, isDark, (result: BidResult) => {
      setSubmitting(false);
      if (!result.ok) {
        setError(result.error);
      } else {
        setSelected(null);
        setDarkChoice(null);
      }
    });
  }

  const currentPlayer = room.players.find(p => p.id === ar.currentTurnPlayerId);
  const isRed = (card: Card) => card.suit === 'hearts' || card.suit === 'diamonds';

  return (
    <div className="game-table">
      <div className="bidding-header">
        <RoundInfoPanel room={room} />
        {isDarkRound && (
          <div className="dark-round-banner">
            Темна гра — замовлення без перегляду карт
          </div>
        )}
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

      {/* Dark / not-dark choice — normal rounds only, before bid */}
      {isNormalRound && isMyTurn && darkChoice === null && (
        <div className="dark-choice-area">
          <p className="dark-choice-prompt">Оберіть тип замовлення:</p>
          <div className="dark-choice-buttons">
            <button className="btn-dark-choice btn-dark-choice--dark" onClick={() => setDarkChoice('dark')}>
              Темна
            </button>
            <button className="btn-dark-choice" onClick={() => setDarkChoice('not-dark')}>
              Не темна
            </button>
          </div>
        </div>
      )}

      {showBidInput && (
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
        {showHand ? (
          <>
            <p className="hand-label">Ваші карти ({hand.length})</p>
            <div className="hand-cards">
              {sortHand(hand, ar.trumpSuit).map((card, idx) => (
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
          </>
        ) : (
          <p className="hand-hidden-notice">Карти приховані до замовлення</p>
        )}
      </div>
    </div>
  );
}

// ─── Playing phase ────────────────────────────────────────────────────────────

const TRICK_DISPLAY_MS = 2500;

type JokerModalState =
  | { step: 'mode'; card: Card }                                          // leading — choose mode
  | { step: 'suit'; card: Card; mode: 'highest-suit' | 'lowest-suit' }   // leading — choose suit
  | { step: 'non-leading'; card: Card };                                  // non-leading — take / lay-down

function PlayingPhase({ room, myId, hand, onCardPlayed }: Props) {
  const ar = room.activeRound!;
  const isMyTurn = ar.currentTurnPlayerId === myId;
  const currentPlayer = room.players.find(p => p.id === ar.currentTurnPlayerId);
  const [jokerModal, setJokerModal] = useState<JokerModalState | null>(null);
  const [showLastTrick, setShowLastTrick] = useState(false);
  const sortedHand = sortHand(hand, ar.trumpSuit);

  // ── Completed-trick snapshot (shown for TRICK_DISPLAY_MS after each trick) ──
  const [completedTrickSnapshot, setCompletedTrickSnapshot] = useState<LastTrick | null>(null);
  // Ref so the effect always reads the latest lastTrick without it being in deps.
  const lastTrickRef = useRef<LastTrick | null>(null);
  lastTrickRef.current = ar.lastTrick;
  const lastTrickIndex = ar.lastTrick?.trickIndex ?? -1;

  useEffect(() => {
    if (lastTrickIndex < 0) {
      // New round started — clear any lingering snapshot immediately.
      setCompletedTrickSnapshot(null);
      return;
    }
    setCompletedTrickSnapshot(lastTrickRef.current);
    const t = setTimeout(() => setCompletedTrickSnapshot(null), TRICK_DISPLAY_MS);
    return () => clearTimeout(t);
  }, [lastTrickIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // What to show on the table:
  //   • current trick in progress → ar.currentTrick
  //   • trick just completed, within TRICK_DISPLAY_MS → snapshot
  //   • otherwise → empty ("Стіл порожній")
  const showSnapshot = completedTrickSnapshot !== null && ar.currentTrick.length === 0;
  const trickDisplayPlays = ar.currentTrick.length > 0
    ? ar.currentTrick
    : showSnapshot
      ? completedTrickSnapshot!.plays
      : null;
  const snapshotWinnerName = showSnapshot && completedTrickSnapshot
    ? (room.players.find(p => p.id === completedTrickSnapshot.winnerId)?.name ?? null)
    : null;

  const legalCards = isMyTurn
    ? getLegalCards(hand, ar.leadSuit, ar.trumpSuit, ar.jokerDeclaration ?? undefined)
    : [];

  function isLegal(card: Card): boolean {
    return legalCards.some(c => c.suit === card.suit && c.rank === card.rank);
  }

  function emit(card: Card, declaration: JokerDeclaration | null) {
    socket.emit('card:play', card, declaration, (result: PlayResult) => {
      if (!result.ok) {
        console.error('[card:play]', result.error);
      } else {
        onCardPlayed?.(card);
      }
    });
  }

  function handleCardClick(card: Card) {
    if (!isMyTurn || !isLegal(card)) return;
    if (card.isJoker) {
      // Leading Joker → choose mode (highest-suit / lowest-suit / lay-down)
      if (ar.currentTrick.length === 0) {
        setJokerModal({ step: 'mode', card });
      } else {
        // Non-leading Joker → choose take or lay-down
        setJokerModal({ step: 'non-leading', card });
      }
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

      <RoundInfoPanel room={room} />

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
        {trickDisplayPlays === null ? (
          <p className="trick-empty">Стіл порожній</p>
        ) : (
          trickDisplayPlays.map(play => (
            <div
              key={play.playerId}
              className={[
                'table-card',
                play.card.isJoker ? 'table-card--joker' : '',
                isRed(play.card) ? 'table-card--red' : '',
                showSnapshot && play.playerId === completedTrickSnapshot?.winnerId
                  ? 'table-card--winner'
                  : '',
              ].filter(Boolean).join(' ')}
            >
              <span className="table-card-label">{play.card.label}</span>
              <span className="table-card-player">{play.playerName}</span>
            </div>
          ))
        )}
      </div>

      {snapshotWinnerName && (
        <div className="trick-winner-banner">
          Взятку забирає: <strong>{snapshotWinnerName}</strong>
        </div>
      )}

      <div className="prev-trick-row">
        <button
          className="btn-prev-trick"
          onClick={() => setShowLastTrick(true)}
          disabled={!ar.lastTrick}
          title={ar.lastTrick ? 'Показати попередню взятку' : 'Попередньої взятки немає'}
        >
          Попередня взятка
        </button>
      </div>

      <div className="hand-area">
        <p className="hand-label">Ваші карти ({hand.length})</p>
        <div className="hand-cards">
          {sortedHand.map((card, idx) => {
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
          onNonLeading={mode => {
            emit(jokerModal.card, { mode });
            setJokerModal(null);
          }}
          onBack={() => setJokerModal({ step: 'mode', card: jokerModal.card })}
          onClose={() => setJokerModal(null)}
        />
      )}

      {/* Previous trick modal */}
      {showLastTrick && ar.lastTrick && (
        <LastTrickModal
          trick={ar.lastTrick}
          players={room.players}
          onClose={() => setShowLastTrick(false)}
        />
      )}
    </div>
  );
}

// ─── Previous trick modal ─────────────────────────────────────────────────────

interface LastTrickModalProps {
  trick: LastTrick;
  players: GameRoom['players'];
  onClose: () => void;
}

function LastTrickModal({ trick, players, onClose }: LastTrickModalProps) {
  const winnerName = players.find(p => p.id === trick.winnerId)?.name ?? trick.winnerId;
  const isRed = (card: Card) => card.suit === 'hearts' || card.suit === 'diamonds';

  return (
    <div className="last-trick-overlay" onClick={onClose}>
      <div className="last-trick-modal" onClick={e => e.stopPropagation()}>
        <div className="last-trick-header">
          <p className="last-trick-title">Взятка #{trick.trickIndex + 1}</p>
          <button className="joker-close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="last-trick-cards">
          {trick.plays.map(play => (
            <div
              key={play.playerId}
              className={[
                'table-card',
                play.card.isJoker ? 'table-card--joker' : '',
                isRed(play.card) ? 'table-card--red' : '',
                play.playerId === trick.winnerId ? 'table-card--winner' : '',
              ].filter(Boolean).join(' ')}
            >
              <span className="table-card-label">{play.card.label}</span>
              <span className="table-card-player">{play.playerName}</span>
            </div>
          ))}
        </div>
        <p className="last-trick-winner">Взяв: <strong>{winnerName}</strong></p>
      </div>
    </div>
  );
}

// ─── Round info panel ─────────────────────────────────────────────────────────

function RoundInfoPanel({ room }: { room: GameRoom }) {
  const ar = room.activeRound!;
  const gs = room.gameSheet!;
  const totalRounds = gs.rounds.length;
  const trumpSuit = ar.trumpSuit;
  const trumpCard = ar.trumpCard;
  const redSuit = trumpSuit === 'hearts' || trumpSuit === 'diamonds';
  const trumpCardRed = trumpCard
    ? (trumpCard.suit === 'hearts' || trumpCard.suit === 'diamonds')
    : false;

  const trumpLabel = trumpSuit ? TRUMP_SUIT_LABELS[trumpSuit] : 'Без козиря';
  const trumpMod   = !trumpSuit ? 'rip-trump--none' : redSuit ? 'rip-trump--red' : '';

  return (
    <div className="round-info-panel">
      <div className="rip-item">
        <span className="rip-label">Раунд</span>
        <span className="rip-value">{ar.roundIndex + 1}/{totalRounds}</span>
      </div>
      <div className="rip-divider" />
      <div className="rip-item">
        <span className="rip-label">Карт у раунді</span>
        <span className="rip-value">{ar.cardsPerPlayer}</span>
      </div>
      <div className="rip-divider" />
      <div className="rip-item">
        <span className="rip-label">Козир</span>
        <span className={`rip-value rip-trump ${trumpMod}`}>{trumpLabel}</span>
      </div>
      {trumpCard && (
        <>
          <div className="rip-divider" />
          <div className="rip-item">
            <span className="rip-label">Козирна карта</span>
            <span className={`rip-value${trumpCardRed ? ' rip-trump--red' : ''}`}>
              {trumpCard.label}
            </span>
          </div>
        </>
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
  onNonLeading: (mode: 'take' | 'lay-down') => void;
  onBack: () => void;
  onClose: () => void;
}

function JokerModal({ state, onSelectMode, onSelectSuit, onNonLeading, onBack, onClose }: JokerModalProps) {
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

        {state.step === 'non-leading' && (
          <div className="joker-modal-options">
            <button className="joker-mode-btn" onClick={() => onNonLeading('take')}>
              <span className="jmb-name">Забираю</span>
              <span className="jmb-desc">Жопа виграє хід</span>
            </button>
            <button className="joker-mode-btn" onClick={() => onNonLeading('lay-down')}>
              <span className="jmb-name">Підкладаюсь</span>
              <span className="jmb-desc">Жопа ігнорується, перемагає краща карта</span>
            </button>
          </div>
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
    case 'take':         return 'Забираю';
  }
}
