import { useState, useEffect, useRef } from 'react';
import type { Card, GameRoom, GameRound } from '@rozpisnyi-poker/shared';
import { ROOM_MIN_PLAYERS, ROOM_MAX_PLAYERS, ROUND_TYPE_LABELS } from '@rozpisnyi-poker/shared';
import { socket } from '../socket.ts';
import ScoreBoard from '../components/ScoreBoard.tsx';
import GameScreen from '../components/game/GameScreen.tsx';
import { notificationSuccess } from '../telegramHaptics.ts';

interface Props {
  room: GameRoom;
  myId: string;
  hand: Card[];
  onLeave: () => void;
  onCardPlayed: (card: Card) => void;
}

export default function Lobby({ room, myId, hand, onLeave, onCardPlayed }: Props) {
  const [copied, setCopied]             = useState(false);
  const [isLeaving, setIsLeaving]       = useState(false);
  const [isStarting, setIsStarting]     = useState(false);
  const [startError, setStartError]     = useState('');

  const prevStatusRef = useRef(room.status);
  useEffect(() => {
    if (room.status === 'finished' && prevStatusRef.current !== 'finished') {
      notificationSuccess();
    }
    prevStatusRef.current = room.status;
  }, [room.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const isOwner = room.ownerId === myId;

  function handleCopy() {
    navigator.clipboard.writeText(room.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  function handleLeave() {
    setIsLeaving(true);
    onLeave();
  }

  function handleStart() {
    if (isStarting) return;
    setIsStarting(true);
    setStartError('');
    socket.emit('game:start', result => {
      setIsStarting(false);
      if (!result.ok) setStartError(result.error);
    });
  }

  // ── shared header block ───────────────────────────────────────────────────────
  const codeBlock = (
    <div className="room-code-block">
      <span className="room-code-label">Код кімнати</span>
      <div className="room-code-row">
        <span className="room-code">{room.code}</span>
        <button className="btn-copy" onClick={handleCopy}>
          {copied ? 'Скопійовано!' : 'Копіювати'}
        </button>
      </div>
    </div>
  );

  // ── game finished ────────────────────────────────────────────────────────────
  if (room.status === 'finished') {
    const gameSheet = room.gameSheet;
    return (
      <main className="screen game-screen">
        <div className="game-header">
          <h1 className="title">Розписний Покер</h1>
          <p className="game-started-banner">Гру завершено!</p>
        </div>
        {gameSheet && (
          <ScoreBoard gameSheet={gameSheet} players={room.players} myId={myId} />
        )}
        <div className="lobby-actions">
          <button className="btn btn-secondary" onClick={handleLeave} disabled={isLeaving}>
            {isLeaving ? 'Виходимо…' : 'Вийти'}
          </button>
        </div>
      </main>
    );
  }

  // ── game in progress ─────────────────────────────────────────────────────────
  if (room.status === 'in-progress') {
    const gameSheet = room.gameSheet;

    if (!gameSheet || gameSheet.rounds.length === 0) {
      return (
        <main className="screen lobby">
          <h1 className="title">Розписний Покер</h1>
          <p className="subtitle">Завантаження гри…</p>
        </main>
      );
    }

    // Active round: new full-screen game UI
    if (room.activeRound) {
      return (
        <GameScreen
          room={room}
          myId={myId}
          hand={hand}
          onCardPlayed={onCardPlayed}
          onLeave={handleLeave}
          isLeaving={isLeaving}
        />
      );
    }

    const cur   = gameSheet.rounds[gameSheet.currentRoundIndex] ?? gameSheet.rounds[0];
    const total = gameSheet.rounds.length;
    const pct   = Math.round((gameSheet.currentRoundIndex / total) * 100);

    if (!cur) {
      return (
        <main className="screen lobby">
          <h1 className="title">Розписний Покер</h1>
          <p className="subtitle">Помилка даних раунду</p>
        </main>
      );
    }

    return (
      <main className="screen lobby">
        <div className="room-header">
          <h1 className="title">Розписний Покер</h1>
          {codeBlock}
        </div>

        <p className="game-started-banner">Гра почалась!</p>

        <div className="cur-round-card">
          <p className="cur-round-meta">
            Раунд <strong>{gameSheet.currentRoundIndex + 1}</strong> / {total}
          </p>
          <div className="cur-round-main">
            <span className="cur-round-badge">{cur.label}</span>
            {cur.type !== 'normal' && (
              <span className="cur-round-type">
                {ROUND_TYPE_LABELS?.[cur.type] ?? cur.type}
              </span>
            )}
          </div>
          <p className="cur-round-cards">{cur.cardsPerPlayer} карт на гравця</p>
        </div>

        <div className="sheet-progress-bar">
          <div className="sheet-progress-fill" style={{ width: `${pct}%` }} />
        </div>

        <div className="round-scroll">
          {gameSheet.rounds.map(r => (
            <RoundRow
              key={r.index}
              round={r}
              isCurrent={r.index === gameSheet.currentRoundIndex}
              isDone={r.index < gameSheet.currentRoundIndex}
            />
          ))}
        </div>

        <div className="lobby-actions">
          <button className="btn btn-secondary" onClick={handleLeave} disabled={isLeaving}>
            {isLeaving ? 'Виходимо…' : 'Вийти'}
          </button>
        </div>
      </main>
    );
  }

  // ── waiting lobby ────────────────────────────────────────────────────────────
  const connectedCount = room.players.filter(p => p.isConnected).length;
  const canStart = connectedCount >= ROOM_MIN_PLAYERS;
  const waitingForReconnect = room.players.length >= ROOM_MIN_PLAYERS && !canStart;
  const needMore = Math.max(0, ROOM_MIN_PLAYERS - room.players.length);

  return (
    <main className="screen lobby">
      <div className="room-header">
        <h1 className="title">Розписний Покер</h1>
        {codeBlock}
      </div>

      <div className="players-section">
        <p className="player-count">
          Гравці: <strong>{room.players.length}</strong> / {ROOM_MAX_PLAYERS}
          {needMore > 0 && (
            <span className="need-more"> — потрібно ще {needMore}</span>
          )}
        </p>
        <ul className="player-list">
          {room.players.map(player => (
            <li
              key={player.id}
              className={`player-item${player.id === myId ? ' player-item--me' : ''}`}
            >
              <span className="player-name">{player.name}</span>
              {player.id === room.ownerId && <span className="owner-tag">Власник</span>}
              {!player.isConnected && <span className="disconnected-tag">відключено</span>}
            </li>
          ))}
        </ul>
      </div>

      {startError && <p className="error">{startError}</p>}

      <div className="lobby-actions">
        {isOwner && (
          <>
            {waitingForReconnect && (
              <p className="lobby-waiting-msg">Очікуємо підключення гравців…</p>
            )}
            <button
              className="btn btn-primary"
              onClick={handleStart}
              disabled={!canStart || isStarting}
              title={needMore > 0 ? `Потрібно мінімум ${ROOM_MIN_PLAYERS} гравців` : undefined}
            >
              {isStarting ? 'Запуск…' : 'Почати гру'}
            </button>
          </>
        )}
        <button className="btn btn-secondary" onClick={handleLeave} disabled={isLeaving}>
          {isLeaving ? 'Виходимо…' : 'Вийти'}
        </button>
      </div>
    </main>
  );
}

// ── Round row ────────────────────────────────────────────────────────────────

function RoundRow({
  round,
  isCurrent,
  isDone,
}: {
  round: GameRound;
  isCurrent: boolean;
  isDone: boolean;
}) {
  const cls = [
    'round-row',
    isCurrent              ? 'round-row--current' : '',
    isDone                 ? 'round-row--done'    : '',
    round.type !== 'normal'? 'round-row--special' : '',
  ].filter(Boolean).join(' ');

  // Safe label lookup — ROUND_TYPE_LABELS might be undefined in a stale cache
  const typeName =
    round.type !== 'normal'
      ? (ROUND_TYPE_LABELS?.[round.type] ?? round.label)
      : '';

  return (
    <div className={cls}>
      <span className="round-row-num">{round.index + 1}</span>
      <span className="round-row-badge">{round.label}</span>
      <span className="round-row-cards">{round.cardsPerPlayer} карт</span>
      {typeName && <span className="round-row-type">{typeName}</span>}
    </div>
  );
}
