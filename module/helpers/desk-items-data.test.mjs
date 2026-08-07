import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dataPath = fileURLToPath(new URL("../../data/desk-items.json", import.meta.url));

function loadDeskItems() {
  return JSON.parse(readFileSync(dataPath, "utf8"));
}

test("desk-items.json is an array of 42 entries", () => {
  const items = loadDeskItems();
  assert.ok(Array.isArray(items));
  assert.equal(items.length, 42);
});

test("every desk item has a name, the shared placeholder icon, and a description", () => {
  const items = loadDeskItems();
  for (const item of items) {
    assert.equal(typeof item.name, "string");
    assert.ok(item.name.length > 0, `entry missing a name: ${JSON.stringify(item)}`);
    assert.equal(item.img, "icons/svg/mystery-man.svg");
    assert.equal(typeof item.system?.description, "string");
    assert.ok(item.system.description.length > 0, `"${item.name}" has an empty description`);
  }
});

test("desk item names are unique", () => {
  const items = loadDeskItems();
  const names = items.map(i => i.name);
  assert.equal(new Set(names).size, names.length);
});
