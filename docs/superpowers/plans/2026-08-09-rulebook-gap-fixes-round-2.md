# Rulebook Gap Fixes, Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close three rulebook gaps found with no code/data trace during a third rulebook-coverage audit: the Director 1d6 roll table (Season Tracker), the NPC ally personality 1d6 roll table (NPC sheet), and the "Having a Flashback" season-mode Talent-swap mechanic (Trope sheet).

**Architecture:** Director and NPC personality both reuse the existing `data/*.json` + `generator-data.mjs` roll-table pattern already used for Quality/Quirk/HQ/Agency Name/Drama, surfaced via a roll-and-overwrite action + read-only display (Director on the Season Tracker, personality on the NPC sheet — same shape as Roll for Drama). Flashback reuses Level Up's Talent-swap machinery: the dedup-against-other-actors computation and the delete-old/create-new swap are extracted out of `#onLevelUp` into two small shared static helpers on `ProceduralTropeActorSheet`, so both Level Up and the new Flashback action call the same logic instead of drifting apart. "A desk item may only have one flashback" is tracked as a `flashbackUsed` boolean on the Equipment item itself (not the actor) — the existing desk-item-replacement code path already deletes the old Equipment document, so a fresh desk item always starts with `flashbackUsed: false` for free.

**Tech Stack:** Foundry VTT v14 (`ApplicationV2`, `HandlebarsApplicationMixin`, `ActorSheetV2`, world settings), vanilla JS ES modules, Node's built-in test runner for pure logic.

## Global Constraints

- Target Foundry VTT v14 (same as the rest of this system).
- No new npm dependencies.
- Preserve the pure-logic-vs-Foundry-glue split: anything with no `game`/`Actor`/`ChatMessage`/DOM dependency is a pure, unit-tested helper in `module/helpers/`; anything that touches Foundry documents, settings, or chat stays in `module/apps/` or `module/sheets/` and is verified by hand (this codebase has no Foundry-runtime test harness). None of this round's three features have any new pure logic — all are UI wiring, so no new `.test.mjs` files are added.
- Follow this repo's existing code style exactly: no comments unless the WHY is non-obvious, `game.i18n.localize` for all user-facing strings (never hardcoded English in templates), `ui.notifications?.error(...)` + `console.error("PROCEDURAL | ...")` on every catch block that wraps a `game.settings` write (Director, matching Drama), no try/catch on plain `actor.update()`/`item.update()` calls (matching every existing single-field actor update in `actor-trope-sheet.mjs`).
- No manual free-text override for the Director or NPC-personality roll results — matches every existing roll table in this codebase (reroll to change it, or ignore the button and homebrew it).
- **Spec refinement:** the committed design doc's Flashback section sketches a single `#pickAndSwapTalent(actor, generatorData)` helper that pops its own dialog — but `#onLevelUp` already collects a chosen Talent name from its own combined stat/skill/Talent dialog, so calling a second dialog-popping helper from inside `#onLevelUp` would show the player two Talent pickers. This plan resolves that by splitting the spec's one helper into two smaller ones: `#getAvailableTalents(actor, generatorData)` (the dedup computation, no dialog) and `#swapTalent(actor, currentTalent, talentSource)` (the delete/create execution, no dialog). Each call site — `#onLevelUp` and the new `#onResolveFlashback` — builds its own dialog UI (they differ: Level Up's is stat+skill+Talent, Flashback's is Talent-only with no "keep current" option) and calls these two helpers around it. This keeps the spec's actual goal (one shared dedup rule, one shared swap execution, no duplicated logic) without the dialog conflict.
- Per this repo's standing convention, bump `version` in `system.json`, `package.json`, and `package-lock.json` together on every feature merge. Feature-adding PRs in this repo's history bump the **minor** version (0.7.2→0.8.0 for the first rulebook-gap-fixes PR, 0.8.x→0.9.0 for Season Mode progression); pure bugfix PRs bump patch (0.9.0→0.9.1→0.9.2). This PR adds three features, so it bumps 0.9.2 → **0.10.0**.
- Full spec: `docs/superpowers/specs/2026-08-09-rulebook-gap-fixes-round-2-design.md`.

---

### Task 1: Roll-table data files and `generator-data.mjs` registration

**Files:**
- Create: `data/directors.json`
- Create: `data/npc-personalities.json`
- Modify: `module/helpers/generator-data.mjs:1-11`

**Interfaces:**
- Consumes: nothing.
- Produces: `generatorData.directors` (array of 3 strings, index via `Math.ceil(roll / 2) - 1` for the rulebook's 1-2/3-4/5-6 grouping — consumed by Task 2) and `generatorData.npcPersonalities` (array of 6 strings, index via `roll - 1` — consumed by Task 3), both loaded through the existing `loadGeneratorData()` cache.

- [ ] **Step 1: Create `data/directors.json`**

Text transcribed verbatim from `rulebook/source_rulebook.md:2064-2105` (the "Director Table - Roll 1d6" table, grouped 1-2/3-4/5-6):

```json
[
  "Cynthia Tilman (60). Cynthia is a hard-as-nails Director who does not accept sub-par performance from her agency. She's nearing retirement and is especially conscious of the legacy she's leaving behind. The players' actions are a possible stain on her otherwise sterling record, and she won't have it. Cynthia loves making unannounced surprise visits at HQ, just to keep everyone on their toes.",
  "Byron Evers (50). Byron was a field agent for years until two bullets in his hip and back put him in a wheelchair for life. Byron is fairly tough but does have a soft spot for agents, since he used to be one. He doesn't like dressing anyone down, but he will do it. Byron prefers terse emails to in-person contact.",
  "Thomas \"Teddy\" O'Shea (38). Thomas is the youngest Director the agency has ever had, and is always fighting against the perception of him being soft, starting with the nickname \"Teddy\" that he got in the academy. He is a fan of trying weak conflict mediation techniques (sharing circles, a gold star chart, a gift card reward to a chain restaurant). Thomas knows that there is extra attention on him because of his age, so if the players are screwing up he could freak out. Thomas loves visiting in person and also long, unnecessary video meetings."
]
```

- [ ] **Step 2: Create `data/npc-personalities.json`**

Text transcribed verbatim from `rulebook/source_rulebook.md:1874-1898` (the "1d6 roll table of NPC personalities"):

```json
[
  "Elias Cope, 30. Hot-headed and impulsive, Elias has a jump-first, measure later attitude.",
  "Jennifer Thompson, 40. Measured and cautious, Jennifer is nursing an old knee injury which slows her down.",
  "Dave Hunt, 45. Cold and detached, Dave has an obsessive drive when it comes to working cases.",
  "Willow McClachlan, 25. Bright-eyed and eager, but naive.",
  "Ron Briar, 32. The class clown, but out of his depth in a fight.",
  "Cindy Huntsman, 30. Methodical and very by-the-book."
]
```

- [ ] **Step 3: Register both files in `GENERATOR_DATA_PATHS`**

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
  deskItems: "systems/procedural/data/desk-items.json",
  drama: "systems/procedural/data/drama.json"
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
  drama: "systems/procedural/data/drama.json",
  directors: "systems/procedural/data/directors.json",
  npcPersonalities: "systems/procedural/data/npc-personalities.json"
};
```

- [ ] **Step 4: Verify JSON validity and run the test suite**

```bash
node -e "JSON.parse(require('fs').readFileSync('data/directors.json', 'utf8')); console.log('directors.json valid')"
node -e "JSON.parse(require('fs').readFileSync('data/npc-personalities.json', 'utf8')); console.log('npc-personalities.json valid')"
node --check module/helpers/generator-data.mjs
npm test
```

Expected: both `valid` lines print, `--check` produces no output, and all existing tests still pass (this task adds no testable logic — `generator-data.mjs`'s `loadGeneratorData()` uses `fetch`, unavailable under `node --test`, and is already untested).

- [ ] **Step 5: Commit**

```bash
git add data/directors.json data/npc-personalities.json module/helpers/generator-data.mjs
git commit -m "feat: add Director and NPC personality roll-table data"
```

---

### Task 2: Director table on the Season Tracker

**Files:**
- Modify: `module/data/season-tracker.mjs`
- Modify: `module/apps/season-tracker.mjs`
- Modify: `templates/apps/season-tracker.hbs`
- Modify: `lang/en.json` (`PROCEDURAL.SeasonTracker`)

**Interfaces:**
- Consumes: `generatorData.directors` from Task 1.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the `director` field to `SeasonTrackerData`**

In `module/data/season-tracker.mjs`, change:

```js
      ep3RerunGranted: new BooleanField({ initial: false }),
      ep5RerunGranted: new BooleanField({ initial: false }),
      ep3LevelUpGranted: new BooleanField({ initial: false }),
      ep6LevelUpGranted: new BooleanField({ initial: false }),
      villains: new ArrayField(
```

to:

```js
      ep3RerunGranted: new BooleanField({ initial: false }),
      ep5RerunGranted: new BooleanField({ initial: false }),
      ep3LevelUpGranted: new BooleanField({ initial: false }),
      ep6LevelUpGranted: new BooleanField({ initial: false }),
      director: new StringField({ initial: "" }),
      villains: new ArrayField(
```

- [ ] **Step 2: Import `rollD6` and `loadGeneratorData` in the Season Tracker app**

In `module/apps/season-tracker.mjs`, change:

```js
import { computeRating, countRecordedEpisodes } from "../helpers/season-benchmarks.mjs";
```

to:

```js
import { computeRating, countRecordedEpisodes } from "../helpers/season-benchmarks.mjs";
import { rollD6 } from "../helpers/dice-rules.mjs";
import { loadGeneratorData } from "../helpers/generator-data.mjs";
```

- [ ] **Step 3: Register the `rollDirector` action**

In `module/apps/season-tracker.mjs`, change:

```js
    actions: {
      grantEp3Rerun: SeasonTrackerApplication.#onGrantEp3Rerun,
      grantEp5Rerun: SeasonTrackerApplication.#onGrantEp5Rerun,
      grantEp3LevelUp: SeasonTrackerApplication.#onGrantEp3LevelUp,
      grantEp6LevelUp: SeasonTrackerApplication.#onGrantEp6LevelUp,
      addVillain: SeasonTrackerApplication.#onAddVillain,
      deleteVillain: SeasonTrackerApplication.#onDeleteVillain
    }
```

to:

```js
    actions: {
      grantEp3Rerun: SeasonTrackerApplication.#onGrantEp3Rerun,
      grantEp5Rerun: SeasonTrackerApplication.#onGrantEp5Rerun,
      grantEp3LevelUp: SeasonTrackerApplication.#onGrantEp3LevelUp,
      grantEp6LevelUp: SeasonTrackerApplication.#onGrantEp6LevelUp,
      rollDirector: SeasonTrackerApplication.#onRollDirector,
      addVillain: SeasonTrackerApplication.#onAddVillain,
      deleteVillain: SeasonTrackerApplication.#onDeleteVillain
    }
```

- [ ] **Step 4: Expose `director` in `_prepareContext` and `#formToData`**

In `module/apps/season-tracker.mjs`, change:

```js
    context.villains = data.villains;
    context.villainWarning = data.villains.filter(v => v.active).length >= 3;

    return context;
```

to:

```js
    context.director = data.director;
    context.villains = data.villains;
    context.villainWarning = data.villains.filter(v => v.active).length >= 3;

    return context;
```

And change:

```js
      ep3RerunGranted: current.ep3RerunGranted,
      ep5RerunGranted: current.ep5RerunGranted,
      ep3LevelUpGranted: current.ep3LevelUpGranted,
      ep6LevelUpGranted: current.ep6LevelUpGranted,
      villains: Object.values(expanded.villains ?? {}).map(v => ({
```

to:

```js
      ep3RerunGranted: current.ep3RerunGranted,
      ep5RerunGranted: current.ep5RerunGranted,
      ep3LevelUpGranted: current.ep3LevelUpGranted,
      ep6LevelUpGranted: current.ep6LevelUpGranted,
      director: expanded.director ?? "",
      villains: Object.values(expanded.villains ?? {}).map(v => ({
```

(`director` is a `StringField`, so — unlike the four `BooleanField` grant guards, which have no safe hidden-input round-trip and must always be carried forward from `current` — it round-trips through a hidden input in the template exactly like the Case Tracker's `drama` field already does.)

- [ ] **Step 5: Add the `#onRollDirector` handler**

In `module/apps/season-tracker.mjs`, add this method directly after `#onGrantEp6LevelUp` (before `#onAddVillain`):

```js
  static async #onRollDirector() {
    const generatorData = await loadGeneratorData();
    const roll = rollD6();
    const text = generatorData.directors[Math.ceil(roll / 2) - 1];

    const data = SeasonTrackerApplication.#formToData(this.form);
    data.director = text;
    try {
      await setSeasonTracker(data);
    } catch (err) {
      console.error("PROCEDURAL | Failed to save the Director roll result", err);
      ui.notifications?.error("PROCEDURAL! failed to save the Director roll. Check the console for details.");
      return;
    }
    this.render();
  }
```

- [ ] **Step 6: Add the Director section to the Season Tracker template**

In `templates/apps/season-tracker.hbs`, add this new section directly before the Villains section:

```hbs
  <section class="procedural-season-tracker-director">
    <h2>{{localize "PROCEDURAL.SeasonTracker.Director"}}</h2>
    <input type="hidden" name="director" value="{{director}}">
    <p class="procedural-season-tracker-director-text">{{director}}</p>
    <button type="button" data-action="rollDirector">{{localize "PROCEDURAL.SeasonTracker.RollDirector"}}</button>
  </section>

  <section class="procedural-season-tracker-villains">
```

(That's the existing `<section class="procedural-season-tracker-villains">` opening tag with the new Director section inserted immediately above it — don't duplicate the Villains section, just prepend to it.)

- [ ] **Step 7: Add localization keys**

In `lang/en.json`, inside the `PROCEDURAL.SeasonTracker` object, change:

```json
    "SeasonTracker": {
      "Title": "Season Tracker",
      "Rating": "Agency Rating",
```

to:

```json
    "SeasonTracker": {
      "Title": "Season Tracker",
      "Director": "Director",
      "RollDirector": "Roll Director",
      "Rating": "Agency Rating",
```

- [ ] **Step 8: Verify syntax and run the test suite**

```bash
node --check module/apps/season-tracker.mjs && node --check module/data/season-tracker.mjs
node -e "JSON.parse(require('fs').readFileSync('lang/en.json', 'utf8')); console.log('valid')"
npm test
```

Expected: no output from `--check`, `valid` prints, all tests pass.

- [ ] **Step 9: Commit**

```bash
git add module/data/season-tracker.mjs module/apps/season-tracker.mjs templates/apps/season-tracker.hbs lang/en.json
git commit -m "feat: add Director roll table to the Season Tracker"
```

---

### Task 3: NPC ally personality table

**Files:**
- Modify: `module/data/actor-npc.mjs`
- Modify: `module/sheets/actor-npc-sheet.mjs`
- Modify: `templates/actor/npc-sheet.hbs`
- Modify: `lang/en.json` (`PROCEDURAL.Actor`)

**Interfaces:**
- Consumes: `generatorData.npcPersonalities` from Task 1.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the `personality` field to `NpcActorData`**

In `module/data/actor-npc.mjs`, change:

```js
import { buildSkillsSchema } from "./shared.mjs";

export default class NpcActorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      skills: buildSkillsSchema(1)
    };
  }
}
```

to:

```js
import { buildSkillsSchema } from "./shared.mjs";

export default class NpcActorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { StringField } = foundry.data.fields;

    return {
      skills: buildSkillsSchema(1),
      personality: new StringField({ initial: "" })
    };
  }
}
```

- [ ] **Step 2: Register the `rollPersonality` action and its handler**

In `module/sheets/actor-npc-sheet.mjs`, change:

```js
const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export default class ProceduralNpcActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["procedural", "sheet", "actor", "npc"],
    position: { width: 480, height: 480 },
    window: { resizable: true },
    actions: {
      createItem: ProceduralNpcActorSheet.#onCreateItem,
      editItem: ProceduralNpcActorSheet.#onEditItem,
      deleteItem: ProceduralNpcActorSheet.#onDeleteItem
    }
  };
```

to:

```js
import { rollD6 } from "../helpers/dice-rules.mjs";
import { loadGeneratorData } from "../helpers/generator-data.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export default class ProceduralNpcActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["procedural", "sheet", "actor", "npc"],
    position: { width: 480, height: 480 },
    window: { resizable: true },
    actions: {
      rollPersonality: ProceduralNpcActorSheet.#onRollPersonality,
      createItem: ProceduralNpcActorSheet.#onCreateItem,
      editItem: ProceduralNpcActorSheet.#onEditItem,
      deleteItem: ProceduralNpcActorSheet.#onDeleteItem
    }
  };
```

Then, in the same file, change:

```js
    return context;
  }

  static async #onCreateItem(event, target) {
```

to:

```js
    return context;
  }

  static async #onRollPersonality() {
    const generatorData = await loadGeneratorData();
    const roll = rollD6();
    await this.actor.update({ "system.personality": generatorData.npcPersonalities[roll - 1] });
  }

  static async #onCreateItem(event, target) {
```

(No try/catch here — this matches every other single-field `actor.update()` call in `actor-trope-sheet.mjs`, e.g. `#onToggleHurt`/`#onResolveBStory`, none of which wrap the update. Unlike `game.settings` writes, a failed `Actor#update()` throws all the way up to Foundry's own error UI, which is the existing convention for actor-document writes in this codebase.)

- [ ] **Step 3: Add the personality display and roll button to the NPC sheet template**

In `templates/actor/npc-sheet.hbs`, change:

```hbs
  <section class="procedural-skills-grid">
```

to:

```hbs
  <section class="procedural-npc-personality">
    <h3>{{localize "PROCEDURAL.Actor.Personality"}}</h3>
    <p class="procedural-npc-personality-text">{{system.personality}}</p>
    <button type="button" data-action="rollPersonality">{{localize "PROCEDURAL.Actor.RollPersonality"}}</button>
  </section>

  <section class="procedural-skills-grid">
```

- [ ] **Step 4: Add localization keys**

In `lang/en.json`, inside the `PROCEDURAL.Actor` object, change:

```json
      "LevelUpConfirm": "Confirm Level Up",
      "LevelUpInvalid": "That skill doesn't match the chosen stat, or is already at the cap. Reopen Level Up and pick again."
    },
```

to:

```json
      "LevelUpConfirm": "Confirm Level Up",
      "LevelUpInvalid": "That skill doesn't match the chosen stat, or is already at the cap. Reopen Level Up and pick again.",
      "Personality": "Personality",
      "RollPersonality": "Roll Personality"
    },
```

- [ ] **Step 5: Verify syntax and run the test suite**

```bash
node --check module/data/actor-npc.mjs && node --check module/sheets/actor-npc-sheet.mjs
node -e "JSON.parse(require('fs').readFileSync('lang/en.json', 'utf8')); console.log('valid')"
npm test
```

Expected: no output from `--check`, `valid` prints, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add module/data/actor-npc.mjs module/sheets/actor-npc-sheet.mjs templates/actor/npc-sheet.hbs lang/en.json
git commit -m "feat: add NPC ally personality roll table"
```

---

### Task 4: Extract shared Talent-swap helpers from Level Up

**Files:**
- Modify: `module/sheets/actor-trope-sheet.mjs:119-212` (`#onLevelUp`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `ProceduralTropeActorSheet.#getAvailableTalents(actor, generatorData)` → `{ currentTalent: Item|undefined, availableTalents: Array<{name, img, system}> }`, and `ProceduralTropeActorSheet.#swapTalent(actor, currentTalent, talentSource)` → `Promise<void>` (deletes `currentTalent` if present, creates a new `talent` Item from `talentSource`). Task 5's `#onResolveFlashback` calls both.

This task is a pure refactor — Level Up's behavior must be identical before and after. There's no automated coverage for sheet wiring in this codebase, so "testing" here means running the existing suite as a regression check (no logic changed, only where it lives) plus a manual pass through Level Up.

- [ ] **Step 1: Extract the two helpers and simplify `#onLevelUp`**

In `module/sheets/actor-trope-sheet.mjs`, change:

```js
  static async #onLevelUp() {
    if (!this.actor.system.levelUpsAvailable) return;

    const generatorData = await loadGeneratorData();
    const currentTalent = this.actor.items.find(i => i.type === "talent");
    const heldElsewhere = new Set(
      game.actors
        .filter(a => a.type === "trope" && a.id !== this.actor.id)
        .flatMap(a => a.items.filter(i => i.type === "talent").map(i => i.name))
    );
    const availableTalents = generatorData.secondTalents.filter(t => !heldElsewhere.has(t.name));
    const skills = this.actor.system.skills;
```

to:

```js
  static #getAvailableTalents(actor, generatorData) {
    const currentTalent = actor.items.find(i => i.type === "talent");
    const heldElsewhere = new Set(
      game.actors
        .filter(a => a.type === "trope" && a.id !== actor.id)
        .flatMap(a => a.items.filter(i => i.type === "talent").map(i => i.name))
    );
    const availableTalents = generatorData.secondTalents.filter(t => !heldElsewhere.has(t.name));
    return { currentTalent, availableTalents };
  }

  static async #swapTalent(actor, currentTalent, talentSource) {
    if (currentTalent) await currentTalent.delete();
    await Item.createDocuments(
      [{ name: talentSource.name, type: "talent", img: talentSource.img, system: { ...talentSource.system } }],
      { parent: actor }
    );
  }

  static async #onLevelUp() {
    if (!this.actor.system.levelUpsAvailable) return;

    const generatorData = await loadGeneratorData();
    const { currentTalent, availableTalents } = ProceduralTropeActorSheet.#getAvailableTalents(this.actor, generatorData);
    const skills = this.actor.system.skills;
```

Then, further down in the same method, change:

```js
    if (config.talentName) {
      const talentSource = availableTalents.find(t => t.name === config.talentName);
      if (talentSource) {
        if (currentTalent) await currentTalent.delete();
        await Item.createDocuments(
          [{ name: talentSource.name, type: "talent", img: talentSource.img, system: { ...talentSource.system } }],
          { parent: this.actor }
        );
      }
    }
  }
```

to:

```js
    if (config.talentName) {
      const talentSource = availableTalents.find(t => t.name === config.talentName);
      if (talentSource) {
        await ProceduralTropeActorSheet.#swapTalent(this.actor, currentTalent, talentSource);
      }
    }
  }
```

- [ ] **Step 2: Verify syntax and run the test suite**

```bash
node --check module/sheets/actor-trope-sheet.mjs
npm test
```

Expected: no output from `--check`, all tests pass (no test file touches this sheet; this is a pure regression check that nothing else broke).

- [ ] **Step 3: Manually verify Level Up is unchanged**

In a running Foundry world with this system: give a Trope actor at least 1 `levelUpsAvailable` (e.g. via the Season Tracker's grant buttons, or by editing the field directly in the sheet), click "Level Up", pick a stat/skill, and pick a Talent swap from the dropdown. Confirm: the stat and skill both increment by 1, `levelUpsAvailable` decrements by 1, the old Talent item is gone, and the new one appears with matching name/img/description. Repeat once choosing "Keep current Talent" — confirm the Talent list is untouched while the stat/skill/levelUpsAvailable changes still apply.

- [ ] **Step 4: Commit**

```bash
git add module/sheets/actor-trope-sheet.mjs
git commit -m "refactor: extract shared Talent-swap helpers out of Level Up"
```

---

### Task 5: Having a Flashback

**Files:**
- Modify: `module/data/item-equipment.mjs`
- Modify: `module/sheets/actor-trope-sheet.mjs`
- Modify: `templates/actor/trope-sheet.hbs`
- Modify: `lang/en.json` (`PROCEDURAL.Actor`)

**Interfaces:**
- Consumes: `ProceduralTropeActorSheet.#getAvailableTalents` and `ProceduralTropeActorSheet.#swapTalent` from Task 4; `loadGeneratorData` (already imported in this file).
- Produces: `EquipmentItemData.flashbackUsed: boolean`, consumed by the template to hide the Flashback button once used.

- [ ] **Step 1: Add `flashbackUsed` to `EquipmentItemData`**

In `module/data/item-equipment.mjs`, change:

```js
export default class EquipmentItemData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { StringField } = foundry.data.fields;

    return {
      description: new StringField({ required: true, initial: "", blank: true })
    };
  }
}
```

to:

```js
export default class EquipmentItemData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { StringField, BooleanField } = foundry.data.fields;

    return {
      description: new StringField({ required: true, initial: "", blank: true }),
      flashbackUsed: new BooleanField({ initial: false })
    };
  }
}
```

- [ ] **Step 2: Register the `resolveFlashback` action**

In `module/sheets/actor-trope-sheet.mjs`, change:

```js
      resolveBStory: ProceduralTropeActorSheet.#onResolveBStory,
      levelUp: ProceduralTropeActorSheet.#onLevelUp,
```

to:

```js
      resolveBStory: ProceduralTropeActorSheet.#onResolveBStory,
      resolveFlashback: ProceduralTropeActorSheet.#onResolveFlashback,
      levelUp: ProceduralTropeActorSheet.#onLevelUp,
```

- [ ] **Step 3: Add the `#onResolveFlashback` handler**

In `module/sheets/actor-trope-sheet.mjs`, change:

```js
  static async #onResolveBStory() {
    await this.actor.update({ "system.rerunPoints": this.actor.system.rerunPoints + 1 });
  }

  static #getAvailableTalents(actor, generatorData) {
```

to:

```js
  static async #onResolveBStory() {
    await this.actor.update({ "system.rerunPoints": this.actor.system.rerunPoints + 1 });
  }

  static async #onResolveFlashback() {
    const deskItem = this.actor.items.get(this.actor.system.deskItemId);
    if (!deskItem || deskItem.system.flashbackUsed) return;

    const generatorData = await loadGeneratorData();
    const { currentTalent, availableTalents } = ProceduralTropeActorSheet.#getAvailableTalents(this.actor, generatorData);

    const talentName = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize("PROCEDURAL.Actor.Flashback") },
      content: `
        <div class="procedural-flashback-dialog">
          <label>${game.i18n.localize("PROCEDURAL.Actor.LevelUpTalentSwap")}
            <select name="talentName">
              ${availableTalents.map(t => `<option value="${t.name}">${t.name}</option>`).join("")}
            </select>
          </label>
        </div>
      `,
      buttons: [
        {
          action: "confirm",
          label: game.i18n.localize("PROCEDURAL.Actor.LevelUpConfirm"),
          default: true,
          callback: (event, button) => button.form.elements.talentName.value
        },
        { action: "cancel", label: game.i18n.localize("PROCEDURAL.Roll.Cancel"), callback: () => false }
      ],
      rejectClose: false
    });

    if (!talentName) return;
    const talentSource = availableTalents.find(t => t.name === talentName);
    if (!talentSource) return;

    await deskItem.update({ "system.flashbackUsed": true });
    await ProceduralTropeActorSheet.#swapTalent(this.actor, currentTalent, talentSource);
  }

  static #getAvailableTalents(actor, generatorData) {
```

(This relies on Task 4 already having placed `#getAvailableTalents`/`#swapTalent` directly after this insertion point — if working through the tasks in order, `#getAvailableTalents` should be the very next method in the file already.)

- [ ] **Step 4: Add the "Have a Flashback" button to the desk item section**

In `templates/actor/trope-sheet.hbs`, change:

```hbs
  <section class="procedural-desk-item" data-drop-zone="desk-item">
    <h3>{{localize "PROCEDURAL.Actor.DeskItem"}}</h3>
    {{#if deskItem}}
      <div class="procedural-desk-item-card" data-item-id="{{deskItem.id}}">
        <img class="procedural-desk-item-img" src="{{deskItem.img}}" alt="{{deskItem.name}}">
        <div class="procedural-desk-item-info">
          <strong>{{deskItem.name}}</strong>
          <p>{{deskItem.system.description}}</p>
        </div>
        <button type="button" data-action="editItem">✎</button>
        <button type="button" data-action="deleteItem">✕</button>
      </div>
    {{else}}
      <p class="procedural-desk-item-empty">{{localize "PROCEDURAL.Actor.DeskItemEmpty"}}</p>
    {{/if}}
  </section>
```

to:

```hbs
  <section class="procedural-desk-item" data-drop-zone="desk-item">
    <h3>{{localize "PROCEDURAL.Actor.DeskItem"}}</h3>
    {{#if deskItem}}
      <div class="procedural-desk-item-card" data-item-id="{{deskItem.id}}">
        <img class="procedural-desk-item-img" src="{{deskItem.img}}" alt="{{deskItem.name}}">
        <div class="procedural-desk-item-info">
          <strong>{{deskItem.name}}</strong>
          <p>{{deskItem.system.description}}</p>
        </div>
        <button type="button" data-action="editItem">✎</button>
        <button type="button" data-action="deleteItem">✕</button>
      </div>
      {{#unless deskItem.system.flashbackUsed}}
        <button type="button" data-action="resolveFlashback">{{localize "PROCEDURAL.Actor.ResolveFlashback"}}</button>
      {{/unless}}
    {{else}}
      <p class="procedural-desk-item-empty">{{localize "PROCEDURAL.Actor.DeskItemEmpty"}}</p>
    {{/if}}
  </section>
```

- [ ] **Step 5: Add localization keys**

In `lang/en.json`, inside the `PROCEDURAL.Actor` object, change:

```json
      "Personality": "Personality",
      "RollPersonality": "Roll Personality"
    },
```

to:

```json
      "Personality": "Personality",
      "RollPersonality": "Roll Personality",
      "Flashback": "Flashback",
      "ResolveFlashback": "Have a Flashback"
    },
```

(This depends on Task 3 having already inserted `Personality`/`RollPersonality` — if working through the tasks in order, those are already the last two keys in the `Actor` object.)

- [ ] **Step 6: Verify syntax and run the test suite**

```bash
node --check module/data/item-equipment.mjs && node --check module/sheets/actor-trope-sheet.mjs
node -e "JSON.parse(require('fs').readFileSync('lang/en.json', 'utf8')); console.log('valid')"
npm test
```

Expected: no output from `--check`, `valid` prints, all tests pass.

- [ ] **Step 7: Manually verify Flashback**

In a running Foundry world: create a Trope actor with at least one Equipment item, drag it onto the desk item drop zone. Confirm a "Have a Flashback" button appears next to the desk item card. Click it, pick a Talent from the dropdown, and confirm: the old secondary Talent (if any) is gone, the new one appears, and the "Have a Flashback" button disappears (desk item is now used up). Delete the desk item and drag a *different* Equipment item into the drop zone; confirm "Have a Flashback" reappears for the new item (fresh `flashbackUsed: false`). Click Cancel in the Talent dialog on a fresh desk item; confirm nothing changes and the button is still there afterward.

- [ ] **Step 8: Commit**

```bash
git add module/data/item-equipment.mjs module/sheets/actor-trope-sheet.mjs templates/actor/trope-sheet.hbs lang/en.json
git commit -m "feat: add Having a Flashback Talent-swap action"
```

---

### Task 6: Update README and bump the system version

**Files:**
- Modify: `README.md:8, 25-32`
- Modify: `system.json:5`
- Modify: `package.json:4`
- Modify: `package-lock.json` (via `npm install --package-lock-only`)

**Interfaces:**
- Consumes: nothing (documentation + metadata only).
- Produces: nothing — final task in the plan.

- [ ] **Step 1: Mention the NPC personality table**

In `README.md`, change:

```markdown
- Trope (PC) and NPC actor sheets
```

to:

```markdown
- Trope (PC) and NPC actor sheets — NPC sheets include a 1d6 ally
  personality roll table
```

- [ ] **Step 2: Mention the Director table and Flashback**

In `README.md`, change:

```markdown
- A GM-only Season Tracker app (scene controls) for Season Mode: records
  each of a season's 6 episode outcomes, computes the running Agency
  Rating, shows the matching rulebook Director-reaction text, and offers
  one-click (double-grant-guarded) buttons to award the party's Rerun
  Point and Level Up benchmarks. Leveling Up is a dialog on the Trope
  sheet (appears once a Level Up is available) for the +1 stat / divested
  skill / optional second-Talent swap. Villains are tracked as a simple
  list with a 3-or-more warning
```

to:

```markdown
- A GM-only Season Tracker app (scene controls) for Season Mode: records
  each of a season's 6 episode outcomes, computes the running Agency
  Rating, shows the matching rulebook Director-reaction text, rolls a 1d6
  Director table for the season's antagonist-boss NPC, and offers
  one-click (double-grant-guarded) buttons to award the party's Rerun
  Point and Level Up benchmarks. Leveling Up is a dialog on the Trope
  sheet (appears once a Level Up is available) for the +1 stat / divested
  skill / optional second-Talent swap; a season-mode "Have a Flashback"
  button on the desk item offers the same Talent swap, once per desk
  item. Villains are tracked as a simple list with a 3-or-more warning
```

- [ ] **Step 3: Bump the system version**

In `system.json`, change:

```json
  "version": "0.9.2",
```

to:

```json
  "version": "0.10.0",
```

- [ ] **Step 4: Bump the package version to match**

In `package.json`, change:

```json
  "version": "0.9.2",
```

to:

```json
  "version": "0.10.0",
```

- [ ] **Step 5: Sync the lockfile**

```bash
npm install --package-lock-only
```

Expected: `package-lock.json`'s two `"version": "0.9.2"` entries (root package name and the `""` package) become `"0.10.0"`.

- [ ] **Step 6: Run the full test suite one more time**

```bash
npm test
```

Expected: PASS — README and version-field changes don't touch tested code paths.

- [ ] **Step 7: Commit**

```bash
git add README.md system.json package.json package-lock.json
git commit -m "docs: document round-2 rulebook gap fixes and bump version to 0.10.0"
```

---

## Manual Smoke Test (after all tasks)

This system has no Foundry-runtime test harness — verify by hand, in addition to each task's own manual-verification step above:

1. Symlink/copy the repo into `<FoundryUserData>/Data/systems/procedural` per the README's install steps, run `npm run build:packs`, and launch a PROCEDURAL! world.
2. **Director table:** Open the Season Tracker (GM scene-controls launcher) and click "Roll Director." Confirm one of the three Director texts appears in the Director section. Click it again a few times; confirm it can change between all three. Close and reopen the Season Tracker; confirm the rolled text persists.
3. **NPC personality table:** Create an `npc` Actor, open its sheet, click "Roll Personality." Confirm one of the six personalities appears. Click again to confirm it can reroll. Close and reopen the sheet; confirm it persists (it's a real Actor field, so this should be automatic).
4. **Flashback, full lifecycle:** Create a `trope` Actor with a couple of Equipment items available in its inventory. Drag one onto the desk item drop zone. Confirm "Have a Flashback" appears. Click it, cancel out of the dialog — confirm the button is still there and nothing changed. Click it again, pick a Talent, confirm the swap happens and the button disappears. Delete the desk item, drag a different Equipment item in as the new desk item, and confirm "Have a Flashback" is available again for it.
5. **Level Up regression:** With the same or another Trope actor, grant a Level Up (Season Tracker's Ep3/Ep6 buttons, or by hand-editing `levelUpsAvailable`) and run through Level Up once with a Talent swap and once keeping the current Talent. Confirm both still work exactly as before this branch (Task 4's refactor didn't change behavior).
6. `npm test` passes.
