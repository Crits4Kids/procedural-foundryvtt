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
