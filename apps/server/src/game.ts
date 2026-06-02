import type {
  ActiveRound,
  BidResult,
  Card,
  GameRoom,
  JokerDeclaration,
  PlayResult,
  TrickPlay,
} from '@rozpisnyi-poker/shared';
import {
  canBidZero,
  canPlayCard,
  computeScore,
  createDeck,
  dealCards,
  determineTrickWinner,
  getLegalBids,
  shuffleDeck,
  violatesTotalRule,
} from '@rozpisnyi-poker/shared';

// ─── Hand store (server-private) ─────────────────────────────────────────────

const handsByRoom = new Map<string, Map<string, Card[]>>();

// ─── Dealing ──────────────────────────────────────────────────────────────────

export interface DealResult {
  handsMap: Map<string, Card[]>;
  activeRound: ActiveRound;
}

export function dealRound(room: GameRoom): DealResult {
  const { gameSheet } = room;
  if (!gameSheet) throw new Error('No game sheet on room');

  const roundDef = gameSheet.rounds[gameSheet.currentRoundIndex];
  if (!roundDef) throw new Error('Invalid currentRoundIndex');

  const deck = shuffleDeck(createDeck());
  const { hands } = dealCards(deck, room.players.length, roundDef.cardsPerPlayer);

  const handsMap = new Map<string, Card[]>();
  room.players.forEach((player, idx) => {
    handsMap.set(player.id, hands[idx]!);
  });
  handsByRoom.set(room.id, handsMap);

  const firstPlayerId = room.players[0]!.id;

  // Misere and golden have no bidding phase
  const skipsBidding = roundDef.type === 'misere' || roundDef.type === 'golden';

  const activeRound: ActiveRound = {
    roundIndex: gameSheet.currentRoundIndex,
    cardsPerPlayer: roundDef.cardsPerPlayer,
    phase: skipsBidding ? 'playing' : 'bidding',
    bids: {},
    currentTrickIndex: 0,
    currentTrick: [],
    leadSuit: null,
    trumpSuit: null,
    jokerDeclaration: null,
    currentTurnPlayerId: firstPlayerId,
    trickLeadPlayerId: firstPlayerId,
    tricksWon: Object.fromEntries(room.players.map(p => [p.id, 0])),
    playerCardCounts: Object.fromEntries(room.players.map(p => [p.id, roundDef.cardsPerPlayer])),
    isComplete: false,
  };

  return { handsMap, activeRound };
}

export function getHand(roomId: string, playerId: string): Card[] | undefined {
  return handsByRoom.get(roomId)?.get(playerId);
}

export function clearHands(roomId: string): void {
  handsByRoom.delete(roomId);
}

// ─── Scoring and round transition ─────────────────────────────────────────────

export interface FinishRoundResult {
  /** Points earned by each player this round (playerId → delta). */
  scored: Record<string, number>;
  /** Hands for the next round, or null when the game is over. */
  nextHandsMap: Map<string, Card[]> | null;
}

export function finishRound(room: GameRoom): FinishRoundResult {
  const { gameSheet } = room;
  if (!gameSheet) throw new Error('No game sheet on room');

  const ar = room.activeRound;
  if (!ar) throw new Error('No active round');
  if (!ar.isComplete) throw new Error('Round is not yet complete');

  const roundDef = gameSheet.rounds[ar.roundIndex];
  if (!roundDef) throw new Error('Round definition not found');

  // Compute and persist scores for every player
  const scored: Record<string, number> = {};
  for (const ps of gameSheet.scores) {
    const bid = ar.bids[ps.playerId] ?? null;
    const actualTricks = ar.tricksWon[ps.playerId] ?? 0;
    const pts = computeScore(roundDef.type, bid, actualTricks);
    scored[ps.playerId] = pts;
    ps.scores[ar.roundIndex] = pts;
    ps.total += pts;
  }

  const nextRoundIndex = ar.roundIndex + 1;

  if (nextRoundIndex >= gameSheet.rounds.length) {
    // All rounds played — game over
    room.activeRound = null;
    room.status = 'finished';
    clearHands(room.id);
    return { scored, nextHandsMap: null };
  }

  gameSheet.currentRoundIndex = nextRoundIndex;
  const { handsMap, activeRound } = dealRound(room);
  room.activeRound = activeRound;

  return { scored, nextHandsMap: handsMap };
}

// ─── Bidding ──────────────────────────────────────────────────────────────────

export function placeBid(
  room: GameRoom,
  playerId: string,
  tricks: number,
): BidResult {
  const ar = room.activeRound;
  if (!ar) return { ok: false, error: 'Раунд не активний' };
  if (ar.phase !== 'bidding') return { ok: false, error: 'Зараз не фаза ставок' };
  if (ar.currentTurnPlayerId !== playerId) return { ok: false, error: 'Не ваш хід' };
  if (!Number.isInteger(tricks) || tricks < 0 || tricks > ar.cardsPerPlayer) {
    return { ok: false, error: `Ставка має бути від 0 до ${ar.cardsPerPlayer}` };
  }

  const { gameSheet } = room;
  const playerScore = gameSheet?.scores.find(s => s.playerId === playerId);
  const bidHistory: (number | null)[] = playerScore
    ? playerScore.bids.slice(0, ar.roundIndex)
    : [];

  const currentTotal = Object.values(ar.bids).reduce((s, b) => s + b, 0);
  const bidsSubmittedCount = Object.keys(ar.bids).length;
  const isLastBidder = bidsSubmittedCount === room.players.length - 1;

  const legal = getLegalBids(ar.cardsPerPlayer, currentTotal, isLastBidder, bidHistory);

  if (!legal.includes(tricks)) {
    if (isLastBidder && violatesTotalRule(tricks, currentTotal, ar.cardsPerPlayer)) {
      return {
        ok: false,
        error: `Ставка ${tricks} неможлива — сума ставок не може дорівнювати ${ar.cardsPerPlayer}`,
      };
    }
    if (!canBidZero(bidHistory) && tricks === 0) {
      return { ok: false, error: 'Не можна ставити 0 три рази поспіль' };
    }
    return { ok: false, error: `Ставка ${tricks} недопустима` };
  }

  ar.bids[playerId] = tricks;

  if (playerScore && ar.roundIndex < playerScore.bids.length) {
    playerScore.bids[ar.roundIndex] = tricks;
  }

  const playerCount = room.players.length;

  if (Object.keys(ar.bids).length === playerCount) {
    ar.phase = 'playing';
    ar.currentTurnPlayerId = ar.trickLeadPlayerId;
  } else {
    const currentIdx = room.players.findIndex(p => p.id === playerId);
    ar.currentTurnPlayerId = room.players[(currentIdx + 1) % playerCount]!.id;
  }

  return { ok: true };
}

// ─── Playing ──────────────────────────────────────────────────────────────────

export function playCard(
  room: GameRoom,
  playerId: string,
  card: Card,
  declaration: JokerDeclaration | null = null,
): PlayResult {
  const ar = room.activeRound;
  if (!ar) return { ok: false, error: 'Раунд не активний' };
  if (ar.phase !== 'playing') return { ok: false, error: 'Зараз фаза ставок' };
  if (ar.isComplete) return { ok: false, error: 'Раунд завершено' };
  if (ar.currentTurnPlayerId !== playerId) return { ok: false, error: 'Не ваш хід' };

  const hand = handsByRoom.get(room.id)?.get(playerId);
  if (!hand) return { ok: false, error: 'Гравця не знайдено' };

  const cardIdx = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
  if (cardIdx === -1) return { ok: false, error: 'Картку не знайдено в руці' };

  // When Joker leads a trick a declaration is required
  if (ar.currentTrick.length === 0 && card.isJoker) {
    if (!declaration) {
      return { ok: false, error: 'Необхідно вибрати режим Джокера' };
    }
    if (
      (declaration.mode === 'highest-suit' || declaration.mode === 'lowest-suit') &&
      !declaration.suit
    ) {
      return { ok: false, error: 'Необхідно вказати масть для цього режиму' };
    }
  }

  // Validate card legality using the declaration already stored for this trick
  // (null for the Joker leader itself — any card is legal when leadSuit is null)
  if (!canPlayCard(hand, card, ar.leadSuit, ar.trumpSuit, ar.jokerDeclaration ?? undefined)) {
    return { ok: false, error: 'Порушення правила ходу: потрібно відбити масть або козир' };
  }

  const player = room.players.find(p => p.id === playerId);
  if (!player) return { ok: false, error: 'Гравця не знайдено в кімнаті' };

  hand.splice(cardIdx, 1);

  // ── Set lead suit and Joker declaration ──────────────────────────────────────
  if (ar.currentTrick.length === 0) {
    if (card.isJoker && declaration) {
      ar.jokerDeclaration = declaration;
      // highest-suit / lowest-suit: declared suit is the effective lead
      if (declaration.mode === 'highest-suit' || declaration.mode === 'lowest-suit') {
        ar.leadSuit = declaration.suit!;
      }
      // lay-down: leadSuit stays null until first non-Joker is played
    } else {
      ar.leadSuit = card.suit;
    }
  } else if (ar.jokerDeclaration?.mode === 'lay-down' && ar.leadSuit === null && !card.isJoker) {
    // First non-Joker in a lay-down trick establishes the effective lead suit
    ar.leadSuit = card.suit;
  }

  const trickPlay: TrickPlay = { playerId, playerName: player.name, card };
  ar.currentTrick.push(trickPlay);
  ar.playerCardCounts[playerId] = (ar.playerCardCounts[playerId] ?? 0) - 1;

  const playerCount = room.players.length;

  if (ar.currentTrick.length === playerCount) {
    const winnerId = determineTrickWinner(
      ar.currentTrick,
      ar.leadSuit,
      ar.trumpSuit,
      ar.jokerDeclaration ?? undefined,
    );
    ar.tricksWon[winnerId] = (ar.tricksWon[winnerId] ?? 0) + 1;
    ar.currentTrickIndex++;
    ar.currentTrick = [];
    ar.leadSuit = null;
    ar.jokerDeclaration = null;
    ar.trickLeadPlayerId = winnerId;
    ar.currentTurnPlayerId = winnerId;

    const anyCardsLeft = Object.values(ar.playerCardCounts).some(n => n > 0);
    if (!anyCardsLeft) {
      ar.isComplete = true;
    }
  } else {
    const currentIdx = room.players.findIndex(p => p.id === playerId);
    ar.currentTurnPlayerId = room.players[(currentIdx + 1) % playerCount]!.id;
  }

  return { ok: true };
}
