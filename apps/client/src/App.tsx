import { useState, useEffect, useRef } from 'react';
import type { Card, GameRoom } from '@rozpisnyi-poker/shared';
import { socket, myPlayerId, saveSession, loadSession, clearSession } from './socket.ts';
import { initTelegram, isTelegram, getTelegramUser } from './telegram.ts';
import Home from './pages/Home.tsx';
import Lobby from './pages/Lobby.tsx';

// Resolved once at module load — window.Telegram is synchronously available
// because the script tag in index.html has no defer/async attribute.
const tgMode = isTelegram();
const tgUser = getTelegramUser();
const tgPlayerName = tgUser
  ? (tgUser.first_name || tgUser.username || '')
  : undefined;

type Page = 'home' | 'lobby' | 'restoring';

export default function App() {
  const [page, setPage] = useState<Page>('restoring');
  const [room, setRoom] = useState<GameRoom | null>(null);
  // myId is the stable player UUID — never changes across socket reconnects.
  const myId = myPlayerId;
  const [myHand, setMyHand] = useState<Card[]>([]);
  const [restoreError, setRestoreError] = useState('');
  // True while the socket is down but the player was in a room.
  const [isSocketDown, setIsSocketDown] = useState(false);
  // Switched to true after ~12 s on the restoring screen (Render cold-start).
  const [slowConnection, setSlowConnection] = useState(false);

  // Ref so event-handler closures can read the current room state without
  // being re-registered on every render.
  const inRoomRef = useRef(false);
  inRoomRef.current = room !== null;

  // Show "Сервер прокидається…" after 12 s on the restoring screen.
  useEffect(() => {
    if (page !== 'restoring') {
      setSlowConnection(false);
      return;
    }
    const t = setTimeout(() => setSlowConnection(true), 12_000);
    return () => clearTimeout(t);
  }, [page]);

  useEffect(() => {
    initTelegram(); // no-op outside Telegram
    socket.connect();

    socket.on('connect', () => {
      setIsSocketDown(false);
      const session = loadSession();

      if (!session) {
        if (!inRoomRef.current) setPage('home');
        return;
      }

      // Capture whether we already had room state at the moment of (re)connect.
      // If yes (mobile suspend/resume): stay on lobby with an overlay rather than
      // flashing the restoring screen.
      const hadRoom = inRoomRef.current;
      if (!hadRoom) setPage('restoring');

      socket.emit('room:reconnect', { roomCode: session.roomCode, playerName: session.playerName }, result => {
        if (result.ok) {
          setRoom(result.room);
          setMyHand(result.hand);
          if (!hadRoom) setPage('lobby');
          // hadRoom case: page stays 'lobby', overlay clears via isSocketDown=false above
        } else {
          // Room or player no longer exists on the server — session is stale.
          clearSession();
          setRestoreError('Не вдалося відновити сесію');
          setRoom(null);
          setPage('home');
        }
      });
    });

    socket.on('room:updated', updatedRoom => setRoom(updatedRoom));
    socket.on('hand:dealt', hand => setMyHand(hand));

    socket.on('disconnect', () => {
      if (inRoomRef.current) {
        // Keep game state alive — show a reconnecting overlay while socket.io
        // retries. Session stays in localStorage; do NOT clear it.
        setIsSocketDown(true);
      } else {
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
        <p className="subtitle">
          {slowConnection ? 'Сервер прокидається, зачекайте…' : 'Відновлення сесії…'}
        </p>
      </main>
    );
  }

  if (page === 'lobby' && room) {
    return (
      <>
        {isSocketDown && (
          <div className="reconnecting-overlay">Перепідключення…</div>
        )}
        <Lobby room={room} myId={myId} hand={myHand} onLeave={handleLeave} onCardPlayed={handleCardPlayed} />
      </>
    );
  }

  return (
    <Home
      onRoomJoined={handleRoomJoined}
      restoreError={restoreError}
      tgPlayerName={tgPlayerName}
      isTgMode={tgMode}
    />
  );
}
