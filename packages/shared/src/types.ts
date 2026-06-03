// ─── Primitives ──────────────────────────────────────────────────────────────

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs' | 'joker';

export type Rank = '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A' | 'joker';

// ─── Card ─────────────────────────────────────────────────────────────────────

export interface Card {
  suit: Suit;
  rank: Rank;
  isJoker: boolean;
  label: string;
}

// ─── Game domain enums ────────────────────────────────────────────────────────

export type GamePhase =
  | 'lobby'
  | 'dealing'
  | 'bidding'
  | 'joker-declaration'
  | 'playing'
  | 'scoring'
  | 'finished';

export type GameType =
  | 'pass'
  | 'with-trump'
  | 'without-trump'
  | 'misere';

export type JokerMode =
  | 'trump'
  | 'suit'
  | 'highest'
  | 'lowest';

export interface Bid {
  playerId: string;
  tricks: number;
  gameType: GameType;
}

export interface TrickWinner {
  playerId: string;
  winningCard: Card;
  trickIndex: number;
}

// ─── Future gameplay types ────────────────────────────────────────────────────

export interface Trick {
  plays: Record<string, Card>;
  winnerId: string | null;
}

export interface Round {
  number: number;
  tricks: Trick[];
  dealerId: string;
  trump: Suit | null;
}

// ─── Game sheet ───────────────────────────────────────────────────────────────

/** Variant of a round that determines dealing/bidding/scoring rules. */
export type RoundType =
  | 'normal'    // numbered rounds — standard bidding with trump
  | 'no-trump'  // Б — без козиря
  | 'dark'      // Т — темна (blind bidding)
  | 'misere'    // М — мізер (must take 0 tricks)
  | 'golden';   // З — золота (must take all tricks)

/** One entry in the game-sheet round list. */
export interface GameRound {
  index: number;           // 0-based position in the rounds array
  type: RoundType;
  cardsPerPlayer: number;
  label: string;           // "1"–"11" for normal rounds; "Б","Т","М","З" for special
}

/** Per-player running score, one entry per round. */
export interface PlayerScore {
  playerId: string;
  name: string;
  bids: (number | null)[];    // bid per round (null = not yet bid / round not started)
  scores: (number | null)[];  // null = round not yet scored
  total: number;
}

/** The full game sheet generated at game-start. */
export interface GameSheet {
  rounds: GameRound[];
  scores: PlayerScore[];
  currentRoundIndex: number;
}

// ─── Active round (trick-taking) ─────────────────────────────────────────────

/** One card played by one player within a trick. */
export interface TrickPlay {
  playerId: string;
  playerName: string;
  card: Card;
}

/** Snapshot of the most recently completed trick — for the "previous trick" viewer. */
export interface LastTrick {
  plays: TrickPlay[];
  winnerId: string;
  trickIndex: number;   // 0-based index of this completed trick
}

/**
 * Live state of the current round — public (broadcast to all players).
 * Private hands are kept server-side only.
 */
export interface ActiveRound {
  roundIndex: number;
  cardsPerPlayer: number;
  phase: 'bidding' | 'playing';
  bids: Record<string, number>;        // playerId → bid (only players who have bid)
  currentTrickIndex: number;            // 0-based index of the trick in progress
  currentTrick: TrickPlay[];            // cards played so far in this trick
  leadSuit: Suit | null;               // suit of the first card played (null = not started)
  trumpSuit: Suit | null;              // trump for this round (null = no-trump)
  trumpCard: Card | null;              // the card that revealed trump (null for no-trump rounds)
  jokerDeclaration: JokerDeclaration | null; // set when Joker leads a trick
  currentTurnPlayerId: string;         // who must play next (bidding or playing)
  trickLeadPlayerId: string;           // who leads the first trick
  tricksWon: Record<string, number>;   // playerId → tricks won this round
  playerCardCounts: Record<string, number>; // playerId → cards still in hand (public)
  playerDarkFlags: Record<string, boolean>; // playerId → chose dark bid this round (normal rounds)
  isComplete: boolean;                 // true when all cards have been played
  lastTrick: LastTrick | null;         // snapshot of the most recently completed trick
}

export type PlayResult =
  | { ok: true }
  | { ok: false; error: string };

export type BidResult =
  | { ok: true }
  | { ok: false; error: string };

// ─── Joker declaration ────────────────────────────────────────────────────────

/**
 * Declared mode chosen when a player plays the Joker.
 *
 * Leading Joker (first card of trick):
 *   highest-suit — all other players must play their highest card of `suit`; Joker wins.
 *   lowest-suit  — all other players must play their lowest card of `suit`; normal winner.
 *   lay-down     — no suit declared; next non-Joker establishes lead suit; Joker does not win.
 *
 * Non-leading Joker (not first card):
 *   take      — Joker wins the trick.
 *   lay-down  — Joker is ignored; trick resolved normally among non-Joker cards.
 */
export interface JokerDeclaration {
  mode: 'highest-suit' | 'lowest-suit' | 'lay-down' | 'take';
  suit?: Suit;
}

// ─── Room / Lobby ─────────────────────────────────────────────────────────────

/** A player as seen in the lobby — only identity, no game state. */
export interface RoomPlayer {
  id: string;          // socket ID
  name: string;
  isConnected: boolean;
  /**
   * True only when the player explicitly left during an active game.
   * A temporarily-disconnected player (TCP drop / grace period) has
   * isConnected=false but isVacant=false and cannot be replaced.
   */
  isVacant?: boolean;
}

/** A player during active gameplay — extends RoomPlayer with cards and score. */
export interface Player extends RoomPlayer {
  hand: Card[];
  score: number;
}

export type GameStatus = 'waiting' | 'in-progress' | 'finished';

export const ROOM_MIN_PLAYERS = 3;
export const ROOM_MAX_PLAYERS = 8;

export interface GameRoom {
  id: string;
  code: string;
  ownerId: string;
  players: RoomPlayer[];
  status: GameStatus;
  gameSheet: GameSheet | null;
  activeRound: ActiveRound | null; // null while status === 'waiting'
  createdAt: number;
}

// ─── Socket acknowledgement result ────────────────────────────────────────────

export type RoomResult =
  | { ok: true; room: GameRoom }
  | { ok: false; error: string };

export type ReconnectResult =
  | { ok: true; room: GameRoom; hand: Card[] }
  | { ok: false; error: string };

// ─── Socket.io event contracts ────────────────────────────────────────────────

export interface ServerToClientEvents {
  'room:updated': (room: GameRoom) => void;
  'room:error': (message: string) => void;
  'hand:dealt': (hand: Card[]) => void; // private — sent to one socket only
}

export interface ClientToServerEvents {
  'room:create': (
    playerName: string,
    callback: (result: RoomResult) => void,
  ) => void;
  'room:join': (
    payload: { code: string; playerName: string },
    callback: (result: RoomResult) => void,
  ) => void;
  'room:leave': (callback: () => void) => void;
  'room:reconnect': (
    payload: { roomCode: string; playerName: string },
    callback: (result: ReconnectResult) => void,
  ) => void;
  'game:start': (callback: (result: RoomResult) => void) => void;
  'bid:submit': (tricks: number, isDark: boolean, callback: (result: BidResult) => void) => void;
  'card:play': (
    card: Card,
    declaration: JokerDeclaration | null,
    callback: (result: PlayResult) => void,
  ) => void;
}
