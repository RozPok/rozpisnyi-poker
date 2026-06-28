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

  it('returns true with two consecutive zeros (limit is now 3)', () => {
    expect(canBidZero([0, 0])).toBe(true);
  });

  it('returns true with two consecutive zeros in a longer history', () => {
    expect(canBidZero([1, 2, 3, 0, 0])).toBe(true);
  });

  it('returns false when last three completed bids are all zero', () => {
    expect(canBidZero([0, 0, 0])).toBe(false);
  });

  it('returns false when last three completed bids are all zero in a longer history', () => {
    expect(canBidZero([1, 2, 0, 0, 0])).toBe(false);
  });

  it('returns true after breaking the streak with a non-zero bid', () => {
    expect(canBidZero([0, 0, 0, 1])).toBe(true);
    expect(canBidZero([0, 0, 0, 1, 0])).toBe(true);
  });

  it('ignores null entries (rounds not yet played)', () => {
    // null entries should be skipped; only three real zeros in a row matter
    expect(canBidZero([null, 0, null, 0])).toBe(true);
    expect(canBidZero([null, 0, null, 0, null, 0])).toBe(false);
  });

  it('does not count a null as a zero', () => {
    expect(canBidZero([0, null])).toBe(true);
    expect(canBidZero([null, 0])).toBe(true);
    expect(canBidZero([null, null])).toBe(true);
  });

  it('pass streak limit is 3: three consecutive passes are allowed, fourth is blocked', () => {
    expect(canBidZero([0, 0, 0])).toBe(false);       // 3rd already blocked → false
    expect(canBidZero([0, 0])).toBe(true);            // 2 in a row → still allowed
    expect(canBidZero([1, 0, 0, 0])).toBe(false);    // last 3 are zero
    expect(canBidZero([0, 0, 0, 1, 0, 0])).toBe(true); // streak broken by 1
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

  it('excludes 0 when zero-ban applies (three consecutive zeros)', () => {
    expect(getLegalBids(5, 0, false, [0, 0, 0])).toEqual([1, 2, 3, 4, 5]);
  });

  it('does NOT exclude 0 with only two consecutive zeros (limit is 3)', () => {
    expect(getLegalBids(5, 0, false, [0, 0])).toContain(0);
  });

  it('applies both rules simultaneously', () => {
    // zero-banned (three zeros) → remove 0; last-bidder: 1+4=5=cardsPerPlayer → remove 4
    expect(getLegalBids(5, 1, true, [0, 0, 0])).toEqual([1, 2, 3, 5]);
  });

  it('only one legal bid remains when both rules are tight', () => {
    // cardsPerPlayer=2, total=1, last bidder, zero-banned (three zeros)
    // all=[0,1,2], minus 0 (zero-ban), minus 1 (1+1=2=cardsPerPlayer) → [2]
    expect(getLegalBids(2, 1, true, [0, 0, 0])).toEqual([2]);
  });

  it('returns [0] as emergency fallback when no numeric bid is legal', () => {
    // cardsPerPlayer=1, total=0, last bidder, zero-banned (three zeros)
    // all=[0,1], minus 0 (zero-ban), minus 1 (0+1=1) → [] → fallback [0]
    expect(getLegalBids(1, 0, true, [0, 0, 0])).toEqual([0]);
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
    const legal = getLegalBids(8, 3, true, [0, 0, 0]);
    // forbidden by total: 5 (3+5=8); zero-banned (three zeros): 0
    expect(legal).toContain(1);
    expect(legal).toContain(4);
    expect(legal).toContain(6);
    expect(legal).not.toContain(0);
    expect(legal).not.toContain(5);
  });

  it('returns sorted ascending list', () => {
    const legal = getLegalBids(5, 2, true, [0, 0, 0]);
    expect(legal).toEqual([...legal].sort((a, b) => a - b));
  });

  // ── Special-round regression: getLegalBids must return a non-empty list
  //    for the first bidder in all round types that have a bidding phase.
  //    (no-trump, dark, and normal rounds all call getLegalBids with the same
  //    parameters; misere/golden skip bidding entirely on the server.)

  it('no-trump round: first bidder gets full range 0..N', () => {
    // no-trump has the same bidding mechanics as normal/dark
    expect(getLegalBids(5, 0, false, [])).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('no-trump round: last bidder cannot make total equal cardsPerPlayer', () => {
    expect(getLegalBids(5, 3, true, [])).not.toContain(2);
    expect(getLegalBids(5, 3, true, [])).toEqual([0, 1, 3, 4, 5]);
  });

  it('dark round: first bidder with no history gets full range', () => {
    expect(getLegalBids(7, 0, false, [])).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('dark round: zero-ban applies the same as in normal rounds (requires three zeros)', () => {
    expect(getLegalBids(7, 0, false, [0, 0, 0])).not.toContain(0);
    expect(getLegalBids(7, 0, false, [0, 0])).toContain(0);
  });

  it('first bidder always gets at least one legal bid (no stuck state)', () => {
    // Exhaustively check cardsPerPlayer 1..11 for first bidder
    for (let n = 1; n <= 11; n++) {
      const bids = getLegalBids(n, 0, false, []);
      expect(bids.length).toBeGreaterThan(0);
    }
  });

  it('last bidder always gets at least one legal bid when total < cardsPerPlayer', () => {
    // If currentTotal < cardsPerPlayer, the forbidden value is cardsPerPlayer-total
    // which may still leave other options open
    for (let n = 2; n <= 11; n++) {
      // Total = 0, last bidder: forbidden = n; still has 0..n-1 available
      const bids = getLegalBids(n, 0, true, []);
      expect(bids.length).toBeGreaterThan(0);
    }
  });

  // ── Deadlock-prevention tests ─────────────────────────────────────────────

  it('pass (0) is allowed as emergency fallback when no numeric bid is legal', () => {
    // zero-banned + last bidder with only forbidden slot left → fallback to [0]
    expect(getLegalBids(1, 0, true, [0, 0, 0])).toEqual([0]);
  });

  it('bidding never returns an empty list regardless of constraints', () => {
    // Exhaustively verify across common game scenarios (n=1..11, various totals, zero-ban on)
    for (let n = 1; n <= 11; n++) {
      for (let total = 0; total <= n; total++) {
        const bids = getLegalBids(n, total, true, [0, 0, 0]);
        expect(bids.length).toBeGreaterThan(0);
      }
    }
  });

  it('4th consecutive pass is normally blocked (zero-ban active)', () => {
    // After three zeros, zero is banned; normal bids must exist to keep play flowing
    const bids = getLegalBids(5, 0, false, [0, 0, 0]);
    expect(bids).not.toContain(0);
    expect(bids.length).toBeGreaterThan(0); // non-zero bids still available
  });

  it('4th pass is allowed only as emergency when zero is the sole option', () => {
    // cardsPerPlayer=1, last bidder, zero-banned: no numeric bid survives → pass allowed
    const bids = getLegalBids(1, 0, true, [0, 0, 0]);
    expect(bids).toContain(0);
    expect(bids).toEqual([0]);
  });
});
