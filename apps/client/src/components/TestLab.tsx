import { useState, useEffect, useRef } from 'react';
import type { GameRoom, RoundType } from '@rozpisnyi-poker/shared';
import { maxCardsForCount } from '@rozpisnyi-poker/shared';
import { socket } from '../socket.ts';

interface SelectedRound {
  type: RoundType;
  cardsPerPlayer: number;
  label: string;
}

interface Props {
  onGameStarted: (room: GameRoom, playerName: string) => void;
  onBack: () => void;
}

export default function TestLab({ onGameStarted, onBack }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [playerCount, setPlayerCount] = useState(4);
  const [playerName, setPlayerName] = useState('');
  const [selectedRound, setSelectedRound] = useState<SelectedRound | null>(null);
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const roomIdRef = useRef<string | null>(null);

  useEffect(() => {
    const handler = (updatedRoom: GameRoom) => {
      if (updatedRoom.id === roomIdRef.current) setRoom(updatedRoom);
    };
    socket.on('room:updated', handler);
    return () => { socket.off('room:updated', handler); };
  }, []);

  const maxCards = maxCardsForCount(playerCount);

  function buildRoundOptions(): SelectedRound[] {
    const opts: SelectedRound[] = [];
    for (let c = 1; c <= maxCards; c++) {
      opts.push({ type: 'normal', cardsPerPlayer: c, label: String(c) });
    }
    opts.push({ type: 'no-trump', cardsPerPlayer: maxCards, label: 'Б' });
    opts.push({ type: 'dark',     cardsPerPlayer: maxCards, label: 'Т' });
    opts.push({ type: 'misere',   cardsPerPlayer: maxCards, label: 'М' });
    opts.push({ type: 'golden',   cardsPerPlayer: maxCards, label: 'З' });
    return opts;
  }

  function handleCreate() {
    if (!selectedRound || !playerName.trim() || isLoading) return;
    setIsLoading(true);
    setError('');
    const name = playerName.trim();
    socket.emit('testlab:create', {
      playerName: name,
      playerCount,
      roundType: selectedRound.type,
      cardsPerPlayer: selectedRound.cardsPerPlayer,
      label: selectedRound.label,
    }, result => {
      setIsLoading(false);
      if (!result.ok) { setError(result.error); return; }
      roomIdRef.current = result.room.id;
      setRoom(result.room);
      setStep(3);
    });
  }

  function handleAddBot() {
    if (isLoading) return;
    setIsLoading(true);
    setError('');
    socket.emit('testlab:add-bot', result => {
      setIsLoading(false);
      if (!result.ok) setError(result.error);
      else setRoom(result.room);
    });
  }

  function handleFillBots() {
    if (isLoading) return;
    setIsLoading(true);
    setError('');
    socket.emit('testlab:fill-bots', result => {
      setIsLoading(false);
      if (!result.ok) setError(result.error);
      else setRoom(result.room);
    });
  }

  function handleStart() {
    if (!room || isLoading) return;
    setIsLoading(true);
    setError('');
    socket.emit('game:start', result => {
      setIsLoading(false);
      if (!result.ok) { setError(result.error); return; }
      onGameStarted(result.room, playerName.trim());
    });
  }

  // ── Step 1: player count + name ──────────────────────────────────────────────
  if (step === 1) {
    return (
      <main className="screen">
        <h1 className="title">Тест Лаб</h1>
        <div className="tl-steps">
          <span className="tl-step tl-step--active">1</span>
          <span className="tl-step-divider">—</span>
          <span className="tl-step">2</span>
          <span className="tl-step-divider">—</span>
          <span className="tl-step">3</span>
        </div>

        <div className="form-group">
          <label htmlFor="tl-name">Ваше ім'я</label>
          <input
            id="tl-name"
            className="input"
            type="text"
            placeholder="Введіть ім'я…"
            maxLength={20}
            autoFocus
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Кількість гравців</label>
          <div className="tl-count-grid">
            {[3, 4, 5, 6, 7, 8].map(n => (
              <button
                key={n}
                className={`tl-count-btn${playerCount === n ? ' tl-count-btn--active' : ''}`}
                onClick={() => setPlayerCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="error">{error}</p>}
        <div className="btn-col">
          <button
            className="btn btn-primary"
            onClick={() => { setError(''); setSelectedRound(null); setStep(2); }}
            disabled={!playerName.trim()}
          >
            Далі →
          </button>
          <button className="btn btn-secondary" onClick={onBack}>← Назад</button>
        </div>
      </main>
    );
  }

  // ── Step 2: round selection ───────────────────────────────────────────────────
  if (step === 2) {
    const roundOpts = buildRoundOptions();
    return (
      <main className="screen">
        <h1 className="title">Тест Лаб</h1>
        <div className="tl-steps">
          <span className="tl-step tl-step--done">1</span>
          <span className="tl-step-divider">—</span>
          <span className="tl-step tl-step--active">2</span>
          <span className="tl-step-divider">—</span>
          <span className="tl-step">3</span>
        </div>

        <div className="form-group">
          <label>Оберіть раунд ({playerCount} гравців)</label>
          <div className="tl-round-grid">
            {roundOpts.map(opt => (
              <button
                key={`${opt.type}-${opt.cardsPerPlayer}`}
                className={`tl-round-btn${selectedRound?.label === opt.label && selectedRound?.type === opt.type ? ' tl-round-btn--active' : ''}${opt.type !== 'normal' ? ' tl-round-btn--special' : ''}`}
                onClick={() => setSelectedRound(opt)}
                title={roundTypeLabel(opt.type)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {selectedRound && (
          <p className="tl-round-info">
            {selectedRound.label === String(selectedRound.cardsPerPlayer)
              ? `${selectedRound.cardsPerPlayer} карт`
              : `${roundTypeLabel(selectedRound.type)} — ${selectedRound.cardsPerPlayer} карт`}
          </p>
        )}

        {error && <p className="error">{error}</p>}
        <div className="btn-col">
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={!selectedRound || isLoading}
          >
            {isLoading ? 'Створення…' : 'Створити кімнату'}
          </button>
          <button className="btn btn-secondary" onClick={() => { setError(''); setStep(1); }}>← Назад</button>
        </div>
      </main>
    );
  }

  // ── Step 3: waiting room ──────────────────────────────────────────────────────
  const botCount = room?.players.filter(p => p.isBot).length ?? 0;
  const totalCount = room?.players.length ?? 1;
  const targetCount = room?.testPlayerCount ?? playerCount;
  const isFull = totalCount >= targetCount;
  const canStart = totalCount >= 3;

  return (
    <main className="screen">
      <h1 className="title">Тест Лаб</h1>
      <div className="tl-steps">
        <span className="tl-step tl-step--done">1</span>
        <span className="tl-step-divider">—</span>
        <span className="tl-step tl-step--done">2</span>
        <span className="tl-step-divider">—</span>
        <span className="tl-step tl-step--active">3</span>
      </div>

      {room && (
        <>
          <div className="tl-room-info">
            <span className="tl-room-code">Кімната: <strong>{room.code}</strong></span>
            <span className="tl-room-round">Раунд: <strong>{room.testRound?.label}</strong></span>
          </div>

          <div className="tl-player-list">
            {room.players.map(p => (
              <div key={p.id} className={`tl-player-row${p.isBot ? ' tl-player-row--bot' : ''}`}>
                <span>{p.name}</span>
                {p.isBot && <span className="tl-bot-tag">бот</span>}
              </div>
            ))}
            {Array.from({ length: targetCount - totalCount }, (_, i) => (
              <div key={`empty-${i}`} className="tl-player-row tl-player-row--empty">
                <span>—</span>
              </div>
            ))}
          </div>

          <p className="tl-player-count">{totalCount} / {targetCount} гравців ({botCount} ботів)</p>
        </>
      )}

      {error && <p className="error">{error}</p>}

      <div className="btn-col">
        <button
          className="btn btn-primary"
          onClick={handleStart}
          disabled={!canStart || isLoading}
        >
          {isLoading ? 'Запуск…' : 'Почати тест'}
        </button>
        {!isFull && (
          <button className="btn btn-secondary" onClick={handleAddBot} disabled={isLoading}>
            + 1 бот
          </button>
        )}
        {!isFull && (
          <button className="btn btn-secondary" onClick={handleFillBots} disabled={isLoading}>
            Заповнити ботами
          </button>
        )}
        <button className="btn btn-ghost" onClick={onBack} disabled={isLoading}>
          ← Скасувати
        </button>
      </div>
    </main>
  );
}

function roundTypeLabel(type: RoundType): string {
  switch (type) {
    case 'no-trump': return 'Без козиря';
    case 'dark':     return 'Темна';
    case 'misere':   return 'Мізер';
    case 'golden':   return 'Золота';
    default:         return 'Звичайний';
  }
}
