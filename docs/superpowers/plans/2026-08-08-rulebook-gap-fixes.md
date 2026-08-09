# Rulebook Gap Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close three rulebook gaps found with no code/data trace during a full rulebook-coverage audit: a "Roll for Drama" content table + Case Tracker action, a B-story-resolution Rerun Point button, and double-Hurt knockout tracking with auto-heal on act change.

**Architecture:** All three reuse existing patterns in this codebase rather than introducing new ones. Roll for Drama follows the `data/*.json` + `generator-data.mjs` roll-table pattern already used for Quality/Quirk/HQ/Agency Name, surfaced via a new Case Tracker action (same shape as `#onStartInterrogation`). The B-story Rerun Point award is a one-line sheet action, mirroring `#onToggleHurt`. Double-Hurt knockout adds a `knockedOut` boolean next to the existing `hurt` boolean on `TropeActorData`, a new sheet action that rolls a 1d6 flavor duration, and a pure `findActorsToHeal(actors)` helper (same shape as the existing `findTalentsToReset(actors)`) wired into the Case Tracker's `setCaseTracker()` function, which already re-runs `resetTalentUses()` on every Act-field change.

**Tech Stack:** Foundry VTT v14 (`ApplicationV2`, `HandlebarsApplicationMixin`, `ActorSheetV2`, world settings), vanilla JS ES modules, Node's built-in test runner for pure logic.

## Global Constraints

- Target Foundry VTT v14 (same as the rest of this system).
- No new npm dependencies.
- Preserve the pure-logic-vs-Foundry-glue split: anything with no `game`/`Actor`/`ChatMessage`/DOM dependency is a pure, unit-tested helper in `module/helpers/`; anything that touches Foundry documents, settings, or chat stays in `module/apps/` or `module/sheets/` and is verified by hand (this codebase has no Foundry-runtime test harness).
- All existing tests must keep passing unmodified.
- Follow this repo's existing code style exactly: no comments unless the WHY is non-obvious, `game.i18n.localize` for all user-facing strings (never hardcoded English in templates), `ui.notifications?.error(...)` + `console.error("PROCEDURAL | ...")` on every catch block that wraps a Foundry document write, matching the existing handlers in `case-tracker.mjs`.
- No lock/guard on the B-story Rerun Point button — repeatable by design (see spec's "Out of scope").
- The Hurt checkbox's existing on/off toggle behavior is unchanged — "Hurt Again" is a new, additive action, not a repurposing of the checkbox.
- The act-change hook clears both `hurt` and `knockedOut` unconditionally on every actor, mirroring how `findTalentsToReset` already clears `used` unconditionally regardless of `usesPerAct`.
- Per this repo's standing convention, bump `version` in both `system.json` and `package.json` together on every feature merge.
- Full spec: `docs/superpowers/specs/2026-08-08-rulebook-gap-fixes-design.md`.

---

### Task 1: `rollD6` pure helper

**Files:**
- Modify: `module/helpers/dice-rules.mjs:1-3` (add export near the existing private `rollDie`)
- Modify: `module/helpers/dice-rules.test.mjs` (add test cases)

**Interfaces:**
- Consumes: the existing private `rollDie(rng)` function already defined at the top of `dice-rules.mjs`.
- Produces: `rollD6(rng = Math.random)` returning an integer 1-6. Tasks 3, 5, and 6 import this exact function from `module/helpers/dice-rules.mjs`.

- [ ] **Step 1: Write the failing tests**

Add to the end of `module/helpers/dice-rules.test.mjs` (the file already imports `resolveDice, resolveTier, computeRoll` from `"./dice-rules.mjs"` at the top and defines a `queue(values)` rng-stub helper — extend the import, don't duplicate `queue`):

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDice, resolveTier, computeRoll, rollD6 } from "./dice-rules.mjs";
```

(That's the existing import line at the top of the file with `rollD6` added — edit it in place rather than adding a second import line.)

Then append these tests at the end of the file:

```js
test("rollD6 returns a value in the 1-6 range driven by the rng", () => {
  const rng = queue([1, 6, 3]);
  assert.equal(rollD6(rng), 1);
  assert.equal(rollD6(rng), 6);
  assert.equal(rollD6(rng), 3);
});

test("rollD6 defaults to Math.random when no rng is passed", () => {
  const value = rollD6();
  assert.ok(value >= 1 && value <= 6);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --test module/helpers/dice-rules.test.mjs
```
Expected: FAIL — `rollD6 is not a function` (or a named-export error), since it isn't exported yet.

- [ ] **Step 3: Add the export**

In `module/helpers/dice-rules.mjs`, directly after the existing `rollDie` function (lines 1-3):

```js
function rollDie(rng) {
  return Math.floor(rng() * 6) + 1;
}

/**
 * @param {() => number} rng - returns a float in [0,1), like Math.random
 * @returns {number} 1-6
 */
export function rollD6(rng = Math.random) {
  return rollDie(rng);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --test module/helpers/dice-rules.test.mjs
```
Expected: PASS — all tests including the two new ones.

- [ ] **Step 5: Run the full suite as a regression check**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add module/helpers/dice-rules.mjs module/helpers/dice-rules.test.mjs
git commit -m "feat: add rollD6 helper for single-die rolls outside the 2d6 skill path"
```

---

### Task 2: `data/drama.json` content and generator-data registration

**Files:**
- Create: `data/drama.json`
- Modify: `module/helpers/generator-data.mjs:1-9`

**Interfaces:**
- Consumes: nothing.
- Produces: `data/drama.json` with shape `{odds: string[6], evens: string[6]}`, fetchable at runtime via `systems/procedural/data/drama.json` (same convention as every other entry in `GENERATOR_DATA_PATHS`). Task 3's Case Tracker action fetches this via `loadGeneratorData()` and reads `.drama.odds` / `.drama.evens`.

- [ ] **Step 1: Create `data/drama.json`**

Transcribed verbatim from the rulebook's "ROLL FOR DRAMA" section (`rulebook/source_rulebook.md:1936-2043`):

```json
{
  "odds": [
    "Nobody talks about last year's chili cook-off. Not after Bill died...",
    "You are all still mourning the loss of Lt. Bonnie Ritter, the most beloved member of your agency, gunned down in action two days from retirement.",
    "Someone has been stealing lunches from the fridge for six months.",
    "There's a strange smell emanating from somewhere in HQ. Who or what is to blame?",
    "You're all on the same bowling team but can't agree on who is best.",
    "You've had too many close calls lately and everyone is on edge and having trouble trusting one another."
  ],
  "evens": [
    "There was an anonymous memo passed down about your team's sub-par job performance—it seems someone is paying close attention to you.",
    "There are rumors that your branch is moving to Vegas soon, and everyone has mixed feelings about it.",
    "Someone has been leaking case details to the press and everyone suspects each other.",
    "Someone has introduced a pyramid scheme of plastic food containers into the agency and it's getting out of hand.",
    "All of you love betting on everything you do and the stakes just keep getting higher and higher.",
    "You're all good drinking buddies and spend a lot of time off the job together."
  ]
}
```

- [ ] **Step 2: Verify the JSON is well-formed**

```bash
node -e "JSON.parse(require('fs').readFileSync('data/drama.json', 'utf8')); console.log('valid')"
```
Expected: `valid`.

- [ ] **Step 3: Register the path in `generator-data.mjs`**

In `module/helpers/generator-data.mjs`, change:

```js
export const GENERATOR_DATA_PATHS = {
  tropes: "systems/procedural/data/tropes.json",
  secondTalents: "systems/procedural/data/second-talents.json",
  qualities: "systems/procedural/data/qualities.json",
  quirks: "systems/procedural/data/quirks.json",
  bstories: "systems/procedural/data/bstories.json",
  hq: "systems/procedural/data/hq.json",
  agencyNames: "systems/procedural/data/agency-names.json",
  deskItems: "systems/procedural/data/desk-items.json"
};
```

to:

```js
export const GENERATOR_DATA_PATHS = {
  tropes: "systems/procedural/data/tropes.json",
  secondTalents: "systems/procedural/data/second-talents.json",
  qualities: "systems/procedural/data/qualities.json",
  quirks: "systems/procedural/data/quirks.json",
  bstories: "systems/procedural/data/bstories.json",
  hq: "systems/procedural/data/hq.json",
  agencyNames: "systems/procedural/data/agency-names.json",
  deskItems: "systems/procedural/data/desk-items.json",
  drama: "systems/procedural/data/drama.json"
};
```

- [ ] **Step 4: Run the full test suite as a regression check**

```bash
npm test
```
Expected: all tests pass (this task adds no Node-testable code — `generator-data.mjs` depends on `fetch`/Foundry runtime, same as the rest of that file, and isn't imported by the test suite).

- [ ] **Step 5: Commit**

```bash
git add data/drama.json module/helpers/generator-data.mjs
git commit -m "feat: add Roll for Drama table data"
```

---

### Task 3: Case Tracker "Roll for Drama" action

**Files:**
- Modify: `module/data/case-tracker.mjs:1-33`
- Modify: `module/apps/case-tracker.mjs` (imports, `#formToData`, `_prepareContext`, `actions`, new action handler)
- Modify: `templates/apps/case-tracker.hbs`
- Modify: `lang/en.json` (`PROCEDURAL.CaseTracker`)

**Interfaces:**
- Consumes: `rollD6` from Task 1 (`module/helpers/dice-rules.mjs`), `loadGeneratorData` from `module/helpers/generator-data.mjs` (already used elsewhere in this codebase, e.g. `module/documents/actor.mjs:4`), `data.drama` from Task 2's `data/drama.json`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the `drama` field to `CaseTrackerData`**

In `module/data/case-tracker.mjs`, change:

```js
      epilogueNotes: new StringField({ initial: "" }),
      evidence: new ArrayField(
```

to:

```js
      epilogueNotes: new StringField({ initial: "" }),
      drama: new StringField({ initial: "" }),
      evidence: new ArrayField(
```

- [ ] **Step 2: Import `rollD6` and `loadGeneratorData` in the Case Tracker app**

In `module/apps/case-tracker.mjs`, change:

```js
import { resolveDice } from "../helpers/dice-rules.mjs";
import { findTalentsToReset } from "../helpers/talent-reset.mjs";
```

to:

```js
import { resolveDice, rollD6 } from "../helpers/dice-rules.mjs";
import { findTalentsToReset } from "../helpers/talent-reset.mjs";
import { loadGeneratorData } from "../helpers/generator-data.mjs";
```

- [ ] **Step 3: Expose `drama` in `_prepareContext` and `#formToData`**

In `module/apps/case-tracker.mjs`, change:

```js
    context.arrestPhaseTriggered = data.arrestPhaseTriggered;
    context.arrestPhaseNotes = data.arrestPhaseNotes;
    context.epilogueNotes = data.epilogueNotes;
```

to:

```js
    context.arrestPhaseTriggered = data.arrestPhaseTriggered;
    context.arrestPhaseNotes = data.arrestPhaseNotes;
    context.epilogueNotes = data.epilogueNotes;
    context.drama = data.drama;
```

And change:

```js
      arrestPhaseTriggered: expanded.arrestPhaseTriggered ?? false,
      arrestPhaseNotes: expanded.arrestPhaseNotes ?? "",
      epilogueNotes: expanded.epilogueNotes ?? "",
      evidence: Object.values(expanded.evidence ?? {}),
```

to:

```js
      arrestPhaseTriggered: expanded.arrestPhaseTriggered ?? false,
      arrestPhaseNotes: expanded.arrestPhaseNotes ?? "",
      epilogueNotes: expanded.epilogueNotes ?? "",
      drama: expanded.drama ?? "",
      evidence: Object.values(expanded.evidence ?? {}),
```

(`drama` must round-trip through `#formToData` like every other persisted field — the template in Step 5 renders it as a hidden input so it survives unrelated form submits, the same convention `evidence.{index}.id` already uses.)

- [ ] **Step 4: Register the `rollForDrama` action and its handler**

In `module/apps/case-tracker.mjs`, change:

```js
    actions: {
      addEvidence: CaseTrackerApplication.#onAddEvidence,
      deleteEvidence: CaseTrackerApplication.#onDeleteEvidence,
      startInterrogation: CaseTrackerApplication.#onStartInterrogation,
      decrementInterrogation: CaseTrackerApplication.#onDecrementInterrogation,
      deleteInterrogation: CaseTrackerApplication.#onDeleteInterrogation
    }
```

to:

```js
    actions: {
      addEvidence: CaseTrackerApplication.#onAddEvidence,
      deleteEvidence: CaseTrackerApplication.#onDeleteEvidence,
      startInterrogation: CaseTrackerApplication.#onStartInterrogation,
      decrementInterrogation: CaseTrackerApplication.#onDecrementInterrogation,
      deleteInterrogation: CaseTrackerApplication.#onDeleteInterrogation,
      rollForDrama: CaseTrackerApplication.#onRollForDrama
    }
```

Then add this new handler directly after `#onStartInterrogation` (after the closing brace on the line matching `module/apps/case-tracker.mjs:179` in the current file):

```js
  static async #onRollForDrama() {
    const generatorData = await loadGeneratorData();
    const tableRoll = rollD6();
    const entryRoll = rollD6();
    const table = tableRoll % 2 === 1 ? generatorData.drama.odds : generatorData.drama.evens;
    const text = table[entryRoll - 1];

    const data = CaseTrackerApplication.#formToData(this.form);
    data.drama = text;
    try {
      await setCaseTracker(data);
    } catch (err) {
      console.error("PROCEDURAL | Failed to save the Roll for Drama result", err);
      ui.notifications?.error("PROCEDURAL! failed to save the Drama roll. Check the console for details.");
      return;
    }

    await ChatMessage.create({
      content: `<p><strong>${game.i18n.localize("PROCEDURAL.CaseTracker.RollForDrama")}</strong> (${tableRoll}, ${entryRoll}): ${text}</p>`
    });
    this.render();
  }
```

- [ ] **Step 5: Add the Drama section to the Case Tracker template**

In `templates/apps/case-tracker.hbs`, add this new section directly before the closing `</section>` at the end of the file (after the Interrogations `</section>` block):

```hbs
  <section class="procedural-case-tracker-drama">
    <h2>{{localize "PROCEDURAL.CaseTracker.Drama"}}</h2>
    <input type="hidden" name="drama" value="{{drama}}">
    <p class="procedural-case-tracker-drama-text">{{drama}}</p>
    <button type="button" data-action="rollForDrama">{{localize "PROCEDURAL.CaseTracker.RollForDrama"}}</button>
  </section>
```

- [ ] **Step 6: Add localization keys**

In `lang/en.json`, inside the `PROCEDURAL.CaseTracker` object, change:

```json
      "InterrogationSuspect": "Suspect",
      "InterrogationNotes": "Notes",
      "Status": {
```

to:

```json
      "InterrogationSuspect": "Suspect",
      "InterrogationNotes": "Notes",
      "Drama": "Team Drama",
      "RollForDrama": "Roll for Drama",
      "Status": {
```

- [ ] **Step 7: Verify syntax**

```bash
node --check module/apps/case-tracker.mjs && node --check module/data/case-tracker.mjs && node -e "JSON.parse(require('fs').readFileSync('lang/en.json', 'utf8')); console.log('valid')"
```
Expected: no output from the `--check` calls, then `valid`.

- [ ] **Step 8: Run the full test suite as a regression check**

```bash
npm test
```
Expected: all tests pass (no Node-testable code added in this task — `case-tracker.mjs` and `case-tracker.hbs` depend on Foundry globals).

- [ ] **Step 9: Commit**

```bash
git add module/data/case-tracker.mjs module/apps/case-tracker.mjs templates/apps/case-tracker.hbs lang/en.json
git commit -m "feat: add Roll for Drama action to the Case Tracker"
```

---

### Task 4: B-story resolution grants a Rerun Point

**Files:**
- Modify: `module/sheets/actor-trope-sheet.mjs`
- Modify: `templates/actor/trope-sheet.hbs:44-46`
- Modify: `lang/en.json` (`PROCEDURAL.Actor`)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Register the `resolveBStory` action**

In `module/sheets/actor-trope-sheet.mjs`, change:

```js
    actions: {
      rollSkill: ProceduralTropeActorSheet.#onRollSkill,
      toggleHurt: ProceduralTropeActorSheet.#onToggleHurt,
      createItem: ProceduralTropeActorSheet.#onCreateItem,
      editItem: ProceduralTropeActorSheet.#onEditItem,
      deleteItem: ProceduralTropeActorSheet.#onDeleteItem,
      randomizeTrope: ProceduralTropeActorSheet.#onRandomizeTrope
    }
```

to:

```js
    actions: {
      rollSkill: ProceduralTropeActorSheet.#onRollSkill,
      toggleHurt: ProceduralTropeActorSheet.#onToggleHurt,
      resolveBStory: ProceduralTropeActorSheet.#onResolveBStory,
      createItem: ProceduralTropeActorSheet.#onCreateItem,
      editItem: ProceduralTropeActorSheet.#onEditItem,
      deleteItem: ProceduralTropeActorSheet.#onDeleteItem,
      randomizeTrope: ProceduralTropeActorSheet.#onRandomizeTrope
    }
```

Then add this new handler directly after `#onToggleHurt`:

```js
  static async #onToggleHurt() {
    await this.actor.update({ "system.hurt": !this.actor.system.hurt });
  }

  static async #onResolveBStory() {
    await this.actor.update({ "system.rerunPoints": this.actor.system.rerunPoints + 1 });
  }
```

(The first method is unchanged — shown for placement context; only the new `#onResolveBStory` method below it is added.)

- [ ] **Step 2: Add the button to the B-story field**

In `templates/actor/trope-sheet.hbs`, change:

```hbs
    <label>{{localize "PROCEDURAL.Actor.BStory"}}
      <textarea name="system.bStory">{{system.bStory}}</textarea>
    </label>
```

to:

```hbs
    <label>{{localize "PROCEDURAL.Actor.BStory"}}
      <textarea name="system.bStory">{{system.bStory}}</textarea>
      <button type="button" data-action="resolveBStory">{{localize "PROCEDURAL.Actor.ResolveBStory"}}</button>
    </label>
```

- [ ] **Step 3: Add the localization key**

In `lang/en.json`, inside the `PROCEDURAL.Actor` object, change:

```json
      "BStory": "B-Story",
      "HQ": "HQ",
```

to:

```json
      "BStory": "B-Story",
      "ResolveBStory": "Resolve (+1 Rerun Point)",
      "HQ": "HQ",
```

- [ ] **Step 4: Verify syntax**

```bash
node --check module/sheets/actor-trope-sheet.mjs && node -e "JSON.parse(require('fs').readFileSync('lang/en.json', 'utf8')); console.log('valid')"
```
Expected: no output, then `valid`.

- [ ] **Step 5: Run the full test suite as a regression check**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add module/sheets/actor-trope-sheet.mjs templates/actor/trope-sheet.hbs lang/en.json
git commit -m "feat: add a B-story resolution button that awards 1 Rerun Point"
```

---

### Task 5: `knockedOut` field and "Hurt Again" action

**Files:**
- Modify: `module/data/actor-trope.mjs:14`
- Modify: `module/sheets/actor-trope-sheet.mjs`
- Modify: `templates/actor/trope-sheet.hbs:18-23`
- Modify: `lang/en.json` (`PROCEDURAL.Actor`)

**Interfaces:**
- Consumes: `rollD6` from Task 1 (`module/helpers/dice-rules.mjs`).
- Produces: `system.knockedOut` (boolean, initial `false`) on `TropeActorData`. Task 7's `findActorsToHeal` reads this field name from `game.actors`.

- [ ] **Step 1: Add the `knockedOut` field**

In `module/data/actor-trope.mjs`, change:

```js
      rerunPoints: new NumberField({ required: true, integer: true, initial: 1, min: 0 }),
      hurt: new BooleanField({ initial: false }),
```

to:

```js
      rerunPoints: new NumberField({ required: true, integer: true, initial: 1, min: 0 }),
      hurt: new BooleanField({ initial: false }),
      knockedOut: new BooleanField({ initial: false }),
```

- [ ] **Step 2: Import `rollD6` and register the `hurtAgain` action**

In `module/sheets/actor-trope-sheet.mjs`, change the top of the file:

```js
const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
```

to:

```js
import { rollD6 } from "../helpers/dice-rules.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
```

Change (building on Task 4's already-updated actions block):

```js
    actions: {
      rollSkill: ProceduralTropeActorSheet.#onRollSkill,
      toggleHurt: ProceduralTropeActorSheet.#onToggleHurt,
      resolveBStory: ProceduralTropeActorSheet.#onResolveBStory,
      createItem: ProceduralTropeActorSheet.#onCreateItem,
      editItem: ProceduralTropeActorSheet.#onEditItem,
      deleteItem: ProceduralTropeActorSheet.#onDeleteItem,
      randomizeTrope: ProceduralTropeActorSheet.#onRandomizeTrope
    }
```

to:

```js
    actions: {
      rollSkill: ProceduralTropeActorSheet.#onRollSkill,
      toggleHurt: ProceduralTropeActorSheet.#onToggleHurt,
      hurtAgain: ProceduralTropeActorSheet.#onHurtAgain,
      resolveBStory: ProceduralTropeActorSheet.#onResolveBStory,
      createItem: ProceduralTropeActorSheet.#onCreateItem,
      editItem: ProceduralTropeActorSheet.#onEditItem,
      deleteItem: ProceduralTropeActorSheet.#onDeleteItem,
      randomizeTrope: ProceduralTropeActorSheet.#onRandomizeTrope
    }
```

Then add this new handler directly after `#onToggleHurt` (before Task 4's `#onResolveBStory`, order doesn't matter — place it adjacent to `#onToggleHurt` since both concern the Hurt state):

```js
  static async #onHurtAgain() {
    if (!this.actor.system.hurt) return;
    const hours = rollD6();
    await this.actor.update({ "system.knockedOut": true });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p>${this.actor.name} is hurt again and knocked out for ${hours} hours!</p>`
    });
  }
```

- [ ] **Step 3: Add the "Hurt Again" button and "Knocked Out" indicator**

In `templates/actor/trope-sheet.hbs`, change:

```hbs
    <div>
      <label>
        <input type="checkbox" data-action="toggleHurt" {{#if system.hurt}}checked{{/if}}>
        {{localize "PROCEDURAL.Actor.Hurt"}}
      </label>
    </div>
```

to:

```hbs
    <div>
      <label>
        <input type="checkbox" data-action="toggleHurt" {{#if system.hurt}}checked{{/if}}>
        {{localize "PROCEDURAL.Actor.Hurt"}}
      </label>
      {{#if system.hurt}}
        <button type="button" data-action="hurtAgain">{{localize "PROCEDURAL.Actor.HurtAgain"}}</button>
      {{/if}}
      {{#if system.knockedOut}}
        <span class="procedural-knocked-out-badge">{{localize "PROCEDURAL.Actor.KnockedOut"}}</span>
      {{/if}}
    </div>
```

- [ ] **Step 4: Add localization keys**

In `lang/en.json`, inside the `PROCEDURAL.Actor` object, change:

```json
      "RerunPoints": "Rerun Points",
      "Hurt": "Hurt",
```

to:

```json
      "RerunPoints": "Rerun Points",
      "Hurt": "Hurt",
      "HurtAgain": "Hurt Again (Knock Out)",
      "KnockedOut": "Knocked Out",
```

- [ ] **Step 5: Verify syntax**

```bash
node --check module/data/actor-trope.mjs && node --check module/sheets/actor-trope-sheet.mjs && node -e "JSON.parse(require('fs').readFileSync('lang/en.json', 'utf8')); console.log('valid')"
```
Expected: no output, then `valid`.

- [ ] **Step 6: Run the full test suite as a regression check**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add module/data/actor-trope.mjs module/sheets/actor-trope-sheet.mjs templates/actor/trope-sheet.hbs lang/en.json
git commit -m "feat: add Knocked Out tracking and a Hurt Again action"
```

---

### Task 6: Pure `findActorsToHeal` helper

**Files:**
- Create: `module/helpers/hurt-reset.mjs`
- Create: `module/helpers/hurt-reset.test.mjs`

**Interfaces:**
- Consumes: nothing — pure function, no imports beyond the test framework.
- Produces: `findActorsToHeal(actors)` where `actors` is `Array<{id: string, system: {hurt: boolean, knockedOut: boolean}}>`, returning `string[]` of actor ids where `system.hurt === true || system.knockedOut === true`. Task 7 imports this exact function and shape from `module/helpers/hurt-reset.mjs`.

- [ ] **Step 1: Write the failing tests**

Create `module/helpers/hurt-reset.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { findActorsToHeal } from "./hurt-reset.mjs";

test("findActorsToHeal returns an empty array for no actors", () => {
  assert.deepEqual(findActorsToHeal([]), []);
});

test("findActorsToHeal ignores an actor with neither flag set", () => {
  const actors = [{ id: "a1", system: { hurt: false, knockedOut: false } }];
  assert.deepEqual(findActorsToHeal(actors), []);
});

test("findActorsToHeal includes an actor with only hurt set", () => {
  const actors = [{ id: "a1", system: { hurt: true, knockedOut: false } }];
  assert.deepEqual(findActorsToHeal(actors), ["a1"]);
});

test("findActorsToHeal includes an actor with only knockedOut set", () => {
  const actors = [{ id: "a1", system: { hurt: false, knockedOut: true } }];
  assert.deepEqual(findActorsToHeal(actors), ["a1"]);
});

test("findActorsToHeal includes an actor with both flags set, once", () => {
  const actors = [{ id: "a1", system: { hurt: true, knockedOut: true } }];
  assert.deepEqual(findActorsToHeal(actors), ["a1"]);
});

test("findActorsToHeal handles multiple actors with mixed flags", () => {
  const actors = [
    { id: "a1", system: { hurt: true, knockedOut: false } },
    { id: "a2", system: { hurt: false, knockedOut: false } },
    { id: "a3", system: { hurt: false, knockedOut: true } }
  ];
  assert.deepEqual(findActorsToHeal(actors), ["a1", "a3"]);
});

test("findActorsToHeal treats a missing system object as not needing healing", () => {
  const actors = [{ id: "a1", system: {} }];
  assert.deepEqual(findActorsToHeal(actors), []);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --test module/helpers/hurt-reset.test.mjs
```
Expected: FAIL — `Cannot find module './hurt-reset.mjs'` (the module doesn't exist yet).

- [ ] **Step 3: Implement `module/helpers/hurt-reset.mjs`**

```js
/**
 * @param {Array<{id: string, system: {hurt: boolean, knockedOut: boolean}}>} actors
 * @returns {string[]} actor ids that need healing
 */
export function findActorsToHeal(actors) {
  return actors
    .filter(a => a.system?.hurt === true || a.system?.knockedOut === true)
    .map(a => a.id);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --test module/helpers/hurt-reset.test.mjs
```
Expected: PASS — all 7 tests.

- [ ] **Step 5: Run the full suite as a regression check**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add module/helpers/hurt-reset.mjs module/helpers/hurt-reset.test.mjs
git commit -m "feat: add pure findActorsToHeal helper with TDD coverage"
```

---

### Task 7: Wire auto-heal into the Case Tracker's Act-change hook

**Files:**
- Modify: `module/apps/case-tracker.mjs:1-19`

**Interfaces:**
- Consumes: `findActorsToHeal(actors)` from Task 6.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Import the helper**

In `module/apps/case-tracker.mjs`, change:

```js
import { resolveDice, rollD6 } from "../helpers/dice-rules.mjs";
import { findTalentsToReset } from "../helpers/talent-reset.mjs";
import { loadGeneratorData } from "../helpers/generator-data.mjs";
```

to:

```js
import { resolveDice, rollD6 } from "../helpers/dice-rules.mjs";
import { findTalentsToReset } from "../helpers/talent-reset.mjs";
import { findActorsToHeal } from "../helpers/hurt-reset.mjs";
import { loadGeneratorData } from "../helpers/generator-data.mjs";
```

- [ ] **Step 2: Call `healActors` alongside `resetTalentUses` on an Act change**

Change:

```js
async function setCaseTracker(data) {
  const previousAct = getCaseTracker().act;
  await game.settings.set("procedural", "caseTracker", data);
  if (data.act !== previousAct) {
    await resetTalentUses(data.act);
  }
}
```

to:

```js
async function setCaseTracker(data) {
  const previousAct = getCaseTracker().act;
  await game.settings.set("procedural", "caseTracker", data);
  if (data.act !== previousAct) {
    await resetTalentUses(data.act);
    await healActors(data.act);
  }
}
```

- [ ] **Step 3: Add the `healActors` function**

Add directly after the existing `resetTalentUses` function (after its closing brace, before the `CaseTrackerApplication` class definition):

```js
async function healActors(act) {
  const actors = game.actors.map(actor => ({
    id: actor.id,
    system: { hurt: actor.system?.hurt, knockedOut: actor.system?.knockedOut }
  }));
  const ids = findActorsToHeal(actors);
  if (!ids.length) return;

  try {
    for (const id of ids) {
      await game.actors.get(id).update({ "system.hurt": false, "system.knockedOut": false });
    }
  } catch (err) {
    console.error("PROCEDURAL | Failed to heal actors for the new act", err);
    ui.notifications?.error("PROCEDURAL! failed to heal actors. Check the console for details.");
    return;
  }

  const count = ids.length;
  ui.notifications?.info(`PROCEDURAL! healed ${count} actor${count === 1 ? "" : "s"} for Act ${act}.`);
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
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add module/apps/case-tracker.mjs
git commit -m "feat: auto-heal Hurt and Knocked Out actors when the Case Tracker's Act changes"
```

---

### Task 8: Update README and bump the system version

**Files:**
- Modify: `README.md:10-21`
- Modify: `system.json:5` (`version` field)
- Modify: `package.json:4` (`version` field)

**Interfaces:**
- Consumes: nothing (documentation + metadata only).
- Produces: nothing consumed by other tasks — this is the final task in the plan.

- [ ] **Step 1: Update the feature list**

In `README.md`, change:

```markdown
- Fully automated skill rolls: 2d6 + modifier, Advantage/Disadvantage,
  Critical Failure/Success, "Hurt" status effects, and Rerun Point rerolls
  via a chat card button
```

to:

```markdown
- Fully automated skill rolls: 2d6 + modifier, Advantage/Disadvantage,
  Critical Failure/Success, "Hurt" status effects, and Rerun Point rerolls
  via a chat card button — plus a "Hurt Again" action that flags a Trope
  Knocked Out when they're hurt while already Hurt, and a one-click button
  that awards the rulebook's +1 Rerun Point for resolving a B-story
```

And change:

```markdown
- A GM-only Case Tracker app (scene controls) for tracking act/scene,
  interludes, the arrest phase, evidence, and interrogations over the
  course of a session — changing the Act field automatically clears every
  Talent's "Used" checkbox (including each Trope's own built-in Talent) for
  every actor in the Actors directory
```

to:

```markdown
- A GM-only Case Tracker app (scene controls) for tracking act/scene,
  interludes, the arrest phase, evidence, interrogations, and a "Roll for
  Drama" team-flavor table over the course of a session — changing the Act
  field automatically clears every Talent's "Used" checkbox (including each
  Trope's own built-in Talent) and heals every Hurt/Knocked Out actor, for
  every actor in the Actors directory
```

- [ ] **Step 2: Bump the system version**

In `system.json`, change:

```json
  "version": "0.7.2",
```

to:

```json
  "version": "0.8.0",
```

(Minor bump for new features, per this repo's standing convention.)

- [ ] **Step 3: Bump the package version to match**

In `package.json`, change:

```json
  "version": "0.7.2",
```

to:

```json
  "version": "0.8.0",
```

- [ ] **Step 4: Run the full test suite one more time**

```bash
npm test
```
Expected: PASS — README and version-field changes don't touch tested code paths.

- [ ] **Step 5: Commit**

```bash
git add README.md system.json package.json
git commit -m "docs: document rulebook gap fixes and bump version to 0.8.0"
```

---

## Manual Smoke Test (after all tasks)

This system has no Foundry-runtime test harness (see README) — verify by hand:

1. Symlink/copy the repo into `<FoundryUserData>/Data/systems/procedural` per the README's install steps, run `npm run build:packs`, and launch a PROCEDURAL! world.
2. **Roll for Drama:** Open the Case Tracker (GM scene-controls launcher) and click "Roll for Drama." Confirm text appears both in the app's Drama section and as a chat message. Click it again; confirm the text can change and both the app and a new chat message update. Close and reopen the Case Tracker; confirm the rolled text is still shown (persisted).
3. **B-story Rerun Point:** Create a `trope` Actor, write something in the B-story field, note the current Rerun Points value, and click "Resolve (+1 Rerun Point)." Confirm Rerun Points increments by exactly 1. Click it again; confirm it increments again (no lock).
4. **Hurt Again / Knocked Out:** On the same actor, check the Hurt checkbox. Confirm a "Hurt Again" button now appears (it should not be visible while unchecked — verify by unchecking Hurt and confirming the button disappears, then re-check Hurt). With Hurt checked, click "Hurt Again." Confirm a chat message announces a knockout duration (1-6 hours) and a "Knocked Out" badge appears on the sheet.
5. **Auto-heal on Act change:** With that actor still Hurt and Knocked Out, open the Case Tracker and change the Act field. Confirm a notification reports healing at least 1 actor, and reopening the Trope sheet shows both Hurt and Knocked Out cleared. Also confirm the existing Talent-reset notification still fires independently (check a Talent's "Used" box before changing Act again).
6. Change the Act field again with no actors currently Hurt/Knocked Out anywhere; confirm no healing notification appears (no-op, no noise) — same as the existing Talent-reset behavior.
7. `npm test` passes with all new test files (`dice-rules.test.mjs` additions, `hurt-reset.test.mjs`).
