import { test } from "node:test";
import assert from "node:assert/strict";
import { findTalentsToReset } from "./talent-reset.mjs";

test("findTalentsToReset returns an empty array for no actors", () => {
  assert.deepEqual(findTalentsToReset([]), []);
});

test("findTalentsToReset returns an empty array when an actor has no items", () => {
  const actors = [{ id: "a1", items: [] }];
  assert.deepEqual(findTalentsToReset(actors), []);
});

test("findTalentsToReset returns a pair for a used Talent", () => {
  const actors = [
    { id: "a1", items: [{ id: "i1", type: "talent", system: { used: true } }] }
  ];
  assert.deepEqual(findTalentsToReset(actors), [{ actorId: "a1", itemId: "i1" }]);
});

test("findTalentsToReset ignores an unused Talent", () => {
  const actors = [
    { id: "a1", items: [{ id: "i1", type: "talent", system: { used: false } }] }
  ];
  assert.deepEqual(findTalentsToReset(actors), []);
});

test("findTalentsToReset ignores a non-Talent item even if system.used is true", () => {
  const actors = [
    { id: "a1", items: [{ id: "i1", type: "equipment", system: { used: true } }] }
  ];
  assert.deepEqual(findTalentsToReset(actors), []);
});

test("findTalentsToReset returns a pair for a used Trope's built-in Talent", () => {
  const actors = [
    { id: "a1", items: [{ id: "i1", type: "trope", system: { used: true } }] }
  ];
  assert.deepEqual(findTalentsToReset(actors), [{ actorId: "a1", itemId: "i1" }]);
});

test("findTalentsToReset ignores an unused Trope's built-in Talent", () => {
  const actors = [
    { id: "a1", items: [{ id: "i1", type: "trope", system: { used: false } }] }
  ];
  assert.deepEqual(findTalentsToReset(actors), []);
});

test("findTalentsToReset returns both a used Talent and a used Trope on the same actor", () => {
  const actors = [
    {
      id: "a1",
      items: [
        { id: "i1", type: "talent", system: { used: true } },
        { id: "i2", type: "trope", system: { used: true } }
      ]
    }
  ];
  assert.deepEqual(findTalentsToReset(actors), [
    { actorId: "a1", itemId: "i1" },
    { actorId: "a1", itemId: "i2" }
  ]);
});

test("findTalentsToReset handles multiple actors with mixed used/unused Talents", () => {
  const actors = [
    {
      id: "a1",
      items: [
        { id: "i1", type: "talent", system: { used: true } },
        { id: "i2", type: "talent", system: { used: false } }
      ]
    },
    {
      id: "a2",
      items: [
        { id: "i3", type: "talent", system: { used: true } },
        { id: "i4", type: "equipment", system: { used: true } }
      ]
    }
  ];
  assert.deepEqual(findTalentsToReset(actors), [
    { actorId: "a1", itemId: "i1" },
    { actorId: "a2", itemId: "i3" }
  ]);
});
