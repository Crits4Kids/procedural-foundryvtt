import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidPool } from "./lead-pool.mjs";

test("isValidPool is false for empty contributions", () => {
  assert.equal(isValidPool({}, 3), false);
});

test("isValidPool is true when contributions sum to exactly cost", () => {
  assert.equal(isValidPool({ a1: 2, a2: 1 }, 3), true);
});

test("isValidPool is false when contributions sum to less than cost", () => {
  assert.equal(isValidPool({ a1: 1, a2: 1 }, 3), false);
});

test("isValidPool is false when contributions sum to more than cost", () => {
  assert.equal(isValidPool({ a1: 2, a2: 2 }, 3), false);
});

test("isValidPool is false when cost is zero", () => {
  assert.equal(isValidPool({ a1: 0 }, 0), false);
});

test("isValidPool treats non-numeric or missing contribution values as zero", () => {
  assert.equal(isValidPool({ a1: 3, a2: undefined, a3: "not a number" }, 3), true);
});
