# NPC Name/Personality Roll Tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat 6-entry `data/npc-personalities.json` array with real Foundry `RollTable` compendiums (first names, last names, personality traits) plus a dice-formula age, wired into the NPC builder wizard, the NPC sheet's "Roll Personality" button, and the Trope (PC) builder's name step.

**Architecture:** Three new `RollTable` compendium packs, compiled from flat JSON string arrays by a new build mode in `scripts/build-packs.mjs` (mirroring the existing Item-pack build mode). A new Foundry-API-dependent helper module (`module/helpers/npc-name-generator.mjs`) draws from those compendiums at runtime and is consumed by three call sites: the NPC builder wizard, the NPC sheet's reroll button, and the Trope builder's name step. The existing pure, unit-tested `character-generator.mjs` loses its NPC-personality-specific code (which is being replaced, not ported) and stays Foundry-free for everything else it does.

**Tech Stack:** Foundry VTT v14 system module (ESM, no framework), `@foundryvtt/foundryvtt-cli` for compendium pack compilation, `node --test` for unit tests.

## Global Constraints

- Bump `system.json` AND `package.json` version together (currently `0.11.1`) as part of this work, patch or minor per judgment — this is a standing rule for this repo, not spec-specific.
- No Foundry-runtime test harness exists in this repo — code that touches `game.packs`/`game.i18n`/Foundry `Application` classes is verified by hand in a running Foundry world, not by `node --test`. Only genuinely pure functions get automated tests.
- Every new/changed generator table must keep the same "Roll / Choose from list / free-text override" UX pattern used elsewhere in this codebase (`roll-choose-create.hbs`) wherever a bounded list of options exists; skip the dropdown only where the option space is too large to browse (first+last name combinations).

---

### Task 1: NPC name/personality data files

**Files:**
- Create: `data/npc-first-names.json`
- Create: `data/npc-last-names.json`
- Modify: `data/npc-personalities.json` (replace entire contents)

**Interfaces:**
- Produces: three flat JSON arrays of strings, read by Task 2's build script. No code interface — pure data.

- [ ] **Step 1: Write `data/npc-first-names.json`**

```json
[
  "Elias", "Jennifer", "Dave", "Willow", "Ron", "Cindy", "Marcus", "Priya",
  "Diego", "Sasha", "Nadia", "Trevor", "Yolanda", "Felix", "Rosa", "Omar",
  "Brianna", "Curtis", "Ingrid", "Julian", "Keisha", "Lars", "Monique",
  "Nathaniel", "Odette"
]
```

- [ ] **Step 2: Write `data/npc-last-names.json`**

```json
[
  "Cope", "Thompson", "Hunt", "McClachlan", "Briar", "Huntsman", "Delgado",
  "Whitfield", "Nakamura", "Okafor", "Castellano", "Voss", "Marsh",
  "Abernathy", "Pruitt", "Kowalski", "Fairweather", "Solano", "Blackwood",
  "Rourke", "Yamamoto", "Ferris", "Duval", "Sinclair", "Larkspur"
]
```

- [ ] **Step 3: Replace `data/npc-personalities.json` with pronoun/name-free traits**

The old 6 entries embedded a specific name in the sentence (e.g. "...Elias has a jump-first..."). Since traits now pair with an independently-rolled name, every entry must stand alone without a name or pronoun reference.

```json
[
  "Hot-headed and impulsive, with a jump-first, measure-later attitude.",
  "Measured and cautious, nursing an old knee injury that slows things down.",
  "Cold and detached, with an obsessive drive when it comes to working cases.",
  "Bright-eyed and eager, but naive.",
  "The department's class clown, but out of their depth in a fight.",
  "Methodical and very by-the-book.",
  "Chronically late, but sharp enough to get away with it.",
  "Quiet and watchful, prone to noticing details everyone else misses.",
  "Overconfident, with a habit of taking credit for other people's work.",
  "Warm and easygoing, the one everyone trusts with a secret.",
  "Superstitious, keeps a lucky charm that's clearly seen better days.",
  "Blunt to the point of rudeness, but never dishonest.",
  "A stickler for procedure who quotes the manual from memory.",
  "Restless and easily bored, always looking for the next big case.",
  "Fiercely loyal, would take a bullet for a partner without hesitation.",
  "Recently divorced and still a little raw about it.",
  "A gifted mimic who does impressions to break the tension.",
  "Perpetually exhausted, running on coffee and stubbornness.",
  "Sharp-tongued and sarcastic, softer than they let on.",
  "Deeply religious, finds comfort in ritual before a big operation.",
  "A gearhead who'd rather talk about cars than the case at hand.",
  "Painfully honest, terrible at keeping a poker face.",
  "Ambitious to a fault, always angling for the next promotion.",
  "Haunted by one unsolved case that still keeps them up at night.",
  "An incurable optimist, certain every case is about to break wide open."
]
```

- [ ] **Step 4: Verify all three files are valid JSON arrays of the expected length**

Run:
```bash
node -e "
const fs = require('fs');
for (const f of ['data/npc-first-names.json', 'data/npc-last-names.json', 'data/npc-personalities.json']) {
  const arr = JSON.parse(fs.readFileSync(f, 'utf8'));
  console.log(f, Array.isArray(arr), arr.length, new Set(arr).size === arr.length ? 'no dupes' : 'HAS DUPES');
}
"
```
Expected: each file prints `true`, a length of 25, and `no dupes`.

- [ ] **Step 5: Commit**

```bash
git add data/npc-first-names.json data/npc-last-names.json data/npc-personalities.json
git commit -m "data: add NPC first/last name lists, rewrite personality traits name-free"
```

---

### Task 2: `build-packs.mjs` RollTable build mode

**Files:**
- Modify: `scripts/build-packs.mjs`
- Modify: `system.json` (add 3 pack declarations)
- Create: `scripts/build-packs.test.mjs`

**Interfaces:**
- Consumes: `data/npc-first-names.json`, `data/npc-last-names.json`, `data/npc-personalities.json` (Task 1) — flat string arrays.
- Produces: `buildRollTableResults(entries, packName)` — exported pure function, `(string[], string) => object[]`, used by Task 2's own test. `packs/procedural-npc-first-names/`, `packs/procedural-npc-last-names/`, `packs/procedural-npc-personalities/` — compiled RollTable compendium packs on disk, consumed by Task 3's runtime code via `game.packs.get("procedural.<packName>")`.

- [ ] **Step 1: Read the current script to confirm the exact existing shape before editing**

Run: `cat scripts/build-packs.mjs`

The current script has a top-level `for` loop that runs immediately on import — this must be guarded before Step 4's test can import from it without triggering a full compendium build.

- [ ] **Step 2: Write the failing test for `buildRollTableResults`**

Create `scripts/build-packs.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRollTableResults } from "./build-packs.mjs";

test("buildRollTableResults creates one result per entry with sequential ranges", () => {
  const results = buildRollTableResults(["Alpha", "Beta", "Gamma"], "test-pack");
  assert.equal(results.length, 3);
  assert.deepEqual(results.map(r => r.range), [[1, 1], [2, 2], [3, 3]]);
});

test("buildRollTableResults gives every result equal weight and the entry's text", () => {
  const results = buildRollTableResults(["Alpha", "Beta"], "test-pack");
  assert.equal(results[0].text, "Alpha");
  assert.equal(results[1].text, "Beta");
  assert.equal(results[0].weight, 1);
  assert.equal(results[1].weight, 1);
});

test("buildRollTableResults gives every result a unique, stable _id", () => {
  const first = buildRollTableResults(["Alpha", "Beta"], "test-pack");
  const second = buildRollTableResults(["Alpha", "Beta"], "test-pack");
  assert.equal(first[0]._id, second[0]._id, "same input produces the same id");
  assert.notEqual(first[0]._id, first[1]._id, "different entries get different ids");
});

test("buildRollTableResults handles a single-entry table", () => {
  const results = buildRollTableResults(["OnlyOne"], "test-pack");
  assert.equal(results.length, 1);
  assert.deepEqual(results[0].range, [1, 1]);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test scripts/build-packs.test.mjs`
Expected: FAIL — `buildRollTableResults` is not exported yet (current `build-packs.mjs` has no exports and would also attempt to run its full build loop on import, likely failing or side-effecting before the test even runs).

- [ ] **Step 4: Rewrite `scripts/build-packs.mjs`**

```js
import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

const PACKS = [
  { dataFile: "data/tropes.json", packName: "procedural-tropes", documentType: "Item", itemType: "trope" },
  { dataFile: "data/second-talents.json", packName: "procedural-second-talents", documentType: "Item", itemType: "talent" },
  { dataFile: "data/desk-items.json", packName: "procedural-desk-items", documentType: "Item", itemType: "equipment" },
  { dataFile: "data/npc-first-names.json", packName: "procedural-npc-first-names", documentType: "RollTable", tableName: "NPC First Names" },
  { dataFile: "data/npc-last-names.json", packName: "procedural-npc-last-names", documentType: "RollTable", tableName: "NPC Last Names" },
  { dataFile: "data/npc-personalities.json", packName: "procedural-npc-personalities", documentType: "RollTable", tableName: "NPC Personality Traits" }
];

function stableId(seed) {
  const hash = createHash("sha256").update(seed).digest();
  let id = "";
  for (let i = 0; i < 16; i++) {
    id += ID_ALPHABET[hash[i] % ID_ALPHABET.length];
  }
  return id;
}

export function buildRollTableResults(entries, packName) {
  return entries.map((text, i) => ({
    _id: stableId(`${packName}:result:${i}`),
    type: 0,
    text,
    weight: 1,
    range: [i + 1, i + 1],
    drawn: false
  }));
}

export function buildRollTableDocument(packName, tableName, entries) {
  const id = stableId(`${packName}:table`);
  return {
    _id: id,
    _key: `!tables!${id}`,
    name: tableName,
    img: "icons/svg/mystery-man.svg",
    description: "",
    formula: `1d${entries.length}`,
    replacement: true,
    displayRoll: true,
    results: buildRollTableResults(entries, packName),
    folder: null,
    sort: 0,
    ownership: { default: 0 },
    flags: {}
  };
}

async function buildItemPack({ dataFile, packName, itemType }) {
  const entries = JSON.parse(await readFile(path.join(ROOT, dataFile), "utf8"));
  const srcDir = path.join(ROOT, ".pack-src", packName);
  const destDir = path.join(ROOT, "packs", packName);

  const idToNames = {};
  const collisions = [];
  for (const entry of entries) {
    const id = stableId(`${packName}:${entry.name}`);
    if (idToNames[id]) {
      collisions.push(`"${idToNames[id]}" and "${entry.name}" (ID: ${id})`);
    } else {
      idToNames[id] = entry.name;
    }
  }

  if (collisions.length > 0) {
    throw new Error(
      `Duplicate entry names in pack "${packName}": ${collisions.join(", ")}`
    );
  }

  await rm(srcDir, { recursive: true, force: true });
  await mkdir(srcDir, { recursive: true });

  for (const entry of entries) {
    const id = stableId(`${packName}:${entry.name}`);
    const document = {
      _id: id,
      _key: `!items!${id}`,
      name: entry.name,
      type: itemType,
      img: entry.img,
      system: entry.system,
      effects: [],
      folder: null,
      sort: 0,
      ownership: { default: 0 },
      flags: {}
    };
    await writeFile(path.join(srcDir, `${id}.json`), JSON.stringify(document, null, 2));
  }

  await rm(destDir, { recursive: true, force: true });
  await compilePack(srcDir, destDir, { log: true });
  await rm(srcDir, { recursive: true, force: true });

  console.log(`PROCEDURAL | Built pack "${packName}" (${entries.length} entries)`);
}

async function buildRollTablePack({ dataFile, packName, tableName }) {
  const entries = JSON.parse(await readFile(path.join(ROOT, dataFile), "utf8"));
  const srcDir = path.join(ROOT, ".pack-src", packName);
  const destDir = path.join(ROOT, "packs", packName);

  const document = buildRollTableDocument(packName, tableName, entries);

  await rm(srcDir, { recursive: true, force: true });
  await mkdir(srcDir, { recursive: true });
  await writeFile(path.join(srcDir, `${document._id}.json`), JSON.stringify(document, null, 2));

  await rm(destDir, { recursive: true, force: true });
  await compilePack(srcDir, destDir, { log: true });
  await rm(srcDir, { recursive: true, force: true });

  console.log(`PROCEDURAL | Built pack "${packName}" (1 RollTable, ${entries.length} results)`);
}

async function main() {
  for (const pack of PACKS) {
    if (pack.documentType === "RollTable") {
      await buildRollTablePack(pack);
    } else {
      await buildItemPack(pack);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
```

Note the entry-point guard at the bottom (`if (process.argv[1] === ...)`) — this is the same idiom already used in `scripts/check-version-tag.mjs`. Without it, Task 2's test importing `buildRollTableResults` would trigger the entire compendium build as a side effect of the import.

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test scripts/build-packs.test.mjs`
Expected: PASS, all 4 tests.

- [ ] **Step 6: Add the three new pack declarations to `system.json`**

Find the `"packs"` array in `system.json` (currently 3 entries: `procedural-tropes`, `procedural-second-talents`, `procedural-desk-items`) and add:

```json
{
  "name": "procedural-npc-first-names",
  "label": "Procedural: NPC First Names",
  "path": "packs/procedural-npc-first-names",
  "type": "RollTable",
  "system": "procedural"
},
{
  "name": "procedural-npc-last-names",
  "label": "Procedural: NPC Last Names",
  "path": "packs/procedural-npc-last-names",
  "type": "RollTable",
  "system": "procedural"
},
{
  "name": "procedural-npc-personalities",
  "label": "Procedural: NPC Personality Traits",
  "path": "packs/procedural-npc-personalities",
  "type": "RollTable",
  "system": "procedural"
}
```

- [ ] **Step 7: Run the full build and inspect the output**

Run: `npm run build:packs`
Expected: console output showing all 6 packs built, including:
```
PROCEDURAL | Built pack "procedural-npc-first-names" (1 RollTable, 25 results)
PROCEDURAL | Built pack "procedural-npc-last-names" (1 RollTable, 25 results)
PROCEDURAL | Built pack "procedural-npc-personalities" (1 RollTable, 25 results)
```
Then verify the LevelDB output exists: `ls packs/procedural-npc-first-names/` should show pack files (not empty).

**This step cannot fully confirm the compiled document matches Foundry's actual `RollTable`/`TableResult` schema** — `compilePack` serializes what it's given; it does not validate against Foundry's client-side data model. The real confirmation happens in Task 8's manual Foundry smoke test, when the pack is actually loaded into a running world. If that fails with a schema error, revisit the `type`/`img`/`description` field names in `buildRollTableDocument` and `buildRollTableResults` against the installed Foundry v14 `foundry.documents.BaseRollTable`/`BaseTableResult` schema (or `CONFIG.RollTable.resultTypes`) before re-running this step.

- [ ] **Step 8: Run the full test suite to confirm nothing else broke**

Run: `npm test`
Expected: all existing tests still pass, plus the 4 new `build-packs.test.mjs` tests.

- [ ] **Step 9: Commit**

```bash
git add scripts/build-packs.mjs scripts/build-packs.test.mjs system.json packs/
git commit -m "feat: compile NPC name/personality data into RollTable compendiums"
```

---

### Task 3: `npc-name-generator.mjs` runtime helper

**Files:**
- Create: `module/helpers/npc-name-generator.mjs`

**Interfaces:**
- Consumes: `game.packs` (Foundry global), the 3 compendium packs built in Task 2 (`procedural.procedural-npc-first-names`, `procedural.procedural-npc-last-names`, `procedural.procedural-npc-personalities`).
- Produces (used by Tasks 4, 5, 6):
  - `rollFirstName(): Promise<string>`
  - `rollLastName(): Promise<string>`
  - `rollFullName(): Promise<string>` — `"First Last"`
  - `rollNpcAge(): Promise<number>`
  - `rollPersonalityTrait(): Promise<string>`
  - `getPersonalityTraitOptions(): Promise<string[]>`

- [ ] **Step 1: Write the module**

```js
const PACK_IDS = {
  firstNames: "procedural.procedural-npc-first-names",
  lastNames: "procedural.procedural-npc-last-names",
  personalities: "procedural.procedural-npc-personalities"
};

const NPC_AGE_FORMULA = "2d10+20";

const cachedTables = {};

async function getTable(key) {
  if (cachedTables[key]) return cachedTables[key];
  try {
    const pack = game.packs.get(PACK_IDS[key]);
    if (!pack) throw new Error(`Missing compendium pack "${PACK_IDS[key]}"`);
    const [table] = await pack.getDocuments();
    cachedTables[key] = table;
    return table;
  } catch (err) {
    console.error("PROCEDURAL | Failed to load NPC roll table", err);
    ui.notifications?.error("PROCEDURAL! failed to load an NPC roll table. Check the console for details.");
    throw err;
  }
}

async function drawText(key) {
  const table = await getTable(key);
  const { results } = await table.roll();
  return results[0].text;
}

export const rollFirstName = () => drawText("firstNames");
export const rollLastName = () => drawText("lastNames");
export const rollPersonalityTrait = () => drawText("personalities");

export async function rollFullName() {
  const [first, last] = await Promise.all([rollFirstName(), rollLastName()]);
  return `${first} ${last}`;
}

export async function rollNpcAge() {
  const roll = await new Roll(NPC_AGE_FORMULA).evaluate();
  return roll.total;
}

export async function getPersonalityTraitOptions() {
  const table = await getTable("personalities");
  return table.results.map(r => r.text);
}
```

- [ ] **Step 2: Manual verification (no automated test — `game.packs`/`Roll` are Foundry runtime globals not available under `node --test`)**

This can't be exercised standalone yet since nothing calls it — Task 8 covers full manual verification once Tasks 4-6 wire it up. For now, confirm the file has no syntax errors:

Run: `node --check module/helpers/npc-name-generator.mjs`
Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add module/helpers/npc-name-generator.mjs
git commit -m "feat: add Foundry-dependent NPC name/personality roll-table helper"
```

---

### Task 4: `NpcBuilderApplication` — split Name/Age and Personality trait

**Files:**
- Modify: `module/apps/npc-builder.mjs`
- Modify: `templates/apps/npc-builder.hbs`
- Create: `templates/apps/npc-builder-steps/personality.hbs`
- Modify: `templates/apps/npc-builder-steps/review.hbs`
- Modify: `lang/en.json`

**Interfaces:**
- Consumes: `rollFullName`, `rollNpcAge`, `rollPersonalityTrait`, `getPersonalityTraitOptions` from `module/helpers/npc-name-generator.mjs` (Task 3). `parseNpcName` from `module/helpers/character-generator.mjs` (unchanged, still exported from there — Task 7 only removes `rollNpcPersonality`, not `parseNpcName`).
- Produces: `#draft.name` (string, e.g. `"Elias Cope, 30"`) and `#draft.trait` (string) replace the old single `#draft.personality` field. No other task depends on this app's internals.

- [ ] **Step 1: Add the new localization key**

In `lang/en.json`, inside the existing `"NpcBuilder"` block (currently `Title`, `Launch`, `Name`), add:

```json
"NpcBuilder": {
  "Title": "Build an NPC Ally",
  "Launch": "Generate NPC",
  "Name": "Name",
  "NameAndAge": "Name & Age"
}
```

- [ ] **Step 2: Create `templates/apps/npc-builder-steps/personality.hbs`**

```html
<div class="procedural-builder-step procedural-npc-personality-step">
  <div class="procedural-builder-rcc-label-wrapper">
    <label class="procedural-builder-rcc-label">{{localize "PROCEDURAL.NpcBuilder.NameAndAge"}}</label>
    <div class="procedural-builder-row">
      <button type="button" data-action="rollName">{{localize "PROCEDURAL.TropeBuilder.Roll"}}</button>
    </div>
    <input type="text" name="nameValue" class="procedural-builder-freetext" value="{{nameValue}}" placeholder="{{localize 'PROCEDURAL.TropeBuilder.OrTypeYourOwn'}}">
  </div>

  {{> "systems/procedural/templates/apps/trope-builder-steps/roll-choose-create.hbs" rollChooseCreate}}
</div>
```

- [ ] **Step 3: Update `templates/apps/npc-builder.hbs` to render the new template**

Change:
```html
{{#if show.personality}}{{> "systems/procedural/templates/apps/trope-builder-steps/roll-choose-create.hbs" rollChooseCreate}}{{/if}}
```
to:
```html
{{#if show.personality}}{{> "systems/procedural/templates/apps/npc-builder-steps/personality.hbs"}}{{/if}}
```

- [ ] **Step 4: Update `templates/apps/npc-builder-steps/review.hbs`**

Replace the single "Personality" row with separate "Name & Age" and "Personality" rows, both editing the same `personality` step:

```html
<div class="procedural-builder-step procedural-builder-review">
  <dl>
    <dt>{{localize "PROCEDURAL.NpcBuilder.Name"}}</dt>
    <dd>{{name}}</dd>

    <dt>{{localize "PROCEDURAL.NpcBuilder.NameAndAge"}}</dt>
    <dd>
      {{draft.name}}
      <button type="button" data-action="goToStep" data-step="personality">{{localize "PROCEDURAL.TropeBuilder.Edit"}}</button>
    </dd>

    <dt>{{localize "PROCEDURAL.Actor.Personality"}}</dt>
    <dd>
      {{draft.trait}}
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

- [ ] **Step 5: Rewrite `module/apps/npc-builder.mjs`**

```js
const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ApplicationV2 } = foundry.applications.api;

import { loadGeneratorData } from "../helpers/generator-data.mjs";
import { rollTrope, parseNpcName } from "../helpers/character-generator.mjs";
import { rollFullName, rollNpcAge, rollPersonalityTrait, getPersonalityTraitOptions } from "../helpers/npc-name-generator.mjs";

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
      rollName: NpcBuilderApplication.#onRollName,
      rollTable: NpcBuilderApplication.#onRollTable,
      rollTrope: NpcBuilderApplication.#onRollTrope,
      finish: NpcBuilderApplication.#onFinish
    }
  };

  static PARTS = {
    form: {
      template: "systems/procedural/templates/apps/npc-builder.hbs",
      templates: [
        "systems/procedural/templates/apps/npc-builder-steps/personality.hbs",
        "systems/procedural/templates/apps/trope-builder-steps/roll-choose-create.hbs",
        "systems/procedural/templates/apps/npc-builder-steps/trope.hbs",
        "systems/procedural/templates/apps/npc-builder-steps/review.hbs"
      ]
    }
  };

  #stepIndex = 0;
  #data = null;
  #draft = {
    name: "",
    trait: "",
    trope: null
  };
  #finishing = false;

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
      context.nameValue = this.#draft.name;
      context.rollChooseCreate = {
        label: game.i18n.localize("PROCEDURAL.Actor.Personality"),
        options: await getPersonalityTraitOptions(),
        value: this.#draft.trait
      };
    }

    if (stepId === "trope") {
      context.tropeOptions = this.#data.tropes.map(t => ({
        name: t.name,
        selected: t.name === (this.#draft.trope?.name ?? "")
      }));
    }

    if (stepId === "review") {
      context.name = parseNpcName(this.#draft.name);
    }

    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const stepId = this.#stepId;

    const nameInput = this.element.querySelector('[name="nameValue"]');
    if (nameInput) {
      nameInput.addEventListener("input", () => {
        this.#draft.name = nameInput.value;
        this.#refreshNextEnabled();
      });
    }

    const textInput = this.element.querySelector('[name="stepValue"]');
    if (textInput) {
      textInput.addEventListener("input", () => {
        this.#draft.trait = textInput.value;
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

  #refreshNextEnabled() {
    const enabled = this.#isStepValid(this.#stepId);
    const nextBtn = this.element.querySelector('[data-action="goNext"], [data-action="finish"]');
    if (nextBtn) nextBtn.disabled = !enabled;
  }

  #isStepValid(stepId) {
    switch (stepId) {
      case "personality": return this.#draft.name.trim().length > 0 && this.#draft.trait.trim().length > 0;
      case "trope": return this.#draft.trope !== null;
      case "review": return this.#isStepValid("personality") && this.#isStepValid("trope");
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

  static async #onRollName() {
    const [fullName, age] = await Promise.all([rollFullName(), rollNpcAge()]);
    this.#draft.name = `${fullName}, ${age}`;
    this.render();
  }

  static async #onRollTable() {
    this.#draft.trait = await rollPersonalityTrait();
    this.render();
  }

  static #onRollTrope() {
    this.#draft.trope = rollTrope(this.#data.tropes, Math.random);
    this.render();
  }

  static async #onFinish() {
    if (!this.#isStepValid("review")) return;
    if (this.#finishing) return;
    this.#finishing = true;

    try {
      const draft = this.#draft;
      const name = parseNpcName(draft.name);
      const personality = `${draft.name}. ${draft.trait}`;
      const actor = await Actor.create({ name, type: "npc" });

      await actor.update({ "system.personality": personality });

      await Item.createDocuments([
        {
          name: draft.trope.name,
          type: "trope",
          img: draft.trope.img,
          system: { ...draft.trope.system, talentName: "", talentDescription: "", talentUsesPerAct: null }
        },
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
}
```

- [ ] **Step 6: Syntax-check the changed files**

Run: `node --check module/apps/npc-builder.mjs`
Expected: no output (success).

- [ ] **Step 7: Commit**

```bash
git add module/apps/npc-builder.mjs templates/apps/npc-builder.hbs templates/apps/npc-builder-steps/personality.hbs templates/apps/npc-builder-steps/review.hbs lang/en.json
git commit -m "feat: split NPC builder's personality step into Name/Age and Trait fields"
```

---

### Task 5: `actor-npc-sheet.mjs` — reroll all three draws

**Files:**
- Modify: `module/sheets/actor-npc-sheet.mjs`

**Interfaces:**
- Consumes: `rollFullName`, `rollNpcAge`, `rollPersonalityTrait` from `module/helpers/npc-name-generator.mjs` (Task 3).

- [ ] **Step 1: Rewrite the imports and `#onRollPersonality`**

Current file (from the earlier name-sync bugfix, PR #23):

```js
import { loadGeneratorData } from "../helpers/generator-data.mjs";
import { rollNpcPersonality, parseNpcName } from "../helpers/character-generator.mjs";
```
```js
  static async #onRollPersonality() {
    const generatorData = await loadGeneratorData();
    const personality = rollNpcPersonality(generatorData.npcPersonalities, Math.random);
    await this.actor.update({ name: parseNpcName(personality), "system.personality": personality });
  }
```

Replace with:

```js
import { rollFullName, rollNpcAge, rollPersonalityTrait } from "../helpers/npc-name-generator.mjs";
```
```js
  static async #onRollPersonality() {
    const [fullName, age, trait] = await Promise.all([
      rollFullName(),
      rollNpcAge(),
      rollPersonalityTrait()
    ]);
    const personality = `${fullName}, ${age}. ${trait}`;
    await this.actor.update({ name: fullName, "system.personality": personality });
  }
```

The `loadGeneratorData` import is removed entirely — nothing else in this file uses it.

- [ ] **Step 2: Syntax-check**

Run: `node --check module/sheets/actor-npc-sheet.mjs`
Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add module/sheets/actor-npc-sheet.mjs
git commit -m "feat: NPC sheet's Roll Personality rerolls name, age, and trait from tables"
```

---

### Task 6: `TropeBuilderApplication` — Roll button on the name step

**Files:**
- Modify: `module/apps/trope-builder.mjs`
- Modify: `templates/apps/trope-builder-steps/name.hbs`

**Interfaces:**
- Consumes: `rollFullName` from `module/helpers/npc-name-generator.mjs` (Task 3).

- [ ] **Step 1: Update `templates/apps/trope-builder-steps/name.hbs`**

```html
<div class="procedural-builder-step">
  <label>{{localize "PROCEDURAL.TropeBuilder.NamePrompt"}}</label>
  <div class="procedural-builder-row">
    <button type="button" data-action="rollName">{{localize "PROCEDURAL.TropeBuilder.Roll"}}</button>
  </div>
  <input type="text" name="stepValue" value="{{draft.name}}" placeholder="{{localize 'PROCEDURAL.TropeBuilder.NamePlaceholder'}}">
</div>
```

- [ ] **Step 2: Add the import and action to `module/apps/trope-builder.mjs`**

Add to the existing import line:

```js
import { rollTrope, validateSkillAllocation, rollQualityOrQuirk, rollBStoryOrHq } from "../helpers/character-generator.mjs";
import { rollFullName } from "../helpers/npc-name-generator.mjs";
```

Add `rollName: TropeBuilderApplication.#onRollName` to `DEFAULT_OPTIONS.actions` (alongside the existing `goNext`, `goBack`, etc.), and add the handler:

```js
  static async #onRollName() {
    this.#draft.name = await rollFullName();
    this.render();
  }
```

- [ ] **Step 3: Syntax-check**

Run: `node --check module/apps/trope-builder.mjs`
Expected: no output (success).

- [ ] **Step 4: Commit**

```bash
git add module/apps/trope-builder.mjs templates/apps/trope-builder-steps/name.hbs
git commit -m "feat: add Roll button to Trope builder's name step"
```

---

### Task 7: Remove the now-unused flat-array NPC personality code

**Files:**
- Modify: `module/helpers/character-generator.mjs`
- Modify: `module/helpers/character-generator.test.mjs`
- Modify: `module/helpers/generator-data.mjs`

**Interfaces:**
- No producer/consumer interface — this is deletion-only. Safe now because Tasks 4-6 already migrated every call site off `rollNpcPersonality` and `data.npcPersonalities`.

- [ ] **Step 1: Confirm nothing still references the code being removed**

Run:
```bash
grep -rn "rollNpcPersonality\|npcPersonalities" module/ templates/ scripts/
```
Expected: no matches other than inside `character-generator.mjs`, `character-generator.test.mjs`, and `generator-data.mjs` themselves (the files this task is about to edit).

- [ ] **Step 2: Remove `rollNpcPersonality` from `module/helpers/character-generator.mjs`**

Delete this block:

```js
/**
 * NPC ally personality table: a flat 1d6 roll (data/npc-personalities.json),
 * unlike the qualities/quirks/bstory/hq tables' odds/evens split.
 */
export function rollNpcPersonality(personalities, rng) {
  return personalities[roll1d6(rng) - 1];
}
```

`parseNpcName` (immediately below it in the file) stays — it's still used by Task 4's `npc-builder.mjs` and is not Foundry-dependent.

- [ ] **Step 3: Remove the corresponding tests from `module/helpers/character-generator.test.mjs`**

Delete the `rollNpcPersonality` import from the top-of-file import list, and delete these three tests:

```js
test("rollNpcPersonality picks the entry at 1d6 roll 1 (low boundary)", () => {
  ...
});

test("rollNpcPersonality picks the entry at 1d6 roll 6 (high boundary)", () => {
  ...
});

test("rollNpcPersonality picks the entry at a middle roll", () => {
  ...
});
```

Leave the `parseNpcName` tests and the `NPC_PERSONALITIES_FIXTURE` constant alone unless `NPC_PERSONALITIES_FIXTURE` is now unused (check with `grep -n "NPC_PERSONALITIES_FIXTURE" module/helpers/character-generator.test.mjs` — if its only remaining use was in the deleted tests, delete the fixture too).

- [ ] **Step 4: Remove `npcPersonalities` from `GENERATOR_DATA_PATHS` in `module/helpers/generator-data.mjs`**

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
  directors: "systems/procedural/data/directors.json"
};
```

(the `npcPersonalities` line is removed; everything else is unchanged)

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all tests pass, with 3 fewer tests than before this task (the removed `rollNpcPersonality` tests) plus the 4 `build-packs.test.mjs` tests added in Task 2.

- [ ] **Step 6: Commit**

```bash
git add module/helpers/character-generator.mjs module/helpers/character-generator.test.mjs module/helpers/generator-data.mjs
git commit -m "refactor: remove flat-array NPC personality code, superseded by roll tables"
```

---

### Task 8: Manual Foundry smoke test, version bump, and finish

**Files:**
- Modify: `system.json` (version)
- Modify: `package.json` (version)

**Interfaces:** None — this is the final verification and version-bump task.

- [ ] **Step 1: Run the full automated test suite one more time**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Manual smoke test in a running Foundry v14 world**

This system has no Foundry-runtime test harness, so this step is the real confirmation that Tasks 2-6 actually work end-to-end (in particular, that the compiled `RollTable` documents from Task 2 load correctly — see the caveat in Task 2 Step 7).

Launch Foundry with this system loaded and check each of the following:
1. Open the Compendium sidebar tab — confirm "Procedural: NPC First Names", "Procedural: NPC Last Names", and "Procedural: NPC Personality Traits" all appear and open without error, each showing one RollTable with 25 results.
2. From the Actor Directory, click "Generate NPC" to launch the wizard. On the Personality step, click Roll under "Name & Age" — confirm it fills in a "First Last, Age" value with age roughly in the 22-40 range. Click Roll under "Personality" — confirm the dropdown-eligible trait list is populated and a random trait fills the text field. Complete the wizard and confirm the created NPC actor's name matches the rolled first+last name (no age suffix) and the sheet's personality field shows the full combined sentence.
3. On that new NPC's sheet, click "Roll Personality" several times — confirm the actor's name (header) updates each time to match a newly-rolled name, and the personality text updates to a new name+age+trait combination each time.
4. Click "Build Trope Character" to launch the PC wizard. On the name step, click the new Roll button — confirm it fills in a "First Last" name (no age) and the field stays editable afterward.

If step 1 fails with a schema/validation error, revisit `buildRollTableDocument`/`buildRollTableResults` in `scripts/build-packs.mjs` (Task 2) against the actual Foundry v14 `RollTable`/`TableResult` data model and re-run `npm run build:packs`.

- [ ] **Step 3: Bump the version**

In `system.json` and `package.json`, bump `"version"` from `0.11.1` to `0.12.0` (minor bump — this adds new player/GM-facing functionality, not just a fix).

- [ ] **Step 4: Commit**

```bash
git add system.json package.json
git commit -m "chore: bump version to 0.12.0"
```
