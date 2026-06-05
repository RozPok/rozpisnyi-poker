import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import type {
  ActiveRound,
  Card,
  GameRoom,
  GameSheet,
  JokerDeclaration,
  LastTrick,
  PlayResult,
  Suit,
  TrickPlay,
} from '@rozpisnyi-poker/shared';
import { canRevealHand, getLegalCards, sortHand } from '@rozpisnyi-poker/shared';
import { socket } from '../../socket.ts';
import {
  getHapticsEnabled,
  setHapticsEnabled,
  impactLight,
  impactMedium,
  impactHeavy,
  notificationSuccess,
  selectionChanged,
} from '../../telegramHaptics.ts';
import DealAnimation from './DealAnimation.tsx';
import DebugModal   from './DebugModal.tsx';
import GraphicCard  from './GraphicCard.tsx';
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

interface FlyingCard  { card: Card; from: DOMRect; to: DOMRect; }
interface CollectState { plays: TrickPlay[]; direction: 'left' | 'right' | 'bottom'; from: DOMRect; }

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
  const ar = room.activeRound!;
  const gs = room.gameSheet!;

  // UI state
  const [menuOpen,        setMenuOpen]        = useState(false);
  const [showScoreSheet,  setShowScoreSheet]  = useState(false);
  const [showLastTrick,   setShowLastTrick]   = useState(false);
  const [hapticsOn,       setHapticsOn]       = useState(getHapticsEnabled);
  const [isDealing,       setIsDealing]       = useState(false);
  const [showDebug,       setShowDebug]       = useState(false);
  const [testDealActive,  setTestDealActive]  = useState(false);

  // Animation state
  const [flyingCard,      setFlyingCard]      = useState<FlyingCard | null>(null);
  const [hiddenCard,      setHiddenCard]      = useState<Card | null>(null);
  const [collectState,    setCollectState]    = useState<CollectState | null>(null);
  const [winnerGlowId,    setWinnerGlowId]    = useState<string | null>(null);
  const [isHandRevealing, setIsHandRevealing] = useState(false);
  const [showRoundResult, setShowRoundResult] = useState(false);

  // Bidding: dark-choice lifted here so HandArea can compute visibility
  const [darkChoice, setDarkChoice] = useState<'dark' | 'not-dark' | null>(null);

  // Playing: Joker modal
  const [jokerModal, setJokerModal] = useState<JokerModalState | null>(null);

  // Ref to gs-table-zone — used to compute fly-card target and collect source
  const tableCenterRef = useRef<HTMLDivElement>(null);

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

  // Trick snapshot timer + collect animation trigger
  useEffect(() => {
    if (effectiveTrickIndex < 0) { setHiddenTrickIndex(-1); return; }

    // Start collect animation 600 ms before snapshot clears
    const collectT = setTimeout(() => {
      if (!effectiveLastTrick) return;
      const from = tableCenterRef.current?.getBoundingClientRect() ?? new DOMRect();
      const direction = getWinnerDirection(effectiveLastTrick.winnerId, myId, leftOpps, rightOpps);
      setCollectState({ plays: effectiveLastTrick.plays, direction, from });
      impactMedium();
      setWinnerGlowId(effectiveLastTrick.winnerId);
    }, 2400);

    const hideT = setTimeout(() => setHiddenTrickIndex(effectiveTrickIndex), 3000);
    return () => { clearTimeout(collectT); clearTimeout(hideT); };
  }, [effectiveTrickIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear winner glow after pulse
  useEffect(() => {
    if (!winnerGlowId) return;
    const t = setTimeout(() => setWinnerGlowId(null), 800);
    return () => clearTimeout(t);
  }, [winnerGlowId]);

  // Round result + haptic: round finished.
  // Delay the overlay so the last trick snapshot is visible for ~3 seconds first.
  const prevIsCompleteRef = useRef(ar.isComplete);
  useEffect(() => {
    const wasComplete = prevIsCompleteRef.current;
    prevIsCompleteRef.current = ar.isComplete;
    if (!ar.isComplete || wasComplete) return;
    impactHeavy();
    notificationSuccess();
    const t = setTimeout(() => setShowRoundResult(true), 3100);
    return () => clearTimeout(t);
  }, [ar.isComplete]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deal animation — fires on every new round (roundIndex change) and on mount.
  // useLayoutEffect sets isDealing=true synchronously before first paint → no flash.
  const lastAnimatedRoundIndexRef = useRef(-1);
  useLayoutEffect(() => {
    if (lastAnimatedRoundIndexRef.current === ar.roundIndex) return;
    lastAnimatedRoundIndexRef.current = ar.roundIndex;
    if (ar.phase !== 'bidding') return; // skip reconnect to mid-round (playing phase)
    setIsDealing(true);
    // Clear animation state from previous round
    setShowRoundResult(false);
    setCollectState(null);
    setFlyingCard(null);
    setHiddenCard(null);
  }, [ar.roundIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Haptics + 1200 ms timer; keyed on both roundIndex and isDealing so the cleanup
  // cancels the previous round's timer when a new round starts.
  useEffect(() => {
    if (!isDealing) return;
    impactLight();
    const t = setTimeout(() => {
      setIsDealing(false);
      selectionChanged();
    }, 1200);
    return () => clearTimeout(t);
  }, [ar.roundIndex, isDealing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hand reveal — fires when deal animation ends, slides cards in one-by-one.
  const wasDealing = useRef(false);
  useEffect(() => {
    if (isDealing) { wasDealing.current = true; return; }
    if (!wasDealing.current) return;
    wasDealing.current = false;
    if (ar.phase !== 'bidding') return;
    setIsHandRevealing(true);
    const t = setTimeout(() => setIsHandRevealing(false), 700);
    return () => clearTimeout(t);
  }, [isDealing]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Center bidding board — shown in table center during bidding phase
  const biddingEntries = ar.phase === 'bidding'
    ? room.players.map(p => ({
        playerId: p.id,
        name: p.name,
        bid: ar.bids[p.id] as number | undefined,
        isCurrentBidder: ar.currentTurnPlayerId === p.id,
      }))
    : undefined;

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

  // Split opponents left / right.
  // Rotate so that the player immediately after me (clockwise) is first, giving
  // a consistent relative seating regardless of who created the room.
  // Split: ≤3 opponents → ceil (keeps the single "opposite" player on the left
  // for small tables); ≥4 opponents → floor (balanced lean-right for large tables).
  const myIndex = room.players.findIndex(p => p.id === myId);
  const nPlayers = room.players.length;
  const opponents = Array.from({ length: nPlayers - 1 }, (_, i) =>
    room.players[(myIndex + 1 + i) % nPlayers]!
  );
  const leftCount = opponents.length <= 3
    ? Math.ceil(opponents.length / 2)
    : Math.floor(opponents.length / 2);
  const leftOpps  = opponents.slice(0, leftCount);
  const rightOpps = opponents.slice(leftCount);

  // ── Card-play helpers ─────────────────────────────────────────────────────

  function emitCard(card: Card, declaration: JokerDeclaration | null) {
    socket.emit('card:play', card, declaration, (result: PlayResult) => {
      if (!result.ok) {
        console.error('[card:play]', result.error);
        setHiddenCard(null); // restore card in hand on rejection
      } else {
        impactMedium();
        onCardPlayed?.(card);
        setHiddenCard(null);
      }
    });
  }

  function handleCardClick(card: Card, fromRect: DOMRect) {
    if (!isMyTurn || ar.phase !== 'playing') return;
    if (showSnapshot) return;
    if (!isLegal(card)) return;
    if (hiddenCard) return; // prevent double-tap while card is in flight
    impactLight();
    if (card.isJoker) {
      setJokerModal(
        ar.currentTrick.length === 0
          ? { step: 'mode', card }
          : { step: 'non-leading', card },
      );
      return;
    }
    const toRect = tableCenterRef.current?.getBoundingClientRect() ?? new DOMRect();
    setHiddenCard(card);
    setFlyingCard({ card, from: fromRect, to: toRect });
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
              className="gs-menu-item"
              onClick={() => { setMenuOpen(false); setShowDebug(true); }}
            >
              Діагностика
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
        <div className="gs-table-zone" ref={tableCenterRef}>

          <div className="gs-col gs-col--left">
            {leftOpps.map(p => (
              <OpponentSeat
                key={p.id}
                player={p}
                score={gs.scores.find(s => s.playerId === p.id)}
                ar={ar}
                isCurrentTurn={ar.currentTurnPlayerId === p.id}
                isWinner={winnerGlowId === p.id}
              />
            ))}
          </div>

          <TableCenter
            plays={trickDisplayPlays}
            winnerId={snapshotWinnerId}
            players={room.players}
            biddingEntries={biddingEntries}
          />

          <div className="gs-col gs-col--right">
            {rightOpps.map(p => (
              <OpponentSeat
                key={p.id}
                player={p}
                score={gs.scores.find(s => s.playerId === p.id)}
                ar={ar}
                isCurrentTurn={ar.currentTurnPlayerId === p.id}
                isWinner={winnerGlowId === p.id}
              />
            ))}
          </div>

        </div>

        {/* Bottom zone: my info + controls + hand */}
        <div className="gs-bottom">

          {/* My info bar */}
          <div className={`gs-me-bar${winnerGlowId === myId ? ' gs-me-bar--winner' : ''}`}>
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
              isDealing={isDealing}
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
            isDealing={isDealing}
            isHandRevealing={isHandRevealing}
            hiddenCard={hiddenCard}
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

      {/* ── Round result panel ──────────────────────────────────────────── */}
      {showRoundResult && (
        <RoundResultPanel ar={ar} gs={gs} myId={myId} players={room.players} />
      )}

      {/* ── Fly card overlay ────────────────────────────────────────────── */}
      {flyingCard && (
        <FlyCard
          card={flyingCard.card}
          from={flyingCard.from}
          to={flyingCard.to}
          onDone={() => setFlyingCard(null)}
        />
      )}

      {/* ── Trick collect overlay ───────────────────────────────────────── */}
      {collectState && (
        <CollectOverlay
          plays={collectState.plays}
          direction={collectState.direction}
          from={collectState.from}
          onDone={() => setCollectState(null)}
        />
      )}

      {/* ── Deal animation overlay ───────────────────────────────────────── */}
      <DealAnimation active={isDealing || testDealActive} />

      {/* ── Debug modal ─────────────────────────────────────────────────── */}
      {showDebug && (
        <DebugModal
          onClose={() => setShowDebug(false)}
          onTestDealAnim={() => {
            setTestDealActive(true);
            setTimeout(() => setTestDealActive(false), 1400);
          }}
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

// ─── Animation helpers & overlay components ───────────────────────────────────

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function getWinnerDirection(
  winnerId: string,
  myId: string,
  leftOpps: GameRoom['players'],
  rightOpps: GameRoom['players'],
): 'left' | 'right' | 'bottom' {
  if (winnerId === myId) return 'bottom';
  if (leftOpps.some(p => p.id === winnerId)) return 'left';
  return 'right';
}

const CARD_W = 48, CARD_H = 68; // gcard--md dimensions

function FlyCard({ card, from, to, onDone }: { card: Card; from: DOMRect; to: DOMRect; onDone: () => void }) {
  const [phase, setPhase] = useState<'init' | 'fly'>('init');
  const dur = reducedMotion() ? 0 : 300;

  useEffect(() => {
    const raf = requestAnimationFrame(() => setPhase('fly'));
    const t   = setTimeout(onDone, dur + 60);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fromL = from.left + from.width  / 2 - CARD_W / 2;
  const fromT = from.top  + from.height / 2 - CARD_H / 2;
  const toL   = to.left   + to.width    / 2 - CARD_W / 2;
  const toT   = to.top    + to.height   / 2 - CARD_H / 2;

  return (
    <div
      className="fly-card-overlay"
      style={{
        left: phase === 'fly' ? toL : fromL,
        top:  phase === 'fly' ? toT : fromT,
        transition: phase === 'fly' && dur > 0
          ? `left ${dur}ms cubic-bezier(0.25,0.1,0.25,1), top ${dur}ms cubic-bezier(0.25,0.1,0.25,1)`
          : 'none',
      } as React.CSSProperties}
    >
      <GraphicCard card={card} size="md" />
    </div>
  );
}

function CollectOverlay({ plays, direction, from, onDone }: {
  plays: TrickPlay[];
  direction: 'left' | 'right' | 'bottom';
  from: DOMRect;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 560);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cx = from.left + from.width  / 2 - CARD_W / 2;
  const cy = from.top  + from.height / 2 - CARD_H / 2;
  const n  = plays.length;

  return (
    <>
      {plays.map((play, i) => {
        const jitter = (i - (n - 1) / 2) * 10;
        return (
          <div
            key={play.playerId}
            className={`collect-card-overlay collect-card--${direction}`}
            style={{
              left: cx + jitter,
              top:  cy + Math.abs(jitter) * 0.2,
              animationDelay: `${i * 35}ms`,
            } as React.CSSProperties}
          >
            <GraphicCard card={play.card} size="md" />
          </div>
        );
      })}
    </>
  );
}

function RoundResultPanel({ ar, gs, myId, players }: {
  ar: ActiveRound;
  gs: GameSheet;
  myId: string;
  players: GameRoom['players'];
}) {
  const roundDef = gs.rounds[ar.roundIndex];
  return (
    <div className="gs-round-result">
      <p className="rr-title">Раунд {ar.roundIndex + 1} завершено</p>
      {roundDef && <p className="rr-subtitle">{roundDef.label}</p>}
      <div className="rr-table">
        {players.map(p => {
          const bid    = ar.bids[p.id];
          const tricks = ar.tricksWon[p.id] ?? 0;
          const score  = gs.scores.find(s => s.playerId === p.id);
          const hit    = bid !== undefined && tricks === bid;
          return (
            <div
              key={p.id}
              className={[
                'rr-row',
                p.id === myId ? 'rr-row--me'   : '',
                hit           ? 'rr-row--hit'  : 'rr-row--miss',
              ].filter(Boolean).join(' ')}
            >
              <span className="rr-name">{p.name.slice(0, 10)}</span>
              <span className="rr-bid">{bid !== undefined ? `${tricks}/${bid}` : '—'}</span>
              <span className="rr-total">{score?.total ?? 0}</span>
            </div>
          );
        })}
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
