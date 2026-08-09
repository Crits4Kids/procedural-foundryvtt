import { test } from "node:test";
import assert from "node:assert/strict";
import { computeRating, countRecordedEpisodes } from "./season-benchmarks.mjs";

test("computeRating returns 0 for an empty array", () => {
  assert.equal(computeRating([]), 0);
});

test("computeRating returns 0 when every episode is unset", () => {
  const episodes = [{ outcome: "" }, { outcome: "" }, { outcome: "" }];
  assert.equal(computeRating(episodes), 0);
});

test("computeRating sums successful (+2), neutral (0), and unsuccessful (-1)", () => {
  const episodes = [{ outcome: "successful" }, { outcome: "neutral" }, { outcome: "unsuccessful" }];
  assert.equal(computeRating(episodes), 1);
});

test("computeRating treats unset episodes as 0 alongside set ones", () => {
  const episodes = [{ outcome: "successful" }, { outcome: "" }, { outcome: "successful" }];
  assert.equal(computeRating(episodes), 4);
});

test("computeRating returns 12 for a perfect all-successful season", () => {
  const episodes = Array(6).fill({ outcome: "successful" });
  assert.equal(computeRating(episodes), 12);
});

test("countRecordedEpisodes returns 0 for an empty array", () => {
  assert.equal(countRecordedEpisodes([]), 0);
});

test("countRecordedEpisodes counts only non-empty outcomes", () => {
  const episodes = [{ outcome: "successful" }, { outcome: "" }, { outcome: "neutral" }, { outcome: "" }];
  assert.equal(countRecordedEpisodes(episodes), 2);
});

test("countRecordedEpisodes returns 6 when every episode is recorded", () => {
  const episodes = Array(6).fill({ outcome: "unsuccessful" });
  assert.equal(countRecordedEpisodes(episodes), 6);
});
