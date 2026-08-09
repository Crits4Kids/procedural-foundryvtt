const STAT_SKILLS = {
  mental: ["tech", "lab", "investigation"],
  physical: ["violence", "reflexes", "coordination"],
  social: ["cool", "intuition", "deception"]
};

/**
 * @param {object} params
 * @param {"mental"|"physical"|"social"} params.stat
 * @param {string} params.skillKey
 * @param {Record<string, number>} params.currentSkills - skillKey -> current value
 * @returns {{valid: boolean, reason?: string}}
 */
export function validateLevelUpChoice({ stat, skillKey, currentSkills }) {
  if (!stat || !(stat in STAT_SKILLS)) return { valid: false, reason: "noStat" };
  if (!skillKey || !STAT_SKILLS[stat].includes(skillKey)) return { valid: false, reason: "skillNotInStat" };
  if (currentSkills[skillKey] >= 3) return { valid: false, reason: "skillAtCap" };
  return { valid: true };
}
