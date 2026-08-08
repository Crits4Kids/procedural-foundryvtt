# Talent Act Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically clear every Talent item's "Used" checkbox, world-wide, whenever the GM changes the Act field in the Case Tracker — replacing the current fully-manual workflow where nothing ever unticks `used`.

**Architecture:** A new pure helper, `findTalentsToReset(actors)` in `module/helpers/talent-reset.mjs`, takes a plain-object snapshot of every actor's items and returns which Talent items currently have `used === true`. `CaseTrackerApplication#onSubmit` (`module/apps/case-tracker.mjs`) already runs on every Case Tracker form save (`submitOnChange: true`); it gains a before/after comparison of the `act` field, and on a change, a new `#resetTalentUses` method builds that plain snapshot from `game.actors`, runs it through `findTalentsToReset`, and applies the resulting clears via `updateEmbeddedDocuments`.

**Tech Stack:** Foundry VTT v14 (`ApplicationV2`, `HandlebarsApplicationMixin`, world settings), vanilla JS ES modules, Node's built-in test runner for the pure logic.

## Global Constraints

- Target Foundry VTT v14 (same as the rest of this system).
- No new npm dependencies.
- Preserve the pure-logic-vs-Foundry-glue split: `findTalentsToReset` is pure logic in `module/helpers/talent-reset.mjs`, unit-tested with Node's test runner; everything that touches `Actor`/`Item` documents or `game.settings` stays in `case-tracker.mjs` and is verified by hand (this codebase has no Foundry-runtime test harness).
- All existing tests must keep passing unmodified.
- No schema changes — `TalentItemData.used`/`usesPerAct` already exist (`module/data/item-talent.mjs`) and are untouched by this feature.
- No manual "Reset Talents" button and no filtering by `usesPerAct` — reset unconditionally clears `used` on every Talent item, triggered only by an `act` field change.
- Per this repo's standing convention, bump `version` in both `system.json` and `package.json` together on every feature merge.
- Full spec: `docs/superpowers/specs/2026-08-07-talent-act-reset-design.md`.

---

### Task 1: Pure `findTalentsToReset` helper

**Files:**
- Create: `module/helpers/talent-reset.mjs`
- Create: `module/helpers/talent-reset.test.mjs`

**Interfaces:**
- Consumes: nothing — pure function, no imports beyond the test framework.
- Produces: `findTalentsToReset(actors)` where `actors` is `Array<{id: string, items: Array<{id: string, type: string, system: {used: boolean}}>}>`, returning `Array<{actorId: string, itemId: string}>` for every item with `type === "talent" && system.used === true`. Task 2 imports this exact function and shape from `module/helpers/talent-reset.mjs`.

- [ ] **Step 1: Write the failing tests**

Create `module/helpers/talent-reset.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --test module/helpers/talent-reset.test.mjs
```
Expected: FAIL — `Cannot find module './talent-reset.mjs'` (the module doesn't exist yet).

- [ ] **Step 3: Implement `module/helpers/talent-reset.mjs`**

```js
/**
 * @param {Array<{id: string, items: Array<{id: string, type: string, system: {used: boolean}}>}>} actors
 * @returns {Array<{actorId: string, itemId: string}>}
 */
export function findTalentsToReset(actors) {
  const updates = [];
  for (const actor of actors) {
    for (const item of actor.items ?? []) {
      if (item.type === "talent" && item.system?.used === true) {
        updates.push({ actorId: actor.id, itemId: item.id });
      }
    }
  }
  return updates;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --test module/helpers/talent-reset.test.mjs
```
Expected: PASS — all 6 tests.

- [ ] **Step 5: Run the full suite as a regression check**

```bash
npm test
```
Expected: all tests pass, including the unmodified `dice-rules.test.mjs`, `character-generator.test.mjs`, and `desk-items-data.test.mjs`.

- [ ] **Step 6: Commit**

```bash
git add module/helpers/talent-reset.mjs module/helpers/talent-reset.test.mjs
git commit -m "feat: add pure findTalentsToReset helper with TDD coverage"
```

---

### Task 2: Wire the reset into the Case Tracker's Act field

**Files:**
- Modify: `module/apps/case-tracker.mjs`

**Interfaces:**
- Consumes: `findTalentsToReset(actors)` from Task 1.
- Produces: nothing consumed by later tasks — this is the last code task in the plan.

- [ ] **Step 1: Import the helper**

In `module/apps/case-tracker.mjs`, change:

```js
import { resolveDice } from "../helpers/dice-rules.mjs";
```

to:

```js
import { resolveDice } from "../helpers/dice-rules.mjs";
import { findTalentsToReset } from "../helpers/talent-reset.mjs";
```

- [ ] **Step 2: Detect an `act` change in `#onSubmit` and trigger the reset**

Change:

```js
  static async #onSubmit(event, form) {
    await setCaseTracker(CaseTrackerApplication.#formToData(form));
  }
```

to:

```js
  static async #onSubmit(event, form) {
    const previousAct = getCaseTracker().act;
    const data = CaseTrackerApplication.#formToData(form);
    await setCaseTracker(data);
    if (data.act !== previousAct) {
      await CaseTrackerApplication.#resetTalentUses(data.act);
    }
  }
```

- [ ] **Step 3: Add the `#resetTalentUses` method**

Add this new private static method directly after `#onSubmit`:

```js
  static async #resetTalentUses(act) {
    const actors = game.actors.map(actor => ({
      id: actor.id,
      items: actor.items.map(item => ({
        id: item.id,
        type: item.type,
        system: { used: item.system.used }
      }))
    }));
    const updates = findTalentsToReset(actors);
    if (!updates.length) return;

    const updatesByActor = new Map();
    for (const { actorId, itemId } of updates) {
      if (!updatesByActor.has(actorId)) updatesByActor.set(actorId, []);
      updatesByActor.get(actorId).push({ _id: itemId, "system.used": false });
    }

    try {
      for (const [actorId, itemUpdates] of updatesByActor) {
        await game.actors.get(actorId).updateEmbeddedDocuments("Item", itemUpdates);
      }
    } catch (err) {
      console.error("PROCEDURAL | Failed to reset Talents for the new act", err);
      ui.notifications?.error("PROCEDURAL! failed to reset Talents. Check the console for details.");
      return;
    }

    const count = updates.length;
    ui.notifications?.info(`PROCEDURAL! reset ${count} Talent${count === 1 ? "" : "s"} for Act ${act}.`);
  }
```

- [ ] **Step 4: Verify syntax**

```bash
node --check module/apps/case-tracker.mjs
```
Expected: no output.

- [ ] **Step 5: Run the full test suite as a regression check**

```bash
npm test
```
Expected: all tests pass (this task adds no Node-testable code — `case-tracker.mjs` depends on Foundry globals at evaluation time, so it isn't imported by the test suite).

- [ ] **Step 6: Commit**

```bash
git add module/apps/case-tracker.mjs
git commit -m "feat: auto-reset Talent used checkboxes when the Case Tracker's Act changes"
```

---

### Task 3: Update README and bump the system version

**Files:**
- Modify: `README.md`
- Modify: `system.json:5` (`version` field)
- Modify: `package.json:4` (`version` field)

**Interfaces:**
- Consumes: nothing (documentation + metadata only).
- Produces: nothing consumed by other tasks — this is the final task in the plan.

- [ ] **Step 1: Update the feature list**

In `README.md`, change:

```markdown
- A GM-only Case Tracker app (scene controls) for tracking act/scene,
  interludes, the arrest phase, evidence, and interrogations over the
  course of a session
```

to:

```markdown
- A GM-only Case Tracker app (scene controls) for tracking act/scene,
  interludes, the arrest phase, evidence, and interrogations over the
  course of a session — changing the Act field automatically clears every
  Talent's "Used" checkbox world-wide
```

- [ ] **Step 2: Bump the system version**

In `system.json`, change:

```json
  "version": "0.5.2",
```

to:

```json
  "version": "0.6.0",
```

(Minor bump for a new feature, per this repo's standing convention.)

- [ ] **Step 3: Bump the package version to match**

In `package.json`, change:

```json
  "version": "0.5.2",
```

to:

```json
  "version": "0.6.0",
```

- [ ] **Step 4: Run the full test suite one more time**

```bash
npm test
```
Expected: PASS — README and version-field changes don't touch tested code paths.

- [ ] **Step 5: Commit**

```bash
git add README.md system.json package.json
git commit -m "docs: document Talent act-reset and bump version to 0.6.0"
```

---

## Manual Smoke Test (after all tasks)

This system has no Foundry-runtime test harness (see README) — verify by hand:

1. Symlink/copy the repo into `<FoundryUserData>/Data/systems/procedural` per the README's install steps, and launch a PROCEDURAL! world.
2. Create two `trope` Actors, each with an embedded Talent item (drag one from the "Procedural: Second Talents" compendium onto each). Open one Talent's item sheet and check its "Used" checkbox; leave the other unticked.
3. Open the Case Tracker (GM scene-controls launcher) and change the Act field from 1 to 2. Confirm a notification appears: "PROCEDURAL! reset 1 Talent for Act 2."
4. Reopen both actors' Talent item sheets. Confirm the previously-checked one is now unticked, and the already-unticked one is unaffected.
5. Change the Act field again (e.g. 2 to 3) with no Talents currently checked anywhere. Confirm no notification appears.
6. Edit a different Case Tracker field (e.g. Scene or Turn Order) without changing Act. Confirm no Talent reset happens and no reset notification appears.
7. Check "Used" on a Talent again, then change Act back down (e.g. 3 to 1). Confirm the reset still fires (any change to Act triggers it, not just an increase).
8. `npm test` passes.
