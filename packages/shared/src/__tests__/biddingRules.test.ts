import { describe, it, expect } from 'vitest';
import { canBidZero, getLegalBids, violatesTotalRule } from '../biddingRules';

// ─── canBidZero ───────────────────────────────────────────────────────────────

describe('canBidZero', () => {
  it('returns true with empty history', () => {
    expect(canBidZero([])).toBe(true);
  });

  it('returns true with one entry', () => {
    expect(canBidZero([0])).toBe(true);
  });

  it('returns true when last two completed bids are not both zero', () => {
    expect(canBidZero([0, 1])).toBe(true);
    expect(canBidZero([1, 0])).toBe(true);
    expect(canBidZero([1, 1])).toBe(true);
  });

  it('returns false when last two completed bids are both zero', () => {
    expect(canBidZero([0, 0])).toBe(false);
  });

  it('returns false when last two completed bids are both zero in a longer history', () => {
    expect(canBidZero([1, 2, 3, 0, 0])).toBe(false);
  });

  it('returns true after breaking the streak with a non-zero bid', () => {
    expect(canBidZero([0, 0, 1])).toBe(true);
    expect(canBidZero([0, 0, 1, 0])).toBe(true);
  });

  it('ignores null entries (rounds not yet played)', () => {
    // null entries should be skipped; only two real zeros in a row matter
    expect(canBidZero([null, 0, null, 0])).toBe(false);
  });

  it('does not count a null as a zero', () => {
    expect(canBidZero([0, null])).toBe(true);
    expect(canBidZero([null, 0])).toBe(true);
    expect(canBidZero([null, null])).toBe(true);
  });

  it('three consecutive zeros: last two are zero → false', () => {
    expect(canBidZero([0, 0, 0])).toBe(false);
  });
});

// ─── violatesTotalRule ────────────────────────────────────────────────────────

describe('violatesTotalRule', () => {
  it('returns true when bid + total equals cardsPerPlayer', () => {
    expect(violatesTotalRule(3, 2, 5)).toBe(true);
    expect(violatesTotalRule(0, 5, 5)).toBe(true);
    expect(violatesTotalRule(5, 0, 5)).toBe(true);
  });

  it('returns false when bid + total is less than cardsPerPlayer', () => {
    expect(violatesTotalRule(2, 2, 5)).toBe(false);
    expect(violatesTotalRule(0, 0, 5)).toBe(false);
  });

  it('returns false when bid + total exceeds cardsPerPlayer', () => {
    expect(violatesTotalRule(4, 2, 5)).toBe(false);
    expect(violatesTotalRule(5, 1, 5)).toBe(false);
  });

  it('handles edge case of cardsPerPlayer = 1', () => {
    expect(violatesTotalRule(1, 0, 1)).toBe(true);
    expect(violatesTotalRule(0, 1, 1)).toBe(true); // 0+1=1
    expect(violatesTotalRule(0, 0, 1)).toBe(false);
  });
});

// ─── getLegalBids ─────────────────────────────────────────────────────────────

describe('getLegalBids', () => {
  it('returns 0..N for first bidder with no history', () => {
    expect(getLegalBids(5, 0, false, [])).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('excludes the total-violating bid for the last bidder', () => {
    // forbidden = 2 because 3 + 2 = 5
    expect(getLegalBids(5, 3, true, [])).toEqual([0, 1, 3, 4, 5]);
  });

  it('excludes 0 when zero-ban applies', () => {
    expect(getLegalBids(5, 0, false, [0, 0])).toEqual([1, 2, 3, 4, 5]);
  });

  it('applies both rules simultaneously', () => {
    // zero-banned → remove 0; last-bidder: 1+4=5=cardsPerPlayer → remove 4
    expect(getLegalBids(5, 1, true, [0, 0])).toEqual([1, 2, 3, 5]);
  });

  it('only one legal bid remains when both rules are tight', () => {
    // cardsPerPlayer=2, total=1, last bidder, zero-banned
    // all=[0,1,2], minus 0 (zero-ban), minus 1 (1+1=2=cardsPerPlayer) → [2]
    expect(getLegalBids(2, 1, true, [0, 0])).toEqual([2]);
  });

  it('returns empty list when no legal bid exists', () => {
    // cardsPerPlayer=1, total=0, last bidder, zero-banned
    // all=[0,1], minus 0 (zero-ban), minus 1 (0+1=1) → []
    expect(getLegalBids(1, 0, true, [0, 0])).toEqual([]);
  });

  it('does not apply total rule when not the last bidder', () => {
    // even if a bid would make total = cardsPerPlayer it is allowed for non-last bidder
    expect(getLegalBids(5, 0, false, [])).toContain(5);
  });

  it('total rule excludes 0 when currentTotal equals cardsPerPlayer', () => {
    // 5+0=5=cardsPerPlayer
    expect(getLegalBids(5, 5, true, [])).not.toContain(0);
    expect(getLegalBids(5, 5, true, [])).toEqual([1, 2, 3, 4, 5]);
  });

  it('preserves values outside both restrictions', () => {
    const legal = getLegalBids(8, 3, true, [0, 0]);
    // forbidden by total: 5 (3+5=8); zero-banned: 0
    expect(legal).toContain(1);
    expect(legal).toContain(4);
    expect(legal).toContain(6);
    expect(legal).not.toContain(0);
    expect(legal).not.toContain(5);
  });

  it('returns sorted ascending list', () => {
    const legal = getLegalBids(5, 2, true, [0, 0]);
    expect(legal).toEqual([...legal].sort((a, b) => a - b));
  });
});
