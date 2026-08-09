# NPC Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 3-step wizard (Personality → Trope → Review), launched from the Actor Directory, that rolls/chooses an NPC ally's personality and Trope-derived Talent and creates a finished `npc` Actor on Finish — the same interaction pattern as the existing Trope Builder wizard, scaled down to match `NpcActorData`'s much smaller shape (no stats, no skill allocation, no B-story/HQ/desk item).

**Architecture:** `NpcBuilderApplication` (`module/apps/npc-builder.mjs`) is a `HandlebarsApplicationMixin(ApplicationV2)` class following `TropeBuilderApplication`'s exact shape: an in-memory draft object, a step-index/`STEP_IDS` array, Back/Next/goToStep navigation, and nothing touching the database until Finish. The Personality step reuses the Trope Builder's existing generic `roll-choose-create.hbs` partial (Roll/dropdown/free-text) unchanged; the Trope step gets its own new, simplified partial (no stat block, no Gifted-stat radio — NPCs never touch stats). Two new pure helpers, `rollNpcPersonality` and `parseNpcName`, are added to `module/helpers/character-generator.mjs` alongside the existing pure roll functions.

**Tech Stack:** Foundry VTT v14 (`ApplicationV2`, `HandlebarsApplicationMixin`), vanilla JS ES modules, Handlebars (`{{#each}}`, `{{#if}}`/`{{#unless}}`, `{{localize}}` — all already proven in this codebase), plain CSS, Node's built-in test runner for the pure logic.

## Global Constraints

- Target Foundry VTT v14 (same as the rest of this system).
- No new npm dependencies.
- Preserve the pure-logic-vs-Foundry-glue split: `rollNpcPersonality`/`parseNpcName` are pure, dependency-free, unit-tested functions in `module/helpers/character-generator.mjs`; `NpcBuilderApplication` itself has no automated coverage (this codebase has no Foundry-runtime test harness) and is verified by hand in the Manual Smoke Test at the end of this plan.
- All existing tests must keep passing unmodified.
- Do **not** use any Handlebars helper not already proven in this codebase (`{{eq}}`, `{{or}}`, `{{selectOptions}}`, etc. are all unsafe/unproven) — precompute booleans/selected-flags in JS context instead, exactly like `trope-builder.mjs` already does.
- Reuse `PROCEDURAL.TropeBuilder.*` localization keys (`StepIndicator`, `Back`, `Next`, `Finish`, `Edit`, `Roll`, `ChooseOption`, `OrTypeYourOwn`) for generic wizard chrome text rather than duplicating them under a new namespace — they aren't Trope-specific.
- Per this repo's standing convention, bump `version` in `system.json`, `package.json`, and `package-lock.json` together in the final task. This PR adds one feature (the NPC generator), so it bumps the **minor** version: 0.10.0 → **0.11.0**.
- Full spec: `docs/superpowers/specs/2026-08-09-npc-generator-design.md`.

---

### Task 1: `rollNpcPersonality` and `parseNpcName` pure helpers

**Files:**
- Modify: `module/helpers/character-generator.mjs`
- Modify: `module/helpers/character-generator.test.mjs`

**Interfaces:**
- Consumes: the existing private `roll1d6(rng)` already defined in `character-generator.mjs` (no changes to it).
- Produces: `rollNpcPersonality(personalities: string[], rng: () => number): string` and `parseNpcName(personality: string): string`. Both consumed by Task 2/3's `NpcBuilderApplication`.

- [ ] **Step 1: Write the failing tests**

Append to `module/helpers/character-generator.test.mjs` (keep every existing test). First, update the import line:

```js
import { rollTrope, applyGifted, divestSkills, rollQualityOrQuirk, rollBStoryOrHq, rollAgencyName, pickRandom, generateTrope, validateSkillAllocation } from "./character-generator.mjs";
```

to:

```js
import { rollTrope, applyGifted, divestSkills, rollQualityOrQuirk, rollBStoryOrHq, rollAgencyName, pickRandom, generateTrope, validateSkillAllocation, rollNpcPersonality, parseNpcName } from "./character-generator.mjs";
```

Then append these tests at the end of the file:

```js
const NPC_PERSONALITIES_FIXTURE = [
  "Elias Cope, 30. Hot-headed and impulsive, Elias has a jump-first, measure later attitude.",
  "Jennifer Thompson, 40. Measured and cautious, Jennifer is nursing an old knee injury which slows her down.",
  "Dave Hunt, 45. Cold and detached, Dave has an obsessive drive when it comes to working cases.",
  "Willow McClachlan, 25. Bright-eyed and eager, but naive.",
  "Ron Briar, 32. The class clown, but out of his depth in a fight.",
  "Cindy Huntsman, 30. Methodical and very by-the-book."
];

test("rollNpcPersonality picks the entry at 1d6 roll 1 (low boundary)", () => {
  const rng = queue([1]);
  assert.equal(rollNpcPersonality(NPC_PERSONALITIES_FIXTURE, rng), NPC_PERSONALITIES_FIXTURE[0]);
});

test("rollNpcPersonality picks the entry at 1d6 roll 6 (high boundary)", () => {
  const rng = queue([6]);
  assert.equal(rollNpcPersonality(NPC_PERSONALITIES_FIXTURE, rng), NPC_PERSONALITIES_FIXTURE[5]);
});

test("rollNpcPersonality picks the entry at a middle roll", () => {
  const rng = queue([3]);
  assert.equal(rollNpcPersonality(NPC_PERSONALITIES_FIXTURE, rng), NPC_PERSONALITIES_FIXTURE[2]);
});

test("parseNpcName takes the text before the first comma and trims it", () => {
  assert.equal(parseNpcName("Elias Cope, 30. Hot-headed and impulsive..."), "Elias Cope");
});

test("parseNpcName trims surrounding whitespace around the name", () => {
  assert.equal(parseNpcName("  Jennifer Thompson  , 40. Measured..."), "Jennifer Thompson");
});

test("parseNpcName falls back to the full trimmed string when there's no comma", () => {
  assert.equal(parseNpcName("  A freely typed personality with no comma  "), "A freely typed personality with no comma");
});
```

`queue([1])`/`queue([6])`/`queue([3])` reuse the same `queue()` helper already defined at the top of this test file for `rollTrope`'s tests — it turns a 1-6 roll into the fractional `rng()` value that makes `roll1d6` produce exactly that roll.

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
node --test module/helpers/character-generator.test.mjs
```

Expected: the pre-existing tests PASS, the 6 new tests FAIL (`rollNpcPersonality`/`parseNpcName` are not exported / undefined).

- [ ] **Step 3: Add both functions to `module/helpers/character-generator.mjs`**

Add these two functions after `rollAgencyName` (before `pickRandom`):

```js
/**
 * NPC ally personality table: a flat 1d6 roll (data/npc-personalities.json),
 * unlike the qualities/quirks/bstory/hq tables' odds/evens split.
 */
export function rollNpcPersonality(personalities, rng) {
  return personalities[roll1d6(rng) - 1];
}

/**
 * Parses the name out of a personality string, e.g.
 * "Elias Cope, 30. Hot-headed..." -> "Elias Cope". Falls back to the full
 * trimmed string if there's no comma (free-typed personality text).
 */
export function parseNpcName(personality) {
  const [name] = personality.split(",");
  return name.trim();
}
```

- [ ] **Step 4: Run tests to verify everything passes**

```bash
node --test module/helpers/character-generator.test.mjs
```

Expected: all tests pass, including the 6 new ones.

- [ ] **Step 5: Run the full suite as a regression check**

```bash
npm test
```

Expected: all tests across both `.test.mjs` files pass.

- [ ] **Step 6: Commit**

```bash
git add module/helpers/character-generator.mjs module/helpers/character-generator.test.mjs
git commit -m "feat: add rollNpcPersonality and parseNpcName helpers"
```

---

### Task 2: NPC Builder wizard shell, Personality step, Trope step

**Files:**
- Create: `module/apps/npc-builder.mjs`
- Create: `templates/apps/npc-builder.hbs`
- Create: `templates/apps/npc-builder-steps/trope.hbs`
- Modify: `lang/en.json`

**Interfaces:**
- Consumes: `loadGeneratorData` (`module/helpers/generator-data.mjs`, already registers `npcPersonalities`/`tropes`), `rollTrope` and `rollNpcPersonality` (Task 1), the existing shared partial `templates/apps/trope-builder-steps/roll-choose-create.hbs` (unmodified).
- Produces: `export default class NpcBuilderApplication extends HandlebarsApplicationMixin(ApplicationV2)`. Task 3 adds the Review step and Finish to this same file. Task 4's directory launcher does `new NpcBuilderApplication().render(true)`.

- [ ] **Step 1: Create `module/apps/npc-builder.mjs`**

```js
const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ApplicationV2 } = foundry.applications.api;

import { loadGeneratorData } from "../helpers/generator-data.mjs";
import { rollTrope, rollNpcPersonality } from "../helpers/character-generator.mjs";

const STEP_IDS = ["personality", "trope", "review"];

export default class NpcBuilderApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "procedural-npc-builder",
    classes: ["procedural", "npc-builder"],
    position: { width: 480, height: 520 },
    window: { title: "PROCEDURAL.NpcBuilder.Title", resizable: true },
    actions: {
      goNext: NpcBuilderApplication.#onNext,
      goBack: NpcBuilderApplication.#onBack,
      goToStep: NpcBuilderApplication.#onGoToStep,
      rollTable: NpcBuilderApplication.#onRollTable,
      rollTrope: NpcBuilderApplication.#onRollTrope
    }
  };

  static PARTS = {
    form: {
      template: "systems/procedural/templates/apps/npc-builder.hbs",
      templates: [
        "systems/procedural/templates/apps/trope-builder-steps/roll-choose-create.hbs",
        "systems/procedural/templates/apps/npc-builder-steps/trope.hbs"
      ]
    }
  };

  #stepIndex = 0;
  #data = null;
  #draft = {
    personality: "",
    trope: null
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
      personality: stepId === "personality",
      trope: stepId === "trope",
      review: stepId === "review"
    };

    if (stepId === "personality") {
      context.rollChooseCreate = {
        label: game.i18n.localize("PROCEDURAL.Actor.Personality"),
        options: this.#data.npcPersonalities,
        value: this.#draft.personality
      };
    }

    if (stepId === "trope") {
      context.tropeOptions = this.#data.tropes.map(t => ({
        name: t.name,
        selected: t.name === (this.#draft.trope?.name ?? "")
      }));
    }

    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const stepId = this.#stepId;

    const textInput = this.element.querySelector('[name="stepValue"]');
    if (textInput) {
      textInput.addEventListener("input", () => {
        this.#draft.personality = textInput.value;
        this.#refreshNextEnabled();
      });
    }

    const fillSelect = this.element.querySelector('[data-fills-value]');
    if (fillSelect && textInput) {
      fillSelect.addEventListener("change", () => {
        if (!fillSelect.value) return;
        textInput.value = fillSelect.value;
        textInput.dispatchEvent(new Event("input"));
      });
    }

    if (stepId === "trope") {
      const tropeSelect = this.element.querySelector('[data-role="trope-select"]');
      tropeSelect?.addEventListener("change", () => {
        const trope = this.#data.tropes.find(t => t.name === tropeSelect.value);
        this.#draft.trope = trope ?? null;
        this.render();
      });
    }
  }

  #refreshNextEnabled(forcedValue) {
    const enabled = forcedValue ?? this.#isStepValid(this.#stepId);
    const nextBtn = this.element.querySelector('[data-action="goNext"], [data-action="finish"]');
    if (nextBtn) nextBtn.disabled = !enabled;
  }

  #isStepValid(stepId) {
    switch (stepId) {
      case "personality": return this.#draft.personality.trim().length > 0;
      case "trope": return this.#draft.trope !== null;
      case "review": return false; // Task 3 replaces this
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

  static #onRollTable() {
    this.#draft.personality = rollNpcPersonality(this.#data.npcPersonalities, Math.random);
    this.render();
  }

  static #onRollTrope() {
    this.#draft.trope = rollTrope(this.#data.tropes, Math.random);
    this.render();
  }
}
```

The `case "review": return false; // Task 3 replaces this` line is a deliberate, tracked hand-off (not a vague placeholder) — it keeps the wizard from advancing into the not-yet-built Review step until Task 3 adds it, exactly like `TropeBuilderApplication`'s original `"skills"` placeholder did for that wizard.

- [ ] **Step 2: Create `templates/apps/npc-builder.hbs`**

```hbs
<form class="procedural-sheet procedural-npc-builder">
  <header class="procedural-builder-header">
    <span>{{localize "PROCEDURAL.TropeBuilder.StepIndicator"}} {{stepNumber}} / {{stepCount}}</span>
  </header>

  <section class="procedural-builder-body">
    {{#if show.personality}}{{> "systems/procedural/templates/apps/trope-builder-steps/roll-choose-create.hbs" rollChooseCreate}}{{/if}}
    {{#if show.trope}}{{> "systems/procedural/templates/apps/npc-builder-steps/trope.hbs"}}{{/if}}
  </section>

  <footer class="procedural-builder-footer">
    {{#unless isFirstStep}}
      <button type="button" data-action="goBack">{{localize "PROCEDURAL.TropeBuilder.Back"}}</button>
    {{/unless}}
    <button type="button" data-action="goNext" {{#unless canAdvance}}disabled{{/unless}}>{{localize "PROCEDURAL.TropeBuilder.Next"}}</button>
  </footer>
</form>
```

Task 3 adds a Review body line and replaces the unconditional Next button with a Next-or-Finish branch — noted explicitly in Task 3's own steps.

- [ ] **Step 3: Create `templates/apps/npc-builder-steps/trope.hbs`**

Simplified from `templates/apps/trope-builder-steps/trope.hbs`: no stat block, no Gifted-stat radio (NPCs never touch stats).

```hbs
<div class="procedural-builder-step procedural-builder-npc-trope-step">
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
    </div>
  {{/if}}
</div>
```

- [ ] **Step 4: Add the `NpcBuilder` localization section**

In `lang/en.json`, inside the top-level `"PROCEDURAL"` object, add a new `NpcBuilder` object as a sibling of `TropeBuilder` (after it):

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
      "Word": "Word",
      "Skills": "Skills"
    },
    "NpcBuilder": {
      "Title": "Build an NPC Ally"
    },
```

- [ ] **Step 5: Verify syntax**

```bash
node --check module/apps/npc-builder.mjs
node -e "JSON.parse(require('fs').readFileSync('lang/en.json', 'utf8')); console.log('OK')"
```

Expected: no output from `--check`, `OK` from the JSON check.

- [ ] **Step 6: Run the full test suite as a regression check**

```bash
npm test
```

Expected: all tests pass (this task adds no Node-testable code).

- [ ] **Step 7: Commit**

```bash
git add module/apps/npc-builder.mjs templates/apps/npc-builder.hbs templates/apps/npc-builder-steps/trope.hbs lang/en.json
git commit -m "feat: add NPC builder wizard shell with Personality and Trope steps"
```

---

### Task 3: Review step and Finish

**Files:**
- Modify: `module/apps/npc-builder.mjs`
- Modify: `templates/apps/npc-builder.hbs`
- Create: `templates/apps/npc-builder-steps/review.hbs`
- Modify: `lang/en.json`

**Interfaces:**
- Consumes: `parseNpcName` (Task 1), `this.#draft` (Task 2).
- Produces: nothing new consumed by later tasks — the wizard is fully functional (creates a real Actor) after this task, before the directory launcher exists.

- [ ] **Step 1: Import `parseNpcName`**

In `module/apps/npc-builder.mjs`, change:

```js
import { rollTrope, rollNpcPersonality } from "../helpers/character-generator.mjs";
```

to:

```js
import { rollTrope, rollNpcPersonality, parseNpcName } from "../helpers/character-generator.mjs";
```

- [ ] **Step 2: Register the `finish` action**

Change:

```js
    actions: {
      goNext: NpcBuilderApplication.#onNext,
      goBack: NpcBuilderApplication.#onBack,
      goToStep: NpcBuilderApplication.#onGoToStep,
      rollTable: NpcBuilderApplication.#onRollTable,
      rollTrope: NpcBuilderApplication.#onRollTrope
    }
```

to:

```js
    actions: {
      goNext: NpcBuilderApplication.#onNext,
      goBack: NpcBuilderApplication.#onBack,
      goToStep: NpcBuilderApplication.#onGoToStep,
      rollTable: NpcBuilderApplication.#onRollTable,
      rollTrope: NpcBuilderApplication.#onRollTrope,
      finish: NpcBuilderApplication.#onFinish
    }
```

- [ ] **Step 3: Register the new step partial**

Change:

```js
  static PARTS = {
    form: {
      template: "systems/procedural/templates/apps/npc-builder.hbs",
      templates: [
        "systems/procedural/templates/apps/trope-builder-steps/roll-choose-create.hbs",
        "systems/procedural/templates/apps/npc-builder-steps/trope.hbs"
      ]
    }
  };
```

to:

```js
  static PARTS = {
    form: {
      template: "systems/procedural/templates/apps/npc-builder.hbs",
      templates: [
        "systems/procedural/templates/apps/trope-builder-steps/roll-choose-create.hbs",
        "systems/procedural/templates/apps/npc-builder-steps/trope.hbs",
        "systems/procedural/templates/apps/npc-builder-steps/review.hbs"
      ]
    }
  };
```

- [ ] **Step 4: Add the `#finishing` re-entrancy guard field**

Change:

```js
  #stepIndex = 0;
  #data = null;
  #draft = {
    personality: "",
    trope: null
  };
```

to:

```js
  #stepIndex = 0;
  #data = null;
  #draft = {
    personality: "",
    trope: null
  };
  #finishing = false;
```

- [ ] **Step 5: Add Review-step context**

Add this block in `_prepareContext`, right after the existing `if (stepId === "trope") { ... }` block (before `return context;`):

```js
    if (stepId === "review") {
      context.name = parseNpcName(this.#draft.personality);
    }
```

- [ ] **Step 6: Replace the `"review"` placeholder in `#isStepValid`**

Change:

```js
      case "review": return false; // Task 3 replaces this
```

to:

```js
      case "review": return true;
```

- [ ] **Step 7: Add the `#onFinish` handler**

Add this method at the end of the class body, after `#onRollTrope`:

```js
  static async #onFinish() {
    if (!this.#isStepValid("review")) return;
    if (this.#finishing) return;
    this.#finishing = true;

    try {
      const draft = this.#draft;
      const name = parseNpcName(draft.personality);
      const actor = await Actor.create({ name, type: "npc" });

      await actor.update({ "system.personality": draft.personality });

      await Item.createDocuments([
        { name: draft.trope.name, type: "trope", img: draft.trope.img, system: { ...draft.trope.system } },
        {
          name: draft.trope.system.talentName,
          type: "talent",
          img: draft.trope.img,
          system: {
            description: draft.trope.system.talentDescription,
            usesPerAct: draft.trope.system.talentUsesPerAct
          }
        }
      ], { parent: actor });

      await this.close();
      actor.sheet.render(true);
    } catch (err) {
      console.error("PROCEDURAL | Failed to finish the NPC builder wizard", err);
      ui.notifications?.error("PROCEDURAL! failed to create your NPC. Check the console for details.");
      this.#finishing = false;
    }
  }
```

Skills are left untouched — `NpcActorData.skills` already defaults every skill to `1` (`buildSkillsSchema(1)`), correct per the rulebook's flat "+1 in every skill" rule for NPC allies.

- [ ] **Step 8: Add the Review step to the shell template and branch the footer**

In `templates/apps/npc-builder.hbs`, change:

```hbs
  <section class="procedural-builder-body">
    {{#if show.personality}}{{> "systems/procedural/templates/apps/trope-builder-steps/roll-choose-create.hbs" rollChooseCreate}}{{/if}}
    {{#if show.trope}}{{> "systems/procedural/templates/apps/npc-builder-steps/trope.hbs"}}{{/if}}
  </section>

  <footer class="procedural-builder-footer">
    {{#unless isFirstStep}}
      <button type="button" data-action="goBack">{{localize "PROCEDURAL.TropeBuilder.Back"}}</button>
    {{/unless}}
    <button type="button" data-action="goNext" {{#unless canAdvance}}disabled{{/unless}}>{{localize "PROCEDURAL.TropeBuilder.Next"}}</button>
  </footer>
```

to:

```hbs
  <section class="procedural-builder-body">
    {{#if show.personality}}{{> "systems/procedural/templates/apps/trope-builder-steps/roll-choose-create.hbs" rollChooseCreate}}{{/if}}
    {{#if show.trope}}{{> "systems/procedural/templates/apps/npc-builder-steps/trope.hbs"}}{{/if}}
    {{#if show.review}}{{> "systems/procedural/templates/apps/npc-builder-steps/review.hbs"}}{{/if}}
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
```

- [ ] **Step 9: Create `templates/apps/npc-builder-steps/review.hbs`**

```hbs
<div class="procedural-builder-step procedural-builder-review">
  <dl>
    <dt>{{localize "PROCEDURAL.NpcBuilder.Name"}}</dt>
    <dd>{{name}}</dd>

    <dt>{{localize "PROCEDURAL.Actor.Personality"}}</dt>
    <dd>
      {{draft.personality}}
      <button type="button" data-action="goToStep" data-step="personality">{{localize "PROCEDURAL.TropeBuilder.Edit"}}</button>
    </dd>

    <dt>{{localize "TYPES.Item.trope"}}</dt>
    <dd>
      {{draft.trope.name}} ({{draft.trope.system.talentName}})
      <button type="button" data-action="goToStep" data-step="trope">{{localize "PROCEDURAL.TropeBuilder.Edit"}}</button>
    </dd>
  </dl>
</div>
```

- [ ] **Step 10: Add the `Name` localization key**

In `lang/en.json`, change:

```json
    "NpcBuilder": {
      "Title": "Build an NPC Ally"
    },
```

to:

```json
    "NpcBuilder": {
      "Title": "Build an NPC Ally",
      "Name": "Name"
    },
```

- [ ] **Step 11: Verify syntax**

```bash
node --check module/apps/npc-builder.mjs
node -e "JSON.parse(require('fs').readFileSync('lang/en.json', 'utf8')); console.log('OK')"
```

Expected: no output from `--check`, `OK` from the JSON check.

- [ ] **Step 12: Run the full test suite as a regression check**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 13: Commit**

```bash
git add module/apps/npc-builder.mjs templates/apps/npc-builder.hbs templates/apps/npc-builder-steps/review.hbs lang/en.json
git commit -m "feat: add Review step and NPC builder wizard Finish"
```

---

### Task 4: Actor Directory launcher button

**Files:**
- Modify: `module/procedural.mjs`
- Modify: `css/procedural.css`
- Modify: `lang/en.json`

**Interfaces:**
- Consumes: `NpcBuilderApplication` (Task 2/3).
- Produces: nothing consumed by later tasks — this is the last piece needed to use the wizard end-to-end from the UI.

- [ ] **Step 1: Import `NpcBuilderApplication`**

In `module/procedural.mjs`, change:

```js
import TropeBuilderApplication from "./apps/trope-builder.mjs";
```

to:

```js
import TropeBuilderApplication from "./apps/trope-builder.mjs";
import NpcBuilderApplication from "./apps/npc-builder.mjs";
```

- [ ] **Step 2: Add the second directory button**

In `module/procedural.mjs`, change:

```js
Hooks.on("renderActorDirectory", (app, element) => {
  if (!Actor.canUserCreate(game.user)) return;
  const header = element.querySelector(".directory-header .header-actions");
  if (!header || header.querySelector(".procedural-trope-builder-launch")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("procedural-trope-builder-launch");
  button.innerHTML = `<i class="fa-solid fa-dice-d20"></i> ${game.i18n.localize("PROCEDURAL.TropeBuilder.Launch")}`;
  button.addEventListener("click", () => {
    const existing = foundry.applications.instances.get("procedural-trope-builder");
    if (existing) {
      existing.bringToFront();
      return;
    }
    new TropeBuilderApplication().render(true);
  });
  header.appendChild(button);
});
```

to:

```js
Hooks.on("renderActorDirectory", (app, element) => {
  if (!Actor.canUserCreate(game.user)) return;
  const header = element.querySelector(".directory-header .header-actions");
  if (!header || header.querySelector(".procedural-trope-builder-launch")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("procedural-trope-builder-launch");
  button.innerHTML = `<i class="fa-solid fa-dice-d20"></i> ${game.i18n.localize("PROCEDURAL.TropeBuilder.Launch")}`;
  button.addEventListener("click", () => {
    const existing = foundry.applications.instances.get("procedural-trope-builder");
    if (existing) {
      existing.bringToFront();
      return;
    }
    new TropeBuilderApplication().render(true);
  });
  header.appendChild(button);

  const npcButton = document.createElement("button");
  npcButton.type = "button";
  npcButton.classList.add("procedural-npc-builder-launch");
  npcButton.innerHTML = `<i class="fa-solid fa-user-plus"></i> ${game.i18n.localize("PROCEDURAL.NpcBuilder.Launch")}`;
  npcButton.addEventListener("click", () => {
    const existing = foundry.applications.instances.get("procedural-npc-builder");
    if (existing) {
      existing.bringToFront();
      return;
    }
    new NpcBuilderApplication().render(true);
  });
  header.appendChild(npcButton);
});
```

(Both buttons are injected together in this one hook call, so the existing `header.querySelector(".procedural-trope-builder-launch")` guard at the top already prevents either from being duplicated on re-render.)

- [ ] **Step 3: Add CSS for the wizard form and launcher button**

Append to the end of `css/procedural.css`:

```css
.procedural-npc-builder {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.procedural-npc-builder-launch {
  width: 100%;
  margin-top: 0.25rem;
}
```

- [ ] **Step 4: Add the `Launch` localization key**

In `lang/en.json`, change:

```json
    "NpcBuilder": {
      "Title": "Build an NPC Ally",
      "Name": "Name"
    },
```

to:

```json
    "NpcBuilder": {
      "Title": "Build an NPC Ally",
      "Launch": "Generate NPC",
      "Name": "Name"
    },
```

- [ ] **Step 5: Verify syntax**

```bash
node --check module/procedural.mjs
node -e "JSON.parse(require('fs').readFileSync('lang/en.json', 'utf8')); console.log('OK')"
```

Expected: no output from `--check`, `OK` from the JSON check.

- [ ] **Step 6: Run the full test suite as a regression check**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add module/procedural.mjs css/procedural.css lang/en.json
git commit -m "feat: add Actor Directory launcher for the NPC builder wizard"
```

---

### Task 5: Update README and bump the system version

**Files:**
- Modify: `README.md`
- Modify: `system.json`
- Modify: `package.json`
- Modify: `package-lock.json` (via `npm install --package-lock-only`)

**Interfaces:**
- Consumes: nothing (documentation + metadata only).
- Produces: nothing — final task in the plan.

- [ ] **Step 1: Mention the NPC generator wizard**

In `README.md`, change:

```markdown
- Trope (PC) and NPC actor sheets — NPC sheets include a 1d6 ally
  personality roll table
```

to:

```markdown
- Trope (PC) and NPC actor sheets — NPC sheets include a 1d6 ally
  personality roll table. Both actor types also have a guided,
  multi-step "builder" wizard (Actor Directory buttons) that rolls or
  lets you choose your way through the relevant tables and creates the
  finished actor on Finish — for NPCs, that's the ally's personality and
  a Trope-derived Talent
```

- [ ] **Step 2: Bump the system version**

In `system.json`, change:

```json
  "version": "0.10.0",
```

to:

```json
  "version": "0.11.0",
```

- [ ] **Step 3: Bump the package version to match**

In `package.json`, change:

```json
  "version": "0.10.0",
```

to:

```json
  "version": "0.11.0",
```

- [ ] **Step 4: Sync the lockfile**

```bash
npm install --package-lock-only
```

Expected: `package-lock.json`'s two `"version": "0.10.0"` entries (root package name and the `""` package) become `"0.11.0"`.

- [ ] **Step 5: Run the full test suite one more time**

```bash
npm test
```

Expected: PASS — README and version-field changes don't touch tested code paths.

- [ ] **Step 6: Commit**

```bash
git add README.md system.json package.json package-lock.json
git commit -m "docs: document the NPC builder wizard and bump version to 0.11.0"
```

---

## Manual Smoke Test (after all tasks)

This system has no Foundry-runtime test harness — verify by hand:

1. Symlink/copy the repo into `<FoundryUserData>/Data/systems/procedural` per the README's install steps, run `npm run build:packs`, and launch a PROCEDURAL! world.
2. Open the Actors Directory. Confirm a "Generate NPC" button appears next to the existing "Build Trope Character" button.
3. Click "Generate NPC". Confirm the wizard opens on the Personality step with Roll / dropdown / free-text all present.
4. Click "Roll" a few times; confirm the free-text box fills with one of the 6 canned personalities each time, and that "Next" is disabled until there's text in the box (try clearing it by hand).
5. Advance to the Trope step. Confirm "Roll" and the dropdown both work, and that a Talent name/description preview appears once a Trope is chosen. Confirm "Next" is disabled until a Trope is selected.
6. Advance to Review. Confirm the derived name (text before the first comma of the personality), the full personality text, and the chosen Trope + Talent all display correctly, and that each "Edit" button jumps back to the right step and preserves what's already been entered.
7. Click "Finish". Confirm: a new `npc` Actor is created and its sheet opens automatically; the actor's name matches the parsed name; the Personality section on the sheet shows the full personality text; the actor has a `trope`-type Item (matching the chosen Trope) and a `talent`-type Item (matching that Trope's Talent name/description) in its inventory; every skill on the sheet shows `1`.
8. Reopen the wizard, this time typing a personality with no comma (e.g. "Just Bob"). Confirm Finish still works and the actor is named "Just Bob".
9. Click "Generate NPC" again while a wizard instance is already open; confirm it brings the existing window to front instead of opening a second one (same behavior as "Build Trope Character").
10. Confirm the existing "Roll Personality" button on an NPC's own sheet (unrelated to this wizard) still works unchanged.
11. `npm test` passes.
