import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRollTableResults } from "./build-packs.mjs";

test("buildRollTableResults creates one result per entry with sequential ranges", () => {
  const results = buildRollTableResults(["Alpha", "Beta", "Gamma"], "test-pack");
  assert.equal(results.length, 3);
  assert.deepEqual(results.map(r => r.range), [[1, 1], [2, 2], [3, 3]]);
});

test("buildRollTableResults gives every result equal weight and the entry's text", () => {
  const results = buildRollTableResults(["Alpha", "Beta"], "test-pack");
  assert.equal(results[0].text, "Alpha");
  assert.equal(results[1].text, "Beta");
  assert.equal(results[0].weight, 1);
  assert.equal(results[1].weight, 1);
});

test("buildRollTableResults gives every result a unique, stable _id", () => {
  const first = buildRollTableResults(["Alpha", "Beta"], "test-pack");
  const second = buildRollTableResults(["Alpha", "Beta"], "test-pack");
  assert.equal(first[0]._id, second[0]._id, "same input produces the same id");
  assert.notEqual(first[0]._id, first[1]._id, "different entries get different ids");
});

test("buildRollTableResults handles a single-entry table", () => {
  const results = buildRollTableResults(["OnlyOne"], "test-pack");
  assert.equal(results.length, 1);
  assert.deepEqual(results[0].range, [1, 1]);
});
