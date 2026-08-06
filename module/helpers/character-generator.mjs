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

function rollOddsEvens(table, rng) {
  const selector = roll1d6(rng);
  return selector % 2 === 1 ? table.odds : table.evens;
}

/**
 * Quality/Quirk tables: 1d6 picks Odds vs Evens, then 2d6 (sum 2-12) picks
 * the entry within that table (data/qualities.json & data/quirks.json).
 */
export function rollQualityOrQuirk(table, rng) {
  const pool = rollOddsEvens(table, rng);
  const sum = roll1d6(rng) + roll1d6(rng);
  return pool[sum - 2];
}

/**
 * B-story/HQ tables: 1d6 picks Odds vs Evens, then 1d6 (1-6) picks the
 * entry within that table (data/bstories.json & data/hq.json).
 */
export function rollBStoryOrHq(table, rng) {
  const pool = rollOddsEvens(table, rng);
  const index = roll1d6(rng);
  return pool[index - 1];
}

/**
 * Agency Name: one 1d6 roll per table (data/agency-names.json), joined
 * with spaces, e.g. "Federal Investigation Squad".
 */
export function rollAgencyName(tables, rng) {
  const part1 = tables.table1[roll1d6(rng) - 1];
  const part2 = tables.table2[roll1d6(rng) - 1];
  const part3 = tables.table3[roll1d6(rng) - 1];
  return `${part1} ${part2} ${part3}`;
}

export function pickRandom(list, rng) {
  return list[Math.floor(rng() * list.length)];
}

/**
 * Runs the full PROCEDURAL! character-creation checklist and returns a
 * plain result object. This function touches no Foundry API — the caller
 * (module/documents/actor.mjs) is responsible for applying the result to
 * an actor.
 * @param {object} data
 * @param {Array<object>} data.tropes - data/tropes.json shape
 * @param {Array<object>} data.secondTalents - data/second-talents.json shape
 * @param {{odds: string[], evens: string[]}} data.qualities - data/qualities.json shape
 * @param {{odds: string[], evens: string[]}} data.quirks - data/quirks.json shape
 * @param {{odds: string[], evens: string[]}} data.bstories - data/bstories.json shape
 * @param {{odds: string[], evens: string[]}} data.hq - data/hq.json shape
 * @param {{table1: string[], table2: string[], table3: string[]}} data.agencyNames - data/agency-names.json shape
 * @param {() => number} [rng]
 */
export function generateTrope(data, rng = Math.random) {
  const { tropes, secondTalents, qualities, quirks, bstories, hq, agencyNames } = data;

  const rolledTrope = rollTrope(tropes, rng);
  const stats = applyGifted(rolledTrope, { ...rolledTrope.system.statBlock }, rng);
  const skills = divestSkills(stats, rolledTrope.system.statNotes, rng);

  return {
    trope: {
      ...rolledTrope,
      system: { ...rolledTrope.system, statBlock: stats }
    },
    stats,
    skills,
    quality: rollQualityOrQuirk(qualities, rng),
    quirk: rollQualityOrQuirk(quirks, rng),
    bStory: rollBStoryOrHq(bstories, rng),
    hq: rollBStoryOrHq(hq, rng),
    agencyName: rollAgencyName(agencyNames, rng),
    secondTalent: pickRandom(secondTalents, rng),
    rerunPoints: 1
  };
}
