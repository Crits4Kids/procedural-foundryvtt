const STAT_SKILLS = {
  mental: ["tech", "lab", "investigation"],
  physical: ["violence", "reflexes", "coordination"],
  social: ["cool", "intuition", "deception"]
};

const CAPPED_SKILLS = { tech: 2, lab: 2 };

function roll1d6(rng) {
  return Math.floor(rng() * 6) + 1;
}

/**
 * @param {Array<object>} tropes - 11 entries ordered for 2d6 sums 2-12 (same order as data/tropes.json)
 * @param {() => number} rng
 */
export function rollTrope(tropes, rng) {
  const sum = roll1d6(rng) + roll1d6(rng);
  return tropes[sum - 2];
}

/**
 * Rookie's "Gifted" Talent lets the player add +3 to a stat of their choice
 * during character creation. Picks one at random when the rolled Trope has
 * that Talent; returns stats unchanged otherwise.
 * @param {{system: {talentName: string}}} trope
 * @param {{mental: number, physical: number, social: number}} stats
 * @param {() => number} rng
 */
export function applyGifted(trope, stats, rng) {
  if (trope.system.talentName !== "Gifted") return stats;
  const keys = ["mental", "physical", "social"];
  const picked = keys[Math.floor(rng() * keys.length)];
  return { ...stats, [picked]: stats[picked] + 3 };
}

function parseStatNoteMinimum(statNotes) {
  const match = /at least (\d+) in (Tech|Lab)/i.exec(statNotes ?? "");
  if (!match) return null;
  return { skill: match[2].toLowerCase(), minimum: Number(match[1]) };
}

function divestStat(statName, points, statNotes, rng) {
  const skillKeys = STAT_SKILLS[statName];
  const values = Object.fromEntries(skillKeys.map(key => [key, 0]));
  let remaining = points;

  const noteMin = parseStatNoteMinimum(statNotes);
  if (noteMin && skillKeys.includes(noteMin.skill)) {
    const applied = Math.min(noteMin.minimum, remaining);
    values[noteMin.skill] = applied;
    remaining -= applied;
  }

  const isEligible = (skill) => {
    const cap = CAPPED_SKILLS[skill];
    if (cap === undefined) return true;
    if (noteMin && noteMin.skill === skill) return true;
    return values[skill] < cap;
  };

  while (remaining > 0) {
    const eligible = skillKeys.filter(isEligible);
    if (eligible.length === 0) break; // defensive: no Trope in current data can exhaust this
    const picked = eligible[Math.floor(rng() * eligible.length)];
    values[picked] += 1;
    remaining -= 1;
  }

  return values;
}

/**
 * Distributes each stat's points across its 3 skills, respecting the
 * Tech/Lab cap of 2 (waived for a skill named in statNotes, e.g.
 * "At least 3 in Lab") and applying that named minimum first.
 * @param {{mental: number, physical: number, social: number}} stats
 * @param {string} statNotes
 * @param {() => number} rng
 */
export function divestSkills(stats, statNotes, rng) {
  return {
    ...divestStat("mental", stats.mental, statNotes, rng),
    ...divestStat("physical", stats.physical, statNotes, rng),
    ...divestStat("social", stats.social, statNotes, rng)
  };
}
