import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@rozpisnyi-poker/shared';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

// io() returns Socket<any,any>; cast to the typed variant so all emit/on calls are checked
export const socket = io(SERVER_URL, { autoConnect: false }) as Socket<
  ServerToClientEvents,
  ClientToServerEvents
>;
