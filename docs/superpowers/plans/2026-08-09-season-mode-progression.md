# Season Mode Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the three untooled Season Mode mechanics from the rulebook — Agency Rating, Leveling Up, and Villains — as a new GM-only Season Tracker app plus a Level Up flow on the Trope sheet.

**Architecture:** A new `SeasonTrackerApplication` (own scene-control button, own `seasonTracker` world setting) tracks 6 fixed episode-outcome slots, computes the running Agency Rating and benchmark eligibility via pure helpers, and exposes one-click "Grant" buttons (guarded against double-award) for the rulebook's Rerun Point and Level Up payoffs. Leveling Up reuses the "banked resource" pattern already established by Rerun Points: a new `levelUpsAvailable` counter on `TropeActorData`, incremented by the Season Tracker's grants and decremented by a Level Up dialog on the Trope sheet. Villains are a plain list on the Season Tracker, no new Actor documents.

**Tech Stack:** Foundry VTT v14 (`ApplicationV2`, `HandlebarsApplicationMixin`, `ActorSheetV2`, `DialogV2`, world settings), vanilla JS ES modules, Node's built-in test runner for pure logic.

## Global Constraints

- Target Foundry VTT v14 (same as the rest of this system).
- No new npm dependencies.
- Preserve the pure-logic-vs-Foundry-glue split: `season-benchmarks.mjs` and `level-up.mjs` are pure, unit-tested helpers in `module/helpers/` with no Foundry globals; everything that touches `Actor`/`Item` documents, `game.settings`, or chat stays in `module/apps/`/`module/sheets/` and is verified by hand (this codebase has no Foundry-runtime test harness).
- All existing tests must keep passing unmodified.
- Follow this repo's existing code style exactly: no comments unless the WHY is non-obvious, `game.i18n.localize`/`game.i18n.format` for all user-facing strings, `ui.notifications?.error(...)` + `console.error("PROCEDURAL | ...")` on every catch block that wraps a Foundry document write, matching the existing handlers in `case-tracker.mjs`.
- Villain "disadvantage on all rolls in a scene" is reference-only — no roll-engine changes, no new state read by `dice-rules.mjs`/`ProceduralActor#rollSkill`.
- No fake Director dialogue — benchmark flavor text is fixed reference copy paraphrased from the rulebook, not generated.
- Leveling Up's skill choice must belong to the chosen stat's group (`mental` → `tech`/`lab`/`investigation`, `physical` → `violence`/`reflexes`/`coordination`, `social` → `cool`/`intuition`/`deception`) — confirmed with the user during planning, not left as a free choice.
- The four Season Tracker guard booleans (`ep3RerunGranted`, `ep5RerunGranted`, `ep3LevelUpGranted`, `ep6LevelUpGranted`) are never exposed as form inputs — they round-trip through `#formToData` by reading the currently-persisted values, not the submitted form, because a `BooleanField` has no safe hidden-input serialization the way the existing `drama` `StringField` does. Grant actions flip exactly one flag via a fresh read of `getSeasonTracker().toObject()`, never via the form.
- Per this repo's standing convention, bump `version` in both `system.json` and `package.json` together on every feature merge.
- Full spec: `docs/superpowers/specs/2026-08-09-season-mode-progression-design.md`.

---

### Task 1: `SeasonTrackerData` schema

**Files:**
- Create: `module/data/season-tracker.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `SeasonTrackerData` (default export), a `foundry.abstract.DataModel` with fields `episodes` (6-entry array of `{outcome}`), `ep3RerunGranted`, `ep5RerunGranted`, `ep3LevelUpGranted`, `ep6LevelUpGranted` (booleans), `villains` (array of `{id, name, reason, active}`). Task 5 registers this class as the `seasonTracker` world setting's `type`.

- [ ] **Step 1: Create the file**

```js
export default class SeasonTrackerData extends foundry.abstract.DataModel {
  static defineSchema() {
    const { SchemaField, StringField, BooleanField, ArrayField } = foundry.data.fields;

    return {
      episodes: new ArrayField(
        new SchemaField({
          outcome: new StringField({ initial: "", choices: ["", "successful", "neutral", "unsuccessful"] })
        }),
        { initial: [{ outcome: "" }, { outcome: "" }, { outcome: "" }, { outcome: "" }, { outcome: "" }, { outcome: "" }] }
      ),
      ep3RerunGranted: new BooleanField({ initial: false }),
      ep5RerunGranted: new BooleanField({ initial: false }),
      ep3LevelUpGranted: new BooleanField({ initial: false }),
      ep6LevelUpGranted: new BooleanField({ initial: false }),
      villains: new ArrayField(
        new SchemaField({
          id: new StringField({ required: true }),
          name: new StringField({ initial: "" }),
          reason: new StringField({ initial: "" }),
          active: new BooleanField({ initial: true })
        }),
        { initial: [] }
      )
    };
  }
}
```

- [ ] **Step 2: Verify syntax**

```bash
node --check module/data/season-tracker.mjs
```
Expected: no output.

- [ ] **Step 3: Run the full test suite as a regression check**

```bash
npm test
```
Expected: all tests pass (this file has no Node-testable surface — it depends on Foundry's `foundry.abstract.DataModel`/`foundry.data.fields` globals — and isn't imported by the test suite).

- [ ] **Step 4: Commit**

```bash
git add module/data/season-tracker.mjs
git commit -m "feat: add SeasonTrackerData schema"
```

---

### Task 2: `levelUpsAvailable` field on `TropeActorData`

**Files:**
- Modify: `module/data/actor-trope.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `system.levelUpsAvailable` (integer, initial 0, min 0) on every `trope` actor. Task 6's grant actions increment it; Task 8's Level Up dialog reads and decrements it.

- [ ] **Step 1: Add the field**

In `module/data/actor-trope.mjs`, change:

```js
      rerunPoints: new NumberField({ required: true, integer: true, initial: 1, min: 0 }),
      hurt: new BooleanField({ initial: false }),
      knockedOut: new BooleanField({ initial: false }),
```

to:

```js
      rerunPoints: new NumberField({ required: true, integer: true, initial: 1, min: 0 }),
      hurt: new BooleanField({ initial: false }),
      knockedOut: new BooleanField({ initial: false }),
      levelUpsAvailable: new NumberField({ required: true, integer: true, initial: 0, min: 0 }),
```

- [ ] **Step 2: Verify syntax**

```bash
node --check module/data/actor-trope.mjs
```
Expected: no output.

- [ ] **Step 3: Run the full test suite as a regression check**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add module/data/actor-trope.mjs
git commit -m "feat: add levelUpsAvailable field to TropeActorData"
```

---

### Task 3: Pure `season-benchmarks.mjs` helper

**Files:**
- Create: `module/helpers/season-benchmarks.mjs`
- Create: `module/helpers/season-benchmarks.test.mjs`

**Interfaces:**
- Consumes: nothing — pure functions, no imports beyond the test framework.
- Produces: `computeRating(episodes)` and `countRecordedEpisodes(episodes)`, both taking `Array<{outcome: string}>`. `computeRating` returns a number (sum of `successful` +2 / `neutral` 0 / `unsuccessful` −1 / unset 0). `countRecordedEpisodes` returns the count of entries with a non-empty `outcome`. Task 5's Season Tracker app imports both exact names/signatures.

- [ ] **Step 1: Write the failing tests**

Create `module/helpers/season-benchmarks.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --test module/helpers/season-benchmarks.test.mjs
```
Expected: FAIL — `Cannot find module './season-benchmarks.mjs'` (the module doesn't exist yet).

- [ ] **Step 3: Implement `module/helpers/season-benchmarks.mjs`**

```js
const OUTCOME_POINTS = { successful: 2, neutral: 0, unsuccessful: -1 };

/**
 * @param {Array<{outcome: string}>} episodes
 * @returns {number} sum of point values for every episode with a set outcome
 */
export function computeRating(episodes) {
  return episodes.reduce((total, ep) => total + (OUTCOME_POINTS[ep.outcome] ?? 0), 0);
}

/**
 * @param {Array<{outcome: string}>} episodes
 * @returns {number} count of episodes with a non-empty outcome
 */
export function countRecordedEpisodes(episodes) {
  return episodes.filter(ep => ep.outcome !== "").length;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --test module/helpers/season-benchmarks.test.mjs
```
Expected: PASS — all 8 tests.

- [ ] **Step 5: Run the full suite as a regression check**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add module/helpers/season-benchmarks.mjs module/helpers/season-benchmarks.test.mjs
git commit -m "feat: add pure season-benchmarks helper with TDD coverage"
```

---

### Task 4: Pure `level-up.mjs` helper

**Files:**
- Create: `module/helpers/level-up.mjs`
- Create: `module/helpers/level-up.test.mjs`

**Interfaces:**
- Consumes: nothing — pure function, no imports beyond the test framework.
- Produces: `validateLevelUpChoice({stat, skillKey, currentSkills})` where `stat` is `"mental"|"physical"|"social"`, `skillKey` is a skill key string, `currentSkills` is `Record<string, number>` (skill key → current value). Returns `{valid: boolean, reason?: string}`. Task 8's Level Up dialog handler imports this exact function and shape from `module/helpers/level-up.mjs`.

- [ ] **Step 1: Write the failing tests**

Create `module/helpers/level-up.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateLevelUpChoice } from "./level-up.mjs";

const SKILLS_ALL_ZERO = {
  tech: 0, lab: 0, investigation: 0,
  violence: 0, reflexes: 0, coordination: 0,
  cool: 0, intuition: 0, deception: 0
};

test("validateLevelUpChoice accepts a stat/skill pair with room under the cap", () => {
  const result = validateLevelUpChoice({ stat: "mental", skillKey: "tech", currentSkills: SKILLS_ALL_ZERO });
  assert.deepEqual(result, { valid: true });
});

test("validateLevelUpChoice rejects a missing stat", () => {
  const result = validateLevelUpChoice({ stat: "", skillKey: "tech", currentSkills: SKILLS_ALL_ZERO });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "noStat");
});

test("validateLevelUpChoice rejects an unrecognized stat", () => {
  const result = validateLevelUpChoice({ stat: "spiritual", skillKey: "tech", currentSkills: SKILLS_ALL_ZERO });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "noStat");
});

test("validateLevelUpChoice rejects a skill that doesn't belong to the chosen stat", () => {
  const result = validateLevelUpChoice({ stat: "mental", skillKey: "violence", currentSkills: SKILLS_ALL_ZERO });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "skillNotInStat");
});

test("validateLevelUpChoice rejects a missing skillKey", () => {
  const result = validateLevelUpChoice({ stat: "mental", skillKey: "", currentSkills: SKILLS_ALL_ZERO });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "skillNotInStat");
});

test("validateLevelUpChoice rejects a skill already at the cap of 3", () => {
  const currentSkills = { ...SKILLS_ALL_ZERO, tech: 3 };
  const result = validateLevelUpChoice({ stat: "mental", skillKey: "tech", currentSkills });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "skillAtCap");
});

test("validateLevelUpChoice rejects a skill above the cap (defensive)", () => {
  const currentSkills = { ...SKILLS_ALL_ZERO, tech: 4 };
  const result = validateLevelUpChoice({ stat: "mental", skillKey: "tech", currentSkills });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "skillAtCap");
});

test("validateLevelUpChoice accepts a skill one below the cap", () => {
  const currentSkills = { ...SKILLS_ALL_ZERO, cool: 2 };
  const result = validateLevelUpChoice({ stat: "social", skillKey: "cool", currentSkills });
  assert.deepEqual(result, { valid: true });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --test module/helpers/level-up.test.mjs
```
Expected: FAIL — `Cannot find module './level-up.mjs'` (the module doesn't exist yet).

- [ ] **Step 3: Implement `module/helpers/level-up.mjs`**

```js
const STAT_SKILLS = {
  mental: ["tech", "lab", "investigation"],
  physical: ["violence", "reflexes", "coordination"],
  social: ["cool", "intuition", "deception"]
};

/**
 * @param {object} params
 * @param {"mental"|"physical"|"social"} params.stat
 * @param {string} params.skillKey
 * @param {Record<string, number>} params.currentSkills - skillKey -> current value
 * @returns {{valid: boolean, reason?: string}}
 */
export function validateLevelUpChoice({ stat, skillKey, currentSkills }) {
  if (!stat || !(stat in STAT_SKILLS)) return { valid: false, reason: "noStat" };
  if (!skillKey || !STAT_SKILLS[stat].includes(skillKey)) return { valid: false, reason: "skillNotInStat" };
  if (currentSkills[skillKey] >= 3) return { valid: false, reason: "skillAtCap" };
  return { valid: true };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --test module/helpers/level-up.test.mjs
```
Expected: PASS — all 8 tests.

- [ ] **Step 5: Run the full suite as a regression check**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add module/helpers/level-up.mjs module/helpers/level-up.test.mjs
git commit -m "feat: add pure level-up validation helper with TDD coverage"
```

---

### Task 5: Season Tracker app scaffold — episode recording, rating, registration

**Files:**
- Create: `module/apps/season-tracker.mjs`
- Create: `templates/apps/season-tracker.hbs`
- Modify: `module/procedural.mjs`
- Modify: `lang/en.json`

**Interfaces:**
- Consumes: `computeRating`, `countRecordedEpisodes` from Task 3 (`module/helpers/season-benchmarks.mjs`); `SeasonTrackerData` from Task 1.
- Produces: `SeasonTrackerApplication` (default export of `module/apps/season-tracker.mjs`), registered as a scene-control button and backed by the `procedural.seasonTracker` world setting. Task 6 and Task 7 add actions/template sections to this same app; both import nothing new from this task (they extend the same file/class).

- [ ] **Step 1: Create the app**

```js
import { computeRating, countRecordedEpisodes } from "../helpers/season-benchmarks.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ApplicationV2 } = foundry.applications.api;

const OUTCOME_CHOICES = ["", "successful", "neutral", "unsuccessful"];

function getSeasonTracker() {
  return game.settings.get("procedural", "seasonTracker");
}

async function setSeasonTracker(data) {
  await game.settings.set("procedural", "seasonTracker", data);
}

export default class SeasonTrackerApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "procedural-season-tracker",
    classes: ["procedural", "season-tracker"],
    position: { width: 480, height: 640 },
    window: {
      title: "PROCEDURAL.SeasonTracker.Title",
      resizable: true,
      contentTag: "form"
    },
    form: {
      handler: SeasonTrackerApplication.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    },
    actions: {}
  };

  static PARTS = {
    form: { template: "systems/procedural/templates/apps/season-tracker.hbs" }
  };

  async _prepareContext(options) {
    if (!game.user.isGM) throw new Error("The Season Tracker is GM-only.");
    const context = await super._prepareContext(options);
    const data = getSeasonTracker().toObject();

    context.episodes = data.episodes.map((episode, index) => ({
      index,
      number: index + 1,
      outcome: episode.outcome,
      outcomeOptions: OUTCOME_CHOICES.map(value => ({
        value,
        label: value
          ? game.i18n.localize(`PROCEDURAL.SeasonTracker.Outcome.${value}`)
          : game.i18n.localize("PROCEDURAL.SeasonTracker.OutcomeUnset"),
        selected: value === episode.outcome
      })),
      recorded: episode.outcome !== "",
      reactionKey: `PROCEDURAL.SeasonTracker.Ep${index + 1}Reaction`
    }));
    context.rating = computeRating(data.episodes);
    context.recordedCount = countRecordedEpisodes(data.episodes);

    return context;
  }

  static #formToData(form) {
    const expanded = foundry.utils.expandObject(
      new foundry.applications.ux.FormDataExtended(form).object
    );
    const current = getSeasonTracker();
    return {
      episodes: Object.values(expanded.episodes ?? {}).map(ep => ({ outcome: ep.outcome ?? "" })),
      // The four guard booleans are never form inputs (a BooleanField has no
      // safe hidden-input round-trip) — always carry the persisted value
      // forward so an unrelated form submit can't reset a grant flag.
      ep3RerunGranted: current.ep3RerunGranted,
      ep5RerunGranted: current.ep5RerunGranted,
      ep3LevelUpGranted: current.ep3LevelUpGranted,
      ep6LevelUpGranted: current.ep6LevelUpGranted,
      villains: []
    };
  }

  static async #onSubmit(event, form) {
    await setSeasonTracker(SeasonTrackerApplication.#formToData(form));
  }
}
```

`villains: []` is a placeholder in `#formToData` for this task only — Task 7 replaces it with real form-derived villain rows. Until Task 7 lands, any Season Tracker form submit (e.g. recording an episode outcome) will harmlessly clear the (currently always-empty) villains array, since no villain rows exist yet to lose.

- [ ] **Step 2: Create the template**

```hbs
<section class="procedural-sheet procedural-season-tracker">
  <div class="procedural-season-tracker-rating">
    <strong>{{localize "PROCEDURAL.SeasonTracker.Rating"}}:</strong> {{rating}}
  </div>

  <ol class="procedural-season-tracker-episodes">
    {{#each episodes as |episode|}}
      <li class="procedural-season-tracker-episode-row">
        <label>{{localize "PROCEDURAL.SeasonTracker.Episode"}} {{episode.number}}
          <select name="episodes.{{episode.index}}.outcome">
            {{#each episode.outcomeOptions as |opt|}}
              <option value="{{opt.value}}" {{#if opt.selected}}selected{{/if}}>{{opt.label}}</option>
            {{/each}}
          </select>
        </label>
        {{#if episode.recorded}}
          <p class="procedural-season-tracker-reaction">{{localize episode.reactionKey}}</p>
        {{/if}}
      </li>
    {{/each}}
  </ol>
</section>
```

- [ ] **Step 3: Register the world setting, data model, and scene-control button**

In `module/procedural.mjs`, change the import block:

```js
import CaseTrackerData from "./data/case-tracker.mjs";
import ProceduralActor from "./documents/actor.mjs";
import TropeBuilderApplication from "./apps/trope-builder.mjs";
import CaseTrackerApplication from "./apps/case-tracker.mjs";
```

to:

```js
import CaseTrackerData from "./data/case-tracker.mjs";
import SeasonTrackerData from "./data/season-tracker.mjs";
import ProceduralActor from "./documents/actor.mjs";
import TropeBuilderApplication from "./apps/trope-builder.mjs";
import CaseTrackerApplication from "./apps/case-tracker.mjs";
import SeasonTrackerApplication from "./apps/season-tracker.mjs";
```

Change:

```js
  game.settings.register("procedural", "caseTracker", {
    scope: "world",
    config: false,
    type: CaseTrackerData
  });

  CONFIG.Actor.documentClass = ProceduralActor;
```

to:

```js
  game.settings.register("procedural", "caseTracker", {
    scope: "world",
    config: false,
    type: CaseTrackerData
  });
  game.settings.register("procedural", "seasonTracker", {
    scope: "world",
    config: false,
    type: SeasonTrackerData
  });

  CONFIG.Actor.documentClass = ProceduralActor;
```

Change:

```js
Hooks.on("getSceneControlButtons", controls => {
  controls.tokens.tools.proceduralCaseTracker = {
    name: "proceduralCaseTracker",
    title: "PROCEDURAL.CaseTracker.Title",
    icon: "fa-solid fa-magnifying-glass",
    order: Object.keys(controls.tokens.tools).length,
    button: true,
    visible: game.user.isGM,
    onChange: () => {
      const existing = foundry.applications.instances.get("procedural-case-tracker");
      if (existing) {
        existing.bringToFront();
        return;
      }
      new CaseTrackerApplication().render(true);
    }
  };
});
```

to:

```js
Hooks.on("getSceneControlButtons", controls => {
  controls.tokens.tools.proceduralCaseTracker = {
    name: "proceduralCaseTracker",
    title: "PROCEDURAL.CaseTracker.Title",
    icon: "fa-solid fa-magnifying-glass",
    order: Object.keys(controls.tokens.tools).length,
    button: true,
    visible: game.user.isGM,
    onChange: () => {
      const existing = foundry.applications.instances.get("procedural-case-tracker");
      if (existing) {
        existing.bringToFront();
        return;
      }
      new CaseTrackerApplication().render(true);
    }
  };

  controls.tokens.tools.proceduralSeasonTracker = {
    name: "proceduralSeasonTracker",
    title: "PROCEDURAL.SeasonTracker.Title",
    icon: "fa-solid fa-star",
    order: Object.keys(controls.tokens.tools).length,
    button: true,
    visible: game.user.isGM,
    onChange: () => {
      const existing = foundry.applications.instances.get("procedural-season-tracker");
      if (existing) {
        existing.bringToFront();
        return;
      }
      new SeasonTrackerApplication().render(true);
    }
  };
});
```

- [ ] **Step 4: Add localization keys**

In `lang/en.json`, add a new `SeasonTracker` object as a sibling of `CaseTracker` (after the `CaseTracker` object's closing `}`, i.e. change:

```json
      "Drama": "Team Drama",
      "RollForDrama": "Roll for Drama",
      "Status": {
        "good": "Good",
        "bad": "Bad",
        "unknown": "Unknown"
      }
    }
  },
```

to:

```json
      "Drama": "Team Drama",
      "RollForDrama": "Roll for Drama",
      "Status": {
        "good": "Good",
        "bad": "Bad",
        "unknown": "Unknown"
      }
    },
    "SeasonTracker": {
      "Title": "Season Tracker",
      "Rating": "Agency Rating",
      "Episode": "Episode",
      "OutcomeUnset": "Not recorded",
      "Outcome": {
        "successful": "Successful (+2)",
        "neutral": "Neutral (0)",
        "unsuccessful": "Unsuccessful (−1)"
      },
      "Ep1Reaction": "The Director reacts to the outcome (optional).",
      "Ep2Reaction": "The Director reacts; if the rating is less than 2, they may issue a warning.",
      "Ep3Reaction": "The Director reacts; if the rating is 6, all players gain 1 Rerun Point. If the rating is 0 or less, the Director freaks out and all players may level up.",
      "Ep4Reaction": "The Director reacts; if the rating is less than 4, they may issue another warning.",
      "Ep5Reaction": "The Director reacts; if the rating is 10, all players gain 1 Rerun Point. If the rating is 4 or less, the Director issues an ultimatum.",
      "Ep6Reaction": "The Director reacts; the season is over. A perfect rating of 12 earns a medal of valorous service. If playing another season, another Level Up session happens here."
    }
  },
```

- [ ] **Step 5: Verify syntax**

```bash
node --check module/apps/season-tracker.mjs && node --check module/procedural.mjs && node -e "JSON.parse(require('fs').readFileSync('lang/en.json', 'utf8')); console.log('valid')"
```
Expected: no output from the `--check` calls, then `valid`.

- [ ] **Step 6: Run the full test suite as a regression check**

```bash
npm test
```
Expected: all tests pass (no Node-testable code added in this task).

- [ ] **Step 7: Commit**

```bash
git add module/apps/season-tracker.mjs templates/apps/season-tracker.hbs module/procedural.mjs lang/en.json
git commit -m "feat: add Season Tracker app with episode recording and Agency Rating"
```

---

### Task 6: Season Tracker Rerun Point and Level Up grants

**Files:**
- Modify: `module/apps/season-tracker.mjs`
- Modify: `templates/apps/season-tracker.hbs`
- Modify: `lang/en.json`

**Interfaces:**
- Consumes: `computeRating` from Task 3; `system.levelUpsAvailable` from Task 2.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add grant-eligibility flags to `_prepareContext`**

In `module/apps/season-tracker.mjs`, change:

```js
    context.rating = computeRating(data.episodes);
    context.recordedCount = countRecordedEpisodes(data.episodes);

    return context;
```

to:

```js
    context.rating = computeRating(data.episodes);
    context.recordedCount = countRecordedEpisodes(data.episodes);

    const ep3Rating = computeRating(data.episodes.slice(0, 3));
    const ep5Rating = computeRating(data.episodes.slice(0, 5));
    context.ep3RerunEligible = data.episodes[2].outcome !== "" && ep3Rating === 6 && !data.ep3RerunGranted;
    context.ep3LevelUpEligible = data.episodes[2].outcome !== "" && ep3Rating <= 0 && !data.ep3LevelUpGranted;
    context.ep5RerunEligible = data.episodes[4].outcome !== "" && ep5Rating === 10 && !data.ep5RerunGranted;
    context.ep6LevelUpEligible = data.episodes[5].outcome !== "" && !data.ep6LevelUpGranted;

    return context;
```

- [ ] **Step 2: Add the grant helper functions and action handlers**

Add these two module-level functions directly after the existing `setSeasonTracker` function:

```js
async function grantRerunPoints(flagKey) {
  const data = getSeasonTracker().toObject();
  if (data[flagKey]) return null;

  const actors = game.actors.filter(a => a.type === "trope");
  try {
    for (const actor of actors) {
      await actor.update({ "system.rerunPoints": actor.system.rerunPoints + 1 });
    }
  } catch (err) {
    console.error("PROCEDURAL | Failed to grant Rerun Points", err);
    ui.notifications?.error("PROCEDURAL! failed to grant Rerun Points. Check the console for details.");
    return null;
  }

  data[flagKey] = true;
  await setSeasonTracker(data);
  return actors.length;
}

async function grantLevelUps(flagKey) {
  const data = getSeasonTracker().toObject();
  if (data[flagKey]) return null;

  const actors = game.actors.filter(a => a.type === "trope");
  try {
    for (const actor of actors) {
      await actor.update({ "system.levelUpsAvailable": actor.system.levelUpsAvailable + 1 });
    }
  } catch (err) {
    console.error("PROCEDURAL | Failed to grant Level Ups", err);
    ui.notifications?.error("PROCEDURAL! failed to grant Level Ups. Check the console for details.");
    return null;
  }

  data[flagKey] = true;
  await setSeasonTracker(data);
  return actors.length;
}
```

Change the `actions` block:

```js
    actions: {}
```

to:

```js
    actions: {
      grantEp3Rerun: SeasonTrackerApplication.#onGrantEp3Rerun,
      grantEp5Rerun: SeasonTrackerApplication.#onGrantEp5Rerun,
      grantEp3LevelUp: SeasonTrackerApplication.#onGrantEp3LevelUp,
      grantEp6LevelUp: SeasonTrackerApplication.#onGrantEp6LevelUp
    }
```

Add these four static methods directly after `#onSubmit`:

```js
  static async #onGrantEp3Rerun() {
    const count = await grantRerunPoints("ep3RerunGranted");
    if (!count) return;
    ui.notifications?.info(`PROCEDURAL! granted 1 Rerun Point to ${count} Trope${count === 1 ? "" : "s"}.`);
    this.render();
  }

  static async #onGrantEp5Rerun() {
    const count = await grantRerunPoints("ep5RerunGranted");
    if (!count) return;
    ui.notifications?.info(`PROCEDURAL! granted 1 Rerun Point to ${count} Trope${count === 1 ? "" : "s"}.`);
    this.render();
  }

  static async #onGrantEp3LevelUp() {
    const count = await grantLevelUps("ep3LevelUpGranted");
    if (!count) return;
    ui.notifications?.info(`PROCEDURAL! granted a Level Up to ${count} Trope${count === 1 ? "" : "s"}.`);
    this.render();
  }

  static async #onGrantEp6LevelUp() {
    const count = await grantLevelUps("ep6LevelUpGranted");
    if (!count) return;
    ui.notifications?.info(`PROCEDURAL! granted a Level Up to ${count} Trope${count === 1 ? "" : "s"}.`);
    this.render();
  }
```

- [ ] **Step 3: Add the grant buttons to the template**

In `templates/apps/season-tracker.hbs`, change:

```hbs
        {{#if episode.recorded}}
          <p class="procedural-season-tracker-reaction">{{localize episode.reactionKey}}</p>
        {{/if}}
      </li>
    {{/each}}
  </ol>
</section>
```

to:

```hbs
        {{#if episode.recorded}}
          <p class="procedural-season-tracker-reaction">{{localize episode.reactionKey}}</p>
        {{/if}}
        {{#if (eq episode.number 3)}}
          {{#if ../ep3RerunEligible}}
            <button type="button" data-action="grantEp3Rerun">{{localize "PROCEDURAL.SeasonTracker.GrantRerun"}}</button>
          {{/if}}
          {{#if ../ep3LevelUpEligible}}
            <button type="button" data-action="grantEp3LevelUp">{{localize "PROCEDURAL.SeasonTracker.GrantLevelUp"}}</button>
          {{/if}}
        {{/if}}
        {{#if (eq episode.number 5)}}
          {{#if ../ep5RerunEligible}}
            <button type="button" data-action="grantEp5Rerun">{{localize "PROCEDURAL.SeasonTracker.GrantRerun"}}</button>
          {{/if}}
        {{/if}}
        {{#if (eq episode.number 6)}}
          {{#if ../ep6LevelUpEligible}}
            <button type="button" data-action="grantEp6LevelUp">{{localize "PROCEDURAL.SeasonTracker.GrantLevelUp"}}</button>
          {{/if}}
        {{/if}}
      </li>
    {{/each}}
  </ol>
</section>
```

`eq` is Handlebars' standard equality helper, already available in Foundry v14's built-in helper set (used the same way `concat` is already used in `trope-sheet.hbs`). `../ep3RerunEligible` etc. reach outside the `{{#each episodes}}` block to the top-level context values set in Step 1.

- [ ] **Step 4: Add localization keys**

In `lang/en.json`, inside the `SeasonTracker` object added in Task 5, change:

```json
      "Ep6Reaction": "The Director reacts; the season is over. A perfect rating of 12 earns a medal of valorous service. If playing another season, another Level Up session happens here."
    }
```

to:

```json
      "Ep6Reaction": "The Director reacts; the season is over. A perfect rating of 12 earns a medal of valorous service. If playing another season, another Level Up session happens here.",
      "GrantRerun": "Grant +1 Rerun Point to the Party",
      "GrantLevelUp": "Grant a Level Up to the Party"
    }
```

- [ ] **Step 5: Verify syntax**

```bash
node --check module/apps/season-tracker.mjs && node -e "JSON.parse(require('fs').readFileSync('lang/en.json', 'utf8')); console.log('valid')"
```
Expected: no output, then `valid`.

- [ ] **Step 6: Run the full test suite as a regression check**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add module/apps/season-tracker.mjs templates/apps/season-tracker.hbs lang/en.json
git commit -m "feat: add Rerun Point and Level Up grant buttons to the Season Tracker"
```

---

### Task 7: Season Tracker Villains list

**Files:**
- Modify: `module/apps/season-tracker.mjs`
- Modify: `templates/apps/season-tracker.hbs`
- Modify: `lang/en.json`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Expose villains and the 3+ warning in `_prepareContext`**

In `module/apps/season-tracker.mjs`, change:

```js
    context.ep6LevelUpEligible = data.episodes[5].outcome !== "" && !data.ep6LevelUpGranted;

    return context;
```

to:

```js
    context.ep6LevelUpEligible = data.episodes[5].outcome !== "" && !data.ep6LevelUpGranted;

    context.villains = data.villains;
    context.villainWarning = data.villains.filter(v => v.active).length >= 3;

    return context;
```

- [ ] **Step 2: Make `#formToData` round-trip villains for real**

Change:

```js
      ep6LevelUpGranted: current.ep6LevelUpGranted,
      villains: []
    };
```

to:

```js
      ep6LevelUpGranted: current.ep6LevelUpGranted,
      villains: Object.values(expanded.villains ?? {}).map(v => ({
        id: v.id,
        name: v.name ?? "",
        reason: v.reason ?? "",
        active: v.active ?? false
      }))
    };
```

- [ ] **Step 3: Add the villain actions**

Change the `actions` block:

```js
    actions: {
      grantEp3Rerun: SeasonTrackerApplication.#onGrantEp3Rerun,
      grantEp5Rerun: SeasonTrackerApplication.#onGrantEp5Rerun,
      grantEp3LevelUp: SeasonTrackerApplication.#onGrantEp3LevelUp,
      grantEp6LevelUp: SeasonTrackerApplication.#onGrantEp6LevelUp
    }
```

to:

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

Add these two static methods directly after `#onGrantEp6LevelUp`:

```js
  static async #onAddVillain() {
    const data = SeasonTrackerApplication.#formToData(this.form);
    data.villains.push({ id: foundry.utils.randomID(), name: "", reason: "", active: true });
    try {
      await setSeasonTracker(data);
    } catch (err) {
      console.error("PROCEDURAL | Failed to add a Villain to the Season Tracker", err);
      ui.notifications?.error("PROCEDURAL! failed to add the Villain. Check the console for details.");
      return;
    }
    this.render();
  }

  static async #onDeleteVillain(event, target) {
    const id = target.closest("[data-villain-id]").dataset.villainId;
    const data = SeasonTrackerApplication.#formToData(this.form);
    data.villains = data.villains.filter(entry => entry.id !== id);
    try {
      await setSeasonTracker(data);
    } catch (err) {
      console.error("PROCEDURAL | Failed to delete a Villain from the Season Tracker", err);
      ui.notifications?.error("PROCEDURAL! failed to delete the Villain. Check the console for details.");
      return;
    }
    this.render();
  }
```

- [ ] **Step 4: Add the Villains section to the template**

In `templates/apps/season-tracker.hbs`, add this new section directly before the closing `</section>` at the end of the file:

```hbs
  <section class="procedural-season-tracker-villains">
    <h2>{{localize "PROCEDURAL.SeasonTracker.Villains"}}</h2>
    {{#if villainWarning}}
      <p class="procedural-season-tracker-villain-warning">{{localize "PROCEDURAL.SeasonTracker.VillainWarning"}}</p>
    {{/if}}

    <ul class="procedural-season-tracker-villain-list">
      {{#each villains as |entry index|}}
        <li class="procedural-season-tracker-villain-row" data-villain-id="{{entry.id}}">
          <input type="hidden" name="villains.{{index}}.id" value="{{entry.id}}">
          <input type="text" name="villains.{{index}}.name" value="{{entry.name}}" placeholder="{{localize 'PROCEDURAL.SeasonTracker.VillainName'}}">
          <input type="text" name="villains.{{index}}.reason" value="{{entry.reason}}" placeholder="{{localize 'PROCEDURAL.SeasonTracker.VillainReason'}}">
          <label>
            <input type="checkbox" name="villains.{{index}}.active" {{#if entry.active}}checked{{/if}}>
            {{localize "PROCEDURAL.SeasonTracker.VillainActive"}}
          </label>
          <button type="button" data-action="deleteVillain">{{localize "PROCEDURAL.SeasonTracker.Delete"}}</button>
        </li>
      {{/each}}
    </ul>

    <button type="button" data-action="addVillain">{{localize "PROCEDURAL.SeasonTracker.AddVillain"}}</button>
  </section>
```

- [ ] **Step 5: Add localization keys**

In `lang/en.json`, inside the `SeasonTracker` object, change:

```json
      "GrantRerun": "Grant +1 Rerun Point to the Party",
      "GrantLevelUp": "Grant a Level Up to the Party"
    }
```

to:

```json
      "GrantRerun": "Grant +1 Rerun Point to the Party",
      "GrantLevelUp": "Grant a Level Up to the Party",
      "Villains": "Villains",
      "VillainWarning": "The Director has noticed 3 or more active Villains and is not happy.",
      "VillainName": "Name",
      "VillainReason": "Reason",
      "VillainActive": "Active",
      "AddVillain": "Add Villain",
      "Delete": "Delete"
    }
```

- [ ] **Step 6: Verify syntax**

```bash
node --check module/apps/season-tracker.mjs && node -e "JSON.parse(require('fs').readFileSync('lang/en.json', 'utf8')); console.log('valid')"
```
Expected: no output, then `valid`.

- [ ] **Step 7: Run the full test suite as a regression check**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add module/apps/season-tracker.mjs templates/apps/season-tracker.hbs lang/en.json
git commit -m "feat: add Villains list to the Season Tracker"
```

---

### Task 8: Trope sheet Level Up

**Files:**
- Modify: `module/sheets/actor-trope-sheet.mjs`
- Modify: `templates/actor/trope-sheet.hbs`
- Modify: `lang/en.json`

**Interfaces:**
- Consumes: `validateLevelUpChoice` from Task 4 (`module/helpers/level-up.mjs`); `system.levelUpsAvailable` from Task 2; `loadGeneratorData` (already imported elsewhere in this codebase, e.g. `module/documents/actor.mjs:4`) for the Talent-swap options, reading `.secondTalents` — the same JSON source (`data/second-talents.json`) the Trope Builder and random generator already use, not the compendium Documents, for consistency with the rest of this codebase's data flow.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Import the new helpers**

In `module/sheets/actor-trope-sheet.mjs`, change:

```js
import { rollD6 } from "../helpers/dice-rules.mjs";
```

to:

```js
import { rollD6 } from "../helpers/dice-rules.mjs";
import { validateLevelUpChoice } from "../helpers/level-up.mjs";
import { loadGeneratorData } from "../helpers/generator-data.mjs";
```

- [ ] **Step 2: Register the `levelUp` action**

Change:

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

to:

```js
    actions: {
      rollSkill: ProceduralTropeActorSheet.#onRollSkill,
      toggleHurt: ProceduralTropeActorSheet.#onToggleHurt,
      hurtAgain: ProceduralTropeActorSheet.#onHurtAgain,
      resolveBStory: ProceduralTropeActorSheet.#onResolveBStory,
      levelUp: ProceduralTropeActorSheet.#onLevelUp,
      createItem: ProceduralTropeActorSheet.#onCreateItem,
      editItem: ProceduralTropeActorSheet.#onEditItem,
      deleteItem: ProceduralTropeActorSheet.#onDeleteItem,
      randomizeTrope: ProceduralTropeActorSheet.#onRandomizeTrope
    }
```

- [ ] **Step 3: Add the `#onLevelUp` handler**

Add this new method directly after `#onResolveBStory`:

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

    const skillOption = (key) => {
      const label = game.i18n.localize(`PROCEDURAL.Skill.${key}`);
      const disabled = skills[key].value >= 3 ? "disabled" : "";
      return `<option value="${key}" ${disabled}>${label}</option>`;
    };

    const config = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize("PROCEDURAL.Actor.LevelUp") },
      content: `
        <div class="procedural-level-up-dialog">
          <fieldset>
            <legend>${game.i18n.localize("PROCEDURAL.Actor.LevelUpStat")}</legend>
            <label><input type="radio" name="stat" value="mental" checked> ${game.i18n.localize("PROCEDURAL.Stat.mental")}</label>
            <label><input type="radio" name="stat" value="physical"> ${game.i18n.localize("PROCEDURAL.Stat.physical")}</label>
            <label><input type="radio" name="stat" value="social"> ${game.i18n.localize("PROCEDURAL.Stat.social")}</label>
          </fieldset>
          <label>${game.i18n.localize("PROCEDURAL.Actor.LevelUpSkill")}
            <select name="skillKey">
              <optgroup label="${game.i18n.localize("PROCEDURAL.Stat.mental")}">
                ${skillOption("tech")}${skillOption("lab")}${skillOption("investigation")}
              </optgroup>
              <optgroup label="${game.i18n.localize("PROCEDURAL.Stat.physical")}">
                ${skillOption("violence")}${skillOption("reflexes")}${skillOption("coordination")}
              </optgroup>
              <optgroup label="${game.i18n.localize("PROCEDURAL.Stat.social")}">
                ${skillOption("cool")}${skillOption("intuition")}${skillOption("deception")}
              </optgroup>
            </select>
          </label>
          <label>${game.i18n.localize("PROCEDURAL.Actor.LevelUpTalentSwap")}
            <select name="talentName">
              <option value="">${game.i18n.localize("PROCEDURAL.Actor.LevelUpKeepTalent")}</option>
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
          callback: (event, button) => ({
            stat: button.form.elements.stat.value,
            skillKey: button.form.elements.skillKey.value,
            talentName: button.form.elements.talentName.value
          })
        },
        { action: "cancel", label: game.i18n.localize("PROCEDURAL.Roll.Cancel") }
      ],
      rejectClose: false
    });

    if (!config) return;

    const currentSkills = Object.fromEntries(
      Object.entries(skills).map(([key, skill]) => [key, skill.value])
    );
    const result = validateLevelUpChoice({ stat: config.stat, skillKey: config.skillKey, currentSkills });
    if (!result.valid) {
      ui.notifications?.error(game.i18n.localize("PROCEDURAL.Actor.LevelUpInvalid"));
      return;
    }

    await this.actor.update({
      [`system.stats.${config.stat}`]: this.actor.system.stats[config.stat] + 1,
      [`system.skills.${config.skillKey}.value`]: skills[config.skillKey].value + 1,
      "system.levelUpsAvailable": this.actor.system.levelUpsAvailable - 1
    });

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

- [ ] **Step 4: Add the Level Up button to the template**

In `templates/actor/trope-sheet.hbs`, change:

```hbs
    <button type="button" class="procedural-randomize-btn" data-action="randomizeTrope">
      {{localize "PROCEDURAL.Actor.Randomize"}}
    </button>
  </header>
```

to:

```hbs
    <button type="button" class="procedural-randomize-btn" data-action="randomizeTrope">
      {{localize "PROCEDURAL.Actor.Randomize"}}
    </button>
    {{#if system.levelUpsAvailable}}
      <button type="button" class="procedural-level-up-btn" data-action="levelUp">
        {{localize "PROCEDURAL.Actor.LevelUp"}} ({{system.levelUpsAvailable}})
      </button>
    {{/if}}
  </header>
```

- [ ] **Step 5: Add localization keys**

In `lang/en.json`, inside the `PROCEDURAL.Actor` object, change:

```json
      "Randomize": "Randomize",
      "RandomizeConfirm": "This will overwrite the current Trope, skills, and flavor fields. Continue?",
      "Confirm": "Confirm"
```

to:

```json
      "Randomize": "Randomize",
      "RandomizeConfirm": "This will overwrite the current Trope, skills, and flavor fields. Continue?",
      "Confirm": "Confirm",
      "LevelUp": "Level Up",
      "LevelUpStat": "Choose a stat to improve by 1",
      "LevelUpSkill": "Divest the point into a skill (max 3)",
      "LevelUpTalentSwap": "Optionally swap your second Talent",
      "LevelUpKeepTalent": "Keep current Talent",
      "LevelUpConfirm": "Confirm Level Up",
      "LevelUpInvalid": "That skill doesn't match the chosen stat, or is already at the cap. Reopen Level Up and pick again."
```

- [ ] **Step 6: Verify syntax**

```bash
node --check module/sheets/actor-trope-sheet.mjs && node -e "JSON.parse(require('fs').readFileSync('lang/en.json', 'utf8')); console.log('valid')"
```
Expected: no output, then `valid`.

- [ ] **Step 7: Run the full test suite as a regression check**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add module/sheets/actor-trope-sheet.mjs templates/actor/trope-sheet.hbs lang/en.json
git commit -m "feat: add Level Up dialog to the Trope sheet"
```

---

### Task 9: Update README and bump the system version

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
  interludes, the arrest phase, evidence, interrogations, and a "Roll for
  Drama" team-flavor table over the course of a session — changing the Act
  field automatically clears every Talent's "Used" checkbox (including each
  Trope's own built-in Talent) and heals every Hurt/Knocked Out actor, for
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
- A GM-only Season Tracker app (scene controls) for Season Mode: records
  each of a season's 6 episode outcomes, computes the running Agency
  Rating, shows the matching rulebook Director-reaction text, and offers
  one-click (double-grant-guarded) buttons to award the party's Rerun
  Point and Level Up benchmarks. Leveling Up is a dialog on the Trope
  sheet (appears once a Level Up is available) for the +1 stat / divested
  skill / optional second-Talent swap. Villains are tracked as a simple
  list with a 3-or-more warning
```

- [ ] **Step 2: Bump the system version**

In `system.json`, change:

```json
  "version": "0.8.0",
```

to:

```json
  "version": "0.9.0",
```

(Minor bump for a new feature, per this repo's standing convention.)

- [ ] **Step 3: Bump the package version to match**

In `package.json`, change:

```json
  "version": "0.8.0",
```

to:

```json
  "version": "0.9.0",
```

- [ ] **Step 4: Run the full test suite one more time**

```bash
npm test
```
Expected: PASS — README and version-field changes don't touch tested code paths.

- [ ] **Step 5: Commit**

```bash
git add README.md system.json package.json
git commit -m "docs: document Season Mode progression and bump version to 0.9.0"
```

---

## Manual Smoke Test (after all tasks)

This system has no Foundry-runtime test harness (see README) — verify by hand:

1. Symlink/copy the repo into `<FoundryUserData>/Data/systems/procedural` per the README's install steps, run `npm run build:packs`, and launch a PROCEDURAL! world.
2. Open the Season Tracker (new scene-control button, star icon). Confirm it renders 6 episode rows, each with an outcome dropdown, and a rating display starting at 0.
3. Record Episode 1 as Successful, Episode 2 as Unsuccessful (rating 1). Confirm the Episode 2 reaction text appears once Episode 2 is recorded, and rating displays 1.
4. Set outcomes so the rating after 3 episodes is exactly 6 (e.g. Ep1 Successful, Ep2 Successful, Ep3 Neutral). Confirm the "Grant +1 Rerun Point to the Party" button appears under Episode 3. Click it; confirm every `trope` actor's Rerun Points increments by 1, a notification reports the count, and the button disappears on re-render.
5. Change Episode 3's outcome and back; confirm the Rerun Point button does not reappear (guarded).
6. Set outcomes so the rating after 3 episodes is 0 or below; confirm the "Grant a Level Up to the Party" button appears under Episode 3. Click it; confirm every Trope actor's `levelUpsAvailable` increments by 1.
7. On a Trope sheet with `levelUpsAvailable > 0`, confirm a "Level Up (N)" button appears in the header; on one with 0, confirm it's absent. Click it: pick Mental, pick a Mental skill below cap (e.g. Tech), confirm on submit that Mental stat and Tech skill both increment by 1 and `levelUpsAvailable` decrements by 1.
8. Reopen Level Up and try picking Mental with a Physical skill (e.g. Violence) selected in the dropdown (both are visible in the same `<select>`, just under different `<optgroup>`s) — confirm submitting shows the "doesn't match the chosen stat" error and nothing changes.
9. Reopen Level Up and pick a Talent from the swap dropdown; confirm the old second Talent item is deleted and the new one is added with the compendium/JSON source's description. Confirm a Talent currently held by a different Trope actor does not appear in the swap dropdown.
10. Record Episode 5 outcomes so the rating after 5 is exactly 10; confirm its Grant Rerun button appears and works the same way.
11. Record Episode 6 (any outcome); confirm its Grant Level Up button appears (no rating gate) and its reaction text shows.
12. Add three Villains on the Season Tracker, mark them all Active; confirm the "Director has noticed" warning appears. Uncheck one; confirm the warning disappears. Delete a Villain row; confirm it's removed.
13. `npm test` passes with the new `season-benchmarks.test.mjs` and `level-up.test.mjs` suites.
