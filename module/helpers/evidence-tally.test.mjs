import { test } from "node:test";
import assert from "node:assert/strict";
import { tallyEvidence } from "./evidence-tally.mjs";

test("tallyEvidence returns zero counts and not tied for no evidence", () => {
  assert.deepEqual(tallyEvidence([]), { good: 0, bad: 0, tied: false });
});

test("tallyEvidence ignores unknown-status entries", () => {
  const evidence = [{ status: "unknown" }, { status: "unknown" }];
  assert.deepEqual(tallyEvidence(evidence), { good: 0, bad: 0, tied: false });
});

test("tallyEvidence is not tied when good outnumbers bad", () => {
  const evidence = [{ status: "good" }, { status: "good" }, { status: "bad" }];
  assert.deepEqual(tallyEvidence(evidence), { good: 2, bad: 1, tied: false });
});

test("tallyEvidence is not tied when bad outnumbers good", () => {
  const evidence = [{ status: "bad" }, { status: "bad" }, { status: "good" }];
  assert.deepEqual(tallyEvidence(evidence), { good: 1, bad: 2, tied: false });
});

test("tallyEvidence is tied when good and bad counts match and are non-zero", () => {
  const evidence = [{ status: "good" }, { status: "bad" }, { status: "unknown" }];
  assert.deepEqual(tallyEvidence(evidence), { good: 1, bad: 1, tied: true });
});

test("tallyEvidence is not tied for a 0-0 tally", () => {
  const evidence = [{ status: "unknown" }];
  assert.deepEqual(tallyEvidence(evidence), { good: 0, bad: 0, tied: false });
});

test("tallyEvidence adds 2 bad when culpritEscaped is true, even with no evidence", () => {
  assert.deepEqual(tallyEvidence([], { culpritEscaped: true }), { good: 0, bad: 2, tied: false });
});

test("tallyEvidence's culpritEscaped bonus can create a tie", () => {
  const evidence = [{ status: "good" }, { status: "good" }];
  assert.deepEqual(tallyEvidence(evidence, { culpritEscaped: true }), { good: 2, bad: 2, tied: true });
});

test("tallyEvidence's culpritEscaped bonus can break an existing tie", () => {
  const evidence = [{ status: "good" }, { status: "bad" }];
  assert.deepEqual(tallyEvidence(evidence, { culpritEscaped: true }), { good: 1, bad: 3, tied: false });
});

test("tallyEvidence defaults culpritEscaped to false, matching pre-existing call sites", () => {
  const evidence = [{ status: "good" }, { status: "bad" }];
  assert.deepEqual(tallyEvidence(evidence), { good: 1, bad: 1, tied: true });
});
