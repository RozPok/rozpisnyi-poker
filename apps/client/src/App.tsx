import { useState, useEffect } from 'react';
import type { Card, GameRoom } from '@rozpisnyi-poker/shared';
import { socket } from './socket.ts';
import Home from './pages/Home.tsx';
import Lobby from './pages/Lobby.tsx';

type Page = 'home' | 'lobby';

export default function App() {
  const [page, setPage] = useState<Page>('home');
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [myId, setMyId] = useState('');
  const [myHand, setMyHand] = useState<Card[]>([]);

  useEffect(() => {
    socket.connect();

    socket.on('connect', () => setMyId(socket.id ?? ''));
    socket.on('room:updated', updatedRoom => setRoom(updatedRoom));
    socket.on('hand:dealt', hand => setMyHand(hand));

    socket.on('disconnect', () => {
      setRoom(null);
      setPage('home');
      setMyId('');
      setMyHand([]);
    });

    return () => {
      socket.off('connect');
      socket.off('room:updated');
      socket.off('hand:dealt');
      socket.off('disconnect');
    };
  }, []);

  function handleRoomJoined(newRoom: GameRoom) {
    setRoom(newRoom);
    setPage('lobby');
  }

  function handleLeave() {
    setMyHand([]);
    socket.emit('room:leave', () => {
      setRoom(null);
      setPage('home');
    });
  }

  if (page === 'lobby' && room) {
    return <Lobby room={room} myId={myId} hand={myHand} onLeave={handleLeave} />;
  }

  return <Home onRoomJoined={handleRoomJoined} />;
}
