/**
 * @param {Record<string, number>} contributions - actorId -> Rerun Points pledged
 * @param {number} cost - Rerun Points required (number of human players)
 * @returns {boolean} true if the pledged total exactly matches cost
 */
export function isValidPool(contributions, cost) {
  if (cost <= 0) return false;
  const total = Object.values(contributions).reduce((sum, n) => sum + (Number(n) || 0), 0);
  return total === cost;
}

/**
 * @param {Record<string, number>} contributions - actorId -> Rerun Points pledged
 * @param {Record<string, number>} available - actorId -> that actor's current Rerun Points
 * @returns {boolean} true if every pledge is between 0 and that actor's available points (missing actors fail)
 */
export function canAffordPledges(contributions, available) {
  return Object.entries(contributions).every(([actorId, amount]) => {
    const cap = available[actorId];
    return cap !== undefined && amount >= 0 && amount <= cap;
  });
}
