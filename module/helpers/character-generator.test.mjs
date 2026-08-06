import { test } from "node:test";
import assert from "node:assert/strict";
import { rollTrope, applyGifted, divestSkills } from "./character-generator.mjs";

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
