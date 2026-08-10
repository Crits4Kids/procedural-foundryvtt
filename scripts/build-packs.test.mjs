import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRollTableResults, buildRollTableDocument } from "./build-packs.mjs";

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

test("buildRollTableDocument sets a formula matching the entry count", () => {
  const document = buildRollTableDocument("test-pack", "Test Table", ["Alpha", "Beta", "Gamma"]);
  assert.equal(document.formula, "1d3");
});

test("buildRollTableDocument's top-level _key starts with \"!tables!\"", () => {
  const document = buildRollTableDocument("test-pack", "Test Table", ["Alpha", "Beta"]);
  assert.ok(document._key.startsWith("!tables!"), `expected _key "${document._key}" to start with "!tables!"`);
});

test("buildRollTableDocument throws on an empty entries array", () => {
  assert.throws(() => buildRollTableDocument("test-pack", "Test Table", []));
});
