import { test } from "node:test";
import assert from "node:assert/strict";
import { rollTrope, applyGifted, divestSkills, rollQualityOrQuirk, rollBStoryOrHq, rollAgencyName, pickRandom, generateTrope, validateSkillAllocation, rollNpcPersonality, parseNpcName } from "./character-generator.mjs";

function queue(values) {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i += 1;
    return (v - 1) / 6;
  };
}

function fixedRng(values) {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i += 1;
    return v;
  };
}

function tropeFixture(name, statBlock, statNotes, talentName) {
  return {
    name,
    img: "icons/svg/mystery-man.svg",
    system: { statBlock, statNotes, talentName, talentDescription: `${talentName} description`, talentUsesPerAct: 1 }
  };
}

const ROOKIE = tropeFixture("Rookie", { mental: 1, physical: 1, social: 1 }, "", "Gifted");
const CORONER = tropeFixture("Coroner", { mental: 5, physical: 1, social: 0 }, "At least 3 in Lab", "Pathologist");
const HARD_BOILED = tropeFixture("Hard-boiled", { mental: 2, physical: 3, social: 1 }, "", "Quick on the Draw");
const SHOT_CALLER = tropeFixture("Shot-caller", { mental: 2, physical: 2, social: 2 }, "", "Experienced");
const TECHIE = tropeFixture("Techie", { mental: 5, physical: 0, social: 1 }, "At least 3 in Tech", "Hack Attack");
const LAB_TECH = tropeFixture("Lab Tech", { mental: 5, physical: 0, social: 1 }, "At least 3 in Lab", "Enhance!");
const STREETWISE = tropeFixture("Streetwise", { mental: 1, physical: 2, social: 3 }, "", "Connected");
const EX_SPOOK = tropeFixture("Ex-Spook", { mental: 1, physical: 4, social: 1 }, "", "Shadow in the Dark");
const PROFILER = tropeFixture("Profiler", { mental: 2, physical: 1, social: 3 }, "", "Inside Your Mind");
const LEGAL_LIAISON = tropeFixture("Legal Liaison", { mental: 3, physical: 0, social: 3 }, "", "Legalese");
const SHADES = tropeFixture("Shades", { mental: 0, physical: 3, social: 3 }, "", "Irresistible");

const FIXTURE_TROPES = [
  ROOKIE, CORONER, HARD_BOILED, SHOT_CALLER, TECHIE, LAB_TECH,
  STREETWISE, EX_SPOOK, PROFILER, LEGAL_LIAISON, SHADES
];

test("rollTrope picks the Trope at 2d6 sum 2 (low boundary)", () => {
  const rng = queue([1, 1]);
  assert.equal(rollTrope(FIXTURE_TROPES, rng).name, "Rookie");
});

test("rollTrope picks the Trope at 2d6 sum 12 (high boundary)", () => {
  const rng = queue([6, 6]);
  assert.equal(rollTrope(FIXTURE_TROPES, rng).name, "Shades");
});

test("rollTrope picks the Trope at a middle sum", () => {
  const rng = queue([3, 4]); // sum 7
  assert.equal(rollTrope(FIXTURE_TROPES, rng).name, "Lab Tech");
});

test("applyGifted adds +3 to the randomly picked stat when the Talent is Gifted", () => {
  const rng = fixedRng([0.99]); // floor(0.99*3) = 2 -> "social"
  const result = applyGifted(ROOKIE, { mental: 1, physical: 1, social: 1 }, rng);
  assert.deepEqual(result, { mental: 1, physical: 1, social: 4 });
});

test("applyGifted leaves stats unchanged for a non-Gifted Talent", () => {
  const rng = fixedRng([0.1]);
  const result = applyGifted(CORONER, { mental: 5, physical: 1, social: 0 }, rng);
  assert.deepEqual(result, { mental: 5, physical: 1, social: 0 });
});

test("divestSkills caps Tech and Lab at 2 with no statNotes minimum", () => {
  const rng = fixedRng([0]); // always picks the first eligible skill
  const skills = divestSkills({ mental: 5, physical: 0, social: 0 }, "", rng);
  assert.deepEqual(skills, {
    tech: 2, lab: 2, investigation: 1,
    violence: 0, reflexes: 0, coordination: 0,
    cool: 0, intuition: 0, deception: 0
  });
});

test("divestSkills applies an 'at least N in Lab' minimum before random distribution", () => {
  const rng = fixedRng([0]);
  const skills = divestSkills({ mental: 5, physical: 0, social: 0 }, "At least 3 in Lab", rng);
  assert.deepEqual(skills, {
    tech: 2, lab: 3, investigation: 0,
    violence: 0, reflexes: 0, coordination: 0,
    cool: 0, intuition: 0, deception: 0
  });
});

test("divestSkills waives the cap for the skill named in statNotes", () => {
  const rng = fixedRng([0]);
  const skills = divestSkills({ mental: 5, physical: 0, social: 0 }, "At least 3 in Tech", rng);
  assert.deepEqual(skills, {
    tech: 5, lab: 0, investigation: 0,
    violence: 0, reflexes: 0, coordination: 0,
    cool: 0, intuition: 0, deception: 0
  });
});

test("divestSkills leaves Physical skills uncapped", () => {
  const rng = fixedRng([0]);
  const skills = divestSkills({ mental: 0, physical: 3, social: 0 }, "", rng);
  assert.deepEqual(skills, {
    tech: 0, lab: 0, investigation: 0,
    violence: 3, reflexes: 0, coordination: 0,
    cool: 0, intuition: 0, deception: 0
  });
});

test("Gifted's stat bonus flows into skill divestment", () => {
  const giftRng = fixedRng([0.5]); // floor(0.5*3) = 1 -> "physical"
  const stats = applyGifted(ROOKIE, { mental: 1, physical: 1, social: 1 }, giftRng);
  assert.deepEqual(stats, { mental: 1, physical: 4, social: 1 });

  const divestRng = fixedRng([0]);
  const skills = divestSkills(stats, ROOKIE.system.statNotes, divestRng);
  assert.deepEqual(skills, {
    tech: 1, lab: 0, investigation: 0,
    violence: 4, reflexes: 0, coordination: 0,
    cool: 1, intuition: 0, deception: 0
  });
});

const QUALITIES_FIXTURE = {
  odds: ["Plucky", "Dogged", "Tough", "Honest", "Efficient", "Clever", "Shrewd", "Kind", "Astute", "Empathetic", "Foodie"],
  evens: ["Loyal", "Relaxed", "Zen", "Wise", "Unflappable", "Crafty", "Diligent", "Studious", "Steadfast", "Relentless", "Uncompromising"]
};

const QUIRKS_FIXTURE = {
  odds: ["Impatient", "Condescending", "Hungry", "Oral fixation", "Procrastinator", "Shy", "Colorblind", "Superfan", "Workaholic", "Silly", "Distracted"],
  evens: ["Irritable", "Phobic", "Narcissist", "Impulsive", "Luddite", "Blowhard", "Obsessed", "Science-denier", "Geek", "Perfectionist", "Overly religious"]
};

const BSTORIES_FIXTURE = {
  odds: ["Puppy chaos", "Viral fame", "Wild twin", "Magic class finals", "High school reunion", "Old sports injury"],
  evens: ["Old flame", "Teen caught with drugs", "Reporter digging", "Partner wants out", "Struggling side business", "Corrupt buddy retaliating"]
};

const HQ_FIXTURE = {
  odds: ["Former funeral parlor", "Former beauty salon", "Luxury RV", "Former firehouse", "Museum basement", "Haunted house"],
  evens: ["Boring office suite", "Above a diner", "Ancient church", "Next to a yoga studio", "Restored farmhouse", "Former pizza restaurant"]
};

const AGENCY_NAMES_FIXTURE = {
  table1: ["Federal", "Bureau of", "Department of", "National", "State", "United Nations"],
  table2: ["Crime", "Investigation", "Criminal Science", "Homicide", "Murder", "Justice"],
  table3: ["Squad", "Agency", "Department", "Investigators", "Force", "Organization"]
};

const SECOND_TALENTS_FIXTURE = [
  { name: "Sentinel", img: "icons/svg/mystery-man.svg", system: { description: "Sentinel description", usesPerAct: 1 } },
  { name: "Drama Queen", img: "icons/svg/mystery-man.svg", system: { description: "Drama Queen description", usesPerAct: 1 } }
];

const DESK_ITEMS_FIXTURE = [
  { name: "A Sad Little Cactus", img: "icons/svg/mystery-man.svg", system: { description: "Cactus description" } },
  { name: "The Lucky Pen", img: "icons/svg/mystery-man.svg", system: { description: "Pen description" } }
];

test("rollQualityOrQuirk selects the Odds table on an odd 1d6 and looks up by 2d6 sum", () => {
  const rng = queue([1, 3, 4]); // 1 -> odd/Odds; then 3+4=7
  assert.equal(rollQualityOrQuirk(QUALITIES_FIXTURE, rng), "Clever");
});

test("rollQualityOrQuirk selects the Evens table on an even 1d6", () => {
  const rng = queue([2, 5, 5]); // 2 -> even/Evens; then 5+5=10
  assert.equal(rollQualityOrQuirk(QUALITIES_FIXTURE, rng), "Steadfast");
});

test("rollBStoryOrHq selects the Odds (small stakes) table and 1d6 entry", () => {
  const rng = queue([3, 4]); // 3 -> odd/Odds; then entry 4
  assert.equal(rollBStoryOrHq(BSTORIES_FIXTURE, rng), "Magic class finals");
});

test("rollBStoryOrHq selects the Evens (large stakes) table and 1d6 entry", () => {
  const rng = queue([6, 2]); // 6 -> even/Evens; then entry 2
  assert.equal(rollBStoryOrHq(BSTORIES_FIXTURE, rng), "Teen caught with drugs");
});

test("rollAgencyName concatenates one 1d6 pick per table in order", () => {
  const rng = queue([1, 2, 5]);
  assert.equal(rollAgencyName(AGENCY_NAMES_FIXTURE, rng), "Federal Investigation Force");
});

test("pickRandom returns the entry at the computed index", () => {
  const rng = fixedRng([0.6]);
  assert.equal(pickRandom(["a", "b", "c", "d"], rng), "c");
});

test("generateTrope wires every roll together into one result", () => {
  const rng = fixedRng([0]); // every rng() call returns 0 -> always the first option/index

  const result = generateTrope({
    tropes: FIXTURE_TROPES,
    secondTalents: SECOND_TALENTS_FIXTURE,
    qualities: QUALITIES_FIXTURE,
    quirks: QUIRKS_FIXTURE,
    bstories: BSTORIES_FIXTURE,
    hq: HQ_FIXTURE,
    agencyNames: AGENCY_NAMES_FIXTURE,
    deskItems: DESK_ITEMS_FIXTURE
  }, rng);

  assert.equal(result.trope.name, "Rookie");
  assert.equal(result.trope.system.talentName, "Gifted");
  assert.deepEqual(result.trope.system.statBlock, { mental: 4, physical: 1, social: 1 });
  assert.deepEqual(result.stats, { mental: 4, physical: 1, social: 1 });
  assert.deepEqual(result.skills, {
    tech: 2, lab: 2, investigation: 0,
    violence: 1, reflexes: 0, coordination: 0,
    cool: 1, intuition: 0, deception: 0
  });
  assert.equal(result.quality, "Plucky");
  assert.equal(result.quirk, "Impatient");
  assert.equal(result.bStory, "Puppy chaos");
  assert.equal(result.hq, "Former funeral parlor");
  assert.equal(result.agencyName, "Federal Crime Squad");
  assert.equal(result.secondTalent.name, "Sentinel");
  assert.equal(result.deskItem.name, "A Sad Little Cactus");
  assert.equal(result.rerunPoints, 1);
});

const ZERO_SKILLS = {
  tech: 0, lab: 0, investigation: 0,
  violence: 0, reflexes: 0, coordination: 0,
  cool: 0, intuition: 0, deception: 0
};

test("validateSkillAllocation accepts a fully-spent, cap-compliant allocation", () => {
  const skills = { ...ZERO_SKILLS, tech: 1, lab: 1 };
  const result = validateSkillAllocation({ mental: 2, physical: 0, social: 0 }, "", skills);
  assert.deepEqual(result, {
    valid: true,
    remaining: { mental: 0, physical: 0, social: 0 },
    violations: []
  });
});

test("validateSkillAllocation flags a Tech/Lab skill exceeding the cap with no statNotes minimum", () => {
  const skills = { ...ZERO_SKILLS, tech: 3 };
  const result = validateSkillAllocation({ mental: 3, physical: 0, social: 0 }, "", skills);
  assert.equal(result.valid, false);
  assert.deepEqual(result.violations, ["tech exceeds the cap of 2"]);
  assert.deepEqual(result.remaining, { mental: 0, physical: 0, social: 0 });
});

test("validateSkillAllocation does not flag a statNotes-noted skill for exceeding the cap", () => {
  const skills = { ...ZERO_SKILLS, lab: 5 };
  const result = validateSkillAllocation({ mental: 5, physical: 0, social: 0 }, "At least 3 in Lab", skills);
  assert.equal(result.valid, true);
  assert.deepEqual(result.violations, []);
});

test("validateSkillAllocation flags a statNotes-noted skill below its required minimum", () => {
  const skills = { ...ZERO_SKILLS, lab: 2 };
  const result = validateSkillAllocation({ mental: 2, physical: 0, social: 0 }, "At least 3 in Lab", skills);
  assert.equal(result.valid, false);
  assert.deepEqual(result.violations, ["lab is below its required minimum of 3"]);
});

test("validateSkillAllocation flags nonzero remaining points even with no cap violations", () => {
  const skills = { ...ZERO_SKILLS, tech: 1, lab: 1 };
  const result = validateSkillAllocation({ mental: 3, physical: 0, social: 0 }, "", skills);
  assert.equal(result.valid, false);
  assert.deepEqual(result.violations, []);
  assert.deepEqual(result.remaining, { mental: 1, physical: 0, social: 0 });
});

const NPC_PERSONALITIES_FIXTURE = [
  "Elias Cope, 30. Hot-headed and impulsive, Elias has a jump-first, measure later attitude.",
  "Jennifer Thompson, 40. Measured and cautious, Jennifer is nursing an old knee injury which slows her down.",
  "Dave Hunt, 45. Cold and detached, Dave has an obsessive drive when it comes to working cases.",
  "Willow McClachlan, 25. Bright-eyed and eager, but naive.",
  "Ron Briar, 32. The class clown, but out of his depth in a fight.",
  "Cindy Huntsman, 30. Methodical and very by-the-book."
];

test("rollNpcPersonality picks the entry at 1d6 roll 1 (low boundary)", () => {
  const rng = queue([1]);
  assert.equal(rollNpcPersonality(NPC_PERSONALITIES_FIXTURE, rng), NPC_PERSONALITIES_FIXTURE[0]);
});

test("rollNpcPersonality picks the entry at 1d6 roll 6 (high boundary)", () => {
  const rng = queue([6]);
  assert.equal(rollNpcPersonality(NPC_PERSONALITIES_FIXTURE, rng), NPC_PERSONALITIES_FIXTURE[5]);
});

test("rollNpcPersonality picks the entry at a middle roll", () => {
  const rng = queue([3]);
  assert.equal(rollNpcPersonality(NPC_PERSONALITIES_FIXTURE, rng), NPC_PERSONALITIES_FIXTURE[2]);
});

test("parseNpcName takes the text before the first comma and trims it", () => {
  assert.equal(parseNpcName("Elias Cope, 30. Hot-headed and impulsive..."), "Elias Cope");
});

test("parseNpcName trims surrounding whitespace around the name", () => {
  assert.equal(parseNpcName("  Jennifer Thompson  , 40. Measured..."), "Jennifer Thompson");
});

test("parseNpcName falls back to the full trimmed string when there's no comma", () => {
  assert.equal(parseNpcName("  A freely typed personality with no comma  "), "A freely typed personality with no comma");
});
