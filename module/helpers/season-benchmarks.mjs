const OUTCOME_POINTS = { successful: 2, neutral: 0, unsuccessful: -1 };

/**
 * @param {Array<{outcome: string}>} episodes
 * @returns {number} sum of point values for every episode with a set outcome
 */
export function computeRating(episodes) {
  return episodes.reduce((total, ep) => total + (OUTCOME_POINTS[ep.outcome] ?? 0), 0);
}

/**
 * @param {Array<{outcome: string}>} episodes
 * @returns {number} count of episodes with a non-empty outcome
 */
export function countRecordedEpisodes(episodes) {
  return episodes.filter(ep => ep.outcome !== "").length;
}
