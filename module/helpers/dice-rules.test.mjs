import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDice, resolveTier, computeRoll } from "./dice-rules.mjs";

function queue(values) {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i += 1;
    return (v - 1) / 6;
  };
}

test("resolveDice normal mode sums two dice", () => {
  const rng = queue([3, 5]);
  const result = resolveDice("normal", rng);
  assert.equal(result.die1, 3);
  assert.equal(result.die2, 5);
  assert.equal(result.rawTotal, 8);
});

test("resolveDice advantage keeps the higher of each die pair", () => {
  const rng = queue([2, 6, 5, 1]);
  const result = resolveDice("advantage", rng);
  assert.equal(result.die1, 5);
  assert.equal(result.die2, 6);
  assert.equal(result.rawTotal, 11);
});

test("resolveDice disadvantage rerolls the higher die only", () => {
  const rng = queue([2, 6, 1]);
  const result = resolveDice("disadvantage", rng);
  assert.equal(result.die1, 2);
  assert.equal(result.die2, 1);
  assert.equal(result.rawTotal, 3);
});

test("resolveDice disadvantage rerolls the first die on a tie", () => {
  const rng = queue([4, 4, 1]);
  const result = resolveDice("disadvantage", rng);
  assert.equal(result.die1, 1);
  assert.equal(result.die2, 4);
  assert.equal(result.rawTotal, 5);
});

test("resolveTier bands a modified total of 5 as Failure", () => {
  const tier = resolveTier(8, 5);
  assert.equal(tier.tier, "failure");
  assert.equal(tier.isCriticalFailure, false);
});

test("resolveTier bands a modified total of 9 as So-So", () => {
  const tier = resolveTier(7, 9);
  assert.equal(tier.tier, "soSo");
});

test("resolveTier bands a modified total of 11 as Outright Success", () => {
  const tier = resolveTier(9, 11);
  assert.equal(tier.tier, "success");
});

test("resolveTier bands a modified total of 12+ as Success + Positive Effect", () => {
  const tier = resolveTier(10, 13);
  assert.equal(tier.tier, "successEffect");
});

test("resolveTier flags raw 2 as Critical Failure regardless of modifiedTotal", () => {
  const tier = resolveTier(2, 2);
  assert.equal(tier.isCriticalFailure, true);
  assert.equal(tier.tier, "criticalFailure");
});

test("resolveTier flags raw 12 as Critical Success alongside the successEffect band", () => {
  const tier = resolveTier(12, 15);
  assert.equal(tier.isCriticalSuccess, true);
  assert.equal(tier.tier, "successEffect");
});

test("computeRoll ignores all modifiers on a raw critical failure", () => {
  const rng = queue([1, 1]);
  const result = computeRoll({ mode: "normal", skillModifier: 3, situationalModifier: 2, rng });
  assert.equal(result.rawTotal, 2);
  assert.equal(result.modifiedTotal, 2);
  assert.equal(result.isCriticalFailure, true);
});

test("computeRoll applies skill and situational modifiers normally", () => {
  const rng = queue([3, 4]);
  const result = computeRoll({ mode: "normal", skillModifier: 2, situationalModifier: 1, rng });
  assert.equal(result.rawTotal, 7);
  assert.equal(result.modifiedTotal, 10);
  assert.equal(result.tier, "success");
});

test("computeRoll suppresses skill modifier but not situational modifier while hurt", () => {
  const rng = queue([3, 4]);
  const result = computeRoll({
    mode: "normal", skillModifier: 5, situationalModifier: 5,
    hurt: true, isPhysicalSkill: false, rng
  });
  assert.equal(result.modifiedTotal, 12);
  assert.equal(result.skillModifier, 0);
  assert.equal(result.situationalModifier, 5);
});

test("computeRoll forces disadvantage on physical skills while hurt", () => {
  const rng = queue([2, 6, 1]);
  const result = computeRoll({
    mode: "normal", skillModifier: 0,
    hurt: true, isPhysicalSkill: true, rng
  });
  assert.equal(result.effectiveMode, "disadvantage");
  assert.equal(result.die1, 2);
  assert.equal(result.die2, 1);
});

test("computeRoll does not force disadvantage on non-physical skills while hurt", () => {
  const rng = queue([3, 4]);
  const result = computeRoll({
    mode: "normal", skillModifier: 0,
    hurt: true, isPhysicalSkill: false, rng
  });
  assert.equal(result.effectiveMode, "normal");
});
