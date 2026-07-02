import { useState } from 'react';
import type { GameRoom, LeaderboardEntry } from '@rozpisnyi-poker/shared';
import { socket } from '../socket.ts';
import { useServerStatus } from '../hooks/useServerStatus.ts';
import ServerStatusBadge from '../components/ServerStatusBadge.tsx';

type HomeView = 'menu' | 'create' | 'join' | 'leaderboard';

interface Props {
  onRoomJoined: (room: GameRoom, playerName: string) => void;
  onTestLab: () => void;
  restoreError?: string;
  /** Name pre-filled from Telegram initDataUnsafe.user */
  tgPlayerName?: string;
  /** True when running inside the Telegram Mini App WebView */
  isTgMode?: boolean;
}

export default function Home({ onRoomJoined, onTestLab, restoreError, tgPlayerName, isTgMode }: Props) {
  const [view, setView] = useState<HomeView>('menu');
  const [playerName, setPlayerName] = useState(tgPlayerName ?? '');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[] | null>(null);
  const serverStatus = useServerStatus();

  function back() {
    setView('menu');
    setError('');
    setPlayerName(tgPlayerName ?? '');
    setRoomCode('');
  }

  function openLeaderboard() {
    setView('leaderboard');
    setLeaderboard(null);
    socket.emit('stats:get-leaderboard', entries => setLeaderboard(entries));
  }

  function handleCreate() {
    if (!playerName.trim() || isLoading) return;
    setIsLoading(true);
    setError('');
    const name = playerName.trim();
    socket.emit('room:create', name, result => {
      setIsLoading(false);
      if (!result.ok) { setError(result.error); return; }
      onRoomJoined(result.room, name);
    });
  }

  function handleJoin() {
    if (!playerName.trim() || !roomCode.trim() || isLoading) return;
    setIsLoading(true);
    setError('');
    const name = playerName.trim();
    socket.emit('room:join', { code: roomCode.trim(), playerName: name }, result => {
      setIsLoading(false);
      if (!result.ok) { setError(result.error); return; }
      onRoomJoined(result.room, name);
    });
  }

  if (view === 'create') {
    return (
      <main className="screen">
        <h1 className="title">Розписний Покер</h1>
        <div className="form-group">
          <label htmlFor="create-name">Ваше ім'я</label>
          <input
            id="create-name"
            className="input"
            type="text"
            placeholder="Введіть ім'я…"
            maxLength={20}
            autoFocus
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
        </div>
        {error && <p className="error">{error}</p>}
        <div className="btn-col">
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={!playerName.trim() || isLoading}
          >
            {isLoading ? 'Створення…' : 'Створити'}
          </button>
          <button className="btn btn-secondary" onClick={back}>← Назад</button>
        </div>
        <ServerStatusBadge status={serverStatus} />
      </main>
    );
  }

  if (view === 'join') {
    return (
      <main className="screen">
        <h1 className="title">Розписний Покер</h1>
        <div className="form-group">
          <label htmlFor="join-code">Код кімнати</label>
          <input
            id="join-code"
            className="input input--code"
            type="text"
            placeholder="XXXXXX"
            maxLength={6}
            autoFocus
            value={roomCode}
            onChange={e => setRoomCode(e.target.value.toUpperCase())}
          />
        </div>
        <div className="form-group">
          <label htmlFor="join-name">Ваше ім'я</label>
          <input
            id="join-name"
            className="input"
            type="text"
            placeholder="Введіть ім'я…"
            maxLength={20}
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
          />
        </div>
        {error && <p className="error">{error}</p>}
        <div className="btn-col">
          <button
            className="btn btn-primary"
            onClick={handleJoin}
            disabled={!playerName.trim() || !roomCode.trim() || isLoading}
          >
            {isLoading ? 'Приєднання…' : 'Приєднатися'}
          </button>
          <button className="btn btn-secondary" onClick={back}>← Назад</button>
        </div>
        <ServerStatusBadge status={serverStatus} />
      </main>
    );
  }

  if (view === 'leaderboard') {
    return (
      <main className="screen">
        <h1 className="title">Список підорасів</h1>
        {leaderboard === null ? (
          <p className="subtitle">Завантаження…</p>
        ) : leaderboard.length === 0 ? (
          <p className="subtitle lb-empty">Ще ніхто не завершив жодної гри.</p>
        ) : (
          <div className="lb-table-wrap">
            <table className="lb-table">
              <thead>
                <tr>
                  <th className="lb-rank">#</th>
                  <th className="lb-name-col">Нік</th>
                  <th>Ігор</th>
                  <th>Перемог</th>
                  <th>% перемог</th>
                  <th className="lb-status-col">Статус</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((e, i) => (
                  <tr key={e.playerId}>
                    <td className="lb-rank">{i + 1}</td>
                    <td className="lb-name-col">{e.name}</td>
                    <td>{e.games}</td>
                    <td>{e.wins}</td>
                    <td>{Math.round(e.winRate)}%</td>
                    <td className="lb-status-col">{e.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="btn-col">
          <button className="btn btn-secondary" onClick={back}>← Назад</button>
        </div>
        <ServerStatusBadge status={serverStatus} />
      </main>
    );
  }

  return (
    <main className="screen">
      <h1 className="title">Розписний Покер</h1>
      <p className="subtitle">Онлайн карткова гра</p>
      {isTgMode && <div className="tg-mode-badge">Telegram режим</div>}
      {restoreError && <p className="error">{restoreError}</p>}
      <div className="btn-col">
        <button className="btn btn-primary" onClick={() => setView('create')}>
          Створити гру
        </button>
        <button className="btn btn-secondary" onClick={() => setView('join')}>
          Приєднатися до гри
        </button>
        <button className="btn btn-secondary" onClick={openLeaderboard}>
          Список підорасів
        </button>
        <button className="btn btn-ghost" onClick={onTestLab}>
          Тест Лаб
        </button>
      </div>
      <ServerStatusBadge status={serverStatus} />
    </main>
  );
}
