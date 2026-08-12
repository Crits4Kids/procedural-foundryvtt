/**
 * @param {Array<{status: string}>} evidence
 * @param {{culpritEscaped?: boolean}} [options] - culpritEscaped adds a fixed 2 to the
 *   bad count, per the rulebook's "add 2 pieces of bad evidence" arrest-phase-escape rule.
 * @returns {{good: number, bad: number, tied: boolean}}
 */
export function tallyEvidence(evidence, { culpritEscaped = false } = {}) {
  const good = evidence.filter(e => e.status === "good").length;
  const bad = evidence.filter(e => e.status === "bad").length + (culpritEscaped ? 2 : 0);
  return { good, bad, tied: good === bad && good + bad > 0 };
}
