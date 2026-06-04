import { useState, useEffect, useRef } from 'react';
import type {
  Card,
  GameRoom,
  JokerDeclaration,
  LastTrick,
  PlayResult,
  Suit,
} from '@rozpisnyi-poker/shared';
import { canRevealHand, getLegalCards, sortHand } from '@rozpisnyi-poker/shared';
import { socket } from '../../socket.ts';
import {
  getHapticsEnabled,
  setHapticsEnabled,
  impactLight,
  impactMedium,
  impactHeavy,
} from '../../telegramHaptics.ts';
import TopBar       from './TopBar.tsx';
import OpponentSeat from './OpponentSeat.tsx';
import TableCenter  from './TableCenter.tsx';
import HandArea     from './HandArea.tsx';
import BidPanel     from './BidPanel.tsx';
import ScoreSheetModal from '../ScoreSheetModal.tsx';

// ─── Types ───────────────────────────────────────────────────────────────────

type JokerModalState =
  | { step: 'mode';        card: Card }
  | { step: 'suit';        card: Card; mode: 'highest-suit' | 'lowest-suit' }
  | { step: 'non-leading'; card: Card };

interface Props {
  room: GameRoom;
  myId: string;
  hand: Card[];
  onCardPlayed?: (card: Card) => void;
  onLeave: () => void;
  isLeaving: boolean;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GameScreen({
  room,
  myId,
  hand,
  onCardPlayed,
  onLeave,
  isLeaving,
}: Props) {
  // UI state
  const [menuOpen,       setMenuOpen]       = useState(false);
  const [showScoreSheet, setShowScoreSheet] = useState(false);
  const [showLastTrick,  setShowLastTrick]  = useState(false);
  const [hapticsOn,      setHapticsOn]      = useState(getHapticsEnabled);

  // Bidding: dark-choice lifted here so HandArea can compute visibility
  const [darkChoice, setDarkChoice] = useState<'dark' | 'not-dark' | null>(null);

  // Playing: Joker modal
  const [jokerModal, setJokerModal] = useState<JokerModalState | null>(null);

  const ar = room.activeRound!;
  const gs = room.gameSheet!;

  // ── Trick snapshot (no-flash, covers last trick of round) ─────────────────
  //
  // Problem A: React effects fire *after* render → using useState+useEffect for
  // snapshot gives a one-frame flash of empty table.
  // Fix: read ar.lastTrick directly during render via a ref.
  //
  // Problem B: finishRound replaces activeRound immediately → the last trick of
  // every round becomes invisible because ar.lastTrick is null in the new round.
  // Fix: the server now broadcasts completed-round state before finishRound
  // (so ar.lastTrick IS visible). The ref caches it so we still show it even
  // after the new round arrives.

  // Always cache the most-recently-seen non-null lastTrick.
  const lastSeenTrickRef = useRef<LastTrick | null>(null);
  if (ar.lastTrick !== null) {
    lastSeenTrickRef.current = ar.lastTrick;
  }

  // "Effective" last trick: the current one if available, else the cached one.
  const effectiveLastTrick = ar.lastTrick ?? lastSeenTrickRef.current;
  const effectiveTrickIndex = effectiveLastTrick?.trickIndex ?? -1;

  // Track which trick-index has had its 3-second display window expire.
  // Initialised to -1 so every new trick is shown immediately on first render.
  const [hiddenTrickIndex, setHiddenTrickIndex] = useState(-1);

  useEffect(() => {
    if (effectiveTrickIndex < 0) { setHiddenTrickIndex(-1); return; }
    const t = setTimeout(() => setHiddenTrickIndex(effectiveTrickIndex), 3000);
    return () => clearTimeout(t);
  }, [effectiveTrickIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Haptic: trick won
  const lastHapticTrickRef = useRef(effectiveTrickIndex);
  useEffect(() => {
    if (effectiveTrickIndex > lastHapticTrickRef.current) {
      impactMedium();
    }
    lastHapticTrickRef.current = effectiveTrickIndex;
  }, [effectiveTrickIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Haptic: round finished
  const prevIsCompleteRef = useRef(ar.isComplete);
  useEffect(() => {
    if (ar.isComplete && !prevIsCompleteRef.current) {
      impactHeavy();
    }
    prevIsCompleteRef.current = ar.isComplete;
  }, [ar.isComplete]); // eslint-disable-line react-hooks/exhaustive-deps

  // Computed synchronously (no second render needed) — no flash.
  const showSnapshot =
    effectiveTrickIndex >= 0 &&
    hiddenTrickIndex !== effectiveTrickIndex &&
    ar.currentTrick.length === 0;

  const trickDisplayPlays = ar.currentTrick.length > 0
    ? ar.currentTrick
    : showSnapshot ? effectiveLastTrick!.plays : null;
  const snapshotWinnerId = showSnapshot ? effectiveLastTrick!.winnerId : null;

  // ── Derived state ─────────────────────────────────────────────────────────

  const isMyTurn    = ar.currentTurnPlayerId === myId;
  const sortedHand  = sortHand(hand, ar.trumpSuit);
  const roundDef    = gs.rounds[ar.roundIndex];
  const currentPlayer = room.players.find(p => p.id === ar.currentTurnPlayerId);

  // Hand visibility (bidding phase)
  const showHand = ar.phase === 'playing'
    ? true
    : canRevealHand(roundDef?.type ?? 'normal', myId, ar.bids, isMyTurn, darkChoice);

  // Legal cards (playing phase only)
  const legalCards = isMyTurn && ar.phase === 'playing'
    ? getLegalCards(hand, ar.leadSuit, ar.trumpSuit, ar.jokerDeclaration ?? undefined)
    : [];

  function isLegal(card: Card) {
    return legalCards.some(c => c.suit === card.suit && c.rank === card.rank);
  }

  // Split opponents left / right
  const opponents  = room.players.filter(p => p.id !== myId);
  const leftCount  = Math.ceil(opponents.length / 2);
  const leftOpps   = opponents.slice(0, leftCount);
  const rightOpps  = opponents.slice(leftCount);

  // ── Card-play helpers ─────────────────────────────────────────────────────

  function emitCard(card: Card, declaration: JokerDeclaration | null) {
    socket.emit('card:play', card, declaration, (result: PlayResult) => {
      if (!result.ok) { console.error('[card:play]', result.error); }
      else { impactMedium(); onCardPlayed?.(card); }
    });
  }

  function handleCardClick(card: Card) {
    if (!isMyTurn || ar.phase !== 'playing') return;
    if (showSnapshot) return; // wait for trick reveal to finish
    if (!isLegal(card)) return;
    impactLight();
    if (card.isJoker) {
      setJokerModal(
        ar.currentTrick.length === 0
          ? { step: 'mode', card }
          : { step: 'non-leading', card },
      );
      return;
    }
    emitCard(card, null);
  }

  // ── My score / info ───────────────────────────────────────────────────────

  const myScore  = gs.scores.find(s => s.playerId === myId);
  const myTotal  = myScore?.total ?? 0;
  const myTricks = ar.tricksWon[myId] ?? 0;
  const myBid    = ar.bids[myId];
  const myName   = room.players.find(p => p.id === myId)?.name ?? 'Ви';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="gs-root">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <TopBar room={room} myId={myId} onMenuOpen={() => setMenuOpen(true)} />

      {/* ── Menu drawer ─────────────────────────────────────────────────── */}
      {menuOpen && (
        <div className="gs-menu-overlay" onClick={() => setMenuOpen(false)}>
          <div className="gs-menu-panel" onClick={e => e.stopPropagation()}>
            <button
              className="gs-menu-item"
              onClick={() => { setMenuOpen(false); setShowScoreSheet(true); }}
            >
              Лист рахунку
            </button>
            <button
              className="gs-menu-item"
              onClick={() => {
                const next = !hapticsOn;
                setHapticsOn(next);
                setHapticsEnabled(next);
              }}
            >
              Вібрація: {hapticsOn ? 'Увімк.' : 'Вимк.'}
            </button>
            <button
              className="gs-menu-item gs-menu-item--danger"
              disabled={isLeaving}
              onClick={() => { setMenuOpen(false); onLeave(); }}
            >
              {isLeaving ? 'Виходимо…' : 'Вийти з гри'}
            </button>
          </div>
        </div>
      )}

      {/* ── Play area ────────────────────────────────────────────────────── */}
      <div className="gs-play-area">

        {/* Table zone: left opponents | trick center | right opponents */}
        <div className="gs-table-zone">

          <div className="gs-col gs-col--left">
            {leftOpps.map(p => (
              <OpponentSeat
                key={p.id}
                player={p}
                score={gs.scores.find(s => s.playerId === p.id)}
                ar={ar}
                isCurrentTurn={ar.currentTurnPlayerId === p.id}
              />
            ))}
          </div>

          <TableCenter
            plays={trickDisplayPlays}
            winnerId={snapshotWinnerId}
            players={room.players}
          />

          <div className="gs-col gs-col--right">
            {rightOpps.map(p => (
              <OpponentSeat
                key={p.id}
                player={p}
                score={gs.scores.find(s => s.playerId === p.id)}
                ar={ar}
                isCurrentTurn={ar.currentTurnPlayerId === p.id}
              />
            ))}
          </div>

        </div>

        {/* Bottom zone: my info + controls + hand */}
        <div className="gs-bottom">

          {/* My info bar */}
          <div className="gs-me-bar">
            <span className="gs-me-name">{myName}</span>
            <span className="gs-me-total">{myTotal}</span>
            {ar.phase === 'playing' && myBid !== undefined && (
              <span className={`gs-me-tricks${myTricks === myBid ? ' gs-me-tricks--exact' : ''}`}>
                {myTricks}/{myBid}
              </span>
            )}
            {ar.jokerDeclaration && (
              <span className="gs-joker-badge">
                Жопа: {jokerDeclarationLabel(ar.jokerDeclaration)}
              </span>
            )}
          </div>

          {/* Turn bar — playing phase */}
          {ar.phase === 'playing' && (
            <div className={`gs-turn-bar${isMyTurn ? ' gs-turn-bar--mine' : ''}`}>
              <span>{isMyTurn ? 'Ваш хід!' : `Хід: ${currentPlayer?.name ?? '…'}`}</span>
              <button
                className="gs-prev-trick-btn"
                onClick={() => setShowLastTrick(true)}
                disabled={!ar.lastTrick}
              >
                Взятка ↩
              </button>
            </div>
          )}

          {/* Bidding panel */}
          {ar.phase === 'bidding' && roundDef && (
            <BidPanel
              room={room}
              myId={myId}
              roundDef={roundDef}
              ar={ar}
              darkChoice={darkChoice}
              onSetDarkChoice={setDarkChoice}
            />
          )}

          {/* Hand */}
          <HandArea
            cards={sortedHand}
            phase={ar.phase}
            showCards={showHand}
            isMyTurn={isMyTurn}
            isLegal={isLegal}
            isComplete={ar.isComplete}
            trickResolving={showSnapshot}
            onCardClick={handleCardClick}
          />

        </div>
      </div>

      {/* ── Joker modal ──────────────────────────────────────────────────── */}
      {jokerModal && (
        <JokerModal
          state={jokerModal}
          onSelectMode={mode => {
            if (mode === 'lay-down') {
              emitCard(jokerModal.card, { mode: 'lay-down' });
              setJokerModal(null);
            } else {
              setJokerModal({ step: 'suit', card: jokerModal.card, mode });
            }
          }}
          onSelectSuit={suit => {
            if (jokerModal.step === 'suit') {
              emitCard(jokerModal.card, { mode: jokerModal.mode, suit });
            }
            setJokerModal(null);
          }}
          onNonLeading={mode => {
            emitCard(jokerModal.card, { mode });
            setJokerModal(null);
          }}
          onBack={() => setJokerModal({ step: 'mode', card: jokerModal.card })}
          onClose={() => setJokerModal(null)}
        />
      )}

      {/* ── Previous trick modal ─────────────────────────────────────────── */}
      {showLastTrick && ar.lastTrick && (
        <LastTrickModal
          trick={ar.lastTrick}
          players={room.players}
          onClose={() => setShowLastTrick(false)}
        />
      )}

      {/* ── Score sheet modal ────────────────────────────────────────────── */}
      {showScoreSheet && (
        <ScoreSheetModal
          gameSheet={gs}
          players={room.players}
          myId={myId}
          onClose={() => setShowScoreSheet(false)}
        />
      )}

    </div>
  );
}

// ─── Joker modal (verbatim logic from GameTable.tsx) ─────────────────────────

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

function JokerModal({
  state, onSelectMode, onSelectSuit, onNonLeading, onBack, onClose,
}: JokerModalProps) {
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

// ─── Last trick modal (verbatim logic from GameTable.tsx) ─────────────────────

interface LastTrickModalProps {
  trick: LastTrick;
  players: GameRoom['players'];
  onClose: () => void;
}

function LastTrickModal({ trick, players, onClose }: LastTrickModalProps) {
  const winnerName = players.find(p => p.id === trick.winnerId)?.name ?? trick.winnerId;
  return (
    <div className="last-trick-overlay" onClick={onClose}>
      <div className="last-trick-modal" onClick={e => e.stopPropagation()}>
        <div className="last-trick-header">
          <p className="last-trick-title">Взятка #{trick.trickIndex + 1}</p>
          <button className="joker-close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="last-trick-cards">
          {trick.plays.map(play => {
            const isRed = play.card.suit === 'hearts' || play.card.suit === 'diamonds';
            return (
              <div
                key={play.playerId}
                className={[
                  'table-card',
                  play.card.isJoker            ? 'table-card--joker'  : '',
                  isRed                        ? 'table-card--red'    : '',
                  play.playerId === trick.winnerId ? 'table-card--winner' : '',
                ].filter(Boolean).join(' ')}
              >
                <span className="table-card-label">{play.card.label}</span>
                <span className="table-card-player">{play.playerName}</span>
              </div>
            );
          })}
        </div>
        <p className="last-trick-winner">Взяв: <strong>{winnerName}</strong></p>
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
