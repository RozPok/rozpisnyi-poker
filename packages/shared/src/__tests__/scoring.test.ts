import { describe, it, expect } from 'vitest';
import { computeScore } from '../scoring';

// ─── normal / no-trump ────────────────────────────────────────────────────────

describe.each(['normal', 'no-trump'] as const)('computeScore — %s', type => {
  // Rule 1: bid=0, actual=0 → +5
  it('bid=0 actual=0 → +5', () => {
    expect(computeScore(type, 0, 0)).toBe(5);
  });

  // Rule 2: bid=0, actual>0 → +actual
  it('bid=0 actual=1 → +1', () => {
    expect(computeScore(type, 0, 1)).toBe(1);
  });

  it('bid=0 actual=4 → +4', () => {
    expect(computeScore(type, 0, 4)).toBe(4);
  });

  // Rule 3: bid>0, actual===bid → +10*bid
  it('bid=1 actual=1 → +10', () => {
    expect(computeScore(type, 1, 1)).toBe(10);
  });

  it('bid=3 actual=3 → +30', () => {
    expect(computeScore(type, 3, 3)).toBe(30);
  });

  it('bid=8 actual=8 → +80', () => {
    expect(computeScore(type, 8, 8)).toBe(80);
  });

  // Rule 4: bid>0, actual>bid → +actual
  it('bid=2 actual=4 → +4', () => {
    expect(computeScore(type, 2, 4)).toBe(4);
  });

  it('bid=1 actual=3 → +3', () => {
    expect(computeScore(type, 1, 3)).toBe(3);
  });

  // Rule 5: bid>0, actual<bid → -10*(bid-actual)
  it('bid=3 actual=1 → -20', () => {
    expect(computeScore(type, 3, 1)).toBe(-20);
  });

  it('bid=3 actual=0 → -30', () => {
    expect(computeScore(type, 3, 0)).toBe(-30);
  });

  it('bid=5 actual=2 → -30', () => {
    expect(computeScore(type, 5, 2)).toBe(-30);
  });

  it('bid=1 actual=0 → -10', () => {
    expect(computeScore(type, 1, 0)).toBe(-10);
  });
});

// ─── dark ─────────────────────────────────────────────────────────────────────
//
// Scoring rules:
//   bid=0, taken=0        → +5
//   bid=0, taken>0        → +taken
//   bid>0, taken===bid    → +20 × bid
//   bid>0, taken>bid      → +taken  (overtrick, no multiplier)
//   bid>0, taken<bid      → -20 × (bid − taken)

describe('computeScore — dark', () => {
  // ── bid = 0 ──────────────────────────────────────────────────────────────────

  it('0T → 0 = +5', () => {
    expect(computeScore('dark', 0, 0)).toBe(5);
  });

  it('0T → 1 = +1', () => {
    expect(computeScore('dark', 0, 1)).toBe(1);
  });

  it('0T → 2 = +2', () => {
    expect(computeScore('dark', 0, 2)).toBe(2);
  });

  // ── bid > 0, exact ───────────────────────────────────────────────────────────

  it('1T → 1 = +20', () => {
    expect(computeScore('dark', 1, 1)).toBe(20);
  });

  it('2T → 2 = +40', () => {
    expect(computeScore('dark', 2, 2)).toBe(40);
  });

  it('5T → 5 = +100', () => {
    expect(computeScore('dark', 5, 5)).toBe(100);
  });

  // ── bid > 0, overtrick (+taken, no multiplier) ───────────────────────────────

  it('2T → 3 = +3', () => {
    expect(computeScore('dark', 2, 3)).toBe(3);
  });

  it('3T → 5 = +5', () => {
    expect(computeScore('dark', 3, 5)).toBe(5);
  });

  // ── bid > 0, undertrick (-20 per missing trick) ──────────────────────────────

  it('2T → 1 = -20', () => {
    expect(computeScore('dark', 2, 1)).toBe(-20);
  });

  it('2T → 0 = -40', () => {
    expect(computeScore('dark', 2, 0)).toBe(-40);
  });

  it('5T → 3 = -40', () => {
    expect(computeScore('dark', 5, 3)).toBe(-40);
  });

  it('3T → 1 = -40', () => {
    expect(computeScore('dark', 3, 1)).toBe(-40);
  });

  it('3T → 0 = -60', () => {
    expect(computeScore('dark', 3, 0)).toBe(-60);
  });

  // ── null bid treated as 0 ────────────────────────────────────────────────────

  it('null bid treated as 0 (dark, actual=0) → +5', () => {
    expect(computeScore('dark', null, 0)).toBe(5);
  });

  it('null bid treated as 0 (dark, actual=2) → +2', () => {
    expect(computeScore('dark', null, 2)).toBe(2);
  });
});

// ─── misere ───────────────────────────────────────────────────────────────────

describe('computeScore — misere', () => {
  it('actual=0 → +50', () => {
    expect(computeScore('misere', null, 0)).toBe(50);
  });

  it('actual=1 → -10', () => {
    expect(computeScore('misere', null, 1)).toBe(-10);
  });

  it('actual=3 → -30', () => {
    expect(computeScore('misere', null, 3)).toBe(-30);
  });

  it('actual=8 → -80', () => {
    expect(computeScore('misere', null, 8)).toBe(-80);
  });

  it('ignores bid value if provided', () => {
    expect(computeScore('misere', 5, 0)).toBe(50);
    expect(computeScore('misere', 5, 2)).toBe(-20);
  });
});

// ─── golden ───────────────────────────────────────────────────────────────────

describe('computeScore — golden', () => {
  it('actual=0 → -50', () => {
    expect(computeScore('golden', null, 0)).toBe(-50);
  });

  it('actual=1 → +10', () => {
    expect(computeScore('golden', null, 1)).toBe(10);
  });

  it('actual=3 → +30', () => {
    expect(computeScore('golden', null, 3)).toBe(30);
  });

  it('actual=8 → +80', () => {
    expect(computeScore('golden', null, 8)).toBe(80);
  });

  it('ignores bid value if provided', () => {
    expect(computeScore('golden', 0, 0)).toBe(-50);
    expect(computeScore('golden', 0, 4)).toBe(40);
  });
});
