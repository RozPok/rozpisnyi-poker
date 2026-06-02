import { useState } from 'react';
import type { GameRoom } from '@rozpisnyi-poker/shared';
import { socket } from '../socket.ts';
import { useServerStatus } from '../hooks/useServerStatus.ts';
import ServerStatusBadge from '../components/ServerStatusBadge.tsx';

type HomeView = 'menu' | 'create' | 'join';

interface Props {
  onRoomJoined: (room: GameRoom) => void;
}

export default function Home({ onRoomJoined }: Props) {
  const [view, setView] = useState<HomeView>('menu');
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const serverStatus = useServerStatus();

  function back() {
    setView('menu');
    setError('');
    setPlayerName('');
    setRoomCode('');
  }

  function handleCreate() {
    if (!playerName.trim() || isLoading) return;
    setIsLoading(true);
    setError('');
    socket.emit('room:create', playerName.trim(), result => {
      setIsLoading(false);
      if (!result.ok) { setError(result.error); return; }
      onRoomJoined(result.room);
    });
  }

  function handleJoin() {
    if (!playerName.trim() || !roomCode.trim() || isLoading) return;
    setIsLoading(true);
    setError('');
    socket.emit('room:join', { code: roomCode.trim(), playerName: playerName.trim() }, result => {
      setIsLoading(false);
      if (!result.ok) { setError(result.error); return; }
      onRoomJoined(result.room);
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

  return (
    <main className="screen">
      <h1 className="title">Розписний Покер</h1>
      <p className="subtitle">Онлайн карткова гра</p>
      <div className="btn-col">
        <button className="btn btn-primary" onClick={() => setView('create')}>
          Створити гру
        </button>
        <button className="btn btn-secondary" onClick={() => setView('join')}>
          Приєднатися до гри
        </button>
      </div>
      <ServerStatusBadge status={serverStatus} />
    </main>
  );
}
