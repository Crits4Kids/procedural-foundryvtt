# Desk Item Slot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "desk item" a first-class, single-slot concept on the Trope actor: a dedicated drop-target section on the sheet, a pick Randomize makes automatically, and a step in the Trope builder wizard — instead of desk items just being indistinguishable Equipment entries.

**Architecture:** One new `deskItemId` field on `TropeActorData` tracks which embedded `equipment` Item currently occupies the slot. The Trope sheet renders that item in its own section and overrides `_onDropItem` to route drops landing in that section's `data-drop-zone="desk-item"` element into a slot-setting helper instead of the default generic-Equipment-list behavior. Randomize and the wizard both already share `loadGeneratorData()`/`generateTrope()` (from the prior Randomize and wizard features) — this plan adds `deskItems` as a third data source through that same pipeline, then wires its result into `system.deskItemId` at the two call sites that create actors/items (`ProceduralActor#generateRandomTrope` and `TropeBuilderApplication#onFinish`).

**Tech Stack:** Foundry VTT v14 (`ActorSheetV2`, `ApplicationV2`, `HandlebarsApplicationMixin`), vanilla JS ES modules, Handlebars, plain CSS, Node's built-in test runner for the pure logic.

## Global Constraints

- Target Foundry VTT v14 (same as the rest of this system).
- No new npm dependencies.
- Preserve the pure-logic-vs-Foundry-glue split: `generateTrope`'s new `deskItem` field is pure logic in `module/helpers/character-generator.mjs`, unit-tested with Node's test runner; everything that touches `Actor`/`Item` documents or the DOM stays in the sheet/document/wizard classes and is verified by hand.
- All existing tests must keep passing unmodified.
- Reuse `data/desk-items.json` as-is (already exists, 42 entries, shape `{name, img, system:{description}}`) — no new data file.
- Don't use Handlebars helpers whose exact v14 signature isn't already proven in this codebase (`{{localize}}`, `{{concat}}`, `{{#each}}`, `{{#if}}`/`{{#unless}}`, `{{lookup}}` are all already used and safe). Precompute booleans/selected-flags in JS context, as every existing step in `trope-builder.mjs` already does.
- Per this repo's standing convention, bump `version` in `system.json` as part of this feature.
- Full spec: `docs/superpowers/specs/2026-08-07-desk-item-slot-design.md`.

---

### Task 1: `generateTrope` picks a random desk item

**Files:**
- Modify: `module/helpers/generator-data.mjs`
- Modify: `module/helpers/character-generator.mjs`
- Modify: `module/helpers/character-generator.test.mjs`

**Interfaces:**
- Consumes: existing `pickRandom(list, rng)` (already in `character-generator.mjs`); existing `data/desk-items.json`.
- Produces: `generateTrope(data, rng)`'s returned object gains a `deskItem: {name, img, system:{description}}` field (one entry from `data.deskItems`, picked the same way `secondTalent` already is). `GENERATOR_DATA_PATHS` gains a `deskItems` key, so both `ProceduralActor#generateRandomTrope` (Task 2) and `TropeBuilderApplication` (Task 4) — which both already call `loadGeneratorData()` — receive `data.deskItems` for free with no other wiring.

- [ ] **Step 1: Write the failing test**

In `module/helpers/character-generator.test.mjs`, add this fixture right after `SECOND_TALENTS_FIXTURE`:

```js
const DESK_ITEMS_FIXTURE = [
  { name: "A Sad Little Cactus", img: "icons/svg/mystery-man.svg", system: { description: "Cactus description" } },
  { name: "The Lucky Pen", img: "icons/svg/mystery-man.svg", system: { description: "Pen description" } }
];
```

Then change the `generateTrope` wiring test's input object from:

```js
  const result = generateTrope({
    tropes: FIXTURE_TROPES,
    secondTalents: SECOND_TALENTS_FIXTURE,
    qualities: QUALITIES_FIXTURE,
    quirks: QUIRKS_FIXTURE,
    bstories: BSTORIES_FIXTURE,
    hq: HQ_FIXTURE,
    agencyNames: AGENCY_NAMES_FIXTURE
  }, rng);
```

to:

```js
  const result = generateTrope({
    tropes: FIXTURE_TROPES,
    secondTalents: SECOND_TALENTS_FIXTURE,
    qualities: QUALITIES_FIXTURE,
    quirks: QUIRKS_FIXTURE,
    bstories: BSTORIES_FIXTURE,
    hq: HQ_FIXTURE,
    agencyNames: AGENCY_NAMES_FIXTURE,
    deskItems: DESK_ITEMS_FIXTURE
  }, rng);
```

And add one more assertion at the end of that same test, right after the existing `assert.equal(result.rerunPoints, 1);` line:

```js
  assert.equal(result.deskItem.name, "A Sad Little Cactus");
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test module/helpers/character-generator.test.mjs
```
Expected: FAIL on the new assertion — `result.deskItem` is `undefined` (`generateTrope` doesn't produce it yet).

- [ ] **Step 3: Add `deskItems` to `GENERATOR_DATA_PATHS`**

In `module/helpers/generator-data.mjs`, change:

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
  deskItems: "systems/procedural/data/desk-items.json"
};
```

- [ ] **Step 4: Add `deskItem` to `generateTrope`'s result**

In `module/helpers/character-generator.mjs`, change the `generateTrope` JSDoc block from:

```js
/**
 * Runs the full PROCEDURAL! character-creation checklist and returns a
 * plain result object. This function touches no Foundry API — the caller
 * (module/documents/actor.mjs) is responsible for applying the result to
 * an actor.
 * @param {object} data
 * @param {Array<object>} data.tropes - data/tropes.json shape
 * @param {Array<object>} data.secondTalents - data/second-talents.json shape
 * @param {{odds: string[], evens: string[]}} data.qualities - data/qualities.json shape
 * @param {{odds: string[], evens: string[]}} data.quirks - data/quirks.json shape
 * @param {{odds: string[], evens: string[]}} data.bstories - data/bstories.json shape
 * @param {{odds: string[], evens: string[]}} data.hq - data/hq.json shape
 * @param {{table1: string[], table2: string[], table3: string[]}} data.agencyNames - data/agency-names.json shape
 * @param {() => number} [rng]
 */
export function generateTrope(data, rng = Math.random) {
  const { tropes, secondTalents, qualities, quirks, bstories, hq, agencyNames } = data;

  const rolledTrope = rollTrope(tropes, rng);
  const stats = applyGifted(rolledTrope, { ...rolledTrope.system.statBlock }, rng);
  const skills = divestSkills(stats, rolledTrope.system.statNotes, rng);

  return {
    trope: {
      ...rolledTrope,
      system: { ...rolledTrope.system, statBlock: stats }
    },
    stats,
    skills,
    quality: rollQualityOrQuirk(qualities, rng),
    quirk: rollQualityOrQuirk(quirks, rng),
    bStory: rollBStoryOrHq(bstories, rng),
    hq: rollBStoryOrHq(hq, rng),
    agencyName: rollAgencyName(agencyNames, rng),
    secondTalent: pickRandom(secondTalents, rng),
    rerunPoints: 1
  };
}
```

to:

```js
/**
 * Runs the full PROCEDURAL! character-creation checklist and returns a
 * plain result object. This function touches no Foundry API — the caller
 * (module/documents/actor.mjs) is responsible for applying the result to
 * an actor.
 * @param {object} data
 * @param {Array<object>} data.tropes - data/tropes.json shape
 * @param {Array<object>} data.secondTalents - data/second-talents.json shape
 * @param {{odds: string[], evens: string[]}} data.qualities - data/qualities.json shape
 * @param {{odds: string[], evens: string[]}} data.quirks - data/quirks.json shape
 * @param {{odds: string[], evens: string[]}} data.bstories - data/bstories.json shape
 * @param {{odds: string[], evens: string[]}} data.hq - data/hq.json shape
 * @param {{table1: string[], table2: string[], table3: string[]}} data.agencyNames - data/agency-names.json shape
 * @param {Array<object>} data.deskItems - data/desk-items.json shape
 * @param {() => number} [rng]
 */
export function generateTrope(data, rng = Math.random) {
  const { tropes, secondTalents, qualities, quirks, bstories, hq, agencyNames, deskItems } = data;

  const rolledTrope = rollTrope(tropes, rng);
  const stats = applyGifted(rolledTrope, { ...rolledTrope.system.statBlock }, rng);
  const skills = divestSkills(stats, rolledTrope.system.statNotes, rng);

  return {
    trope: {
      ...rolledTrope,
      system: { ...rolledTrope.system, statBlock: stats }
    },
    stats,
    skills,
    quality: rollQualityOrQuirk(qualities, rng),
    quirk: rollQualityOrQuirk(quirks, rng),
    bStory: rollBStoryOrHq(bstories, rng),
    hq: rollBStoryOrHq(hq, rng),
    agencyName: rollAgencyName(agencyNames, rng),
    secondTalent: pickRandom(secondTalents, rng),
    deskItem: pickRandom(deskItems, rng),
    rerunPoints: 1
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
node --test module/helpers/character-generator.test.mjs
```
Expected: PASS — all pre-existing tests plus the updated wiring test.

- [ ] **Step 6: Run the full suite as a regression check**

```bash
npm test
```
Expected: all tests pass, including the unmodified `dice-rules.test.mjs` and `desk-items-data.test.mjs`.

- [ ] **Step 7: Commit**

```bash
git add module/helpers/generator-data.mjs module/helpers/character-generator.mjs module/helpers/character-generator.test.mjs
git commit -m "feat: have generateTrope pick a random desk item"
```

---

### Task 2: `deskItemId` field and Randomize wiring

**Files:**
- Modify: `module/data/actor-trope.mjs`
- Modify: `module/documents/actor.mjs`

**Interfaces:**
- Consumes: `generateTrope`'s new `result.deskItem` (Task 1).
- Produces: `TropeActorData.deskItemId` (`StringField`, initial `""`) — the id of the embedded `equipment` Item currently occupying the desk-item slot, or `""` if none. Task 3's sheet resolves the current desk item via `actor.items.get(actor.system.deskItemId) ?? null`. Task 4's wizard sets this same field via `actor.update({ "system.deskItemId": ... })` after creating its own desk item Item.

- [ ] **Step 1: Add the `deskItemId` field**

In `module/data/actor-trope.mjs`, change:

```js
      agencyName: new StringField({ initial: "" }),
      deskItem: new StringField({ initial: "" }),
      biography: new HTMLField({ initial: "" })
```

to:

```js
      agencyName: new StringField({ initial: "" }),
      deskItem: new StringField({ initial: "" }),
      deskItemId: new StringField({ initial: "" }),
      biography: new HTMLField({ initial: "" })
```

- [ ] **Step 2: Wire the desk item into `generateRandomTrope`**

In `module/documents/actor.mjs`, change:

```js
  async generateRandomTrope() {
    const data = await loadGeneratorData();
    const result = generateTrope(data);

    const staleItems = this.items.filter(i => i.type === "trope" || i.type === "talent");
    if (staleItems.length) {
      await this.deleteEmbeddedDocuments("Item", staleItems.map(i => i.id));
    }

    await this.update({
      "system.stats": result.stats,
      "system.skills.tech.value": result.skills.tech,
      "system.skills.lab.value": result.skills.lab,
      "system.skills.investigation.value": result.skills.investigation,
      "system.skills.violence.value": result.skills.violence,
      "system.skills.reflexes.value": result.skills.reflexes,
      "system.skills.coordination.value": result.skills.coordination,
      "system.skills.cool.value": result.skills.cool,
      "system.skills.intuition.value": result.skills.intuition,
      "system.skills.deception.value": result.skills.deception,
      "system.qualities": result.quality,
      "system.quirks": result.quirk,
      "system.bStory": result.bStory,
      "system.hq": result.hq,
      "system.agencyName": result.agencyName,
      "system.rerunPoints": result.rerunPoints,
      "system.hurt": false
    });

    await Item.createDocuments([
      { name: result.trope.name, type: "trope", img: result.trope.img, system: result.trope.system },
      { name: result.secondTalent.name, type: "talent", img: result.secondTalent.img, system: { ...result.secondTalent.system } }
    ], { parent: this });

    return result;
  }
```

to:

```js
  async generateRandomTrope() {
    const data = await loadGeneratorData();
    const result = generateTrope(data);

    const currentDeskItem = this.items.get(this.system.deskItemId);
    const staleItems = this.items.filter(i => i.type === "trope" || i.type === "talent" || i.id === currentDeskItem?.id);
    if (staleItems.length) {
      await this.deleteEmbeddedDocuments("Item", staleItems.map(i => i.id));
    }

    await this.update({
      "system.stats": result.stats,
      "system.skills.tech.value": result.skills.tech,
      "system.skills.lab.value": result.skills.lab,
      "system.skills.investigation.value": result.skills.investigation,
      "system.skills.violence.value": result.skills.violence,
      "system.skills.reflexes.value": result.skills.reflexes,
      "system.skills.coordination.value": result.skills.coordination,
      "system.skills.cool.value": result.skills.cool,
      "system.skills.intuition.value": result.skills.intuition,
      "system.skills.deception.value": result.skills.deception,
      "system.qualities": result.quality,
      "system.quirks": result.quirk,
      "system.bStory": result.bStory,
      "system.hq": result.hq,
      "system.agencyName": result.agencyName,
      "system.rerunPoints": result.rerunPoints,
      "system.hurt": false
    });

    const [, , deskItem] = await Item.createDocuments([
      { name: result.trope.name, type: "trope", img: result.trope.img, system: result.trope.system },
      { name: result.secondTalent.name, type: "talent", img: result.secondTalent.img, system: { ...result.secondTalent.system } },
      { name: result.deskItem.name, type: "equipment", img: result.deskItem.img, system: { ...result.deskItem.system } }
    ], { parent: this });

    await this.update({ "system.deskItemId": deskItem.id });

    return result;
  }
```

- [ ] **Step 3: Verify syntax**

```bash
node --check module/data/actor-trope.mjs
node --check module/documents/actor.mjs
```
Expected: no output from either.

- [ ] **Step 4: Run the full test suite as a regression check**

```bash
npm test
```
Expected: all tests pass (this task adds no Node-testable code — `actor.mjs` and `actor-trope.mjs` both depend on Foundry globals at evaluation time, so they aren't imported by the test suite).

- [ ] **Step 5: Commit**

```bash
git add module/data/actor-trope.mjs module/documents/actor.mjs
git commit -m "feat: reroll the desk item as part of Randomize"
```

---

### Task 3: Dedicated Desk Item section on the Trope sheet

**Files:**
- Modify: `module/sheets/actor-trope-sheet.mjs`
- Modify: `templates/actor/trope-sheet.hbs`
- Modify: `css/procedural.css`
- Modify: `lang/en.json`

**Interfaces:**
- Consumes: `actor.system.deskItemId` (Task 2).
- Produces: nothing consumed by later tasks — this task is self-contained once wired in.

- [ ] **Step 1: Resolve the desk item in `_prepareContext` and exclude it from the Equipment list**

In `module/sheets/actor-trope-sheet.mjs`, change:

```js
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.actor = this.actor;
    context.system = this.actor.system;
    context.enrichedBiography = await TextEditor.implementation.enrichHTML(this.actor.system.biography, {
      secrets: this.actor.isOwner,
      relativeTo: this.actor
    });
    context.items = {
      trope: this.actor.items.filter(i => i.type === "trope"),
      talent: this.actor.items.filter(i => i.type === "talent"),
      equipment: this.actor.items.filter(i => i.type === "equipment")
    };
    return context;
  }
```

to:

```js
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.actor = this.actor;
    context.system = this.actor.system;
    context.enrichedBiography = await TextEditor.implementation.enrichHTML(this.actor.system.biography, {
      secrets: this.actor.isOwner,
      relativeTo: this.actor
    });
    context.deskItem = this.actor.items.get(this.actor.system.deskItemId) ?? null;
    context.items = {
      trope: this.actor.items.filter(i => i.type === "trope"),
      talent: this.actor.items.filter(i => i.type === "talent"),
      equipment: this.actor.items.filter(i => i.type === "equipment" && i.id !== this.actor.system.deskItemId)
    };
    return context;
  }
```

- [ ] **Step 2: Override `_onDropItem` to route desk-item-zone drops into the slot**

Add this right after `_prepareContext` (before `static async #onRollSkill`):

```js
  async _onDropItem(event, item) {
    const created = await super._onDropItem(event, item);
    if (created?.type === "equipment" && event.target.closest?.('[data-drop-zone="desk-item"]')) {
      await this.#setDeskItem(created);
    }
    return created;
  }

  async #setDeskItem(item) {
    const actor = this.actor;
    const previousId = actor.system.deskItemId;
    if (previousId && previousId !== item.id) {
      await actor.items.get(previousId)?.delete();
    }
    if (actor.system.deskItemId !== item.id) {
      await actor.update({ "system.deskItemId": item.id });
    }
  }
```

- [ ] **Step 3: Include the desk item in Randomize's overwrite-confirmation check**

In `module/sheets/actor-trope-sheet.mjs`, change:

```js
    const hasExistingData =
      this.actor.items.some(i => i.type === "trope" || i.type === "talent") ||
      !!(s.qualities || s.quirks || s.bStory || s.hq || s.agencyName);
```

to:

```js
    const hasExistingData =
      this.actor.items.some(i => i.type === "trope" || i.type === "talent") ||
      !!(s.qualities || s.quirks || s.bStory || s.hq || s.agencyName || s.deskItemId);
```

- [ ] **Step 4: Add the Desk Item section to the sheet template and relabel the free-text field**

In `templates/actor/trope-sheet.hbs`, change:

```hbs
    <label>{{localize "PROCEDURAL.Actor.DeskItem"}}
      <input type="text" name="system.deskItem" value="{{system.deskItem}}">
    </label>
  </section>

  <section class="procedural-items">
```

to:

```hbs
    <label>{{localize "PROCEDURAL.Actor.DeskItemNote"}}
      <input type="text" name="system.deskItem" value="{{system.deskItem}}">
    </label>
  </section>

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

  <section class="procedural-items">
```

- [ ] **Step 5: Add the new localization keys**

In `lang/en.json`, inside the `"Actor"` object, change:

```json
      "AgencyName": "Agency Name",
      "DeskItem": "Desk Item",
      "Randomize": "Randomize",
```

to:

```json
      "AgencyName": "Agency Name",
      "DeskItem": "Desk Item",
      "DeskItemNote": "Desk Item Note",
      "DeskItemEmpty": "Drag a Desk Item here from the Procedural: Desk Items compendium.",
      "Randomize": "Randomize",
```

Verify the JSON is still valid:

```bash
node -e "JSON.parse(require('fs').readFileSync('lang/en.json', 'utf8')); console.log('OK')"
```
Expected: `OK`.

- [ ] **Step 6: Add the section's styles**

Append to the end of `css/procedural.css`:

```css
.procedural-desk-item {
  border: 1px solid #666;
  border-radius: 4px;
  padding: 0.5rem;
}

.procedural-desk-item-card {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.procedural-desk-item-img {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border: 1px solid #666;
}

.procedural-desk-item-info {
  flex: 1;
}

.procedural-desk-item-info p {
  margin: 0.25rem 0 0;
}

.procedural-desk-item-empty {
  color: #888;
  font-style: italic;
  margin: 0;
}
```

- [ ] **Step 7: Verify syntax**

```bash
node --check module/sheets/actor-trope-sheet.mjs
```
Expected: no output.

- [ ] **Step 8: Run the full test suite as a regression check**

```bash
npm test
```
Expected: all tests pass (this task adds no Node-testable code).

- [ ] **Step 9: Commit**

```bash
git add module/sheets/actor-trope-sheet.mjs templates/actor/trope-sheet.hbs css/procedural.css lang/en.json
git commit -m "feat: add a dedicated Desk Item drop slot to the Trope sheet"
```

---

### Task 4: "Choose your desk item" wizard step

**Files:**
- Modify: `module/apps/trope-builder.mjs`
- Create: `templates/apps/trope-builder-steps/desk-item.hbs`
- Modify: `templates/apps/trope-builder.hbs`
- Modify: `templates/apps/trope-builder-steps/review.hbs`

**Interfaces:**
- Consumes: `this.#data.deskItems` — already populated by `loadGeneratorData()` after Task 1's `GENERATOR_DATA_PATHS` change, no new import needed.
- Produces: nothing consumed by later tasks — this is the last task in the plan.

- [ ] **Step 1: Insert the `deskItem` step into `STEP_IDS`**

In `module/apps/trope-builder.mjs`, change:

```js
const STEP_IDS = [
  "name", "trope", "skills", "quality", "quirk", "bstory",
  "secondTalent", "hq", "agencyName", "review"
];
```

to:

```js
const STEP_IDS = [
  "name", "trope", "skills", "quality", "quirk", "bstory",
  "secondTalent", "hq", "deskItem", "agencyName", "review"
];
```

- [ ] **Step 2: Add `deskItem` to the draft shape**

Change:

```js
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
    agencyName: "",
    agencyWords: [null, null, null]
  };
```

to:

```js
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
    deskItem: null,
    agencyName: "",
    agencyWords: [null, null, null]
  };
```

- [ ] **Step 3: Add the `deskItem` entry to `context.show` and build its options**

Change:

```js
    context.show = {
      name: stepId === "name",
      trope: stepId === "trope",
      skills: stepId === "skills",
      rollChooseCreate: stepId in ROLL_CHOOSE_CREATE_CONFIG,
      secondTalent: stepId === "secondTalent",
      agencyName: stepId === "agencyName",
      review: stepId === "review"
    };
```

to:

```js
    context.show = {
      name: stepId === "name",
      trope: stepId === "trope",
      skills: stepId === "skills",
      rollChooseCreate: stepId in ROLL_CHOOSE_CREATE_CONFIG,
      secondTalent: stepId === "secondTalent",
      deskItem: stepId === "deskItem",
      agencyName: stepId === "agencyName",
      review: stepId === "review"
    };
```

Then add this block right after the existing `if (stepId === "secondTalent") { ... }` block in `_prepareContext` (before the `if (stepId === "agencyName")` block):

```js
    if (stepId === "deskItem") {
      context.deskItemOptions = this.#data.deskItems.map(d => ({
        name: d.name,
        selected: d.name === (this.#draft.deskItem?.name ?? "")
      }));
    }
```

- [ ] **Step 4: Wire the desk item `<select>` listener in `_onRender`**

Add this block right after the existing `if (stepId === "secondTalent") { ... }` block in `_onRender` (before the `if (stepId === "agencyName")` block):

```js
    if (stepId === "deskItem") {
      const deskItemSelect = this.element.querySelector('[data-role="desk-item-select"]');
      deskItemSelect?.addEventListener("change", () => {
        const deskItem = this.#data.deskItems.find(d => d.name === deskItemSelect.value);
        this.#draft.deskItem = deskItem ?? null;
        this.render();
      });
    }
```

- [ ] **Step 5: Add the `deskItem` case to `#isStepValid`**

Change:

```js
      case "secondTalent": return this.#draft.secondTalent !== null;
      case "hq": return this.#draft.hq.trim().length > 0;
```

to:

```js
      case "secondTalent": return this.#draft.secondTalent !== null;
      case "hq": return this.#draft.hq.trim().length > 0;
      case "deskItem": return this.#draft.deskItem !== null;
```

- [ ] **Step 6: Create the desk item as a third Item on Finish, and set `deskItemId`**

Change:

```js
      await Item.createDocuments([
        { name: draft.trope.name, type: "trope", img: draft.trope.img, system: { ...draft.trope.system, statBlock: draft.stats } },
        { name: draft.secondTalent.name, type: "talent", img: draft.secondTalent.img, system: { ...draft.secondTalent.system } }
      ], { parent: actor });

      await this.close();
```

to:

```js
      const [, , deskItem] = await Item.createDocuments([
        { name: draft.trope.name, type: "trope", img: draft.trope.img, system: { ...draft.trope.system, statBlock: draft.stats } },
        { name: draft.secondTalent.name, type: "talent", img: draft.secondTalent.img, system: { ...draft.secondTalent.system } },
        { name: draft.deskItem.name, type: "equipment", img: draft.deskItem.img, system: { ...draft.deskItem.system } }
      ], { parent: actor });

      await actor.update({ "system.deskItemId": deskItem.id });

      await this.close();
```

- [ ] **Step 7: Create `templates/apps/trope-builder-steps/desk-item.hbs`**

Same shape as the existing `second-talent.hbs` step:

```hbs
<div class="procedural-builder-step">
  <select data-role="desk-item-select">
    <option value="">{{localize "PROCEDURAL.TropeBuilder.ChooseOption"}}</option>
    {{#each deskItemOptions as |opt|}}
      <option value="{{opt.name}}" {{#if opt.selected}}selected{{/if}}>{{opt.name}}</option>
    {{/each}}
  </select>
  {{#if draft.deskItem}}
    <p class="procedural-builder-talent-description">{{draft.deskItem.system.description}}</p>
  {{/if}}
</div>
```

- [ ] **Step 8: Add the step to the shell template**

In `templates/apps/trope-builder.hbs`, change:

```hbs
    {{#if show.secondTalent}}{{> "systems/procedural/templates/apps/trope-builder-steps/second-talent.hbs"}}{{/if}}
    {{#if show.agencyName}}{{> "systems/procedural/templates/apps/trope-builder-steps/agency-name.hbs"}}{{/if}}
```

to:

```hbs
    {{#if show.secondTalent}}{{> "systems/procedural/templates/apps/trope-builder-steps/second-talent.hbs"}}{{/if}}
    {{#if show.deskItem}}{{> "systems/procedural/templates/apps/trope-builder-steps/desk-item.hbs"}}{{/if}}
    {{#if show.agencyName}}{{> "systems/procedural/templates/apps/trope-builder-steps/agency-name.hbs"}}{{/if}}
```

- [ ] **Step 9: Register the new step partial in `PARTS.form.templates`**

`HandlebarsApplicationMixin` only preloads and registers templates listed in `PARTS.form.templates` — a `{{> "..."}}` reference to a path not in that array throws `The partial ... could not be found` on render. In `module/apps/trope-builder.mjs`, change:

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

to:

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
        "systems/procedural/templates/apps/trope-builder-steps/desk-item.hbs",
        "systems/procedural/templates/apps/trope-builder-steps/agency-name.hbs",
        "systems/procedural/templates/apps/trope-builder-steps/review.hbs"
      ]
    }
  };
```

- [ ] **Step 10: Add a Desk Item row to the review screen**

In `templates/apps/trope-builder-steps/review.hbs`, change:

```hbs
    <dt>{{localize "PROCEDURAL.Actor.HQ"}}</dt>
    <dd>{{draft.hq}} <button type="button" data-action="goToStep" data-step="hq">{{localize "PROCEDURAL.TropeBuilder.Edit"}}</button></dd>

    <dt>{{localize "PROCEDURAL.Actor.AgencyName"}}</dt>
```

to:

```hbs
    <dt>{{localize "PROCEDURAL.Actor.HQ"}}</dt>
    <dd>{{draft.hq}} <button type="button" data-action="goToStep" data-step="hq">{{localize "PROCEDURAL.TropeBuilder.Edit"}}</button></dd>

    <dt>{{localize "PROCEDURAL.Actor.DeskItem"}}</dt>
    <dd>{{draft.deskItem.name}} <button type="button" data-action="goToStep" data-step="deskItem">{{localize "PROCEDURAL.TropeBuilder.Edit"}}</button></dd>

    <dt>{{localize "PROCEDURAL.Actor.AgencyName"}}</dt>
```

- [ ] **Step 11: Verify syntax**

```bash
node --check module/apps/trope-builder.mjs
```
Expected: no output.

- [ ] **Step 12: Run the full test suite as a regression check**

```bash
npm test
```
Expected: all tests pass (this task adds no Node-testable code).

- [ ] **Step 13: Commit**

```bash
git add module/apps/trope-builder.mjs templates/apps/trope-builder-steps/desk-item.hbs templates/apps/trope-builder.hbs templates/apps/trope-builder-steps/review.hbs
git commit -m "feat: add a desk item selection step to the Trope builder wizard"
```

---

### Task 5: Update README and bump the system version

**Files:**
- Modify: `README.md`
- Modify: `system.json:4` (`version` field)

**Interfaces:**
- Consumes: nothing (documentation + metadata only).
- Produces: nothing consumed by other tasks — this is the final task in the plan.

- [ ] **Step 1: Update the install walkthrough**

In `README.md`, change:

```markdown
6. Create a `trope` Actor, drag a Trope item onto it from the compendium,
   allocate skill points, and start rolling. Drag a Desk Item onto the same
   actor to give them something personal at HQ — the sheet's free-text
   "Desk Item" field stays separate, for a short flashback note.
```

to:

```markdown
6. Create a `trope` Actor, drag a Trope item onto it from the compendium,
   allocate skill points, and start rolling. Drag a Desk Item onto the
   sheet's dedicated "Desk Item" section to give them something personal at
   HQ (dragging a new one replaces the old one) — the separate "Desk Item
   Note" free-text field stays for a short flashback note. Randomize and
   the Trope builder wizard both pick/set a desk item automatically too.
```

- [ ] **Step 2: Bump the system version**

In `system.json`, change:

```json
  "version": "0.4.0",
```

to:

```json
  "version": "0.5.0",
```

(Minor bump for a new feature, per this repo's standing convention of bumping `system.json` version on every feature merge.)

- [ ] **Step 3: Run the full test suite one more time**

```bash
npm test
```
Expected: PASS — README and `system.json` changes don't touch tested code paths.

- [ ] **Step 4: Commit**

```bash
git add README.md system.json
git commit -m "docs: document the Desk Item slot and bump version to 0.5.0"
```

---

## Manual Smoke Test (after all tasks)

This system has no Foundry-runtime test harness (see README) — verify by hand:

1. Symlink/copy the repo into `<FoundryUserData>/Data/systems/procedural` per the README's install steps, and launch a PROCEDURAL! world.
2. Open an existing `trope` Actor (or create one). Confirm the sheet shows a new "Desk Item" section (separate from "Desk Item Note" and from the Equipment list), currently empty with the placeholder prompt.
3. Open the "Procedural: Desk Items" compendium and drag an entry onto that new section. Confirm it appears there with its image and description, and that it does *not* also show up in the Equipment list below.
4. Drag a second, different desk item onto the same section. Confirm the first one is gone (deleted, not just unlinked) and the second is now shown.
5. Drag a non-desk-item Equipment item (or any Item) onto the rest of the sheet, outside that section. Confirm it lands in the generic Equipment list as before, and does not disturb the Desk Item section.
6. Click ✎ and ✕ on the Desk Item card; confirm edit opens its item sheet and delete empties the slot back to the placeholder prompt.
7. Click Randomize. Confirm the Desk Item section now shows a (likely different) desk item, alongside the rerolled Trope/Talent/skills/flavor fields.
8. Launch the Trope builder wizard (Actors directory launcher button). Step through to confirm a "choose your desk item" step appears between HQ and Agency Name, is required to advance (Next stays disabled until one is picked), and shows the picked item's description underneath the dropdown.
9. Reach the Review step; confirm a "Desk Item" row appears (between HQ and Agency Name) showing the chosen name, with a working Edit link back to that step.
10. Click Finish. Confirm the newly created actor's sheet shows that same desk item in its dedicated section.
11. `npm test` passes.
