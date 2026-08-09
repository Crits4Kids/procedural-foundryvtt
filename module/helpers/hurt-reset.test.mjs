import { test } from "node:test";
import assert from "node:assert/strict";
import { findActorsToHeal } from "./hurt-reset.mjs";

test("findActorsToHeal returns an empty array for no actors", () => {
  assert.deepEqual(findActorsToHeal([]), []);
});

test("findActorsToHeal ignores an actor with neither flag set", () => {
  const actors = [{ id: "a1", system: { hurt: false, knockedOut: false } }];
  assert.deepEqual(findActorsToHeal(actors), []);
});

test("findActorsToHeal includes an actor with only hurt set", () => {
  const actors = [{ id: "a1", system: { hurt: true, knockedOut: false } }];
  assert.deepEqual(findActorsToHeal(actors), ["a1"]);
});

test("findActorsToHeal includes an actor with only knockedOut set", () => {
  const actors = [{ id: "a1", system: { hurt: false, knockedOut: true } }];
  assert.deepEqual(findActorsToHeal(actors), ["a1"]);
});

test("findActorsToHeal includes an actor with both flags set, once", () => {
  const actors = [{ id: "a1", system: { hurt: true, knockedOut: true } }];
  assert.deepEqual(findActorsToHeal(actors), ["a1"]);
});

test("findActorsToHeal handles multiple actors with mixed flags", () => {
  const actors = [
    { id: "a1", system: { hurt: true, knockedOut: false } },
    { id: "a2", system: { hurt: false, knockedOut: false } },
    { id: "a3", system: { hurt: false, knockedOut: true } }
  ];
  assert.deepEqual(findActorsToHeal(actors), ["a1", "a3"]);
});

test("findActorsToHeal treats a missing system object as not needing healing", () => {
  const actors = [{ id: "a1", system: {} }];
  assert.deepEqual(findActorsToHeal(actors), []);
});
