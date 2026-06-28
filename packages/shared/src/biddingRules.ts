/**
 * Pure bidding-rule helpers for Rozpisnyi Poker.
 *
 * These functions are intentionally stateless so they can be used on both
 * the server (validation) and the client (computing displayable legal bids).
 */

/**
 * Returns true when the player is allowed to bid zero this round.
 *
 * Forbidden if the player's three most recent non-null bids are all 0
 * (four zeros in a row would be the fourth).
 *
 * @param bidHistory - this player's bids in previous rounds, index = round index,
 *                     null means the round was not played or bid not recorded.
 */
export function canBidZero(bidHistory: (number | null)[]): boolean {
  // Collect only the completed (non-null) bids in order
  const completed = bidHistory.filter((b): b is number => b !== null);
  const len = completed.length;
  if (len < 3) return true;
  return !(completed[len - 1] === 0 && completed[len - 2] === 0 && completed[len - 3] === 0);
}

/**
 * Returns true when submitting `bid` as the last bidder this round would make
 * the total equal to cardsPerPlayer — which is forbidden by the Rozpisnyi
 * Poker last-bidder rule.
 *
 * @param bid           - the bid being considered
 * @param currentTotal  - sum of all bids already submitted this round
 * @param cardsPerPlayer - cards dealt to each player this round
 */
export function violatesTotalRule(
  bid: number,
  currentTotal: number,
  cardsPerPlayer: number,
): boolean {
  return currentTotal + bid === cardsPerPlayer;
}

/**
 * Returns the sorted list of legal bid values (0..cardsPerPlayer) for the
 * current player after applying all Rozpisnyi Poker bidding restrictions.
 *
 * @param cardsPerPlayer - cards dealt this round
 * @param currentTotal   - sum of bids already submitted by other players this round
 * @param isLastBidder   - true when this player is the last to bid
 * @param bidHistory     - this player's bids in all previous rounds (null = not played)
 */
export function getLegalBids(
  cardsPerPlayer: number,
  currentTotal: number,
  isLastBidder: boolean,
  bidHistory: (number | null)[],
): number[] {
  const zeroBanned = !canBidZero(bidHistory);

  const bids = Array.from({ length: cardsPerPlayer + 1 }, (_, i) => i).filter(bid => {
    if (zeroBanned && bid === 0) return false;
    if (isLastBidder && violatesTotalRule(bid, currentTotal, cardsPerPlayer)) return false;
    return true;
  });

  // Emergency fallback: if all numeric bids are blocked, allow pass (0) to prevent deadlock.
  if (bids.length === 0) return [0];
  return bids;
}
