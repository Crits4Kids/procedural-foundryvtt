import { test } from "node:test";
import assert from "node:assert/strict";
import { validateLevelUpChoice } from "./level-up.mjs";

const SKILLS_ALL_ZERO = {
  tech: 0, lab: 0, investigation: 0,
  violence: 0, reflexes: 0, coordination: 0,
  cool: 0, intuition: 0, deception: 0
};

test("validateLevelUpChoice accepts a stat/skill pair with room under the cap", () => {
  const result = validateLevelUpChoice({ stat: "mental", skillKey: "tech", currentSkills: SKILLS_ALL_ZERO });
  assert.deepEqual(result, { valid: true });
});

test("validateLevelUpChoice rejects a missing stat", () => {
  const result = validateLevelUpChoice({ stat: "", skillKey: "tech", currentSkills: SKILLS_ALL_ZERO });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "noStat");
});

test("validateLevelUpChoice rejects an unrecognized stat", () => {
  const result = validateLevelUpChoice({ stat: "spiritual", skillKey: "tech", currentSkills: SKILLS_ALL_ZERO });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "noStat");
});

test("validateLevelUpChoice rejects a skill that doesn't belong to the chosen stat", () => {
  const result = validateLevelUpChoice({ stat: "mental", skillKey: "violence", currentSkills: SKILLS_ALL_ZERO });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "skillNotInStat");
});

test("validateLevelUpChoice rejects a missing skillKey", () => {
  const result = validateLevelUpChoice({ stat: "mental", skillKey: "", currentSkills: SKILLS_ALL_ZERO });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "skillNotInStat");
});

test("validateLevelUpChoice rejects a skill already at the cap of 3", () => {
  const currentSkills = { ...SKILLS_ALL_ZERO, tech: 3 };
  const result = validateLevelUpChoice({ stat: "mental", skillKey: "tech", currentSkills });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "skillAtCap");
});

test("validateLevelUpChoice rejects a skill above the cap (defensive)", () => {
  const currentSkills = { ...SKILLS_ALL_ZERO, tech: 4 };
  const result = validateLevelUpChoice({ stat: "mental", skillKey: "tech", currentSkills });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "skillAtCap");
});

test("validateLevelUpChoice accepts a skill one below the cap", () => {
  const currentSkills = { ...SKILLS_ALL_ZERO, cool: 2 };
  const result = validateLevelUpChoice({ stat: "social", skillKey: "cool", currentSkills });
  assert.deepEqual(result, { valid: true });
});
