import { test } from "node:test";
import assert from "node:assert/strict";
import { heldNames } from "./held-names.mjs";

function actorFixture(id, type, items) {
  return { id, type, items };
}

test("heldNames returns empty arrays for no actors", () => {
  assert.deepEqual(heldNames([]), { tropeNames: [], secondTalentNames: [] });
});

test("heldNames collects Trope and Talent item names from trope-type actors", () => {
  const actors = [
    actorFixture("a1", "trope", [{ type: "trope", name: "Rookie" }, { type: "talent", name: "Sentinel" }]),
    actorFixture("a2", "trope", [{ type: "trope", name: "Coroner" }, { type: "talent", name: "Drama Queen" }])
  ];
  assert.deepEqual(heldNames(actors), {
    tropeNames: ["Rookie", "Coroner"],
    secondTalentNames: ["Sentinel", "Drama Queen"]
  });
});

test("heldNames ignores non-trope-type actors (e.g. NPCs)", () => {
  const actors = [actorFixture("a1", "npc", [{ type: "trope", name: "Hard-boiled" }])];
  assert.deepEqual(heldNames(actors), { tropeNames: [], secondTalentNames: [] });
});

test("heldNames excludes the given actor id from the results", () => {
  const actors = [
    actorFixture("a1", "trope", [{ type: "trope", name: "Rookie" }, { type: "talent", name: "Sentinel" }]),
    actorFixture("a2", "trope", [{ type: "trope", name: "Coroner" }, { type: "talent", name: "Drama Queen" }])
  ];
  assert.deepEqual(heldNames(actors, "a1"), {
    tropeNames: ["Coroner"],
    secondTalentNames: ["Drama Queen"]
  });
});

test("heldNames ignores an actor's non-trope/non-talent items", () => {
  const actors = [actorFixture("a1", "trope", [{ type: "trope", name: "Rookie" }, { type: "equipment", name: "A Sad Little Cactus" }])];
  assert.deepEqual(heldNames(actors), { tropeNames: ["Rookie"], secondTalentNames: [] });
});
