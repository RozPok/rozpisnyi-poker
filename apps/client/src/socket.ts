import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@rozpisnyi-poker/shared';

// io() returns Socket<any,any>; cast to the typed variant so all emit/on calls are checked
export const socket = io({ autoConnect: false }) as Socket<
  ServerToClientEvents,
  ClientToServerEvents
>;
