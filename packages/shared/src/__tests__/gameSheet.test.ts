import { describe, it, expect } from 'vitest';
import { generateGameSheet, maxCardsForCount } from '../gameSheet';

// ─── Expected totals ──────────────────────────────────────────────────────────
//
//  Formula: total = 2*(maxCards-1) + 5*playerCount
//
//  players │ maxCards │ ascending │ flat │ descending │ special (4×n) │ total
//  ────────┼──────────┼───────────┼──────┼────────────┼───────────────┼──────
//    3     │    11    │    10     │   3  │     10     │     12        │  35
//    4     │     8    │     7     │   4  │      7     │     16        │  34
//    5     │     6    │     5     │   5  │      5     │     20        │  35
//    6     │     5    │     4     │   6  │      4     │     24        │  38
//    7     │     4    │     3     │   7  │      3     │     28        │  41
//    8     │     4    │     3     │   8  │      3     │     32        │  46

const CASES = [
  [3, 11, 35],
  [4,  8, 34],
  [5,  6, 35],
  [6,  5, 38],
  [7,  4, 41],
  [8,  4, 46],
] as const;

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Expected cardsPerPlayer sequence for a given player count. */
function expectedCardSequence(players: number, maxCards: number): number[] {
  const seq: number[] = [];
  for (let c = 1; c < maxCards; c++) seq.push(c);                // ascending
  for (let i = 0; i < players; i++) seq.push(maxCards);          // flat
  for (let c = maxCards - 1; c >= 1; c--) seq.push(c);          // descending
  for (let i = 0; i < 4 * players; i++) seq.push(maxCards);     // 4 special types × playerCount
  return seq;
}

// ─── maxCardsForCount ─────────────────────────────────────────────────────────

describe('maxCardsForCount', () => {
  it.each(CASES)('%i players → maxCards %i', (players, maxCards) => {
    expect(maxCardsForCount(players)).toBe(maxCards);
  });
});

// ─── generateGameSheet — round count ─────────────────────────────────────────

describe('generateGameSheet — round count', () => {
  it.each(CASES)('%i players → %i rounds total', (players, _max, total) => {
    expect(generateGameSheet(players).rounds).toHaveLength(total);
  });
});

// ─── generateGameSheet — card sequence ───────────────────────────────────────

describe('generateGameSheet — card sequence', () => {
  it.each(CASES)('%i players → correct cardsPerPlayer sequence', (players, maxCards) => {
    const { rounds } = generateGameSheet(players);
    expect(rounds.map(r => r.cardsPerPlayer)).toEqual(expectedCardSequence(players, maxCards));
  });

  it.each(CASES)('%i players → normal round labels equal card count', (players) => {
    const { rounds } = generateGameSheet(players);
    rounds.filter(r => r.type === 'normal')
          .forEach(r => expect(r.label).toBe(String(r.cardsPerPlayer)));
  });
});

// ─── generateGameSheet — ascending / flat / descending ───────────────────────

describe('generateGameSheet — ascending / flat / descending structure', () => {
  it.each(CASES)('%i players → first round is 1 card (normal)', (players) => {
    const { rounds } = generateGameSheet(players);
    expect(rounds[0].cardsPerPlayer).toBe(1);
    expect(rounds[0].label).toBe('1');
    expect(rounds[0].type).toBe('normal');
  });

  it.each(CASES)('%i players → flat section has exactly playerCount rounds at maxCards', (players, maxCards) => {
    const { rounds } = generateGameSheet(players);
    const flat = rounds.filter(r => r.type === 'normal' && r.cardsPerPlayer === maxCards);
    expect(flat).toHaveLength(players);
  });

  it.each(CASES)('%i players → ascending mirrors descending', (players, maxCards) => {
    const { rounds } = generateGameSheet(players);
    const normal = rounds.filter(r => r.type === 'normal').map(r => r.cardsPerPlayer);
    const ascLen = maxCards - 1;
    const asc  = normal.slice(0, ascLen);
    const desc = normal.slice(ascLen + players);
    expect(desc).toEqual([...asc].reverse());
  });
});

// ─── generateGameSheet — special rounds ──────────────────────────────────────

describe('generateGameSheet — special rounds', () => {
  it.each(CASES)('%i players → total special rounds = 4 × playerCount', (players) => {
    const { rounds } = generateGameSheet(players);
    expect(rounds.filter(r => r.type !== 'normal')).toHaveLength(4 * players);
  });

  it.each(CASES)('%i players → each special type repeated playerCount times', (players) => {
    const { rounds } = generateGameSheet(players);
    const special = rounds.filter(r => r.type !== 'normal');
    expect(special.filter(r => r.type === 'no-trump')).toHaveLength(players);
    expect(special.filter(r => r.type === 'dark')).toHaveLength(players);
    expect(special.filter(r => r.type === 'misere')).toHaveLength(players);
    expect(special.filter(r => r.type === 'golden')).toHaveLength(players);
  });

  it.each(CASES)('%i players → special order is Б…Б Т…Т М…М З…З', (players) => {
    const { rounds } = generateGameSheet(players);
    const special = rounds.filter(r => r.type !== 'normal');
    expect(special.map(r => r.type)).toEqual([
      ...Array<string>(players).fill('no-trump'),
      ...Array<string>(players).fill('dark'),
      ...Array<string>(players).fill('misere'),
      ...Array<string>(players).fill('golden'),
    ]);
    expect(special.map(r => r.label)).toEqual([
      ...Array<string>(players).fill('Б'),
      ...Array<string>(players).fill('Т'),
      ...Array<string>(players).fill('М'),
      ...Array<string>(players).fill('З'),
    ]);
  });

  it.each(CASES)('%i players → special rounds use maxCards cards', (players, maxCards) => {
    const { rounds } = generateGameSheet(players);
    rounds.filter(r => r.type !== 'normal')
          .forEach(r => expect(r.cardsPerPlayer).toBe(maxCards));
  });
});

// ─── generateGameSheet — indices and initial state ───────────────────────────

describe('generateGameSheet — indices and initial state', () => {
  it.each(CASES)('%i players → round indices are 0-based sequential', (players) => {
    const { rounds } = generateGameSheet(players);
    rounds.forEach((r, i) => expect(r.index).toBe(i));
  });

  it('starts at currentRoundIndex 0', () => {
    expect(generateGameSheet(4).currentRoundIndex).toBe(0);
  });

  it('starts with empty scores array', () => {
    expect(generateGameSheet(4).scores).toHaveLength(0);
  });
});

// ─── generateGameSheet — exact sequence for 4 players ────────────────────────

describe('generateGameSheet — exact sequence for 4 players', () => {
  it('matches the reference: 1…7 | 8×4 | 7…1 | Б×4 Т×4 М×4 З×4', () => {
    const { rounds } = generateGameSheet(4);
    expect(rounds.map(r => r.label)).toEqual([
      '1','2','3','4','5','6','7',
      '8','8','8','8',
      '7','6','5','4','3','2','1',
      'Б','Б','Б','Б',
      'Т','Т','Т','Т',
      'М','М','М','М',
      'З','З','З','З',
    ]);
  });
});

// ─── generateGameSheet — boundary errors ─────────────────────────────────────

describe('generateGameSheet — boundary errors', () => {
  it('throws RangeError for playerCount < 3', () => {
    expect(() => generateGameSheet(2)).toThrow(RangeError);
  });

  it('throws RangeError for playerCount > 8', () => {
    expect(() => generateGameSheet(9)).toThrow(RangeError);
  });
});
