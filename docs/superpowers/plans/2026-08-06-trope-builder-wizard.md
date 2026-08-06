# Trope Builder Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A multi-step wizard, launched from the Actors directory, that walks a player through the PROCEDURAL! character-creation checklist one step at a time — Name, Trope (with a player-chosen Gifted stat bonus), manual skill divestment, Quality, Quirk, B-story, Second Talent, HQ, Agency Name, then a Review/Finish screen — creating a new Trope actor only on Finish.

**Architecture:** A dedicated `HandlebarsApplicationMixin(ApplicationV2)` class (`TropeBuilderApplication`), matching the pattern the two existing actor sheets already use, holding every answer in an in-memory draft object and re-rendering one step's Handlebars partial at a time behind Back/Next. Nothing touches the database until Finish. Two small refactors of existing code support this: the JSON-data loader used by Randomize moves to a shared helper, and the skill-divestment cap/minimum rules used by Randomize's auto-divestment are exposed as a reusable pure validation function for the wizard's live Skills-step feedback.

**Tech Stack:** Foundry VTT v14 (`ApplicationV2`, `HandlebarsApplicationMixin`, `foundry.applications.handlebars.loadTemplates`), vanilla JS ES modules, Handlebars (`{{#each}}`, `{{#if}}`, `{{lookup}}`, `{{concat}}` — all either core Handlebars or already used elsewhere in this codebase), plain CSS, Node's built-in test runner for the pure logic.

## Global Constraints

- Target Foundry VTT v14 (same as the rest of this system).
- No new npm dependencies.
- Preserve the pure-logic-vs-Foundry-glue split: any new pure logic goes in `module/helpers/character-generator.mjs` alongside the existing pure functions, stays dependency-free, and is unit-tested with Node's test runner.
- All existing tests must keep passing unmodified.
- **Avoid Handlebars helpers whose exact v14 signature isn't already proven in this codebase.** `{{localize}}` and `{{concat}}` are already used in `templates/actor/trope-sheet.hbs` — safe to reuse freely. `{{#each}}`, `{{#if}}`/`{{#unless}}`, and `{{lookup}}` are core Handlebars, not Foundry-specific — safe. Do **not** use `{{eq}}`, `{{or}}`, `{{selectOptions}}`, or any other comparison/selection helper not already proven in this repo — precompute booleans/selected-flags in JS context instead (every task below already does this; keep following that pattern for any new template work).
- Full spec: `docs/superpowers/specs/2026-08-06-trope-builder-wizard-design.md`.

## Before you start: a local Foundry v14 install is available as ground truth

This machine has a real Foundry VTT v14 client installed at
`/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app/` — its
`client/` directory is the actual shipped source (not minified), and is the
authoritative answer to any "does this Foundry API work the way I think it
does" question this plan raises. **Prefer reading directly from that install
over WebFetch-ing the public API doc site** (`foundryvtt.com/api`), which
covers only public type signatures, not implementation behavior or exact DOM
structure — a gap that caused a real, confirmed defect in this plan's
original text (see below). Grep it like any other local source tree, e.g.:

```bash
grep -rn "renderActorDirectory\|getHeaderControls" "/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app/client/"
```

Task 8 (the Actors-directory launcher button) was the one task where this
mattered — it has already been resolved by reading the relevant
sidebar/directory source directly, and Task 8's own instructions below
already fold in the confirmed answer with citations, so there's nothing
further to research there.

**A note on how this plan already got one thing wrong:** this plan's
original text for `TropeBuilderApplication`'s `static PARTS` declaration
omitted the `templates: [...]` array that `HandlebarsApplicationMixin`
requires in order to preload and register step partials referenced via
`{{> "..."}}` in the shell template — confirmed by reading
`client/applications/api/handlebars-application.mjs` directly on this local
install. Without it, every `{{> "systems/procedural/templates/apps/trope-builder-steps/*.hbs"}}`
reference in `trope-builder.hbs` throws `The partial ... could not be
found` on first render, because Handlebars never registers a partial that
was never fetched. **This has already been corrected** in Task 3's `PARTS`
block below, and each of Tasks 4-7 includes an explicit step appending its
new step partial's path to that same `templates` array — do not skip those
steps, and do not add a new step partial anywhere in this plan without also
adding its path there.

---

### Task 1: Extract the shared generator-data loader

**Files:**
- Create: `module/helpers/generator-data.mjs`
- Modify: `module/documents/actor.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces: `GENERATOR_DATA_PATHS` (object) and `loadGeneratorData(): Promise<{tropes, secondTalents, qualities, quirks, bstories, hq, agencyNames}>` (fetches and caches all 7 data files, module-scope cache). Task 3's wizard class imports this alongside `ProceduralActor#generateRandomTrope`.

- [ ] **Step 1: Read the current `module/documents/actor.mjs`**

It currently looks like this (unchanged since the Randomize feature shipped):

```js
import { computeRoll } from "../helpers/dice-rules.mjs";
import { showDiceSoNice } from "../helpers/dice-so-nice.mjs";
import { generateTrope } from "../helpers/character-generator.mjs";

const PHYSICAL_SKILLS = new Set(["violence", "reflexes", "coordination"]);

const TIER_CLASS = {
  criticalFailure: "procedural-tier-critical-failure",
  failure: "procedural-tier-failure",
  soSo: "procedural-tier-so-so",
  success: "procedural-tier-success",
  successEffect: "procedural-tier-success-effect"
};

const GENERATOR_DATA_PATHS = {
  tropes: "systems/procedural/data/tropes.json",
  secondTalents: "systems/procedural/data/second-talents.json",
  qualities: "systems/procedural/data/qualities.json",
  quirks: "systems/procedural/data/quirks.json",
  bstories: "systems/procedural/data/bstories.json",
  hq: "systems/procedural/data/hq.json",
  agencyNames: "systems/procedural/data/agency-names.json"
};

let cachedGeneratorData = null;

async function loadGeneratorData() {
  if (cachedGeneratorData) return cachedGeneratorData;
  try {
    const entries = await Promise.all(
      Object.entries(GENERATOR_DATA_PATHS).map(async ([key, path]) => {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Failed to fetch "${path}" (${response.status} ${response.statusText})`);
        return [key, await response.json()];
      })
    );
    cachedGeneratorData = Object.fromEntries(entries);
    return cachedGeneratorData;
  } catch (err) {
    console.error("PROCEDURAL | Failed to load random Trope generator data", err);
    ui.notifications?.error("PROCEDURAL! failed to load the random Trope generator data. Check the console for details.");
    throw err;
  }
}

export default class ProceduralActor extends Actor {
  // ...rollSkill, _postRollCard, spendRerunPointAndReroll, generateRandomTrope unchanged below...
}
```

- [ ] **Step 2: Create `module/helpers/generator-data.mjs`**

```js
export const GENERATOR_DATA_PATHS = {
  tropes: "systems/procedural/data/tropes.json",
  secondTalents: "systems/procedural/data/second-talents.json",
  qualities: "systems/procedural/data/qualities.json",
  quirks: "systems/procedural/data/quirks.json",
  bstories: "systems/procedural/data/bstories.json",
  hq: "systems/procedural/data/hq.json",
  agencyNames: "systems/procedural/data/agency-names.json"
};

let cachedGeneratorData = null;

export async function loadGeneratorData() {
  if (cachedGeneratorData) return cachedGeneratorData;
  try {
    const entries = await Promise.all(
      Object.entries(GENERATOR_DATA_PATHS).map(async ([key, path]) => {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Failed to fetch "${path}" (${response.status} ${response.statusText})`);
        return [key, await response.json()];
      })
    );
    cachedGeneratorData = Object.fromEntries(entries);
    return cachedGeneratorData;
  } catch (err) {
    console.error("PROCEDURAL | Failed to load character generator data", err);
    ui.notifications?.error("PROCEDURAL! failed to load character generator data. Check the console for details.");
    throw err;
  }
}
```

This is a straight move — same logic, same behavior, just no longer private to `actor.mjs`. The console/notification wording changes from "random Trope generator data" to "character generator data" since it's now shared by both Randomize and the wizard.

- [ ] **Step 3: Update `module/documents/actor.mjs` to import instead of define**

Remove the `GENERATOR_DATA_PATHS` constant, the `cachedGeneratorData` variable, and the `loadGeneratorData` function from this file entirely. Replace the top of the file with:

```js
import { computeRoll } from "../helpers/dice-rules.mjs";
import { showDiceSoNice } from "../helpers/dice-so-nice.mjs";
import { generateTrope } from "../helpers/character-generator.mjs";
import { loadGeneratorData } from "../helpers/generator-data.mjs";

const PHYSICAL_SKILLS = new Set(["violence", "reflexes", "coordination"]);

const TIER_CLASS = {
  criticalFailure: "procedural-tier-critical-failure",
  failure: "procedural-tier-failure",
  soSo: "procedural-tier-so-so",
  success: "procedural-tier-success",
  successEffect: "procedural-tier-success-effect"
};

export default class ProceduralActor extends Actor {
  // ...everything below this line (rollSkill, _postRollCard, spendRerunPointAndReroll, generateRandomTrope) is unchanged — generateRandomTrope's own body still calls loadGeneratorData() exactly as before, now resolved via the new import
}
```

Do not change anything inside the class body — `generateRandomTrope()` already calls `loadGeneratorData()` by that bare name, so the new import satisfies it with zero other edits.

- [ ] **Step 4: Verify syntax on both files**

```bash
node --check module/helpers/generator-data.mjs
node --check module/documents/actor.mjs
```
Expected: no output from either.

- [ ] **Step 5: Run the full test suite as a regression check**

```bash
npm test
```
Expected: all 36 tests pass (this task doesn't touch the Node-testable surface, but confirms nothing else broke).

- [ ] **Step 6: Commit**

```bash
git add module/helpers/generator-data.mjs module/documents/actor.mjs
git commit -m "refactor: extract shared generator-data loader out of actor.mjs"
```

---

### Task 2: `validateSkillAllocation` pure function

**Files:**
- Modify: `module/helpers/character-generator.mjs`
- Modify (add tests, don't remove existing ones): `module/helpers/character-generator.test.mjs`

**Interfaces:**
- Consumes: the same private `STAT_SKILLS`, `CAPPED_SKILLS`, and `parseStatNoteMinimum` already defined in this file (no changes to those).
- Produces: `validateSkillAllocation(stats, statNotes, skills): { valid: boolean, remaining: {mental,physical,social}, violations: string[] }`. Consumed by Task 4's Skills step (both for the initial-render `canAdvance` check and for live keystroke validation).

- [ ] **Step 1: Write the failing tests**

Append to `module/helpers/character-generator.test.mjs` (keep every existing test):

```js
import { validateSkillAllocation } from "./character-generator.mjs";

const ZERO_SKILLS = {
  tech: 0, lab: 0, investigation: 0,
  violence: 0, reflexes: 0, coordination: 0,
  cool: 0, intuition: 0, deception: 0
};

test("validateSkillAllocation accepts a fully-spent, cap-compliant allocation", () => {
  const skills = { ...ZERO_SKILLS, tech: 1, lab: 1 };
  const result = validateSkillAllocation({ mental: 2, physical: 0, social: 0 }, "", skills);
  assert.deepEqual(result, {
    valid: true,
    remaining: { mental: 0, physical: 0, social: 0 },
    violations: []
  });
});

test("validateSkillAllocation flags a Tech/Lab skill exceeding the cap with no statNotes minimum", () => {
  const skills = { ...ZERO_SKILLS, tech: 3 };
  const result = validateSkillAllocation({ mental: 3, physical: 0, social: 0 }, "", skills);
  assert.equal(result.valid, false);
  assert.deepEqual(result.violations, ["tech exceeds the cap of 2"]);
  assert.deepEqual(result.remaining, { mental: 0, physical: 0, social: 0 });
});

test("validateSkillAllocation does not flag a statNotes-noted skill for exceeding the cap", () => {
  const skills = { ...ZERO_SKILLS, lab: 5 };
  const result = validateSkillAllocation({ mental: 5, physical: 0, social: 0 }, "At least 3 in Lab", skills);
  assert.equal(result.valid, true);
  assert.deepEqual(result.violations, []);
});

test("validateSkillAllocation flags a statNotes-noted skill below its required minimum", () => {
  const skills = { ...ZERO_SKILLS, lab: 2 };
  const result = validateSkillAllocation({ mental: 2, physical: 0, social: 0 }, "At least 3 in Lab", skills);
  assert.equal(result.valid, false);
  assert.deepEqual(result.violations, ["lab is below its required minimum of 3"]);
});

test("validateSkillAllocation flags nonzero remaining points even with no cap violations", () => {
  const skills = { ...ZERO_SKILLS, tech: 1, lab: 1 };
  const result = validateSkillAllocation({ mental: 3, physical: 0, social: 0 }, "", skills);
  assert.equal(result.valid, false);
  assert.deepEqual(result.violations, []);
  assert.deepEqual(result.remaining, { mental: 1, physical: 0, social: 0 });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
node --test module/helpers/character-generator.test.mjs
```
Expected: the 17 pre-existing tests PASS, the 5 new tests FAIL (`validateSkillAllocation` is not exported / undefined).

- [ ] **Step 3: Add `validateSkillAllocation` to `module/helpers/character-generator.mjs`**

Add this function after `divestSkills` (it reads the same private `STAT_SKILLS`, `CAPPED_SKILLS`, and `parseStatNoteMinimum` already defined earlier in the file — do not duplicate or re-declare them):

```js
/**
 * Checks a manually-chosen skill allocation against the same rules
 * divestSkills enforces automatically: each stat's points must be fully
 * spent, and Tech/Lab may not exceed a cap of 2 unless statNotes names
 * that skill with an "at least N" minimum — which then also becomes the
 * floor for that skill, not just a waived cap.
 * @param {{mental: number, physical: number, social: number}} stats
 * @param {string} statNotes
 * @param {{tech:number,lab:number,investigation:number,violence:number,reflexes:number,coordination:number,cool:number,intuition:number,deception:number}} skills
 * @returns {{valid: boolean, remaining: {mental:number,physical:number,social:number}, violations: string[]}}
 */
export function validateSkillAllocation(stats, statNotes, skills) {
  const noteMin = parseStatNoteMinimum(statNotes);
  const violations = [];

  const remaining = {};
  for (const statName of Object.keys(STAT_SKILLS)) {
    const spent = STAT_SKILLS[statName].reduce((sum, key) => sum + (skills[key] ?? 0), 0);
    remaining[statName] = stats[statName] - spent;
  }

  for (const [skill, cap] of Object.entries(CAPPED_SKILLS)) {
    const value = skills[skill] ?? 0;
    const isNotedMinimum = noteMin && noteMin.skill === skill;
    if (!isNotedMinimum && value > cap) {
      violations.push(`${skill} exceeds the cap of ${cap}`);
    }
  }

  if (noteMin) {
    const value = skills[noteMin.skill] ?? 0;
    if (value < noteMin.minimum) {
      violations.push(`${noteMin.skill} is below its required minimum of ${noteMin.minimum}`);
    }
  }

  const valid = violations.length === 0 && Object.values(remaining).every(r => r === 0);

  return { valid, remaining, violations };
}
```

- [ ] **Step 4: Run tests to verify everything passes**

```bash
node --test module/helpers/character-generator.test.mjs
```
Expected: all 22 tests pass (17 pre-existing + 5 new).

- [ ] **Step 5: Run the full suite as a regression check**

```bash
npm test
```
Expected: all tests across both `.test.mjs` files pass.

- [ ] **Step 6: Commit**

```bash
git add module/helpers/character-generator.mjs module/helpers/character-generator.test.mjs
git commit -m "feat: add validateSkillAllocation for manual skill divestment"
```

---

### Task 3: Wizard shell, Name step, Trope step

This is the largest task — it establishes the wizard class, the step-switching machinery, and the two conventions every later step follows: (1) discrete choices (Roll/pick buttons) call a private setter method and trigger a full re-render; (2) continuous text input is read live via a native `input` listener wired in `_onRender`, never via a full re-render (re-rendering on every keystroke would lose focus/cursor position in Foundry's ApplicationV2).

**Files:**
- Create: `module/apps/trope-builder.mjs`
- Create: `templates/apps/trope-builder.hbs`
- Create: `templates/apps/trope-builder-steps/name.hbs`
- Create: `templates/apps/trope-builder-steps/trope.hbs`
- Modify: `css/procedural.css`

**Interfaces:**
- Consumes: `loadGeneratorData` (Task 1), `rollTrope` (existing, from `character-generator.mjs`).
- Produces: `export default class TropeBuilderApplication extends HandlebarsApplicationMixin(ApplicationV2)`. Task 8's directory launcher does `new TropeBuilderApplication().render(true)`. Tasks 4-7 add to this same file: more `if (stepId === ...)` blocks in `_prepareContext`, more `if (stepId === ...)` blocks in `_onRender`, and more static action handlers registered in `DEFAULT_OPTIONS.actions`.

- [ ] **Step 1: Create `module/apps/trope-builder.mjs`**

```js
const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ApplicationV2 } = foundry.applications.api;

import { loadGeneratorData } from "../helpers/generator-data.mjs";
import { rollTrope } from "../helpers/character-generator.mjs";

const STEP_IDS = [
  "name", "trope", "skills", "quality", "quirk", "bstory",
  "secondTalent", "hq", "agencyName", "review"
];

const STAT_KEYS = ["mental", "physical", "social"];

const EMPTY_SKILLS = {
  tech: 0, lab: 0, investigation: 0,
  violence: 0, reflexes: 0, coordination: 0,
  cool: 0, intuition: 0, deception: 0
};

const TEXT_STEP_DRAFT_KEYS = {
  name: "name",
  quality: "quality",
  quirk: "quirk",
  bstory: "bStory",
  hq: "hq",
  agencyName: "agencyName"
};

export default class TropeBuilderApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "procedural-trope-builder",
    classes: ["procedural", "trope-builder"],
    position: { width: 560, height: 680 },
    window: { title: "PROCEDURAL.TropeBuilder.Title", resizable: true },
    actions: {
      goNext: TropeBuilderApplication.#onNext,
      goBack: TropeBuilderApplication.#onBack,
      goToStep: TropeBuilderApplication.#onGoToStep,
      rollTrope: TropeBuilderApplication.#onRollTrope
    }
  };

  static PARTS = {
    form: {
      template: "systems/procedural/templates/apps/trope-builder.hbs",
      templates: [
        "systems/procedural/templates/apps/trope-builder-steps/name.hbs",
        "systems/procedural/templates/apps/trope-builder-steps/trope.hbs"
      ]
    }
  };

  #stepIndex = 0;
  #data = null;
  #draft = {
    name: "",
    trope: null,
    giftedStat: null,
    stats: null,
    skills: { ...EMPTY_SKILLS },
    quality: "",
    quirk: "",
    bStory: "",
    secondTalent: null,
    hq: "",
    agencyName: ""
  };

  get #stepId() {
    return STEP_IDS[this.#stepIndex];
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    this.#data ??= await loadGeneratorData();

    const stepId = this.#stepId;
    context.stepId = stepId;
    context.stepNumber = this.#stepIndex + 1;
    context.stepCount = STEP_IDS.length;
    context.isFirstStep = this.#stepIndex === 0;
    context.draft = this.#draft;
    context.canAdvance = this.#isStepValid(stepId);
    context.show = {
      name: stepId === "name",
      trope: stepId === "trope",
      skills: stepId === "skills",
      rollChooseCreate: false, // Task 5 replaces this with a real check
      secondTalent: stepId === "secondTalent",
      agencyName: stepId === "agencyName",
      review: stepId === "review"
    };

    if (stepId === "trope") {
      context.tropeOptions = this.#data.tropes.map(t => ({
        name: t.name,
        selected: t.name === (this.#draft.trope?.name ?? "")
      }));
      context.statKeys = STAT_KEYS;
      context.isGifted = this.#isGiftedTrope();
      context.giftedStatChecked = {
        mental: this.#draft.giftedStat === "mental",
        physical: this.#draft.giftedStat === "physical",
        social: this.#draft.giftedStat === "social"
      };
      context.finalStats = this.#draft.stats;
    }

    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const stepId = this.#stepId;

    const textInput = this.element.querySelector('[name="stepValue"]');
    if (textInput) {
      textInput.addEventListener("input", () => {
        this.#draft[TEXT_STEP_DRAFT_KEYS[stepId]] = textInput.value;
        this.#refreshNextEnabled();
      });
    }

    if (stepId === "trope") {
      const tropeSelect = this.element.querySelector('[data-role="trope-select"]');
      tropeSelect?.addEventListener("change", () => {
        const trope = this.#data.tropes.find(t => t.name === tropeSelect.value);
        if (trope) this.#setTrope(trope);
      });

      this.element.querySelectorAll('[data-role="gifted-stat"]').forEach(radio => {
        radio.addEventListener("change", () => {
          if (radio.checked) this.#setGiftedStat(radio.value);
        });
      });
    }
  }

  #refreshNextEnabled(forcedValue) {
    const enabled = forcedValue ?? this.#isStepValid(this.#stepId);
    const nextBtn = this.element.querySelector('[data-action="goNext"], [data-action="finish"]');
    if (nextBtn) nextBtn.disabled = !enabled;
  }

  #isGiftedTrope() {
    return this.#draft.trope?.system.talentName === "Gifted";
  }

  #setTrope(tropeEntry) {
    this.#draft.trope = tropeEntry;
    this.#draft.giftedStat = null;
    this.#draft.stats = { ...tropeEntry.system.statBlock };
    this.#draft.skills = { ...EMPTY_SKILLS };
    this.render();
  }

  #setGiftedStat(statKey) {
    if (!this.#isGiftedTrope() || !this.#draft.trope) return;
    this.#draft.giftedStat = statKey;
    const base = this.#draft.trope.system.statBlock;
    this.#draft.stats = { ...base, [statKey]: base[statKey] + 3 };
    this.#draft.skills = { ...EMPTY_SKILLS };
    this.render();
  }

  #isStepValid(stepId) {
    switch (stepId) {
      case "name": return this.#draft.name.trim().length > 0;
      case "trope": return this.#draft.trope !== null && (!this.#isGiftedTrope() || this.#draft.giftedStat !== null);
      case "skills": return false; // Task 4 replaces this
      case "quality": return this.#draft.quality.trim().length > 0;
      case "quirk": return this.#draft.quirk.trim().length > 0;
      case "bstory": return this.#draft.bStory.trim().length > 0;
      case "secondTalent": return this.#draft.secondTalent !== null;
      case "hq": return this.#draft.hq.trim().length > 0;
      case "agencyName": return this.#draft.agencyName.trim().length > 0;
      case "review": return true;
      default: return false;
    }
  }

  static #onNext() {
    if (!this.#isStepValid(this.#stepId)) return;
    this.#stepIndex = Math.min(this.#stepIndex + 1, STEP_IDS.length - 1);
    this.render();
  }

  static #onBack() {
    this.#stepIndex = Math.max(this.#stepIndex - 1, 0);
    this.render();
  }

  static #onGoToStep(event, target) {
    const index = STEP_IDS.indexOf(target.dataset.step);
    if (index >= 0) {
      this.#stepIndex = index;
      this.render();
    }
  }

  static #onRollTrope() {
    const trope = rollTrope(this.#data.tropes, Math.random);
    this.#setTrope(trope);
  }
}
```

Note the two placeholders explicitly marked with `// Task N replaces this` comments (`context.show.rollChooseCreate` and the `"skills"` case in `#isStepValid`) — these are deliberate, tracked hand-offs to later tasks in this same plan, not the kind of vague "add appropriate handling" placeholder this project's plans avoid; each is replaced with concrete logic by name in a specific later task below.

- [ ] **Step 2: Create `templates/apps/trope-builder.hbs`**

```hbs
<form class="procedural-sheet procedural-trope-builder">
  <header class="procedural-builder-header">
    <span>{{localize "PROCEDURAL.TropeBuilder.StepIndicator"}} {{stepNumber}} / {{stepCount}}</span>
  </header>

  <section class="procedural-builder-body">
    {{#if show.name}}{{> "systems/procedural/templates/apps/trope-builder-steps/name.hbs"}}{{/if}}
    {{#if show.trope}}{{> "systems/procedural/templates/apps/trope-builder-steps/trope.hbs"}}{{/if}}
  </section>

  <footer class="procedural-builder-footer">
    {{#unless isFirstStep}}
      <button type="button" data-action="goBack">{{localize "PROCEDURAL.TropeBuilder.Back"}}</button>
    {{/unless}}
    <button type="button" data-action="goNext" {{#unless canAdvance}}disabled{{/unless}}>{{localize "PROCEDURAL.TropeBuilder.Next"}}</button>
  </footer>
</form>
```

Later tasks add more `{{#if show.X}}` lines to the body, and Task 7 replaces the footer's unconditional Next button with a Next-or-Finish branch — noted explicitly in Task 7's own steps.

- [ ] **Step 3: Create `templates/apps/trope-builder-steps/name.hbs`**

```hbs
<div class="procedural-builder-step">
  <label>{{localize "PROCEDURAL.TropeBuilder.NamePrompt"}}</label>
  <input type="text" name="stepValue" value="{{draft.name}}" placeholder="{{localize 'PROCEDURAL.TropeBuilder.NamePlaceholder'}}">
</div>
```

- [ ] **Step 4: Create `templates/apps/trope-builder-steps/trope.hbs`**

```hbs
<div class="procedural-builder-step procedural-builder-trope-step">
  <div class="procedural-builder-row">
    <button type="button" data-action="rollTrope">{{localize "PROCEDURAL.TropeBuilder.Roll"}}</button>
    <select data-role="trope-select">
      <option value="">{{localize "PROCEDURAL.TropeBuilder.ChooseOption"}}</option>
      {{#each tropeOptions as |opt|}}
        <option value="{{opt.name}}" {{#if opt.selected}}selected{{/if}}>{{opt.name}}</option>
      {{/each}}
    </select>
  </div>

  {{#if draft.trope}}
    <div class="procedural-builder-trope-summary">
      <h3>{{draft.trope.name}}</h3>
      <p>{{localize "PROCEDURAL.Item.TalentName"}}: {{draft.trope.system.talentName}} — {{draft.trope.system.talentDescription}}</p>
      <p>
        {{localize "PROCEDURAL.Stat.mental"}}: {{finalStats.mental}},
        {{localize "PROCEDURAL.Stat.physical"}}: {{finalStats.physical}},
        {{localize "PROCEDURAL.Stat.social"}}: {{finalStats.social}}
      </p>
    </div>
  {{/if}}

  {{#if isGifted}}
    <fieldset class="procedural-builder-gifted">
      <legend>{{localize "PROCEDURAL.TropeBuilder.GiftedPrompt"}}</legend>
      {{#each statKeys as |stat|}}
        <label>
          <input type="radio" name="giftedStat" value="{{stat}}" data-role="gifted-stat" {{#if (lookup ../giftedStatChecked stat)}}checked{{/if}}>
          {{localize (concat "PROCEDURAL.Stat." stat)}}
        </label>
      {{/each}}
    </fieldset>
  {{/if}}
</div>
```

- [ ] **Step 5: Add wizard styles to `css/procedural.css`**

Append to the end of the file:

```css
.procedural-trope-builder {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.procedural-builder-header {
  font-weight: bold;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #666;
}

.procedural-builder-body {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 0;
}

.procedural-builder-step {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.procedural-builder-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.procedural-builder-freetext {
  width: 100%;
  min-height: 3rem;
}

.procedural-builder-skill-input {
  width: 3rem;
}

.procedural-builder-violations {
  color: #b00000;
  margin: 0;
  padding-left: 1.25rem;
}

.procedural-builder-review dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.25rem 0.5rem;
  margin: 0;
}

.procedural-builder-footer {
  display: flex;
  justify-content: space-between;
  padding-top: 0.5rem;
  border-top: 1px solid #666;
}
```

- [ ] **Step 6: Add localization strings to `lang/en.json`**

Add a new `TropeBuilder` object inside the existing `"PROCEDURAL"` object (after the existing `"Roll"` object, i.e. as a new top-level sibling of `Actor`/`Item`/`Roll`):

```json
    "TropeBuilder": {
      "Title": "Build a Trope",
      "Launch": "Build Trope Character",
      "StepIndicator": "Step",
      "Back": "Back",
      "Next": "Next",
      "Finish": "Finish",
      "Edit": "Edit",
      "Roll": "Roll",
      "ChooseOption": "Choose...",
      "OrTypeYourOwn": "Or type your own...",
      "NamePrompt": "What's your character's name?",
      "NamePlaceholder": "Character name",
      "GiftedPrompt": "Gifted: choose a stat to add +3 to",
      "PointsRemaining": "points remaining",
      "Word": "Word"
    }
```

Remember the trailing comma on the line above this new block (after `"Roll": { ... }`), and verify the JSON is still valid:

```bash
node -e "JSON.parse(require('fs').readFileSync('lang/en.json', 'utf8')); console.log('OK')"
```
Expected: `OK`.

- [ ] **Step 7: Verify syntax**

```bash
node --check module/apps/trope-builder.mjs
```
Expected: no output.

- [ ] **Step 8: Run the full test suite as a regression check**

```bash
npm test
```
Expected: all 22 tests pass (this task adds no Node-testable code).

- [ ] **Step 9: Commit**

```bash
git add module/apps/trope-builder.mjs templates/apps/trope-builder.hbs templates/apps/trope-builder-steps/name.hbs templates/apps/trope-builder-steps/trope.hbs css/procedural.css lang/en.json
git commit -m "feat: add Trope builder wizard shell with Name and Trope steps"
```

---

### Task 4: Skills step (manual divestment with live validation)

**Files:**
- Modify: `module/apps/trope-builder.mjs`
- Create: `templates/apps/trope-builder-steps/skills.hbs`
- Modify: `templates/apps/trope-builder.hbs`

**Interfaces:**
- Consumes: `validateSkillAllocation` (Task 2), `this.#draft.stats`/`this.#draft.trope` (Task 3).
- Produces: nothing new consumed by later tasks — this step is self-contained once wired in.

- [ ] **Step 1: Import `validateSkillAllocation` and add the Skills step's `STAT_SKILLS` map**

In `module/apps/trope-builder.mjs`, change the import line:

```js
import { rollTrope } from "../helpers/character-generator.mjs";
```

to:

```js
import { rollTrope, validateSkillAllocation } from "../helpers/character-generator.mjs";
```

Add this constant after `STAT_KEYS`:

```js
const STAT_SKILLS = {
  mental: ["tech", "lab", "investigation"],
  physical: ["violence", "reflexes", "coordination"],
  social: ["cool", "intuition", "deception"]
};
```

- [ ] **Step 2: Add the Skills step's context in `_prepareContext`**

Add this block right after the existing `if (stepId === "trope") { ... }` block (before `return context;`):

```js
    if (stepId === "skills") {
      context.statKeys = STAT_KEYS;
      context.statSkills = STAT_SKILLS;
      context.validation = this.#draft.trope
        ? validateSkillAllocation(this.#draft.stats, this.#draft.trope.system.statNotes, this.#draft.skills)
        : { remaining: { mental: 0, physical: 0, social: 0 }, violations: [] };
    }
```

Also change `context.show.skills` — it's already `stepId === "skills"` from Task 3, no change needed there.

- [ ] **Step 3: Wire live skill-input listeners in `_onRender`**

Add this block inside `_onRender`, after the existing `if (stepId === "trope") { ... }` block:

```js
    if (stepId === "skills") {
      this.element.querySelectorAll(".procedural-builder-skill-input").forEach(input => {
        input.addEventListener("input", () => this.#onSkillInput());
      });
    }
```

- [ ] **Step 4: Add the `#onSkillInput` private method**

Add this method anywhere in the class body (e.g. right after `#refreshNextEnabled`):

```js
  #onSkillInput() {
    const skills = { ...EMPTY_SKILLS };
    this.element.querySelectorAll(".procedural-builder-skill-input").forEach(input => {
      skills[input.dataset.skill] = Number(input.value) || 0;
    });
    this.#draft.skills = skills;

    const validation = validateSkillAllocation(this.#draft.stats, this.#draft.trope.system.statNotes, skills);
    for (const stat of STAT_KEYS) {
      const el = this.element.querySelector(`[data-remaining-for="${stat}"]`);
      if (el) el.textContent = validation.remaining[stat];
    }
    const violationsEl = this.element.querySelector(".procedural-builder-violations");
    if (violationsEl) {
      violationsEl.innerHTML = validation.violations.map(v => `<li>${v}</li>`).join("");
    }

    this.#refreshNextEnabled(validation.valid);
  }
```

- [ ] **Step 5: Replace the `"skills"` placeholder in `#isStepValid`**

Change:

```js
      case "skills": return false; // Task 4 replaces this
```

to:

```js
      case "skills":
        return !!this.#draft.trope && validateSkillAllocation(this.#draft.stats, this.#draft.trope.system.statNotes, this.#draft.skills).valid;
```

- [ ] **Step 6: Create `templates/apps/trope-builder-steps/skills.hbs`**

```hbs
<div class="procedural-builder-step procedural-builder-skills">
  {{#each statKeys as |stat|}}
    <fieldset data-stat="{{stat}}">
      <legend>
        {{localize (concat "PROCEDURAL.Stat." stat)}} —
        <span class="procedural-builder-remaining" data-remaining-for="{{stat}}">{{lookup ../validation.remaining stat}}</span>
        {{localize "PROCEDURAL.TropeBuilder.PointsRemaining"}}
      </legend>
      {{#each (lookup ../statSkills stat) as |skillKey|}}
        <label>
          {{localize (concat "PROCEDURAL.Skill." skillKey)}}
          <input type="number" min="0" class="procedural-builder-skill-input" data-skill="{{skillKey}}" value="{{lookup ../draft.skills skillKey}}">
        </label>
      {{/each}}
    </fieldset>
  {{/each}}

  <ul class="procedural-builder-violations">
    {{#each validation.violations as |violation|}}
      <li>{{violation}}</li>
    {{/each}}
  </ul>
</div>
```

- [ ] **Step 7: Add the Skills step to the shell template**

In `templates/apps/trope-builder.hbs`, add a line to the body section:

```hbs
    {{#if show.trope}}{{> "systems/procedural/templates/apps/trope-builder-steps/trope.hbs"}}{{/if}}
    {{#if show.skills}}{{> "systems/procedural/templates/apps/trope-builder-steps/skills.hbs"}}{{/if}}
```

- [ ] **Step 8: Register the new step partial in `PARTS.form.templates`**

`HandlebarsApplicationMixin` only preloads and registers the templates listed in `PARTS.form.templates` as Handlebars partials — a `{{> "..."}}` reference to a path that isn't in that array throws `The partial ... could not be found` on render. In `module/apps/trope-builder.mjs`, add the new step's path to the array:

```js
  static PARTS = {
    form: {
      template: "systems/procedural/templates/apps/trope-builder.hbs",
      templates: [
        "systems/procedural/templates/apps/trope-builder-steps/name.hbs",
        "systems/procedural/templates/apps/trope-builder-steps/trope.hbs",
        "systems/procedural/templates/apps/trope-builder-steps/skills.hbs"
      ]
    }
  };
```

- [ ] **Step 9: Verify syntax**

```bash
node --check module/apps/trope-builder.mjs
```
Expected: no output.

- [ ] **Step 10: Run the full test suite as a regression check**

```bash
npm test
```
Expected: all tests pass (this task adds no Node-testable code, so the count should match whatever the suite already reports going into this task — report the actual number, don't assume a stale count from this plan text).

- [ ] **Step 11: Commit**

```bash
git add module/apps/trope-builder.mjs templates/apps/trope-builder-steps/skills.hbs templates/apps/trope-builder.hbs
git commit -m "feat: add the wizard's manual skill-divestment step"
```

---

### Task 5: Shared roll/choose/create step (Quality, Quirk, B-story, HQ)

These four steps share one interaction shape — roll, pick from a flat dropdown, or free-text — so they share one partial template and one config-driven set of handlers instead of four near-duplicate step implementations.

**Files:**
- Modify: `module/apps/trope-builder.mjs`
- Create: `templates/apps/trope-builder-steps/roll-choose-create.hbs`
- Modify: `templates/apps/trope-builder.hbs`

**Interfaces:**
- Consumes: `rollQualityOrQuirk`, `rollBStoryOrHq` (existing, from `character-generator.mjs`).
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Import the two roll functions and add the step config map**

Change the import line:

```js
import { rollTrope, validateSkillAllocation } from "../helpers/character-generator.mjs";
```

to:

```js
import { rollTrope, validateSkillAllocation, rollQualityOrQuirk, rollBStoryOrHq } from "../helpers/character-generator.mjs";
```

Add this constant after `TEXT_STEP_DRAFT_KEYS`:

```js
const ROLL_CHOOSE_CREATE_CONFIG = {
  quality: { dataKey: "qualities", labelKey: "PROCEDURAL.Actor.Qualities", draftKey: "quality", rollFn: rollQualityOrQuirk },
  quirk: { dataKey: "quirks", labelKey: "PROCEDURAL.Actor.Quirks", draftKey: "quirk", rollFn: rollQualityOrQuirk },
  bstory: { dataKey: "bstories", labelKey: "PROCEDURAL.Actor.BStory", draftKey: "bStory", rollFn: rollBStoryOrHq },
  hq: { dataKey: "hq", labelKey: "PROCEDURAL.Actor.HQ", draftKey: "hq", rollFn: rollBStoryOrHq }
};
```

- [ ] **Step 2: Register the `rollTable` action**

In `DEFAULT_OPTIONS.actions`, add `rollTable` alongside the existing entries:

```js
    actions: {
      goNext: TropeBuilderApplication.#onNext,
      goBack: TropeBuilderApplication.#onBack,
      goToStep: TropeBuilderApplication.#onGoToStep,
      rollTrope: TropeBuilderApplication.#onRollTrope,
      rollTable: TropeBuilderApplication.#onRollTable
    }
```

- [ ] **Step 3: Replace the `rollChooseCreate` placeholder in `_prepareContext`**

Change:

```js
      rollChooseCreate: false, // Task 5 replaces this with a real check
```

to:

```js
      rollChooseCreate: stepId in ROLL_CHOOSE_CREATE_CONFIG,
```

Then add this block right after the `"skills"` block added in Task 4 (before `return context;`):

```js
    if (stepId in ROLL_CHOOSE_CREATE_CONFIG) {
      const config = ROLL_CHOOSE_CREATE_CONFIG[stepId];
      const table = this.#data[config.dataKey];
      context.rollChooseCreate = {
        label: game.i18n.localize(config.labelKey),
        options: [...table.odds, ...table.evens],
        value: this.#draft[config.draftKey]
      };
    }
```

- [ ] **Step 4: Add the free-text-fill `<select>` wiring in `_onRender`**

Add this block right after the existing `textInput` wiring at the top of `_onRender` (it must run for every step, so place it directly after the `if (textInput) { ... }` block that Task 3 already added, not inside any `if (stepId === ...)` block):

```js
    const fillSelect = this.element.querySelector('[data-fills-value]');
    if (fillSelect && textInput) {
      fillSelect.addEventListener("change", () => {
        if (!fillSelect.value) return;
        textInput.value = fillSelect.value;
        textInput.dispatchEvent(new Event("input"));
      });
    }
```

- [ ] **Step 5: Add the `#onRollTable` static handler**

Add this method alongside the other static action handlers (e.g. after `#onRollTrope`):

```js
  static #onRollTable() {
    const config = ROLL_CHOOSE_CREATE_CONFIG[this.#stepId];
    if (!config) return;
    const value = config.rollFn(this.#data[config.dataKey], Math.random);
    this.#draft[config.draftKey] = value;
    this.render();
  }
```

- [ ] **Step 6: Create `templates/apps/trope-builder-steps/roll-choose-create.hbs`**

This partial is included with its own dedicated context object (`rollChooseCreate` from Step 3 above), so inside it `label`, `options`, and `value` refer directly to that object's own fields — no `rollChooseCreate.` prefix:

```hbs
<div class="procedural-builder-step procedural-builder-rcc">
  <label class="procedural-builder-rcc-label">{{label}}</label>
  <div class="procedural-builder-row">
    <button type="button" data-action="rollTable">{{localize "PROCEDURAL.TropeBuilder.Roll"}}</button>
    <select data-fills-value>
      <option value="">{{localize "PROCEDURAL.TropeBuilder.ChooseOption"}}</option>
      {{#each options as |option|}}
        <option value="{{option}}">{{option}}</option>
      {{/each}}
    </select>
  </div>
  <textarea name="stepValue" class="procedural-builder-freetext" placeholder="{{localize 'PROCEDURAL.TropeBuilder.OrTypeYourOwn'}}">{{value}}</textarea>
</div>
```

- [ ] **Step 7: Add the shared step to the shell template**

In `templates/apps/trope-builder.hbs`, add one line to the body section (it covers all four steps — `quality`, `quirk`, `bstory`, `hq` — since `show.rollChooseCreate` is `true` for all of them):

```hbs
    {{#if show.skills}}{{> "systems/procedural/templates/apps/trope-builder-steps/skills.hbs"}}{{/if}}
    {{#if show.rollChooseCreate}}{{> "systems/procedural/templates/apps/trope-builder-steps/roll-choose-create.hbs" rollChooseCreate}}{{/if}}
```

- [ ] **Step 7b: Register the new step partial in `PARTS.form.templates`**

Only one new path is needed even though this partial is reused for four steps — it's a single file. In `module/apps/trope-builder.mjs`:

```js
  static PARTS = {
    form: {
      template: "systems/procedural/templates/apps/trope-builder.hbs",
      templates: [
        "systems/procedural/templates/apps/trope-builder-steps/name.hbs",
        "systems/procedural/templates/apps/trope-builder-steps/trope.hbs",
        "systems/procedural/templates/apps/trope-builder-steps/skills.hbs",
        "systems/procedural/templates/apps/trope-builder-steps/roll-choose-create.hbs"
      ]
    }
  };
```

- [ ] **Step 8: Verify syntax**

```bash
node --check module/apps/trope-builder.mjs
```
Expected: no output.

- [ ] **Step 9: Run the full test suite as a regression check**

```bash
npm test
```
Expected: all tests pass (report the actual current count — this task adds no Node-testable code, so it should match whatever the suite already reported going into this task).

- [ ] **Step 10: Commit**

```bash
git add module/apps/trope-builder.mjs templates/apps/trope-builder-steps/roll-choose-create.hbs templates/apps/trope-builder.hbs
git commit -m "feat: add shared roll/choose/create step for Quality, Quirk, B-story, HQ"
```

---

### Task 6: Second Talent step and Agency Name step

**Files:**
- Modify: `module/apps/trope-builder.mjs`
- Create: `templates/apps/trope-builder-steps/second-talent.hbs`
- Create: `templates/apps/trope-builder-steps/agency-name.hbs`
- Modify: `templates/apps/trope-builder.hbs`

**Interfaces:**
- Consumes: `rollAgencyName` (existing, from `character-generator.mjs`).
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Import `rollAgencyName` and register its action**

Change the import line:

```js
import { rollTrope, validateSkillAllocation, rollQualityOrQuirk, rollBStoryOrHq } from "../helpers/character-generator.mjs";
```

to:

```js
import { rollTrope, validateSkillAllocation, rollQualityOrQuirk, rollBStoryOrHq, rollAgencyName } from "../helpers/character-generator.mjs";
```

Add `rollAgencyName` to `DEFAULT_OPTIONS.actions`:

```js
    actions: {
      goNext: TropeBuilderApplication.#onNext,
      goBack: TropeBuilderApplication.#onBack,
      goToStep: TropeBuilderApplication.#onGoToStep,
      rollTrope: TropeBuilderApplication.#onRollTrope,
      rollTable: TropeBuilderApplication.#onRollTable,
      rollAgencyName: TropeBuilderApplication.#onRollAgencyName
    }
```

- [ ] **Step 2: Add Second Talent and Agency Name context**

Add these two blocks in `_prepareContext`, after the `ROLL_CHOOSE_CREATE_CONFIG` block added in Task 5 (before `return context;`):

```js
    if (stepId === "secondTalent") {
      context.secondTalentOptions = this.#data.secondTalents.map(t => ({
        name: t.name,
        selected: t.name === (this.#draft.secondTalent?.name ?? "")
      }));
    }

    if (stepId === "agencyName") {
      context.table1 = this.#data.agencyNames.table1;
      context.table2 = this.#data.agencyNames.table2;
      context.table3 = this.#data.agencyNames.table3;
    }
```

- [ ] **Step 3: Wire Second Talent and Agency Name listeners in `_onRender`**

Add these two blocks after the `"skills"` block added in Task 4:

```js
    if (stepId === "secondTalent") {
      const talentSelect = this.element.querySelector('[data-role="talent-select"]');
      talentSelect?.addEventListener("change", () => {
        const talent = this.#data.secondTalents.find(t => t.name === talentSelect.value);
        this.#draft.secondTalent = talent ?? null;
        this.#refreshNextEnabled();
      });
    }

    if (stepId === "agencyName") {
      this.element.querySelectorAll('[data-role="agency-word-select"]').forEach((select, index) => {
        select.addEventListener("change", () => {
          if (!select.value || !textInput) return;
          const words = textInput.value.split(" ");
          words[index] = select.value;
          textInput.value = words.join(" ").trim();
          textInput.dispatchEvent(new Event("input"));
        });
      });
    }
```

(`textInput` here refers to the same `const textInput = this.element.querySelector('[name="stepValue"]')` already declared at the top of `_onRender` in Task 3 — the Agency Name step's free-text field also uses `name="stepValue"`, so it's already picked up by that existing declaration.)

- [ ] **Step 4: Add the `#onRollAgencyName` static handler**

```js
  static #onRollAgencyName() {
    this.#draft.agencyName = rollAgencyName(this.#data.agencyNames, Math.random);
    this.render();
  }
```

- [ ] **Step 5: Create `templates/apps/trope-builder-steps/second-talent.hbs`**

```hbs
<div class="procedural-builder-step">
  <select data-role="talent-select">
    <option value="">{{localize "PROCEDURAL.TropeBuilder.ChooseOption"}}</option>
    {{#each secondTalentOptions as |opt|}}
      <option value="{{opt.name}}" {{#if opt.selected}}selected{{/if}}>{{opt.name}}</option>
    {{/each}}
  </select>
  {{#if draft.secondTalent}}
    <p class="procedural-builder-talent-description">{{draft.secondTalent.system.description}}</p>
  {{/if}}
</div>
```

- [ ] **Step 6: Create `templates/apps/trope-builder-steps/agency-name.hbs`**

```hbs
<div class="procedural-builder-step procedural-builder-agency-name">
  <div class="procedural-builder-row">
    <button type="button" data-action="rollAgencyName">{{localize "PROCEDURAL.TropeBuilder.Roll"}}</button>
    <select data-role="agency-word-select">
      <option value="">{{localize "PROCEDURAL.TropeBuilder.Word"}} 1</option>
      {{#each table1 as |word|}}<option value="{{word}}">{{word}}</option>{{/each}}
    </select>
    <select data-role="agency-word-select">
      <option value="">{{localize "PROCEDURAL.TropeBuilder.Word"}} 2</option>
      {{#each table2 as |word|}}<option value="{{word}}">{{word}}</option>{{/each}}
    </select>
    <select data-role="agency-word-select">
      <option value="">{{localize "PROCEDURAL.TropeBuilder.Word"}} 3</option>
      {{#each table3 as |word|}}<option value="{{word}}">{{word}}</option>{{/each}}
    </select>
  </div>
  <input type="text" name="stepValue" value="{{draft.agencyName}}" placeholder="{{localize 'PROCEDURAL.TropeBuilder.OrTypeYourOwn'}}">
</div>
```

- [ ] **Step 7: Add both steps to the shell template**

In `templates/apps/trope-builder.hbs`, add two lines to the body section:

```hbs
    {{#if show.rollChooseCreate}}{{> "systems/procedural/templates/apps/trope-builder-steps/roll-choose-create.hbs" rollChooseCreate}}{{/if}}
    {{#if show.secondTalent}}{{> "systems/procedural/templates/apps/trope-builder-steps/second-talent.hbs"}}{{/if}}
    {{#if show.agencyName}}{{> "systems/procedural/templates/apps/trope-builder-steps/agency-name.hbs"}}{{/if}}
```

- [ ] **Step 7b: Register both new step partials in `PARTS.form.templates`**

In `module/apps/trope-builder.mjs`:

```js
  static PARTS = {
    form: {
      template: "systems/procedural/templates/apps/trope-builder.hbs",
      templates: [
        "systems/procedural/templates/apps/trope-builder-steps/name.hbs",
        "systems/procedural/templates/apps/trope-builder-steps/trope.hbs",
        "systems/procedural/templates/apps/trope-builder-steps/skills.hbs",
        "systems/procedural/templates/apps/trope-builder-steps/roll-choose-create.hbs",
        "systems/procedural/templates/apps/trope-builder-steps/second-talent.hbs",
        "systems/procedural/templates/apps/trope-builder-steps/agency-name.hbs"
      ]
    }
  };
```

- [ ] **Step 8: Verify syntax**

```bash
node --check module/apps/trope-builder.mjs
```
Expected: no output.

- [ ] **Step 9: Run the full test suite as a regression check**

```bash
npm test
```
Expected: all tests pass (report the actual current count — this task adds no Node-testable code, so it should match whatever the suite already reported going into this task).

- [ ] **Step 10: Commit**

```bash
git add module/apps/trope-builder.mjs templates/apps/trope-builder-steps/second-talent.hbs templates/apps/trope-builder-steps/agency-name.hbs templates/apps/trope-builder.hbs
git commit -m "feat: add Second Talent and Agency Name steps"
```

---

### Task 7: Review step and Finish

**Files:**
- Modify: `module/apps/trope-builder.mjs`
- Create: `templates/apps/trope-builder-steps/review.hbs`
- Modify: `templates/apps/trope-builder.hbs`

**Interfaces:**
- Consumes: the complete `#draft` object built up by every prior step.
- Produces: `#onFinish`, which creates the actual `trope` Actor and its embedded `trope`/`talent` Items — the wizard's terminal action. Task 8's launcher doesn't call this directly; it's only reachable through the wizard's own UI.

- [ ] **Step 1: Register the `finish` action**

Add `finish` to `DEFAULT_OPTIONS.actions`:

```js
    actions: {
      goNext: TropeBuilderApplication.#onNext,
      goBack: TropeBuilderApplication.#onBack,
      goToStep: TropeBuilderApplication.#onGoToStep,
      rollTrope: TropeBuilderApplication.#onRollTrope,
      rollTable: TropeBuilderApplication.#onRollTable,
      rollAgencyName: TropeBuilderApplication.#onRollAgencyName,
      finish: TropeBuilderApplication.#onFinish
    }
```

- [ ] **Step 2: Add the Review step's context**

Add this block in `_prepareContext`, after the `"agencyName"` block added in Task 6 (before `return context;`):

```js
    if (stepId === "review") {
      context.finalStats = this.#draft.stats;
    }
```

- [ ] **Step 3: Add the `#onFinish` static handler**

```js
  static async #onFinish() {
    if (!this.#isStepValid("review")) return;
    const draft = this.#draft;

    const actor = await Actor.create({ name: draft.name, type: "trope" });

    await actor.update({
      "system.stats": draft.stats,
      "system.skills.tech.value": draft.skills.tech,
      "system.skills.lab.value": draft.skills.lab,
      "system.skills.investigation.value": draft.skills.investigation,
      "system.skills.violence.value": draft.skills.violence,
      "system.skills.reflexes.value": draft.skills.reflexes,
      "system.skills.coordination.value": draft.skills.coordination,
      "system.skills.cool.value": draft.skills.cool,
      "system.skills.intuition.value": draft.skills.intuition,
      "system.skills.deception.value": draft.skills.deception,
      "system.qualities": draft.quality,
      "system.quirks": draft.quirk,
      "system.bStory": draft.bStory,
      "system.hq": draft.hq,
      "system.agencyName": draft.agencyName,
      "system.rerunPoints": 1
    });

    await Item.createDocuments([
      { name: draft.trope.name, type: "trope", img: draft.trope.img, system: { ...draft.trope.system, statBlock: draft.stats } },
      { name: draft.secondTalent.name, type: "talent", img: draft.secondTalent.img, system: { ...draft.secondTalent.system } }
    ], { parent: actor });

    await this.close();
    actor.sheet.render(true);
  }
```

Note `system: { ...draft.trope.system, statBlock: draft.stats }` for the embedded Trope item — `draft.trope.system.statBlock` is always the ORIGINAL, un-Gifted stat block from the data file (see `#setTrope`/`#setGiftedStat` from Task 3, which recompute `draft.stats` fresh from `draft.trope.system.statBlock` every time rather than mutating it in place, specifically so switching the Gifted stat choice more than once never double-applies the +3). This line is what applies the final, possibly-Gifted-adjusted stats to the actual created Item — matching how `generateRandomTrope`'s embedded Trope item already reflects Gifted-adjusted stats.

- [ ] **Step 4: Create `templates/apps/trope-builder-steps/review.hbs`**

```hbs
<div class="procedural-builder-step procedural-builder-review">
  <dl>
    <dt>{{localize "PROCEDURAL.TropeBuilder.NamePrompt"}}</dt>
    <dd>{{draft.name}} <button type="button" data-action="goToStep" data-step="name">{{localize "PROCEDURAL.TropeBuilder.Edit"}}</button></dd>

    <dt>{{localize "TYPES.Item.trope"}}</dt>
    <dd>{{draft.trope.name}} ({{finalStats.mental}}/{{finalStats.physical}}/{{finalStats.social}}) <button type="button" data-action="goToStep" data-step="trope">{{localize "PROCEDURAL.TropeBuilder.Edit"}}</button></dd>

    <dt>{{localize "PROCEDURAL.Actor.Qualities"}}</dt>
    <dd>{{draft.quality}} <button type="button" data-action="goToStep" data-step="quality">{{localize "PROCEDURAL.TropeBuilder.Edit"}}</button></dd>

    <dt>{{localize "PROCEDURAL.Actor.Quirks"}}</dt>
    <dd>{{draft.quirk}} <button type="button" data-action="goToStep" data-step="quirk">{{localize "PROCEDURAL.TropeBuilder.Edit"}}</button></dd>

    <dt>{{localize "PROCEDURAL.Actor.BStory"}}</dt>
    <dd>{{draft.bStory}} <button type="button" data-action="goToStep" data-step="bstory">{{localize "PROCEDURAL.TropeBuilder.Edit"}}</button></dd>

    <dt>{{localize "TYPES.Item.talent"}} (2nd)</dt>
    <dd>{{draft.secondTalent.name}} <button type="button" data-action="goToStep" data-step="secondTalent">{{localize "PROCEDURAL.TropeBuilder.Edit"}}</button></dd>

    <dt>{{localize "PROCEDURAL.Actor.HQ"}}</dt>
    <dd>{{draft.hq}} <button type="button" data-action="goToStep" data-step="hq">{{localize "PROCEDURAL.TropeBuilder.Edit"}}</button></dd>

    <dt>{{localize "PROCEDURAL.Actor.AgencyName"}}</dt>
    <dd>{{draft.agencyName}} <button type="button" data-action="goToStep" data-step="agencyName">{{localize "PROCEDURAL.TropeBuilder.Edit"}}</button></dd>
  </dl>
</div>
```

- [ ] **Step 5: Add the Review step to the shell template, and branch the footer between Next and Finish**

Replace the full contents of `templates/apps/trope-builder.hbs` with:

```hbs
<form class="procedural-sheet procedural-trope-builder">
  <header class="procedural-builder-header">
    <span>{{localize "PROCEDURAL.TropeBuilder.StepIndicator"}} {{stepNumber}} / {{stepCount}}</span>
  </header>

  <section class="procedural-builder-body">
    {{#if show.name}}{{> "systems/procedural/templates/apps/trope-builder-steps/name.hbs"}}{{/if}}
    {{#if show.trope}}{{> "systems/procedural/templates/apps/trope-builder-steps/trope.hbs"}}{{/if}}
    {{#if show.skills}}{{> "systems/procedural/templates/apps/trope-builder-steps/skills.hbs"}}{{/if}}
    {{#if show.rollChooseCreate}}{{> "systems/procedural/templates/apps/trope-builder-steps/roll-choose-create.hbs" rollChooseCreate}}{{/if}}
    {{#if show.secondTalent}}{{> "systems/procedural/templates/apps/trope-builder-steps/second-talent.hbs"}}{{/if}}
    {{#if show.agencyName}}{{> "systems/procedural/templates/apps/trope-builder-steps/agency-name.hbs"}}{{/if}}
    {{#if show.review}}{{> "systems/procedural/templates/apps/trope-builder-steps/review.hbs"}}{{/if}}
  </section>

  <footer class="procedural-builder-footer">
    {{#unless isFirstStep}}
      <button type="button" data-action="goBack">{{localize "PROCEDURAL.TropeBuilder.Back"}}</button>
    {{/unless}}
    {{#if show.review}}
      <button type="button" data-action="finish" {{#unless canAdvance}}disabled{{/unless}}>{{localize "PROCEDURAL.TropeBuilder.Finish"}}</button>
    {{else}}
      <button type="button" data-action="goNext" {{#unless canAdvance}}disabled{{/unless}}>{{localize "PROCEDURAL.TropeBuilder.Next"}}</button>
    {{/if}}
  </footer>
</form>
```

- [ ] **Step 5b: Register the Review step partial in `PARTS.form.templates`**

In `module/apps/trope-builder.mjs`, add the final path to the array (this completes the full set — every step partial the wizard uses is now listed):

```js
  static PARTS = {
    form: {
      template: "systems/procedural/templates/apps/trope-builder.hbs",
      templates: [
        "systems/procedural/templates/apps/trope-builder-steps/name.hbs",
        "systems/procedural/templates/apps/trope-builder-steps/trope.hbs",
        "systems/procedural/templates/apps/trope-builder-steps/skills.hbs",
        "systems/procedural/templates/apps/trope-builder-steps/roll-choose-create.hbs",
        "systems/procedural/templates/apps/trope-builder-steps/second-talent.hbs",
        "systems/procedural/templates/apps/trope-builder-steps/agency-name.hbs",
        "systems/procedural/templates/apps/trope-builder-steps/review.hbs"
      ]
    }
  };
```

- [ ] **Step 6: Verify syntax**

```bash
node --check module/apps/trope-builder.mjs
```
Expected: no output.

- [ ] **Step 7: Run the full test suite as a regression check**

```bash
npm test
```
Expected: all tests pass (report the actual current count — this task adds no Node-testable code, so it should match whatever the suite already reported going into this task).

- [ ] **Step 8: Commit**

```bash
git add module/apps/trope-builder.mjs templates/apps/trope-builder-steps/review.hbs templates/apps/trope-builder.hbs
git commit -m "feat: add Review step and wizard Finish (creates the Trope actor)"
```

---

### Task 8: Actors-directory launcher

**Files:**
- Modify: `module/procedural.mjs`

**Interfaces:**
- Consumes: `TropeBuilderApplication` (Task 3-7).
- Produces: a visible button in the Actors sidebar directory that opens the wizard.

This task's Foundry-API question — how to add a button to the Actors sidebar directory — has already been resolved by reading the local Foundry v14 install directly (see "Before you start" at the top of this plan), not guessed. The findings are folded into the code below with citations to the exact source files, so no further research is needed before writing this file. If you want to double-check independently, `client/applications/sidebar/document-directory.mjs` and `templates/sidebar/directory/header.hbs` under `/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app/` are the two files that answered this.

- [ ] **Step 1: Read the current `module/procedural.mjs`**

```js
import TropeActorData from "./data/actor-trope.mjs";
import NpcActorData from "./data/actor-npc.mjs";
import TropeItemData from "./data/item-trope.mjs";
import TalentItemData from "./data/item-talent.mjs";
import EquipmentItemData from "./data/item-equipment.mjs";
import ProceduralActor from "./documents/actor.mjs";
import { registerChatListeners } from "./helpers/chat-listeners.mjs";
import { seedCompendiums } from "./helpers/seed-compendiums.mjs";
import ProceduralTropeActorSheet from "./sheets/actor-trope-sheet.mjs";
import ProceduralNpcActorSheet from "./sheets/actor-npc-sheet.mjs";
import {
  ProceduralTropeItemSheet,
  ProceduralTalentItemSheet,
  ProceduralEquipmentItemSheet
} from "./sheets/item-sheet.mjs";

Hooks.once("init", () => {
  CONFIG.Actor.dataModels.trope = TropeActorData;
  CONFIG.Actor.dataModels.npc = NpcActorData;
  CONFIG.Item.dataModels.trope = TropeItemData;
  CONFIG.Item.dataModels.talent = TalentItemData;
  CONFIG.Item.dataModels.equipment = EquipmentItemData;

  CONFIG.Actor.documentClass = ProceduralActor;

  registerChatListeners();

  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("procedural", ProceduralTropeActorSheet, {
    types: ["trope"],
    makeDefault: true,
    label: "PROCEDURAL.SheetTrope"
  });
  Actors.registerSheet("procedural", ProceduralNpcActorSheet, {
    types: ["npc"],
    makeDefault: true,
    label: "PROCEDURAL.SheetNpc"
  });

  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("procedural", ProceduralTropeItemSheet, { types: ["trope"], makeDefault: true });
  Items.registerSheet("procedural", ProceduralTalentItemSheet, { types: ["talent"], makeDefault: true });
  Items.registerSheet("procedural", ProceduralEquipmentItemSheet, { types: ["equipment"], makeDefault: true });
});

Hooks.once("ready", () => {
  seedCompendiums().catch(err => console.error("PROCEDURAL | Compendium seeding failed", err));
});
```

- [ ] **Step 2: Add the import and the directory-button hook**

Add this import near the top, alongside the other imports:

```js
import TropeBuilderApplication from "./apps/trope-builder.mjs";
```

Add this hook registration at the end of the file, after the existing `Hooks.once("ready", ...)` block. This is now written against confirmed v14 source (read directly from the local Foundry install's `client/applications/sidebar/document-directory.mjs` and `templates/sidebar/directory/header.hbs`), not a guess:

- `ActorDirectory` extends `DocumentDirectory`, an `ApplicationV2`. Its "render" lifecycle hook fires as `Hooks.callAll("render" + className, app, element, context, options)` for every class in its inheritance chain — confirmed in `client/applications/api/application.mjs`'s `_doEvent`/`#callHooks` (`hookArgs: [this.#element, ...handlerArgs]` where `handlerArgs = [context, options]`) — so `renderActorDirectory` fires with **`(app, element, context, options)`**, where `element` is always a raw `HTMLElement` (ApplicationV2 never uses jQuery — that was a V1-only convention), never wrapped.
- The header markup (`templates/sidebar/directory/header.hbs`) is exactly `<header class="directory-header flexcol"><div class="header-actions action-buttons flexrow">...</div>...</header>` — confirming the selector `.directory-header .header-actions` is correct.

```js
Hooks.on("renderActorDirectory", (app, element) => {
  const header = element.querySelector(".directory-header .header-actions");
  if (!header || header.querySelector(".procedural-trope-builder-launch")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("procedural-trope-builder-launch");
  button.innerHTML = `<i class="fa-solid fa-dice-d20"></i> ${game.i18n.localize("PROCEDURAL.TropeBuilder.Launch")}`;
  button.addEventListener("click", () => new TropeBuilderApplication().render(true));
  header.appendChild(button);
});
```

The `header.querySelector(".procedural-trope-builder-launch")` guard prevents adding a duplicate button on every directory re-render (this hook fires on every render of the Actor Directory tab, not just once).

- [ ] **Step 3: Add a launcher-button style**

Append to `css/procedural.css`:

```css
.procedural-trope-builder-launch {
  width: 100%;
  margin-top: 0.25rem;
}
```

- [ ] **Step 4: Verify syntax**

```bash
node --check module/procedural.mjs
```
Expected: no output.

- [ ] **Step 5: Run the full test suite as a final regression check**

```bash
npm test
```
Expected: all tests pass (report the actual current count — this task adds no Node-testable code, so it should match whatever the suite already reported going into this task).

- [ ] **Step 6: Commit**

```bash
git add module/procedural.mjs css/procedural.css
git commit -m "feat: add a directory launcher button for the Trope builder wizard"
```

---

### Task 9: Manual verification

**Files:** none (verification only, using a running Foundry v14 client — same setup as the existing smoke-test checklists in `docs/superpowers/plans/2026-08-05-procedural-system-v1.md` Task 15 and `docs/superpowers/plans/2026-08-06-random-trope-generator.md` Task 6).

This cannot be automated or verified by a subagent — note it as a follow-up for the human.

- [ ] **Step 1: Run the full automated suite one more time**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 2: Confirm the launcher button appears**

Open the Actors sidebar tab. Confirm a "Build Trope Character" button appears in the directory header (alongside the existing "Create Actor" control), and doesn't duplicate itself if you switch tabs and back.

- [ ] **Step 3: Walk the wizard straight through**

Click the launcher. Confirm: the Name step's Next stays disabled until you type something; the Trope step lets you Roll and also pick directly from the dropdown, and shows a live stat-block preview; if a Gifted Trope (Rookie) comes up, confirm the stat-picker appears and Next stays disabled until you pick one, and the previewed stats actually reflect the +3. On the Skills step, confirm the "points remaining" counters update live as you type, Next is disabled while any stat still has unspent points or a Tech/Lab-cap violation, and becomes enabled the instant the allocation is fully valid (test both a Trope with no `statNotes` and one with an "at least N in Tech/Lab" minimum, e.g. Coroner). Confirm Quality/Quirk/B-story/HQ each let you Roll, pick from the dropdown (which fills the text box), or type freely, with Next disabled on an empty value. Confirm Second Talent is choose-only (no Roll button) and shows the selected Talent's description. Confirm Agency Name's three word-dropdowns each fill in their word of the free-text field without clobbering the others, and Roll fills all three at once.

- [ ] **Step 4: Confirm reroll-anything-except-Rerun-Points**

On at least one roll-based step (e.g. Trope), click Roll multiple times in a row and confirm each click replaces the previous result with no accumulation or stale state. Then use Back to return to an earlier step (e.g. from Quirk back to Trope), change your answer (reroll or pick a different Trope), and confirm Next carries the new answer forward correctly — including that the Skills step's divestment resets and must be redone if you changed Trope or the Gifted stat pick.

- [ ] **Step 5: Confirm the Review step and Finish**

On the Review step, confirm every field shows the value you actually chose, and each "Edit" button jumps back to the right step (and Next from there returns you correctly toward Review again). Click Finish and confirm: a new Trope actor is created with your chosen name; its sheet opens automatically; `system.stats`, all nine skills, Qualities, Quirks, B-Story, HQ, Agency Name, and Rerun Points (1) all match what you entered; exactly one Trope item and one Talent item are embedded, and the Trope item's stat block reflects the Gifted bonus if applicable.

- [ ] **Step 6: Confirm it doesn't collide with Randomize**

On the newly-built actor's sheet, confirm the existing "Randomize" button still works normally (full auto-generation, overwrite-confirm dialog, etc.) — the wizard and Randomize should coexist without interfering with each other's code paths.

- [ ] **Step 7: Final commit (if any fixes were needed during manual verification)**

```bash
git add -A
git commit -m "fix: address issues found during Trope builder wizard manual verification"
```
