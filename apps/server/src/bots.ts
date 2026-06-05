import { getLegalBids, getLegalCards } from '@rozpisnyi-poker/shared';
import type { GameRoom, JokerDeclaration } from '@rozpisnyi-poker/shared';
import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@rozpisnyi-poker/shared';
import * as game from './game.js';

const TRICK_REVEAL_MS = 3_200;

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

export function scheduleBotAction(room: GameRoom, io: IO): void {
  const ar = room.activeRound;
  if (!ar || ar.isComplete || room.status !== 'in-progress') return;

  const nextPlayer = room.players.find(p => p.id === ar.currentTurnPlayerId);
  if (!nextPlayer?.isBot) return;

  const delay = ar.phase === 'bidding'
    ? 300 + Math.random() * 500
    : 300 + Math.random() * 700;

  const botId = nextPlayer.id;
  setTimeout(() => {
    if (room.activeRound?.currentTurnPlayerId !== botId) return;
    if (room.activeRound?.isComplete) return;
    if (room.status !== 'in-progress') return;

    if (room.activeRound.phase === 'bidding') {
      executeBotBid(room, botId, io);
    } else {
      executeBotCard(room, botId, io);
    }
  }, delay);
}

function executeBotBid(room: GameRoom, botId: string, io: IO): void {
  const ar = room.activeRound!;
  const playerScore = room.gameSheet?.scores.find(s => s.playerId === botId);
  const bidHistory: (number | null)[] = playerScore
    ? playerScore.bids.slice(0, ar.roundIndex)
    : [];
  const currentTotal = Object.values(ar.bids).reduce((s, b) => s + b, 0);
  const isLastBidder = Object.keys(ar.bids).length === room.players.length - 1;
  const legal = getLegalBids(ar.cardsPerPlayer, currentTotal, isLastBidder, bidHistory);

  if (legal.length === 0) return;
  const bid = legal[Math.floor(Math.random() * legal.length)]!;
  const roundDef = room.gameSheet?.rounds[ar.roundIndex];
  const isDark = roundDef?.type === 'dark';

  const result = game.placeBid(room, botId, bid, isDark);
  if (result.ok) {
    io.to(room.id).emit('room:updated', room);
    scheduleBotAction(room, io);
  }
}

function executeBotCard(room: GameRoom, botId: string, io: IO): void {
  const ar = room.activeRound!;
  const hand = game.getHand(room.id, botId) ?? [];
  const legal = getLegalCards(hand, ar.leadSuit, ar.trumpSuit, ar.jokerDeclaration ?? undefined);

  if (legal.length === 0) return;
  const card = legal[Math.floor(Math.random() * legal.length)]!;

  // Joker: always lay-down — valid for both leading and non-leading position
  const declaration: JokerDeclaration | null = card.isJoker
    ? { mode: 'lay-down' }
    : null;

  const result = game.playCard(room, botId, card, declaration);
  if (!result.ok) return;

  if (room.activeRound?.isComplete) {
    io.to(room.id).emit('room:updated', room);
    setTimeout(() => {
      if (!room.activeRound?.isComplete) return;
      const { nextHandsMap } = game.finishRound(room);
      io.to(room.id).emit('room:updated', room);
      if (nextHandsMap) {
        for (const p of room.players) {
          if (!p.isBot) {
            io.to(p.id).emit('hand:dealt', nextHandsMap.get(p.id) ?? []);
          }
        }
        scheduleBotAction(room, io);
      }
    }, TRICK_REVEAL_MS);
  } else {
    io.to(room.id).emit('room:updated', room);
    scheduleBotAction(room, io);
  }
}
