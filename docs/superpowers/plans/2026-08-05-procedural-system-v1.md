# PROCEDURAL! System v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a locally-installable Foundry VTT v14 system for *PROCEDURAL!* with working Trope/NPC character sheets and a fully automated 2d6 skill-roll engine (advantage/disadvantage, crit rules, Hurt status, Rerun Point rerolls), seeded with the rulebook's 11 Tropes and 18 second Talents.

**Architecture:** Foundry v11+ `documentTypes` (declared in `system.json`) backed by JS `TypeDataModel` classes — no `template.json`. ApplicationV2 + `HandlebarsApplicationMixin` sheets. Dice/tier logic is isolated in a pure, dependency-free module (`module/helpers/dice-rules.mjs`) so it can be unit-tested with Node's built-in test runner outside the Foundry client; everything that touches the Foundry API is Foundry-runtime glue, verified by a manual smoke test instead.

**Tech Stack:** Foundry VTT v14 (ApplicationV2, `TypeDataModel`, `DialogV2`), vanilla JS ES modules, Handlebars, plain CSS, Node.js built-in test runner (`node:test`) for the pure dice logic.

---

## Before you start: API-currency risk

This plan targets Foundry **v14**, a version newer than what's certain in the author's training data. The code below is written against the well-established v12/v13 ApplicationV2 patterns, which are very likely to still be current in v14, but a few specific names are the most likely to have shifted:

- `foundry.applications.api.HandlebarsApplicationMixin` / `foundry.applications.sheets.ActorSheetV2`
- `foundry.applications.api.DialogV2.wait(...)` and its button `callback(event, button)` signature
- The chat-render hook name (`renderChatMessageHTML` vs. `renderChatMessage`) and whether it hands you a raw `HTMLElement` or a jQuery object
- `Actors.registerSheet` / `Actors.unregisterSheet` and the legacy sheet class path used to unregister the core default (possibly moved under `foundry.appv1.sheets`)
- `CompendiumCollection.createCompendium(metadata)`

**Task 7 and Task 8** are where these first get exercised. Before writing those files, fetch `https://foundryvtt.com/api/` (via WebFetch) and confirm the current signatures; adjust the code in this plan if anything has changed. Everything else in this plan (data models, pure dice logic, JSON content) has no version-sensitive surface.

---

### Task 1: Project scaffold

**Files:**
- Modify: `system.json`
- Delete: `template.json`
- Create: `package.json`
- Create: `module/` directory (empty placeholder files removed as later tasks fill them)

- [ ] **Step 1: Replace `system.json`**

```json
{
  "id": "procedural",
  "title": "PROCEDURAL!",
  "description": "PROCEDURAL! is a tabletop role-playing game where players take on character tropes from their favorite TV crime shows and try to solve cases within a three-act time limit. Every game session is essentially an episode of an original detective show that you make up! Players will need to work together to not only uncover the mystery, but also compile quality evidence for a conviction. Finding out who did it is only half the battle-- you have to make it stick in court!",
  "version": "0.1.0",
  "authors": [{ "name": "mkniller" }],
  "compatibility": {
    "minimum": "14",
    "verified": "14"
  },
  "esmodules": ["module/procedural.mjs"],
  "styles": ["css/procedural.css"],
  "languages": [
    { "lang": "en", "name": "English", "path": "lang/en.json" }
  ],
  "documentTypes": {
    "Actor": {
      "trope": {},
      "npc": {}
    },
    "Item": {
      "trope": {},
      "talent": {},
      "equipment": {}
    }
  }
}
```

- [ ] **Step 2: Delete the legacy template file**

```bash
rm template.json
```

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "procedural-foundryvtt",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "node --test module/"
  }
}
```

- [ ] **Step 4: Create the directory skeleton**

```bash
mkdir -p module/data module/documents module/sheets module/helpers
mkdir -p templates/actor templates/item templates/chat
mkdir -p data css lang
```

- [ ] **Step 5: Verify `system.json` is valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('system.json', 'utf8')); console.log('valid')"
```
Expected: `valid`

- [ ] **Step 6: Commit**

```bash
git add system.json package.json .gitignore
git rm template.json
git add -A module templates data css lang 2>/dev/null || true
git commit -m "chore: scaffold system.json, package.json, and directory layout"
```

---

### Task 2: Pure dice-rules module (TDD)

This is the one piece of business logic complex enough — and decoupled enough from the Foundry runtime — to develop test-first. It implements the rulebook's success ladder, advantage/disadvantage die resolution, raw-2/raw-12 crit rules, and Hurt suppression, as pure functions that take an injectable RNG.

**Files:**
- Create: `module/helpers/dice-rules.mjs`
- Test: `module/helpers/dice-rules.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `module/helpers/dice-rules.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDice, resolveTier, computeRoll } from "./dice-rules.mjs";

function queue(values) {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i += 1;
    return (v - 1) / 6;
  };
}

test("resolveDice normal mode sums two dice", () => {
  const rng = queue([3, 5]);
  const result = resolveDice("normal", rng);
  assert.equal(result.die1, 3);
  assert.equal(result.die2, 5);
  assert.equal(result.rawTotal, 8);
});

test("resolveDice advantage keeps the higher of each die pair", () => {
  const rng = queue([2, 6, 5, 1]);
  const result = resolveDice("advantage", rng);
  assert.equal(result.die1, 5);
  assert.equal(result.die2, 6);
  assert.equal(result.rawTotal, 11);
});

test("resolveDice disadvantage rerolls the higher die only", () => {
  const rng = queue([2, 6, 1]);
  const result = resolveDice("disadvantage", rng);
  assert.equal(result.die1, 2);
  assert.equal(result.die2, 1);
  assert.equal(result.rawTotal, 3);
});

test("resolveDice disadvantage rerolls the first die on a tie", () => {
  const rng = queue([4, 4, 1]);
  const result = resolveDice("disadvantage", rng);
  assert.equal(result.die1, 1);
  assert.equal(result.die2, 4);
  assert.equal(result.rawTotal, 5);
});

test("resolveTier bands a modified total of 5 as Failure", () => {
  const tier = resolveTier(8, 5);
  assert.equal(tier.tier, "failure");
  assert.equal(tier.isCriticalFailure, false);
});

test("resolveTier bands a modified total of 9 as So-So", () => {
  const tier = resolveTier(7, 9);
  assert.equal(tier.tier, "soSo");
});

test("resolveTier bands a modified total of 11 as Outright Success", () => {
  const tier = resolveTier(9, 11);
  assert.equal(tier.tier, "success");
});

test("resolveTier bands a modified total of 12+ as Success + Positive Effect", () => {
  const tier = resolveTier(10, 13);
  assert.equal(tier.tier, "successEffect");
});

test("resolveTier flags raw 2 as Critical Failure regardless of modifiedTotal", () => {
  const tier = resolveTier(2, 2);
  assert.equal(tier.isCriticalFailure, true);
  assert.equal(tier.tier, "criticalFailure");
});

test("resolveTier flags raw 12 as Critical Success alongside the successEffect band", () => {
  const tier = resolveTier(12, 15);
  assert.equal(tier.isCriticalSuccess, true);
  assert.equal(tier.tier, "successEffect");
});

test("computeRoll ignores all modifiers on a raw critical failure", () => {
  const rng = queue([1, 1]);
  const result = computeRoll({ mode: "normal", skillModifier: 3, situationalModifier: 2, rng });
  assert.equal(result.rawTotal, 2);
  assert.equal(result.modifiedTotal, 2);
  assert.equal(result.isCriticalFailure, true);
});

test("computeRoll applies skill and situational modifiers normally", () => {
  const rng = queue([3, 4]);
  const result = computeRoll({ mode: "normal", skillModifier: 2, situationalModifier: 1, rng });
  assert.equal(result.rawTotal, 7);
  assert.equal(result.modifiedTotal, 10);
  assert.equal(result.tier, "success");
});

test("computeRoll suppresses all modifiers while hurt", () => {
  const rng = queue([3, 4]);
  const result = computeRoll({
    mode: "normal", skillModifier: 5, situationalModifier: 5,
    hurt: true, isPhysicalSkill: false, rng
  });
  assert.equal(result.modifiedTotal, 7);
  assert.equal(result.skillModifier, 0);
  assert.equal(result.situationalModifier, 0);
});

test("computeRoll forces disadvantage on physical skills while hurt", () => {
  const rng = queue([2, 6, 1]);
  const result = computeRoll({
    mode: "normal", skillModifier: 0,
    hurt: true, isPhysicalSkill: true, rng
  });
  assert.equal(result.effectiveMode, "disadvantage");
  assert.equal(result.die1, 2);
  assert.equal(result.die2, 1);
});

test("computeRoll does not force disadvantage on non-physical skills while hurt", () => {
  const rng = queue([3, 4]);
  const result = computeRoll({
    mode: "normal", skillModifier: 0,
    hurt: true, isPhysicalSkill: false, rng
  });
  assert.equal(result.effectiveMode, "normal");
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
node --test module/helpers/dice-rules.test.mjs
```
Expected: FAIL — `Cannot find module './dice-rules.mjs'`

- [ ] **Step 3: Implement `module/helpers/dice-rules.mjs`**

```js
function rollDie(rng) {
  return Math.floor(rng() * 6) + 1;
}

/**
 * @param {"normal"|"advantage"|"disadvantage"} mode
 * @param {() => number} rng - returns a float in [0,1), like Math.random
 * @returns {{die1: number, die2: number, rawTotal: number}}
 */
export function resolveDice(mode, rng) {
  const first = [rollDie(rng), rollDie(rng)];

  if (mode === "advantage") {
    const second = [rollDie(rng), rollDie(rng)];
    const die1 = Math.max(first[0], second[0]);
    const die2 = Math.max(first[1], second[1]);
    return { die1, die2, rawTotal: die1 + die2 };
  }

  if (mode === "disadvantage") {
    const dice = [...first];
    const higherIndex = dice[0] >= dice[1] ? 0 : 1;
    dice[higherIndex] = rollDie(rng);
    return { die1: dice[0], die2: dice[1], rawTotal: dice[0] + dice[1] };
  }

  return { die1: first[0], die2: first[1], rawTotal: first[0] + first[1] };
}

/**
 * @param {number} rawTotal - sum of the two resolved dice, before modifiers
 * @param {number} modifiedTotal - rawTotal + all applicable modifiers
 * @returns {{tier: string, label: string, isCriticalFailure: boolean, isCriticalSuccess: boolean}}
 */
export function resolveTier(rawTotal, modifiedTotal) {
  if (rawTotal === 2) {
    return {
      tier: "criticalFailure",
      label: "Critical Failure",
      isCriticalFailure: true,
      isCriticalSuccess: false
    };
  }

  const isCriticalSuccess = rawTotal === 12;

  if (modifiedTotal <= 6) {
    return { tier: "failure", label: "Failure", isCriticalFailure: false, isCriticalSuccess };
  }
  if (modifiedTotal <= 9) {
    return { tier: "soSo", label: "So-So Result", isCriticalFailure: false, isCriticalSuccess };
  }
  if (modifiedTotal <= 11) {
    return { tier: "success", label: "Outright Success", isCriticalFailure: false, isCriticalSuccess };
  }
  return {
    tier: "successEffect",
    label: "Outright Success + Positive Effect",
    isCriticalFailure: false,
    isCriticalSuccess
  };
}

/**
 * @param {object} params
 * @param {"normal"|"advantage"|"disadvantage"} params.mode
 * @param {number} params.skillModifier
 * @param {number} [params.situationalModifier]
 * @param {boolean} [params.hurt]
 * @param {boolean} [params.isPhysicalSkill]
 * @param {() => number} [params.rng]
 */
export function computeRoll({
  mode,
  skillModifier,
  situationalModifier = 0,
  hurt = false,
  isPhysicalSkill = false,
  rng = Math.random
}) {
  const effectiveMode = hurt && isPhysicalSkill ? "disadvantage" : mode;
  const effectiveSkillModifier = hurt ? 0 : skillModifier;
  const effectiveSituationalModifier = hurt ? 0 : situationalModifier;

  const { die1, die2, rawTotal } = resolveDice(effectiveMode, rng);
  const modifiedTotal = rawTotal === 2
    ? 2
    : rawTotal + effectiveSkillModifier + effectiveSituationalModifier;
  const tierInfo = resolveTier(rawTotal, modifiedTotal);

  return {
    die1,
    die2,
    rawTotal,
    modifiedTotal,
    skillModifier: effectiveSkillModifier,
    situationalModifier: effectiveSituationalModifier,
    effectiveMode,
    ...tierInfo
  };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
node --test module/helpers/dice-rules.test.mjs
```
Expected: all tests pass, 0 failures

- [ ] **Step 5: Commit**

```bash
git add module/helpers/dice-rules.mjs module/helpers/dice-rules.test.mjs
git commit -m "feat: add pure dice-rules module with TDD coverage"
```

---

### Task 3: Actor DataModel classes

**Files:**
- Create: `module/data/shared.mjs`
- Create: `module/data/actor-trope.mjs`
- Create: `module/data/actor-npc.mjs`

- [ ] **Step 1: Write `module/data/shared.mjs`**

```js
export const SKILL_KEYS = [
  "tech", "lab", "investigation",
  "violence", "reflexes", "coordination",
  "cool", "intuition", "deception"
];

export function buildSkillsSchema(initialValue = 0) {
  const { SchemaField, NumberField } = foundry.data.fields;
  const skills = {};
  for (const key of SKILL_KEYS) {
    skills[key] = new SchemaField({
      value: new NumberField({ required: true, integer: true, initial: initialValue, min: 0 })
    });
  }
  return new SchemaField(skills);
}
```

- [ ] **Step 2: Write `module/data/actor-trope.mjs`**

```js
import { buildSkillsSchema } from "./shared.mjs";

export default class TropeActorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { SchemaField, StringField, NumberField, BooleanField, HTMLField } = foundry.data.fields;

    return {
      stats: new SchemaField({
        mental: new NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        physical: new NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        social: new NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),
      skills: buildSkillsSchema(0),
      rerunPoints: new NumberField({ required: true, integer: true, initial: 1, min: 0 }),
      hurt: new BooleanField({ initial: false }),
      qualities: new StringField({ initial: "" }),
      quirks: new StringField({ initial: "" }),
      bStory: new StringField({ initial: "" }),
      hq: new StringField({ initial: "" }),
      agencyName: new StringField({ initial: "" }),
      deskItem: new StringField({ initial: "" }),
      biography: new HTMLField({ initial: "" })
    };
  }
}
```

- [ ] **Step 3: Write `module/data/actor-npc.mjs`**

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

- [ ] **Step 4: Verify syntax**

```bash
node --check module/data/shared.mjs
node --check module/data/actor-trope.mjs
node --check module/data/actor-npc.mjs
```
Expected: no output (silent success) for all three

- [ ] **Step 5: Commit**

```bash
git add module/data/shared.mjs module/data/actor-trope.mjs module/data/actor-npc.mjs
git commit -m "feat: add Actor DataModel classes for trope and npc"
```

---

### Task 4: Item DataModel classes

**Files:**
- Create: `module/data/item-trope.mjs`
- Create: `module/data/item-talent.mjs`
- Create: `module/data/item-equipment.mjs`

- [ ] **Step 1: Write `module/data/item-trope.mjs`**

```js
export default class TropeItemData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { SchemaField, StringField, NumberField, BooleanField } = foundry.data.fields;

    return {
      statBlock: new SchemaField({
        mental: new NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        physical: new NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        social: new NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),
      statNotes: new StringField({ initial: "", blank: true }),
      talentName: new StringField({ required: true, initial: "" }),
      talentDescription: new StringField({ required: true, initial: "", blank: true }),
      talentUsesPerAct: new NumberField({ required: false, integer: true, initial: 1, min: 0, nullable: true }),
      used: new BooleanField({ initial: false })
    };
  }
}
```

- [ ] **Step 2: Write `module/data/item-talent.mjs`**

```js
export default class TalentItemData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { StringField, NumberField, BooleanField } = foundry.data.fields;

    return {
      description: new StringField({ required: true, initial: "", blank: true }),
      usesPerAct: new NumberField({ required: false, integer: true, initial: 1, min: 0, nullable: true }),
      used: new BooleanField({ initial: false })
    };
  }
}
```

- [ ] **Step 3: Write `module/data/item-equipment.mjs`**

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

- [ ] **Step 4: Verify syntax**

```bash
node --check module/data/item-trope.mjs
node --check module/data/item-talent.mjs
node --check module/data/item-equipment.mjs
```
Expected: no output for all three

- [ ] **Step 5: Commit**

```bash
git add module/data/item-trope.mjs module/data/item-talent.mjs module/data/item-equipment.mjs
git commit -m "feat: add Item DataModel classes for trope, talent, and equipment"
```

---

### Task 5: ProceduralActor document class

**Files:**
- Create: `module/documents/actor.mjs`

- [ ] **Step 1: Write `module/documents/actor.mjs`**

```js
import { computeRoll } from "../helpers/dice-rules.mjs";

const PHYSICAL_SKILLS = new Set(["violence", "reflexes", "coordination"]);

const TIER_CLASS = {
  criticalFailure: "procedural-tier-critical-failure",
  failure: "procedural-tier-failure",
  soSo: "procedural-tier-so-so",
  success: "procedural-tier-success",
  successEffect: "procedural-tier-success-effect"
};

export default class ProceduralActor extends Actor {
  async rollSkill(skillKey, { mode = "normal", situationalModifier = 0 } = {}) {
    const skill = this.system.skills?.[skillKey];
    if (!skill) throw new Error(`Unknown skill: ${skillKey}`);

    const result = computeRoll({
      mode,
      skillModifier: skill.value,
      situationalModifier,
      hurt: this.system.hurt ?? false,
      isPhysicalSkill: PHYSICAL_SKILLS.has(skillKey)
    });

    await this._postRollCard(skillKey, mode, situationalModifier, result);
    return result;
  }

  async _postRollCard(skillKey, mode, situationalModifier, result) {
    const skillLabel = game.i18n.localize(`PROCEDURAL.Skill.${skillKey}`);
    const content = await renderTemplate("systems/procedural/templates/chat/roll-card.hbs", {
      actorId: this.id,
      skillKey,
      skillLabel,
      mode,
      situationalModifier,
      result,
      tierClass: TIER_CLASS[result.tier],
      canReroll: (this.system.rerunPoints ?? 0) > 0
    });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content
    });
  }

  async spendRerunPointAndReroll(skillKey, mode, situationalModifier) {
    if ((this.system.rerunPoints ?? 0) <= 0) return null;
    await this.update({ "system.rerunPoints": this.system.rerunPoints - 1 });
    return this.rollSkill(skillKey, { mode, situationalModifier });
  }
}
```

- [ ] **Step 2: Verify syntax**

```bash
node --check module/documents/actor.mjs
```
Expected: no output

- [ ] **Step 3: Commit**

```bash
git add module/documents/actor.mjs
git commit -m "feat: add ProceduralActor document class with roll orchestration"
```

---

### Task 6: Chat card template and reroll listener

**Files:**
- Create: `templates/chat/roll-card.hbs`
- Create: `module/helpers/chat-listeners.mjs`

- [ ] **Step 1: Write `templates/chat/roll-card.hbs`**

```handlebars
<div class="procedural-roll-card">
  <header class="procedural-roll-card-header {{tierClass}}">
    <strong>{{skillLabel}}</strong> Roll ({{mode}})
  </header>
  <div class="procedural-roll-card-dice">
    Dice: {{result.die1}} + {{result.die2}} = {{result.rawTotal}}
    {{#if result.isCriticalSuccess}}<span class="procedural-crit-tag">CRIT!</span>{{/if}}
  </div>
  {{#unless result.isCriticalFailure}}
  <div class="procedural-roll-card-modifiers">
    + Skill {{result.skillModifier}} + Situational {{result.situationalModifier}}
  </div>
  {{/unless}}
  <div class="procedural-roll-card-total">
    Total: <strong>{{result.modifiedTotal}}</strong>
  </div>
  <div class="procedural-roll-card-tier {{tierClass}}">
    {{result.label}}
  </div>
  {{#if canReroll}}
  <button type="button" class="procedural-reroll-button"
          data-actor-id="{{actorId}}" data-skill-key="{{skillKey}}"
          data-mode="{{mode}}" data-situational-modifier="{{situationalModifier}}">
    {{localize "PROCEDURAL.Roll.Reroll"}}
  </button>
  {{/if}}
</div>
```

- [ ] **Step 2: Write `module/helpers/chat-listeners.mjs`**

```js
export function registerChatListeners() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const root = html instanceof HTMLElement ? html : html[0];
    const button = root?.querySelector(".procedural-reroll-button");
    if (!button) return;

    button.addEventListener("click", async () => {
      const actor = game.actors.get(button.dataset.actorId);
      if (!actor) return;

      await actor.spendRerunPointAndReroll(
        button.dataset.skillKey,
        button.dataset.mode,
        Number(button.dataset.situationalModifier) || 0
      );
    });
  });
}
```

- [ ] **Step 3: Verify syntax**

```bash
node --check module/helpers/chat-listeners.mjs
```
Expected: no output

- [ ] **Step 4: Commit**

```bash
git add templates/chat/roll-card.hbs module/helpers/chat-listeners.mjs
git commit -m "feat: add chat roll card template and reroll button listener"
```

---

### Task 7: Entry point — `module/procedural.mjs`

Before writing this file, fetch `https://foundryvtt.com/api/` and confirm: the hook name for chat message rendering (`renderChatMessageHTML` vs `renderChatMessage`), and the current `Actors.registerSheet`/`Actors.unregisterSheet` signature and legacy sheet class path for v14. Adjust the code below if either has changed.

**Files:**
- Create: `module/procedural.mjs`

(This task only registers data models and the document class, and wires the chat listener. Sheet registration is added in Tasks 8-10 once the sheet classes exist, via a follow-up edit to this same file.)

- [ ] **Step 1: Write `module/procedural.mjs`**

```js
import TropeActorData from "./data/actor-trope.mjs";
import NpcActorData from "./data/actor-npc.mjs";
import TropeItemData from "./data/item-trope.mjs";
import TalentItemData from "./data/item-talent.mjs";
import EquipmentItemData from "./data/item-equipment.mjs";
import ProceduralActor from "./documents/actor.mjs";
import { registerChatListeners } from "./helpers/chat-listeners.mjs";
import { seedCompendiums } from "./helpers/seed-compendiums.mjs";

Hooks.once("init", () => {
  CONFIG.Actor.dataModels.trope = TropeActorData;
  CONFIG.Actor.dataModels.npc = NpcActorData;
  CONFIG.Item.dataModels.trope = TropeItemData;
  CONFIG.Item.dataModels.talent = TalentItemData;
  CONFIG.Item.dataModels.equipment = EquipmentItemData;

  CONFIG.Actor.documentClass = ProceduralActor;

  registerChatListeners();
});

Hooks.once("ready", () => {
  seedCompendiums();
});
```

- [ ] **Step 2: Verify syntax**

```bash
node --check module/procedural.mjs
```
Expected: no output (import targets don't exist yet for `seed-compendiums.mjs` — that's fine, `node --check` only parses syntax, it doesn't resolve imports)

- [ ] **Step 3: Commit**

```bash
git add module/procedural.mjs
git commit -m "feat: add system entry point registering data models and document class"
```

---

### Task 8: Actor Trope sheet

Before writing this file, fetch `https://foundryvtt.com/api/` and confirm the current `HandlebarsApplicationMixin`/`ActorSheetV2` namespace and `DialogV2.wait` button-callback signature. Adjust the code below if either has changed.

**Files:**
- Create: `module/sheets/actor-trope-sheet.mjs`
- Create: `templates/actor/trope-sheet.hbs`
- Modify: `module/procedural.mjs`

- [ ] **Step 1: Write `module/sheets/actor-trope-sheet.mjs`**

```js
const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export default class ProceduralTropeActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["procedural", "sheet", "actor", "trope"],
    position: { width: 640, height: 720 },
    window: { resizable: true },
    actions: {
      rollSkill: ProceduralTropeActorSheet.#onRollSkill,
      toggleHurt: ProceduralTropeActorSheet.#onToggleHurt,
      createItem: ProceduralTropeActorSheet.#onCreateItem,
      editItem: ProceduralTropeActorSheet.#onEditItem,
      deleteItem: ProceduralTropeActorSheet.#onDeleteItem
    }
  };

  static PARTS = {
    form: { template: "systems/procedural/templates/actor/trope-sheet.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.system = this.actor.system;
    context.items = {
      trope: this.actor.items.filter(i => i.type === "trope"),
      talent: this.actor.items.filter(i => i.type === "talent"),
      equipment: this.actor.items.filter(i => i.type === "equipment")
    };
    return context;
  }

  static async #onRollSkill(event, target) {
    const skillKey = target.dataset.skill;
    const skillLabel = game.i18n.localize(`PROCEDURAL.Skill.${skillKey}`);

    const config = await foundry.applications.api.DialogV2.wait({
      window: { title: `${skillLabel} ${game.i18n.localize("PROCEDURAL.Roll.DialogTitleSuffix")}` },
      content: `
        <div class="procedural-roll-dialog">
          <label><input type="radio" name="mode" value="normal" checked> ${game.i18n.localize("PROCEDURAL.Roll.Normal")}</label>
          <label><input type="radio" name="mode" value="advantage"> ${game.i18n.localize("PROCEDURAL.Roll.Advantage")}</label>
          <label><input type="radio" name="mode" value="disadvantage"> ${game.i18n.localize("PROCEDURAL.Roll.Disadvantage")}</label>
          <label>${game.i18n.localize("PROCEDURAL.Roll.SituationalModifier")}
            <input type="number" name="situationalModifier" value="0" step="1">
          </label>
        </div>
      `,
      buttons: [
        {
          action: "roll",
          label: game.i18n.localize("PROCEDURAL.Roll.Roll"),
          default: true,
          callback: (event, button) => ({
            mode: button.form.elements.mode.value,
            situationalModifier: Number(button.form.elements.situationalModifier.value) || 0
          })
        },
        { action: "cancel", label: game.i18n.localize("PROCEDURAL.Roll.Cancel") }
      ],
      rejectClose: false
    });

    if (!config) return;
    await this.actor.rollSkill(skillKey, config);
  }

  static async #onToggleHurt() {
    await this.actor.update({ "system.hurt": !this.actor.system.hurt });
  }

  static async #onCreateItem(event, target) {
    const type = target.dataset.type;
    await Item.create({ name: `New ${type}`, type }, { parent: this.actor });
  }

  static async #onEditItem(event, target) {
    const itemId = target.closest("[data-item-id]").dataset.itemId;
    this.actor.items.get(itemId)?.sheet.render(true);
  }

  static async #onDeleteItem(event, target) {
    const itemId = target.closest("[data-item-id]").dataset.itemId;
    await this.actor.items.get(itemId)?.delete();
  }
}
```

- [ ] **Step 2: Write `templates/actor/trope-sheet.hbs`**

```handlebars
<form class="procedural-sheet procedural-trope-sheet">
  <header class="procedural-sheet-header">
    <img class="procedural-sheet-img" src="{{actor.img}}" data-edit="img" alt="{{actor.name}}">
    <input class="procedural-sheet-name" type="text" name="name" value="{{actor.name}}">
  </header>

  <section class="procedural-stats-grid">
    <div>{{localize "PROCEDURAL.Stat.mental"}}: {{system.stats.mental}}</div>
    <div>{{localize "PROCEDURAL.Stat.physical"}}: {{system.stats.physical}}</div>
    <div>{{localize "PROCEDURAL.Stat.social"}}: {{system.stats.social}}</div>
    <div>
      {{localize "PROCEDURAL.Actor.RerunPoints"}}:
      <input type="number" name="system.rerunPoints" value="{{system.rerunPoints}}" min="0">
    </div>
    <div>
      <label>
        <input type="checkbox" data-action="toggleHurt" {{#if system.hurt}}checked{{/if}}>
        {{localize "PROCEDURAL.Actor.Hurt"}}
      </label>
    </div>
  </section>

  <section class="procedural-skills-grid">
    {{#each system.skills as |skill key|}}
      <div class="procedural-skill-row">
        <button type="button" data-action="rollSkill" data-skill="{{key}}">
          {{localize (concat "PROCEDURAL.Skill." key)}}
        </button>
        <input type="number" name="system.skills.{{key}}.value" value="{{skill.value}}" min="0">
      </div>
    {{/each}}
  </section>

  <section class="procedural-text-fields">
    <label>{{localize "PROCEDURAL.Actor.Qualities"}}
      <input type="text" name="system.qualities" value="{{system.qualities}}">
    </label>
    <label>{{localize "PROCEDURAL.Actor.Quirks"}}
      <input type="text" name="system.quirks" value="{{system.quirks}}">
    </label>
    <label>{{localize "PROCEDURAL.Actor.BStory"}}
      <input type="text" name="system.bStory" value="{{system.bStory}}">
    </label>
    <label>{{localize "PROCEDURAL.Actor.HQ"}}
      <input type="text" name="system.hq" value="{{system.hq}}">
    </label>
    <label>{{localize "PROCEDURAL.Actor.AgencyName"}}
      <input type="text" name="system.agencyName" value="{{system.agencyName}}">
    </label>
    <label>{{localize "PROCEDURAL.Actor.DeskItem"}}
      <input type="text" name="system.deskItem" value="{{system.deskItem}}">
    </label>
  </section>

  <section class="procedural-items">
    <h3>{{localize "TYPES.Item.trope"}}
      <button type="button" data-action="createItem" data-type="trope">+</button>
    </h3>
    <ul>
      {{#each items.trope as |item|}}
        <li data-item-id="{{item.id}}">
          {{item.name}}
          <button type="button" data-action="editItem">✎</button>
          <button type="button" data-action="deleteItem">✕</button>
        </li>
      {{/each}}
    </ul>

    <h3>{{localize "TYPES.Item.talent"}}
      <button type="button" data-action="createItem" data-type="talent">+</button>
    </h3>
    <ul>
      {{#each items.talent as |item|}}
        <li data-item-id="{{item.id}}">
          {{item.name}}
          <button type="button" data-action="editItem">✎</button>
          <button type="button" data-action="deleteItem">✕</button>
        </li>
      {{/each}}
    </ul>

    <h3>{{localize "TYPES.Item.equipment"}}
      <button type="button" data-action="createItem" data-type="equipment">+</button>
    </h3>
    <ul>
      {{#each items.equipment as |item|}}
        <li data-item-id="{{item.id}}">
          {{item.name}}
          <button type="button" data-action="editItem">✎</button>
          <button type="button" data-action="deleteItem">✕</button>
        </li>
      {{/each}}
    </ul>
  </section>

  <section class="procedural-biography">
    {{editor system.biography target="system.biography" button=true}}
  </section>
</form>
```

- [ ] **Step 3: Register the sheet in `module/procedural.mjs`**

Add the import at the top:

```js
import ProceduralTropeActorSheet from "./sheets/actor-trope-sheet.mjs";
```

Add to the end of the `Hooks.once("init", ...)` callback:

```js
  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("procedural", ProceduralTropeActorSheet, {
    types: ["trope"],
    makeDefault: true,
    label: "PROCEDURAL.SheetTrope"
  });
```

- [ ] **Step 4: Verify syntax**

```bash
node --check module/sheets/actor-trope-sheet.mjs
node --check module/procedural.mjs
```
Expected: no output for both

- [ ] **Step 5: Commit**

```bash
git add module/sheets/actor-trope-sheet.mjs templates/actor/trope-sheet.hbs module/procedural.mjs
git commit -m "feat: add Trope actor sheet with skill rolling and item management"
```

---

### Task 9: Actor NPC sheet

**Files:**
- Create: `module/sheets/actor-npc-sheet.mjs`
- Create: `templates/actor/npc-sheet.hbs`
- Modify: `module/procedural.mjs`

- [ ] **Step 1: Write `module/sheets/actor-npc-sheet.mjs`**

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

  static PARTS = {
    form: { template: "systems/procedural/templates/actor/npc-sheet.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.system = this.actor.system;
    context.items = {
      trope: this.actor.items.filter(i => i.type === "trope"),
      talent: this.actor.items.filter(i => i.type === "talent")
    };
    return context;
  }

  static async #onCreateItem(event, target) {
    const type = target.dataset.type;
    await Item.create({ name: `New ${type}`, type }, { parent: this.actor });
  }

  static async #onEditItem(event, target) {
    const itemId = target.closest("[data-item-id]").dataset.itemId;
    this.actor.items.get(itemId)?.sheet.render(true);
  }

  static async #onDeleteItem(event, target) {
    const itemId = target.closest("[data-item-id]").dataset.itemId;
    await this.actor.items.get(itemId)?.delete();
  }
}
```

- [ ] **Step 2: Write `templates/actor/npc-sheet.hbs`**

```handlebars
<form class="procedural-sheet procedural-npc-sheet">
  <header class="procedural-sheet-header">
    <img class="procedural-sheet-img" src="{{actor.img}}" data-edit="img" alt="{{actor.name}}">
    <input class="procedural-sheet-name" type="text" name="name" value="{{actor.name}}">
  </header>

  <section class="procedural-skills-grid">
    {{#each system.skills as |skill key|}}
      <div class="procedural-skill-row">
        <span>{{localize (concat "PROCEDURAL.Skill." key)}}</span>
        <input type="number" name="system.skills.{{key}}.value" value="{{skill.value}}" min="0">
      </div>
    {{/each}}
  </section>

  <section class="procedural-items">
    <h3>{{localize "TYPES.Item.trope"}}
      <button type="button" data-action="createItem" data-type="trope">+</button>
    </h3>
    <ul>
      {{#each items.trope as |item|}}
        <li data-item-id="{{item.id}}">
          {{item.name}}
          <button type="button" data-action="editItem">✎</button>
          <button type="button" data-action="deleteItem">✕</button>
        </li>
      {{/each}}
    </ul>

    <h3>{{localize "TYPES.Item.talent"}}
      <button type="button" data-action="createItem" data-type="talent">+</button>
    </h3>
    <ul>
      {{#each items.talent as |item|}}
        <li data-item-id="{{item.id}}">
          {{item.name}}
          <button type="button" data-action="editItem">✎</button>
          <button type="button" data-action="deleteItem">✕</button>
        </li>
      {{/each}}
    </ul>
  </section>
</form>
```

- [ ] **Step 3: Register the sheet in `module/procedural.mjs`**

Add the import at the top:

```js
import ProceduralNpcActorSheet from "./sheets/actor-npc-sheet.mjs";
```

Add after the Trope sheet registration inside `Hooks.once("init", ...)`:

```js
  Actors.registerSheet("procedural", ProceduralNpcActorSheet, {
    types: ["npc"],
    makeDefault: true,
    label: "PROCEDURAL.SheetNpc"
  });
```

- [ ] **Step 4: Verify syntax**

```bash
node --check module/sheets/actor-npc-sheet.mjs
node --check module/procedural.mjs
```
Expected: no output for both

- [ ] **Step 5: Commit**

```bash
git add module/sheets/actor-npc-sheet.mjs templates/actor/npc-sheet.hbs module/procedural.mjs
git commit -m "feat: add NPC actor sheet"
```

---

### Task 10: Item sheets (trope, talent, equipment)

**Files:**
- Create: `module/sheets/item-sheet.mjs`
- Create: `templates/item/trope-sheet.hbs`
- Create: `templates/item/talent-sheet.hbs`
- Create: `templates/item/equipment-sheet.hbs`
- Modify: `module/procedural.mjs`

- [ ] **Step 1: Write `module/sheets/item-sheet.mjs`**

```js
const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

class ProceduralItemSheetBase extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["procedural", "sheet", "item"],
    position: { width: 480, height: 420 },
    window: { resizable: true }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.system = this.item.system;
    return context;
  }
}

export class ProceduralTropeItemSheet extends ProceduralItemSheetBase {
  static PARTS = {
    form: { template: "systems/procedural/templates/item/trope-sheet.hbs" }
  };
}

export class ProceduralTalentItemSheet extends ProceduralItemSheetBase {
  static PARTS = {
    form: { template: "systems/procedural/templates/item/talent-sheet.hbs" }
  };
}

export class ProceduralEquipmentItemSheet extends ProceduralItemSheetBase {
  static PARTS = {
    form: { template: "systems/procedural/templates/item/equipment-sheet.hbs" }
  };
}
```

- [ ] **Step 2: Write `templates/item/trope-sheet.hbs`**

```handlebars
<form class="procedural-sheet procedural-item-sheet">
  <header class="procedural-sheet-header">
    <img class="procedural-sheet-img" src="{{item.img}}" data-edit="img" alt="{{item.name}}">
    <input class="procedural-sheet-name" type="text" name="name" value="{{item.name}}">
  </header>

  <label>{{localize "PROCEDURAL.Item.StatBlock"}}
    <input type="number" name="system.statBlock.mental" value="{{system.statBlock.mental}}" min="0">
    <input type="number" name="system.statBlock.physical" value="{{system.statBlock.physical}}" min="0">
    <input type="number" name="system.statBlock.social" value="{{system.statBlock.social}}" min="0">
  </label>

  <label>{{localize "PROCEDURAL.Item.StatNotes"}}
    <input type="text" name="system.statNotes" value="{{system.statNotes}}">
  </label>

  <label>{{localize "PROCEDURAL.Item.TalentName"}}
    <input type="text" name="system.talentName" value="{{system.talentName}}">
  </label>

  <label>{{localize "PROCEDURAL.Item.TalentDescription"}}
    <textarea name="system.talentDescription">{{system.talentDescription}}</textarea>
  </label>

  <label>{{localize "PROCEDURAL.Item.UsesPerAct"}}
    <input type="number" name="system.talentUsesPerAct" value="{{system.talentUsesPerAct}}" min="0">
  </label>

  <label>
    <input type="checkbox" name="system.used" {{#if system.used}}checked{{/if}}>
    {{localize "PROCEDURAL.Item.Used"}}
  </label>
</form>
```

- [ ] **Step 3: Write `templates/item/talent-sheet.hbs`**

```handlebars
<form class="procedural-sheet procedural-item-sheet">
  <header class="procedural-sheet-header">
    <img class="procedural-sheet-img" src="{{item.img}}" data-edit="img" alt="{{item.name}}">
    <input class="procedural-sheet-name" type="text" name="name" value="{{item.name}}">
  </header>

  <label>{{localize "PROCEDURAL.Item.Description"}}
    <textarea name="system.description">{{system.description}}</textarea>
  </label>

  <label>{{localize "PROCEDURAL.Item.UsesPerAct"}}
    <input type="number" name="system.usesPerAct" value="{{system.usesPerAct}}" min="0">
  </label>

  <label>
    <input type="checkbox" name="system.used" {{#if system.used}}checked{{/if}}>
    {{localize "PROCEDURAL.Item.Used"}}
  </label>
</form>
```

- [ ] **Step 4: Write `templates/item/equipment-sheet.hbs`**

```handlebars
<form class="procedural-sheet procedural-item-sheet">
  <header class="procedural-sheet-header">
    <img class="procedural-sheet-img" src="{{item.img}}" data-edit="img" alt="{{item.name}}">
    <input class="procedural-sheet-name" type="text" name="name" value="{{item.name}}">
  </header>

  <label>{{localize "PROCEDURAL.Item.Description"}}
    <textarea name="system.description">{{system.description}}</textarea>
  </label>
</form>
```

- [ ] **Step 5: Register the sheets in `module/procedural.mjs`**

Add the import at the top:

```js
import {
  ProceduralTropeItemSheet,
  ProceduralTalentItemSheet,
  ProceduralEquipmentItemSheet
} from "./sheets/item-sheet.mjs";
```

Add to the end of the `Hooks.once("init", ...)` callback:

```js
  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("procedural", ProceduralTropeItemSheet, { types: ["trope"], makeDefault: true });
  Items.registerSheet("procedural", ProceduralTalentItemSheet, { types: ["talent"], makeDefault: true });
  Items.registerSheet("procedural", ProceduralEquipmentItemSheet, { types: ["equipment"], makeDefault: true });
```

- [ ] **Step 6: Verify syntax**

```bash
node --check module/sheets/item-sheet.mjs
node --check module/procedural.mjs
```
Expected: no output for both

- [ ] **Step 7: Commit**

```bash
git add module/sheets/item-sheet.mjs templates/item/*.hbs module/procedural.mjs
git commit -m "feat: add Item sheets for trope, talent, and equipment"
```

---

### Task 11: Localization

**Files:**
- Create: `lang/en.json`

- [ ] **Step 1: Write `lang/en.json`**

```json
{
  "PROCEDURAL": {
    "SheetTrope": "Trope Sheet",
    "SheetNpc": "NPC Sheet",
    "Skill": {
      "tech": "Tech",
      "lab": "Lab",
      "investigation": "Investigation",
      "violence": "Violence",
      "reflexes": "Reflexes",
      "coordination": "Coordination",
      "cool": "Cool",
      "intuition": "Intuition",
      "deception": "Deception"
    },
    "Stat": {
      "mental": "Mental",
      "physical": "Physical",
      "social": "Social"
    },
    "Actor": {
      "RerunPoints": "Rerun Points",
      "Hurt": "Hurt",
      "Qualities": "Qualities",
      "Quirks": "Quirks",
      "BStory": "B-Story",
      "HQ": "HQ",
      "AgencyName": "Agency Name",
      "DeskItem": "Desk Item"
    },
    "Item": {
      "StatBlock": "Suggested Stats (Mental / Physical / Social)",
      "StatNotes": "Stat Notes",
      "TalentName": "Talent Name",
      "TalentDescription": "Talent Description",
      "UsesPerAct": "Uses Per Act (blank = no limit)",
      "Description": "Description",
      "Used": "Used This Act"
    },
    "Roll": {
      "DialogTitleSuffix": "Roll",
      "Normal": "Normal",
      "Advantage": "Advantage",
      "Disadvantage": "Disadvantage",
      "SituationalModifier": "Situational Modifier",
      "Roll": "Roll",
      "Cancel": "Cancel",
      "Reroll": "Spend Rerun Point & Reroll"
    }
  },
  "TYPES": {
    "Item": {
      "trope": "Trope",
      "talent": "Talent",
      "equipment": "Equipment"
    }
  }
}
```

- [ ] **Step 2: Verify valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('lang/en.json', 'utf8')); console.log('valid')"
```
Expected: `valid`

- [ ] **Step 3: Commit**

```bash
git add lang/en.json
git commit -m "feat: add English localization strings"
```

---

### Task 12: Stylesheet

**Files:**
- Create: `css/procedural.css`

- [ ] **Step 1: Write `css/procedural.css`**

```css
.procedural-sheet {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.5rem;
}

.procedural-sheet-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.procedural-sheet-img {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border: 1px solid #666;
}

.procedural-sheet-name {
  flex: 1;
  font-size: 1.25rem;
  font-weight: bold;
}

.procedural-stats-grid,
.procedural-skills-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}

.procedural-skill-row {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.procedural-skill-row button {
  flex: 1;
  text-align: left;
}

.procedural-skill-row input {
  width: 3rem;
}

.procedural-text-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.procedural-items ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.procedural-items li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.15rem 0;
}

.procedural-items li > :first-child {
  flex: 1;
}

.procedural-roll-card {
  border: 1px solid #666;
  border-radius: 4px;
  padding: 0.5rem;
}

.procedural-roll-card-header {
  font-size: 1rem;
  margin-bottom: 0.25rem;
}

.procedural-roll-card-tier {
  font-weight: bold;
  margin-top: 0.25rem;
}

.procedural-crit-tag {
  color: #b00;
  font-weight: bold;
  margin-left: 0.5rem;
}

.procedural-tier-critical-failure { color: #b00000; }
.procedural-tier-failure { color: #a05a00; }
.procedural-tier-so-so { color: #7a7a00; }
.procedural-tier-success { color: #2a7a00; }
.procedural-tier-success-effect { color: #0a6b3d; font-weight: bold; }

.procedural-reroll-button {
  margin-top: 0.5rem;
}

.procedural-roll-dialog {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
```

- [ ] **Step 2: Commit**

```bash
git add css/procedural.css
git commit -m "feat: add functional stylesheet for sheets and chat cards"
```

---

### Task 13: Seed content JSON (11 Tropes, 18 second Talents)

**Files:**
- Create: `data/tropes.json`
- Create: `data/second-talents.json`

- [ ] **Step 1: Write `data/tropes.json`**

Transcribed from `Rulebook/source_rulebook.md` lines 400-514.

```json
[
  {
    "name": "Rookie",
    "img": "icons/svg/mystery-man.svg",
    "system": {
      "statBlock": { "mental": 1, "physical": 1, "social": 1 },
      "statNotes": "",
      "talentName": "Gifted",
      "talentDescription": "Choose any stat and add +3 to it during character creation.",
      "talentUsesPerAct": 1
    }
  },
  {
    "name": "Coroner",
    "img": "icons/svg/mystery-man.svg",
    "system": {
      "statBlock": { "mental": 5, "physical": 1, "social": 0 },
      "statNotes": "At least 3 in Lab",
      "talentName": "Pathologist",
      "talentDescription": "You can perform autopsies and have advantage on skill rolls to perform them. You also have advantage on Investigation rolls involving any dead bodies.",
      "talentUsesPerAct": null
    }
  },
  {
    "name": "Hard-boiled",
    "img": "icons/svg/mystery-man.svg",
    "system": {
      "statBlock": { "mental": 2, "physical": 3, "social": 1 },
      "statNotes": "",
      "talentName": "Quick on the Draw",
      "talentDescription": "You have advantage on a Violence roll the first time you draw your gun in an act.",
      "talentUsesPerAct": 1
    }
  },
  {
    "name": "Shot-caller",
    "img": "icons/svg/mystery-man.svg",
    "system": {
      "statBlock": { "mental": 2, "physical": 2, "social": 2 },
      "statNotes": "",
      "talentName": "Experienced",
      "talentDescription": "You may re-roll a critical fail.",
      "talentUsesPerAct": 1
    }
  },
  {
    "name": "Techie",
    "img": "icons/svg/mystery-man.svg",
    "system": {
      "statBlock": { "mental": 5, "physical": 0, "social": 1 },
      "statNotes": "At least 3 in Tech",
      "talentName": "Hack Attack",
      "talentDescription": "You have advantage on a Tech roll. You also know how to hack systems, although if you don't get an outright success someone will know you were in there.",
      "talentUsesPerAct": 1
    }
  },
  {
    "name": "Lab Tech",
    "img": "icons/svg/mystery-man.svg",
    "system": {
      "statBlock": { "mental": 5, "physical": 0, "social": 1 },
      "statNotes": "At least 3 in Lab",
      "talentName": "Enhance!",
      "talentDescription": "You may add +3 to a single roll analyzing a piece of evidence, +2 to another piece of evidence, and +1 to another piece of evidence over the course of the episode. All three options may be used in the same scene with different pieces of evidence.",
      "talentUsesPerAct": null
    }
  },
  {
    "name": "Streetwise",
    "img": "icons/svg/mystery-man.svg",
    "system": {
      "statBlock": { "mental": 1, "physical": 2, "social": 3 },
      "statNotes": "",
      "talentName": "Connected",
      "talentDescription": "You have a criminal or CI (Confidential Informant) who owes you a big favor. This NPC is treated like an ally NPC for one scene in the game, with a +3 roll bonus.",
      "talentUsesPerAct": 1
    }
  },
  {
    "name": "Ex-Spook",
    "img": "icons/svg/mystery-man.svg",
    "system": {
      "statBlock": { "mental": 1, "physical": 4, "social": 1 },
      "statNotes": "",
      "talentName": "Shadow in the Dark",
      "talentDescription": "You have advantage +1 on a Coordination roll where stealth is involved.",
      "talentUsesPerAct": 1
    }
  },
  {
    "name": "Profiler",
    "img": "icons/svg/mystery-man.svg",
    "system": {
      "statBlock": { "mental": 2, "physical": 1, "social": 3 },
      "statNotes": "",
      "talentName": "Inside Your Mind",
      "talentDescription": "You have advantage on an Intuition roll.",
      "talentUsesPerAct": 1
    }
  },
  {
    "name": "Legal Liaison",
    "img": "icons/svg/mystery-man.svg",
    "system": {
      "statBlock": { "mental": 3, "physical": 0, "social": 3 },
      "statNotes": "",
      "talentName": "Legalese",
      "talentDescription": "You have advantage on social rolls when dealing with judges or lawyers.",
      "talentUsesPerAct": 1
    }
  },
  {
    "name": "Shades",
    "img": "icons/svg/mystery-man.svg",
    "system": {
      "statBlock": { "mental": 0, "physical": 3, "social": 3 },
      "statNotes": "",
      "talentName": "Irresistible",
      "talentDescription": "You may add +3 to a Cool roll when trying to win someone over.",
      "talentUsesPerAct": 1
    }
  }
]
```

- [ ] **Step 2: Write `data/second-talents.json`**

Transcribed from `Rulebook/source_rulebook.md` lines 852-953.

```json
[
  {
    "name": "Sentinel",
    "img": "icons/svg/mystery-man.svg",
    "system": {
      "description": "If another agent in a scene is hurt, gain +2 on your skill rolls in that scene.",
      "usesPerAct": 1
    }
  },
  {
    "name": "Drama Queen",
    "img": "icons/svg/mystery-man.svg",
    "system": {
      "description": "You have advantage on a skill roll while working on your B-story or Flashback.",
      "usesPerAct": 1
    }
  },
  {
    "name": "Jack of All Trades",
    "img": "icons/svg/mystery-man.svg",
    "system": {
      "description": "Your presence in a scene always counts for the Partner Bonus, even if you don't have a modifier in the skill being used.",
      "usesPerAct": 1
    }
  },
  {
    "name": "Clutch Performer",
    "img": "icons/svg/mystery-man.svg",
    "system": {
      "description": "If you have an unspent Rerun Points in the Arrest Phase, add +2 to all your rolls.",
      "usesPerAct": 1
    }
  },
  {
    "name": "Gambler",
    "img": "icons/svg/mystery-man.svg",
    "system": {
      "description": "You may use this Talent when spending a Rerun Point to re-roll. If you get an outright success (10+) on the re-roll, you don't lose the Rerun Point. If you do not get an outright success, you do lose it and the roll is automatically a critical fail.",
      "usesPerAct": 1
    }
  },
  {
    "name": "Hard case",
    "img": "icons/svg/mystery-man.svg",
    "system": {
      "description": "You're great at playing the bad cop. Gain advantage +1 on a Cool or Deception roll when threatening consequences to someone.",
      "usesPerAct": 1
    }
  },
  {
    "name": "Weekend Warrior",
    "img": "icons/svg/mystery-man.svg",
    "system": {
      "description": "You may add +2 to a Violence roll where shooting is involved if you have no Violence modifier.",
      "usesPerAct": 1
    }
  },
  {
    "name": "Undercover",
    "img": "icons/svg/mystery-man.svg",
    "system": {
      "description": "You're an expert chameleon in the criminal underworld. You may pose as someone else and gain advantage on your first Deception roll for it.",
      "usesPerAct": 1
    }
  },
  {
    "name": "Expect Results",
    "img": "icons/svg/mystery-man.svg",
    "system": {
      "description": "You may spend a Rerun Point before a skill roll to automatically get a so-so result.",
      "usesPerAct": 1
    }
  },
  {
    "name": "Martial Artist",
    "img": "icons/svg/mystery-man.svg",
    "system": {
      "description": "Choose a martial art during character creation. You have advantage on Violence skill rolls when using your martial art.",
      "usesPerAct": 1
    }
  },
  {
    "name": "Wheelman",
    "img": "icons/svg/mystery-man.svg",
    "system": {
      "description": "You have advantage on all Coordination skill rolls while driving.",
      "usesPerAct": null
    }
  },
  {
    "name": "Good Cop",
    "img": "icons/svg/mystery-man.svg",
    "system": {
      "description": "If you run out of questions during an interrogation, you may spend 1 Rerun Point to get 1d6 more questions.",
      "usesPerAct": 1
    }
  },
  {
    "name": "Field Medic",
    "img": "icons/svg/mystery-man.svg",
    "system": {
      "description": "You may make a Coordination roll to attempt to treat anyone's hurt status. On an outright success or better, they're patched up and good to go!",
      "usesPerAct": 1
    }
  },
  {
    "name": "Ace Interrogator",
    "img": "icons/svg/mystery-man.svg",
    "system": {
      "description": "You know the secret number of questions available to the players if you are present at an interrogation.",
      "usesPerAct": 1
    }
  },
  {
    "name": "Loose Cannon",
    "img": "icons/svg/mystery-man.svg",
    "system": {
      "description": "You can add +2 to a Violence roll as long as another player cautioned you against that very action.",
      "usesPerAct": 1
    }
  },
  {
    "name": "Olfactory Edge",
    "img": "icons/svg/mystery-man.svg",
    "system": {
      "description": "You have advantage on any Investigation roll that involves your sense of smell.",
      "usesPerAct": null
    }
  },
  {
    "name": "Human Lie Detector",
    "img": "icons/svg/mystery-man.svg",
    "system": {
      "description": "If you get an outright success or better on an Intuition roll to catch someone lying, you also see their \"tell\" which you can see if they lie to you in the future.",
      "usesPerAct": 1
    }
  },
  {
    "name": "Fan Favorite",
    "img": "icons/svg/mystery-man.svg",
    "system": {
      "description": "If you're about to become hurt, you may roll 1d6. If you rolled a 1 or 2, prevent the hurt status.",
      "usesPerAct": 1
    }
  }
]
```

- [ ] **Step 3: Verify valid JSON and correct counts**

```bash
node -e "const d = JSON.parse(require('fs').readFileSync('data/tropes.json', 'utf8')); console.log('tropes:', d.length)"
node -e "const d = JSON.parse(require('fs').readFileSync('data/second-talents.json', 'utf8')); console.log('talents:', d.length)"
```
Expected: `tropes: 11` and `talents: 18`

- [ ] **Step 4: Commit**

```bash
git add data/tropes.json data/second-talents.json
git commit -m "feat: add seed content for 11 Tropes and 18 second Talents"
```

---

### Task 14: Compendium auto-seeding

**Files:**
- Create: `module/helpers/seed-compendiums.mjs`

- [ ] **Step 1: Write `module/helpers/seed-compendiums.mjs`**

```js
const SEED_PACKS = [
  {
    label: "Procedural: Tropes",
    name: "procedural-tropes",
    type: "trope",
    path: "systems/procedural/data/tropes.json"
  },
  {
    label: "Procedural: Second Talents",
    name: "procedural-second-talents",
    type: "talent",
    path: "systems/procedural/data/second-talents.json"
  }
];

export async function seedCompendiums() {
  if (!game.user.isGM) return;

  for (const pack of SEED_PACKS) {
    const existing = game.packs.get(`world.${pack.name}`);
    if (existing) continue;

    const response = await fetch(pack.path);
    const source = await response.json();

    const collection = await CompendiumCollection.createCompendium({
      type: "Item",
      label: pack.label,
      name: pack.name,
      package: "world"
    });

    const items = source.map(entry => ({
      name: entry.name,
      type: pack.type,
      img: entry.img,
      system: entry.system
    }));

    await Item.createDocuments(items, { pack: collection.collection });
  }
}
```

- [ ] **Step 2: Verify syntax**

```bash
node --check module/helpers/seed-compendiums.mjs
```
Expected: no output

- [ ] **Step 3: Verify the import in `module/procedural.mjs` now resolves**

`module/procedural.mjs` already imports `seedCompendiums` from this file (Task 7, Step 1) — confirm the path matches: `./helpers/seed-compendiums.mjs`.

```bash
grep "seed-compendiums" module/procedural.mjs
```
Expected: one line showing the import

- [ ] **Step 4: Commit**

```bash
git add module/helpers/seed-compendiums.mjs
git commit -m "feat: auto-seed Trope and second-Talent compendiums on world ready"
```

---

### Task 15: Manual smoke test

**Files:** none (verification only, using the running Foundry v14 client)

- [ ] **Step 1: Run the automated dice-rules test suite one more time as a final regression check**

```bash
npm test
```
Expected: all tests pass

- [ ] **Step 2: Install the system into Foundry's user data directory**

Find your Foundry user data path (varies by OS — check Foundry's Configuration screen if unsure), then symlink this repo into `Data/systems/procedural`:

```bash
ln -s /Users/matt/GitHub/procedural-foundryvtt "<FoundryUserData>/Data/systems/procedural"
```

- [ ] **Step 3: Launch Foundry v14 and confirm the system is installed**

Open the Foundry desktop/browser client. On the Setup screen, confirm "PROCEDURAL!" appears in the systems list.

- [ ] **Step 4: Create a test world**

Create a new world selecting the PROCEDURAL! system, then launch into it.

- [ ] **Step 5: Confirm compendium auto-seeding**

Open the Compendium Packs sidebar tab. Confirm "Procedural: Tropes" (11 items) and "Procedural: Second Talents" (18 items) both appear automatically.

- [ ] **Step 6: Create a Trope actor and configure it**

Create a new Actor of type `trope`. Drag the "Rookie" item from the Tropes compendium onto the actor. Manually set a few skill values (e.g. `investigation: 2`, `cool: 1`). Drag a second Talent (e.g. "Wheelman") and create one Equipment item onto the actor.

- [ ] **Step 7: Roll a skill Normal**

Click the Investigation skill roll button, choose Normal, submit with situational modifier 0. Confirm a chat card appears showing both dice, the raw total, the modifier breakdown, the banded tier label, and the correct total.

- [ ] **Step 8: Roll a skill with Advantage and with Disadvantage**

Repeat, selecting Advantage once and Disadvantage once. Confirm the chat card and behavior differ appropriately (you won't be able to directly verify the RNG outcome, but confirm no errors occur and the card renders).

- [ ] **Step 9: Trigger and confirm Critical Failure / Critical Success handling**

Roll the same skill repeatedly (10-20 times) until a raw double-1 and a raw double-6 occur. Confirm the double-1 roll shows "Critical Failure" with no modifiers added, and the double-6 roll shows the "CRIT!" tag alongside "Outright Success + Positive Effect".

- [ ] **Step 10: Toggle Hurt and confirm its effects**

Check the Hurt box on the actor sheet. Roll a Physical skill (e.g. Violence) and confirm it is forced to Disadvantage with 0 modifiers applied even if Normal or Advantage was selected in the dialog. Roll a non-Physical skill and confirm modifiers are still suppressed to 0, but the requested mode (Normal/Advantage) is respected.

- [ ] **Step 11: Spend a Rerun Point via the chat card**

With Rerun Points > 0, click "Spend Rerun Point & Reroll" on a roll's chat card. Confirm the actor's Rerun Points count decrements by 1 on the sheet, and a new chat card appears with a fresh roll.

- [ ] **Step 12: Create and verify an NPC actor**

Create a new Actor of type `npc`. Confirm all 9 skills default to `1`. Drag a Trope or Talent item onto it and confirm it appears in the item list.

- [ ] **Step 13: Record results**

If every step above passes, the v1 system is confirmed working end-to-end. If any step fails, note the exact failure (console error text, unexpected UI state) — this will likely point to one of the version-sensitive APIs flagged in the "Before you start" section at the top of this plan, and the corresponding file should be patched against the current `https://foundryvtt.com/api/` docs.

- [ ] **Step 14: Final commit (if any fixes were needed during smoke testing)**

```bash
git add -A
git commit -m "fix: address issues found during v14 manual smoke test"
```
