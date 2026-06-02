import { describe, it, expect } from 'vitest';
import { canRevealHand } from '../canRevealHand';

const NO_BIDS: Record<string, number> = {};
const P1_BID:  Record<string, number> = { p1: 2 };

// ─── Dark round (Т) ──────────────────────────────────────────────────────────

describe('canRevealHand — dark round', () => {
  it('returns false regardless of turn or choice', () => {
    expect(canRevealHand('dark', 'p1', NO_BIDS, true,  'not-dark')).toBe(false);
    expect(canRevealHand('dark', 'p1', NO_BIDS, true,  'dark')).toBe(false);
    expect(canRevealHand('dark', 'p1', NO_BIDS, true,  null)).toBe(false);
    expect(canRevealHand('dark', 'p1', NO_BIDS, false, null)).toBe(false);
  });

  it('returns false even when the player has already bid', () => {
    expect(canRevealHand('dark', 'p1', P1_BID, false, null)).toBe(false);
  });
});

// ─── Non-dark, non-normal rounds ─────────────────────────────────────────────

describe('canRevealHand — no-trump round', () => {
  it('always returns true', () => {
    expect(canRevealHand('no-trump', 'p1', NO_BIDS, true,  null)).toBe(true);
    expect(canRevealHand('no-trump', 'p1', NO_BIDS, false, null)).toBe(true);
  });
});

describe('canRevealHand — misere / golden rounds', () => {
  it('returns true for misere (no bidding phase in practice)', () => {
    expect(canRevealHand('misere', 'p1', NO_BIDS, false, null)).toBe(true);
  });

  it('returns true for golden', () => {
    expect(canRevealHand('golden', 'p1', NO_BIDS, false, null)).toBe(true);
  });
});

// ─── Normal round ─────────────────────────────────────────────────────────────

describe('canRevealHand — normal round, not yet bid', () => {
  it('hides hand when not yet bid and not my turn', () => {
    expect(canRevealHand('normal', 'p2', NO_BIDS, false, null)).toBe(false);
  });

  it('hides hand when it is my turn but choice not yet made', () => {
    expect(canRevealHand('normal', 'p1', NO_BIDS, true, null)).toBe(false);
  });

  it('hides hand when it is my turn and I chose dark', () => {
    expect(canRevealHand('normal', 'p1', NO_BIDS, true, 'dark')).toBe(false);
  });

  it('reveals hand when it is my turn and I chose not-dark', () => {
    expect(canRevealHand('normal', 'p1', NO_BIDS, true, 'not-dark')).toBe(true);
  });

  it('hides hand when not my turn even after dark choice was made (p2 waiting)', () => {
    // p2 has not bid yet; it is p1's turn — p2 must not peek
    expect(canRevealHand('normal', 'p2', NO_BIDS, false, 'not-dark')).toBe(false);
  });

  it('hides hand when not my turn and I chose dark but have not bid', () => {
    expect(canRevealHand('normal', 'p2', NO_BIDS, false, 'dark')).toBe(false);
  });
});

describe('canRevealHand — normal round, already bid', () => {
  it('reveals hand once bid is submitted (regardless of dark choice)', () => {
    expect(canRevealHand('normal', 'p1', P1_BID, false, null)).toBe(true);
    expect(canRevealHand('normal', 'p1', P1_BID, false, 'dark')).toBe(true);
    expect(canRevealHand('normal', 'p1', P1_BID, false, 'not-dark')).toBe(true);
  });

  it('other players who have not bid yet remain hidden', () => {
    // p2 has not bid; p1 has
    expect(canRevealHand('normal', 'p2', P1_BID, false, null)).toBe(false);
  });
});
