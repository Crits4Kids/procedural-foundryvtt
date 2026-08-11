/**
 * @param {Array<{status: string}>} evidence
 * @returns {{good: number, bad: number, tied: boolean}}
 */
export function tallyEvidence(evidence) {
  const good = evidence.filter(e => e.status === "good").length;
  const bad = evidence.filter(e => e.status === "bad").length;
  return { good, bad, tied: good === bad && good + bad > 0 };
}
