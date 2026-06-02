import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@rozpisnyi-poker/shared';
import { getTelegramUser, telegramPlayerId } from './telegram.ts';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

function getOrCreatePlayerId(): string {
  // Inside Telegram: derive a stable ID from the Telegram user ID so the same
  // person is always the same player regardless of device/session.
  const tgUser = getTelegramUser();
  if (tgUser) {
    return telegramPlayerId(tgUser.id);
  }

  // Normal browser: persist a random UUID across refreshes.
  const key = 'poker:playerId';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

/** Stable player identity — persists across refreshes and socket reconnects. */
export const myPlayerId = getOrCreatePlayerId();

// io() returns Socket<any,any>; cast to the typed variant so all emit/on calls are checked
export const socket = io(SERVER_URL, {
  autoConnect: false,
  auth: { playerId: myPlayerId },
}) as Socket<ServerToClientEvents, ClientToServerEvents>;

// ─── Session helpers ─────────────────────────────────────────────────────────

const SESSION_KEY = 'poker:session';

export interface SessionData {
  roomCode: string;
  playerName: string;
}

export function saveSession(data: SessionData): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

export function loadSession(): SessionData | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}
