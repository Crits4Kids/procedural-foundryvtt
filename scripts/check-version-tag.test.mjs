import { test } from "node:test";
import assert from "node:assert/strict";
import { tagMatchesVersion } from "./check-version-tag.mjs";

test("matches when tag has 'v' prefix and equals version", () => {
  assert.equal(tagMatchesVersion("v0.6.0", "0.6.0"), true);
});

test("matches when tag has no prefix and equals version", () => {
  assert.equal(tagMatchesVersion("0.6.0", "0.6.0"), true);
});

test("does not match when versions differ", () => {
  assert.equal(tagMatchesVersion("v0.6.0", "0.5.2"), false);
});

test("does not match on trailing whitespace", () => {
  assert.equal(tagMatchesVersion("v0.6.0\n", "0.6.0"), false);
});
