import { useState, useEffect, useRef } from 'react';
import type { Card, GameRoom } from '@rozpisnyi-poker/shared';
import { socket, saveSession, loadSession, clearSession } from './socket.ts';
import Home from './pages/Home.tsx';
import Lobby from './pages/Lobby.tsx';

type Page = 'home' | 'lobby' | 'restoring';

export default function App() {
  const [page, setPage] = useState<Page>('restoring');
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [myId, setMyId] = useState('');
  const [myHand, setMyHand] = useState<Card[]>([]);
  const [restoreError, setRestoreError] = useState('');

  // Track whether we're currently in a room (used to decide whether to reconnect
  // after a transient socket disconnect/reconnect cycle).
  const inRoomRef = useRef(false);
  inRoomRef.current = room !== null;

  useEffect(() => {
    socket.connect();

    socket.on('connect', () => {
      setMyId(socket.id ?? '');

      const session = loadSession();

      if (!session) {
        // No saved session — go straight to home screen.
        setPage('home');
        return;
      }

      // Try to restore the session every time the socket (re)connects.
      // This handles both page refresh and transient mobile disconnects.
      setPage('restoring');
      socket.emit('room:reconnect', { roomCode: session.roomCode, playerName: session.playerName }, result => {
        if (result.ok) {
          setRoom(result.room);
          setMyHand(result.hand);
          setPage('lobby');
        } else {
          clearSession();
          setRestoreError('Не вдалося відновити сесію');
          setPage('home');
        }
      });
    });

    socket.on('room:updated', updatedRoom => setRoom(updatedRoom));
    socket.on('hand:dealt', hand => setMyHand(hand));

    socket.on('disconnect', () => {
      setMyId('');
      // Keep room/hand state alive — socket.io will attempt to reconnect
      // automatically and the 'connect' handler above will restore the session.
      // Only reset to home if we were not in a room at all.
      if (!inRoomRef.current) {
        setPage('home');
      }
    });

    return () => {
      socket.off('connect');
      socket.off('room:updated');
      socket.off('hand:dealt');
      socket.off('disconnect');
    };
  }, []);

  function handleRoomJoined(newRoom: GameRoom, playerName: string) {
    saveSession({ roomCode: newRoom.code, playerName });
    setRoom(newRoom);
    setPage('lobby');
  }

  function handleLeave() {
    setMyHand([]);
    socket.emit('room:leave', () => {
      clearSession();
      setRoom(null);
      setPage('home');
    });
  }

  function handleCardPlayed(card: Card) {
    setMyHand(prev => prev.filter(c => !(c.suit === card.suit && c.rank === card.rank)));
  }

  if (page === 'restoring') {
    return (
      <main className="screen">
        <h1 className="title">Розписний Покер</h1>
        <p className="subtitle">Відновлення сесії…</p>
      </main>
    );
  }

  if (page === 'lobby' && room) {
    return <Lobby room={room} myId={myId} hand={myHand} onLeave={handleLeave} onCardPlayed={handleCardPlayed} />;
  }

  return <Home onRoomJoined={handleRoomJoined} restoreError={restoreError} />;
}
