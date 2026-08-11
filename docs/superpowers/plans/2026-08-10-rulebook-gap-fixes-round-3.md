# Rulebook Gap Fixes, Round 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the two remaining rulebook mechanics with zero code trace: Rerun Point pooling for a new lead, and the Epilogue evidence tie-break roll — both scoped entirely to the Case Tracker.

**Architecture:** Two new pure/testable helpers (`lead-pool.mjs`, `evidence-tally.mjs`) plus two new `game.settings`-backed fields on `CaseTrackerData`, two new actions on `CaseTrackerApplication`, and matching template sections — following the exact conventions already established by the existing `rollForDrama` action (roll → persist via `setCaseTracker` → chat message → re-render) and the existing `interludes`/`drama` hidden-field round-trip patterns in `case-tracker.hbs`.

**Tech Stack:** Foundry VTT ApplicationV2/HandlebarsApplicationMixin, Foundry DataModel schema fields, Handlebars templates, vanilla JS (`.mjs`), `node --test` for unit tests.

## Global Constraints

- No Foundry-runtime test harness exists in this repo — only pure helpers get `.test.mjs` files; app/sheet/template wiring is verified by hand (matches all three prior gap-fix rounds).
- `X` (Rerun Point pool cost) is `game.actors.filter(a => a.type === "trope").length` — no new "human player count" setting.
- No clue-text roll table — the pooling action only spends points, flags the act, and announces success in chat; the GM adds the new clue as a normal Evidence row.
- Pledged Rerun Point contributions must sum to **exactly** `X`, not merely `>= X`.
- The evidence tally counts only `good`/`bad` statuses (ignores `unknown`); a 0-0 tally is not "tied."
- Every new `setCaseTracker`/`ChatMessage.create` write follows the existing try/catch + `console.error("PROCEDURAL | ...")` + `ui.notifications?.error(...)` pattern already used by `rollForDrama`.

---

## File Structure

- Create `module/helpers/lead-pool.mjs` — pure `isValidPool(contributions, cost)`.
- Create `module/helpers/lead-pool.test.mjs` — unit tests for the above.
- Create `module/helpers/evidence-tally.mjs` — pure `tallyEvidence(evidence)`.
- Create `module/helpers/evidence-tally.test.mjs` — unit tests for the above.
- Modify `module/data/case-tracker.mjs` — add `leadsPooled`, `epilogueTiebreakRoll`, `epilogueTiebreakOutcome` schema fields.
- Modify `module/apps/case-tracker.mjs` — add `poolRerunPoints` and `rollEpilogueTiebreak` actions, extend `#formToData`/`_prepareContext`.
- Modify `templates/apps/case-tracker.hbs` — add the pooling section and the evidence tally/tie-break section.
- Modify `lang/en.json` — add the new `PROCEDURAL.CaseTracker.*` keys.
- Modify `system.json`, `package.json` — version bump.

---

### Task 1: `lead-pool.mjs` pure helper

**Files:**
- Create: `module/helpers/lead-pool.mjs`
- Test: `module/helpers/lead-pool.test.mjs`

**Interfaces:**
- Produces: `isValidPool(contributions: Record<string, number>, cost: number): boolean` — used by Task 4.

- [ ] **Step 1: Write the failing tests**

```js
// module/helpers/lead-pool.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidPool } from "./lead-pool.mjs";

test("isValidPool is false for empty contributions", () => {
  assert.equal(isValidPool({}, 3), false);
});

test("isValidPool is true when contributions sum to exactly cost", () => {
  assert.equal(isValidPool({ a1: 2, a2: 1 }, 3), true);
});

test("isValidPool is false when contributions sum to less than cost", () => {
  assert.equal(isValidPool({ a1: 1, a2: 1 }, 3), false);
});

test("isValidPool is false when contributions sum to more than cost", () => {
  assert.equal(isValidPool({ a1: 2, a2: 2 }, 3), false);
});

test("isValidPool is false when cost is zero", () => {
  assert.equal(isValidPool({ a1: 0 }, 0), false);
});

test("isValidPool treats non-numeric or missing contribution values as zero", () => {
  assert.equal(isValidPool({ a1: 3, a2: undefined, a3: "not a number" }, 3), true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module './lead-pool.mjs'` (or similar import error).

- [ ] **Step 3: Write the implementation**

```js
// module/helpers/lead-pool.mjs
/**
 * @param {Record<string, number>} contributions - actorId -> Rerun Points pledged
 * @param {number} cost - Rerun Points required (number of human players)
 * @returns {boolean} true if the pledged total exactly matches cost
 */
export function isValidPool(contributions, cost) {
  if (cost <= 0) return false;
  const total = Object.values(contributions).reduce((sum, n) => sum + (Number(n) || 0), 0);
  return total === cost;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, all 6 `lead-pool` tests green.

- [ ] **Step 5: Commit**

```bash
git add module/helpers/lead-pool.mjs module/helpers/lead-pool.test.mjs
git commit -m "feat: add isValidPool helper for Rerun Point lead pooling"
```

---

### Task 2: `evidence-tally.mjs` pure helper

**Files:**
- Create: `module/helpers/evidence-tally.mjs`
- Test: `module/helpers/evidence-tally.test.mjs`

**Interfaces:**
- Produces: `tallyEvidence(evidence: Array<{status: string}>): {good: number, bad: number, tied: boolean}` — used by Task 5.

- [ ] **Step 1: Write the failing tests**

```js
// module/helpers/evidence-tally.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { tallyEvidence } from "./evidence-tally.mjs";

test("tallyEvidence returns zero counts and not tied for no evidence", () => {
  assert.deepEqual(tallyEvidence([]), { good: 0, bad: 0, tied: false });
});

test("tallyEvidence ignores unknown-status entries", () => {
  const evidence = [{ status: "unknown" }, { status: "unknown" }];
  assert.deepEqual(tallyEvidence(evidence), { good: 0, bad: 0, tied: false });
});

test("tallyEvidence is not tied when good outnumbers bad", () => {
  const evidence = [{ status: "good" }, { status: "good" }, { status: "bad" }];
  assert.deepEqual(tallyEvidence(evidence), { good: 2, bad: 1, tied: false });
});

test("tallyEvidence is not tied when bad outnumbers good", () => {
  const evidence = [{ status: "bad" }, { status: "bad" }, { status: "good" }];
  assert.deepEqual(tallyEvidence(evidence), { good: 1, bad: 2, tied: false });
});

test("tallyEvidence is tied when good and bad counts match and are non-zero", () => {
  const evidence = [{ status: "good" }, { status: "bad" }, { status: "unknown" }];
  assert.deepEqual(tallyEvidence(evidence), { good: 1, bad: 1, tied: true });
});

test("tallyEvidence is not tied for a 0-0 tally", () => {
  const evidence = [{ status: "unknown" }];
  assert.deepEqual(tallyEvidence(evidence), { good: 0, bad: 0, tied: false });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module './evidence-tally.mjs'` (or similar import error).

- [ ] **Step 3: Write the implementation**

```js
// module/helpers/evidence-tally.mjs
/**
 * @param {Array<{status: string}>} evidence
 * @returns {{good: number, bad: number, tied: boolean}}
 */
export function tallyEvidence(evidence) {
  const good = evidence.filter(e => e.status === "good").length;
  const bad = evidence.filter(e => e.status === "bad").length;
  return { good, bad, tied: good === bad && good + bad > 0 };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, all 6 `evidence-tally` tests green.

- [ ] **Step 5: Commit**

```bash
git add module/helpers/evidence-tally.mjs module/helpers/evidence-tally.test.mjs
git commit -m "feat: add tallyEvidence helper for Epilogue tie-break detection"
```

---

### Task 3: Case Tracker schema fields

**Files:**
- Modify: `module/data/case-tracker.mjs`

**Interfaces:**
- Consumes: none.
- Produces: `CaseTrackerData` schema fields `leadsPooled: boolean[]` (length 3, one per act), `epilogueTiebreakRoll: number`, `epilogueTiebreakOutcome: "" | "against" | "for"` — consumed by Task 4 and Task 5.

- [ ] **Step 1: Add the three fields to the schema**

In `module/data/case-tracker.mjs`, add after the existing `drama` field (before `evidence`):

```js
      drama: new StringField({ initial: "" }),
      leadsPooled: new ArrayField(new BooleanField({ initial: false }), { initial: [false, false, false] }),
      epilogueTiebreakRoll: new NumberField({ initial: 0, integer: true, min: 0, max: 6 }),
      epilogueTiebreakOutcome: new StringField({ initial: "", choices: ["", "against", "for"] }),
```

The full schema block now reads:

```js
export default class CaseTrackerData extends foundry.abstract.DataModel {
  static defineSchema() {
    const { SchemaField, StringField, NumberField, BooleanField, ArrayField } = foundry.data.fields;

    return {
      act: new NumberField({ required: true, integer: true, initial: 1 }),
      scene: new NumberField({ required: true, integer: true, initial: 1 }),
      turnOrder: new StringField({ initial: "" }),
      interludes: new ArrayField(new BooleanField({ initial: false }), { initial: [false, false, false] }),
      arrestPhaseTriggered: new BooleanField({ initial: false }),
      arrestPhaseNotes: new StringField({ initial: "" }),
      epilogueNotes: new StringField({ initial: "" }),
      drama: new StringField({ initial: "" }),
      leadsPooled: new ArrayField(new BooleanField({ initial: false }), { initial: [false, false, false] }),
      epilogueTiebreakRoll: new NumberField({ initial: 0, integer: true, min: 0, max: 6 }),
      epilogueTiebreakOutcome: new StringField({ initial: "", choices: ["", "against", "for"] }),
      evidence: new ArrayField(
        new SchemaField({
          id: new StringField({ required: true }),
          description: new StringField({ initial: "" }),
          status: new StringField({ initial: "unknown", choices: ["good", "bad", "unknown"] }),
          notes: new StringField({ initial: "" })
        }),
        { initial: [] }
      ),
      interrogations: new ArrayField(
        new SchemaField({
          id: new StringField({ required: true }),
          suspect: new StringField({ initial: "" }),
          questionsRemaining: new NumberField({ required: true, integer: true, initial: 0, min: 0 }),
          notes: new StringField({ initial: "" })
        }),
        { initial: [] }
      )
    };
  }
}
```

- [ ] **Step 2: Sanity-check the schema loads**

Run: `npm test`
Expected: PASS (this file has no dedicated test suite; this just confirms Task 1/2 tests still pass and no syntax error was introduced — Foundry itself validates the schema at runtime, which has no test harness here).

- [ ] **Step 3: Commit**

```bash
git add module/data/case-tracker.mjs
git commit -m "feat: add leadsPooled and epilogueTiebreak fields to CaseTrackerData"
```

---

### Task 4: Rerun Point pooling action + wiring

**Files:**
- Modify: `module/apps/case-tracker.mjs`
- Modify: `lang/en.json`

**Interfaces:**
- Consumes: `isValidPool` from `module/helpers/lead-pool.mjs` (Task 1); `leadsPooled` schema field (Task 3).
- Produces: `poolRerunPoints` action registered in `DEFAULT_OPTIONS.actions`; `context.leadsPooled` in `_prepareContext`; `leadsPooled` in `#formToData`'s return shape — consumed by Task 6 (template).

- [ ] **Step 1: Add the localization keys**

In `lang/en.json`, inside the `"CaseTracker"` object, add after `"RollForDrama": "Roll for Drama",`:

```json
      "PoolRerunPoints": "Pool Rerun Points for a Lead",
      "PoolRerunPointsPrompt": "Pool {cost} Rerun Points total (in any combination) to obtain a new clue from the Showrunner.",
      "PoolRerunPointsConfirm": "Pool Points",
      "PoolRerunPointsInvalid": "Pledged Rerun Points must total exactly {cost}.",
      "PoolRerunPointsAnnounce": "The players pool {cost} Rerun Points to obtain a new clue from the Showrunner!",
      "PoolRerunPointsUsed": "Already pooled for a lead this act.",
      "PoolRerunPointsNoPlayers": "There are no player characters to pool Rerun Points.",
```

- [ ] **Step 2: Import `isValidPool` and register the action**

In `module/apps/case-tracker.mjs`, update the import line:

```js
import { resolveDice, rollD6 } from "../helpers/dice-rules.mjs";
import { findTalentsToReset } from "../helpers/talent-reset.mjs";
import { findActorsToHeal } from "../helpers/hurt-reset.mjs";
import { loadGeneratorData } from "../helpers/generator-data.mjs";
import { isValidPool } from "../helpers/lead-pool.mjs";
```

Add `poolRerunPoints: CaseTrackerApplication.#onPoolRerunPoints` to the `actions` object in `DEFAULT_OPTIONS`, right after `rollForDrama: CaseTrackerApplication.#onRollForDrama`:

```js
    actions: {
      addEvidence: CaseTrackerApplication.#onAddEvidence,
      deleteEvidence: CaseTrackerApplication.#onDeleteEvidence,
      startInterrogation: CaseTrackerApplication.#onStartInterrogation,
      decrementInterrogation: CaseTrackerApplication.#onDecrementInterrogation,
      deleteInterrogation: CaseTrackerApplication.#onDeleteInterrogation,
      rollForDrama: CaseTrackerApplication.#onRollForDrama,
      poolRerunPoints: CaseTrackerApplication.#onPoolRerunPoints
    }
```

- [ ] **Step 3: Extend `_prepareContext` and `#formToData`**

In `_prepareContext`, right after `context.drama = data.drama;`, add:

```js
    context.leadsPooled = data.leadsPooled;
```

In `#formToData`, right after `drama: expanded.drama ?? "",`, add:

```js
      leadsPooled: Object.values(expanded.leadsPooled ?? {}),
```

- [ ] **Step 4: Add the `#onPoolRerunPoints` action**

Add this method right after `#onRollForDrama` in `module/apps/case-tracker.mjs`:

```js
  static async #onPoolRerunPoints() {
    const data = CaseTrackerApplication.#formToData(this.form);
    const actIndex = data.act - 1;
    if (data.leadsPooled[actIndex]) {
      ui.notifications?.warn(game.i18n.localize("PROCEDURAL.CaseTracker.PoolRerunPointsUsed"));
      return;
    }

    const tropeActors = game.actors.filter(actor => actor.type === "trope");
    const cost = tropeActors.length;
    if (cost === 0) {
      ui.notifications?.warn(game.i18n.localize("PROCEDURAL.CaseTracker.PoolRerunPointsNoPlayers"));
      return;
    }

    const content = `
      <p>${game.i18n.format("PROCEDURAL.CaseTracker.PoolRerunPointsPrompt", { cost })}</p>
      <ul class="procedural-case-tracker-pool-list">
        ${tropeActors.map(actor => `
          <li>
            <label>${actor.name} (${actor.system.rerunPoints})
              <input type="number" name="contribution-${actor.id}" value="0" min="0" max="${actor.system.rerunPoints}" step="1">
            </label>
          </li>
        `).join("")}
      </ul>
    `;

    const contributions = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize("PROCEDURAL.CaseTracker.PoolRerunPoints") },
      content,
      buttons: [
        {
          action: "confirm",
          label: game.i18n.localize("PROCEDURAL.CaseTracker.PoolRerunPointsConfirm"),
          default: true,
          callback: (event, button) => Object.fromEntries(
            tropeActors.map(actor => [actor.id, Number(button.form.elements[`contribution-${actor.id}`].value) || 0])
          )
        },
        { action: "cancel", label: game.i18n.localize("PROCEDURAL.Roll.Cancel"), callback: () => null }
      ],
      rejectClose: false
    });
    if (!contributions) return;

    if (!isValidPool(contributions, cost)) {
      ui.notifications?.error(game.i18n.format("PROCEDURAL.CaseTracker.PoolRerunPointsInvalid", { cost }));
      return;
    }

    try {
      for (const [actorId, amount] of Object.entries(contributions)) {
        if (amount <= 0) continue;
        const actor = game.actors.get(actorId);
        await actor.update({ "system.rerunPoints": actor.system.rerunPoints - amount });
      }
      data.leadsPooled[actIndex] = true;
      await setCaseTracker(data);
    } catch (err) {
      console.error("PROCEDURAL | Failed to pool Rerun Points for a new lead", err);
      ui.notifications?.error("PROCEDURAL! failed to pool Rerun Points. Check the console for details.");
      return;
    }

    await ChatMessage.create({
      content: `<p>${game.i18n.format("PROCEDURAL.CaseTracker.PoolRerunPointsAnnounce", { cost })}</p>`
    });
    this.render();
  }
```

- [ ] **Step 5: Run tests to confirm nothing broke**

Run: `npm test`
Expected: PASS (this task has no new pure-logic tests beyond Task 1's, which still pass; the action itself has no Foundry-runtime test harness per the Global Constraints).

- [ ] **Step 6: Commit**

```bash
git add module/apps/case-tracker.mjs lang/en.json
git commit -m "feat: add Rerun Point pooling action to the Case Tracker"
```

---

### Task 5: Epilogue tie-break action + wiring

**Files:**
- Modify: `module/apps/case-tracker.mjs`
- Modify: `lang/en.json`

**Interfaces:**
- Consumes: `tallyEvidence` from `module/helpers/evidence-tally.mjs` (Task 2); `epilogueTiebreakRoll`/`epilogueTiebreakOutcome` schema fields (Task 3); `rollD6` (already imported in this file).
- Produces: `rollEpilogueTiebreak` action registered in `DEFAULT_OPTIONS.actions`; `context.evidenceTally`, `context.epilogueTiebreakRoll`, `context.epilogueTiebreakOutcome`, `context.epilogueTiebreakOutcomeLabel` in `_prepareContext`; `epilogueTiebreakRoll`/`epilogueTiebreakOutcome` in `#formToData`'s return shape — consumed by Task 6 (template).

- [ ] **Step 1: Add the localization keys**

In `lang/en.json`, inside the `"CaseTracker"` object, add after the keys from Task 4:

```json
      "EvidenceTally": "Good / Bad Evidence",
      "EpilogueTiebreak": {
        "Title": "Epilogue Tie-break Roll",
        "Roll": "Roll Tie-break",
        "against": "Against the players",
        "for": "For the players"
      },
```

- [ ] **Step 2: Import `tallyEvidence` and register the action**

Update the import line in `module/apps/case-tracker.mjs`:

```js
import { resolveDice, rollD6 } from "../helpers/dice-rules.mjs";
import { findTalentsToReset } from "../helpers/talent-reset.mjs";
import { findActorsToHeal } from "../helpers/hurt-reset.mjs";
import { loadGeneratorData } from "../helpers/generator-data.mjs";
import { isValidPool } from "../helpers/lead-pool.mjs";
import { tallyEvidence } from "../helpers/evidence-tally.mjs";
```

Add `rollEpilogueTiebreak: CaseTrackerApplication.#onRollEpilogueTiebreak` to `DEFAULT_OPTIONS.actions`, after `poolRerunPoints`:

```js
    actions: {
      addEvidence: CaseTrackerApplication.#onAddEvidence,
      deleteEvidence: CaseTrackerApplication.#onDeleteEvidence,
      startInterrogation: CaseTrackerApplication.#onStartInterrogation,
      decrementInterrogation: CaseTrackerApplication.#onDecrementInterrogation,
      deleteInterrogation: CaseTrackerApplication.#onDeleteInterrogation,
      rollForDrama: CaseTrackerApplication.#onRollForDrama,
      poolRerunPoints: CaseTrackerApplication.#onPoolRerunPoints,
      rollEpilogueTiebreak: CaseTrackerApplication.#onRollEpilogueTiebreak
    }
```

- [ ] **Step 3: Extend `_prepareContext` and `#formToData`**

In `_prepareContext`, right after `context.leadsPooled = data.leadsPooled;` (added in Task 4), add:

```js
    context.evidenceTally = tallyEvidence(data.evidence);
    context.epilogueTiebreakRoll = data.epilogueTiebreakRoll;
    context.epilogueTiebreakOutcome = data.epilogueTiebreakOutcome;
    context.epilogueTiebreakOutcomeLabel = data.epilogueTiebreakOutcome
      ? game.i18n.localize(`PROCEDURAL.CaseTracker.EpilogueTiebreak.${data.epilogueTiebreakOutcome}`)
      : "";
```

In `#formToData`, right after `leadsPooled: Object.values(expanded.leadsPooled ?? {}),` (added in Task 4), add:

```js
      epilogueTiebreakRoll: Number(expanded.epilogueTiebreakRoll) || 0,
      epilogueTiebreakOutcome: expanded.epilogueTiebreakOutcome ?? "",
```

- [ ] **Step 4: Add the `#onRollEpilogueTiebreak` action**

Add this method right after `#onPoolRerunPoints` in `module/apps/case-tracker.mjs`:

```js
  static async #onRollEpilogueTiebreak() {
    const data = CaseTrackerApplication.#formToData(this.form);
    const { tied } = tallyEvidence(data.evidence);
    if (!tied) return;

    const roll = rollD6();
    const outcome = roll % 2 === 1 ? "against" : "for";

    data.epilogueTiebreakRoll = roll;
    data.epilogueTiebreakOutcome = outcome;
    try {
      await setCaseTracker(data);
    } catch (err) {
      console.error("PROCEDURAL | Failed to save the Epilogue tie-break roll", err);
      ui.notifications?.error("PROCEDURAL! failed to save the tie-break roll. Check the console for details.");
      return;
    }

    const outcomeLabel = game.i18n.localize(`PROCEDURAL.CaseTracker.EpilogueTiebreak.${outcome}`);
    await ChatMessage.create({
      content: `<p><strong>${game.i18n.localize("PROCEDURAL.CaseTracker.EpilogueTiebreak.Title")}</strong> (${roll}): ${outcomeLabel}</p>`
    });
    this.render();
  }
```

- [ ] **Step 5: Run tests to confirm nothing broke**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add module/apps/case-tracker.mjs lang/en.json
git commit -m "feat: add Epilogue evidence tie-break roll to the Case Tracker"
```

---

### Task 6: Template wiring

**Files:**
- Modify: `templates/apps/case-tracker.hbs`

**Interfaces:**
- Consumes: `context.leadsPooled`, `context.act` (Task 4); `context.evidenceTally`, `context.epilogueTiebreakRoll`, `context.epilogueTiebreakOutcome`, `context.epilogueTiebreakOutcomeLabel` (Task 5).

- [ ] **Step 1: Add the lead-pooling section**

In `templates/apps/case-tracker.hbs`, insert a new section right after the closing `</fieldset>` of `procedural-case-tracker-interludes` and before the `procedural-case-tracker-arrest-phase` fieldset:

```hbs
  <section class="procedural-case-tracker-lead-pool">
    <h2>{{localize "PROCEDURAL.CaseTracker.PoolRerunPoints"}}</h2>
    {{#each leadsPooled as |used index|}}
      <input type="checkbox" name="leadsPooled.{{index}}" {{#if used}}checked{{/if}} hidden>
    {{/each}}
    {{#if (lookup leadsPooled (subtract act 1))}}
      <p>{{localize "PROCEDURAL.CaseTracker.PoolRerunPointsUsed"}}</p>
    {{else}}
      <button type="button" data-action="poolRerunPoints">{{localize "PROCEDURAL.CaseTracker.PoolRerunPoints"}}</button>
    {{/if}}
  </section>
```

Handlebars' built-in `lookup` helper reads an array by index, but there is no built-in `subtract` helper in this codebase (confirmed: no `Handlebars.registerHelper` calls exist anywhere in `module/`). Rather than adding one, compute the flag directly in `_prepareContext` instead — replace the block above with the simpler version that follows, and add one line to `case-tracker.mjs`'s `_prepareContext` (right after `context.leadsPooled = data.leadsPooled;` from Task 4):

```js
    context.leadPooledThisAct = data.leadsPooled[data.act - 1] ?? false;
```

Then the template section becomes:

```hbs
  <section class="procedural-case-tracker-lead-pool">
    <h2>{{localize "PROCEDURAL.CaseTracker.PoolRerunPoints"}}</h2>
    {{#each leadsPooled as |used index|}}
      <input type="checkbox" name="leadsPooled.{{index}}" {{#if used}}checked{{/if}} hidden>
    {{/each}}
    {{#if leadPooledThisAct}}
      <p>{{localize "PROCEDURAL.CaseTracker.PoolRerunPointsUsed"}}</p>
    {{else}}
      <button type="button" data-action="poolRerunPoints">{{localize "PROCEDURAL.CaseTracker.PoolRerunPoints"}}</button>
    {{/if}}
  </section>
```

- [ ] **Step 2: Add the evidence tally + tie-break section**

In `templates/apps/case-tracker.hbs`, inside `<section class="procedural-case-tracker-evidence">`, right after the closing `</ul>` of `procedural-case-tracker-evidence-list` and before the `addEvidence` button, add:

```hbs
    <p class="procedural-case-tracker-evidence-tally">
      {{localize "PROCEDURAL.CaseTracker.EvidenceTally"}}: {{evidenceTally.good}} / {{evidenceTally.bad}}
    </p>
    <input type="hidden" name="epilogueTiebreakRoll" value="{{epilogueTiebreakRoll}}">
    <input type="hidden" name="epilogueTiebreakOutcome" value="{{epilogueTiebreakOutcome}}">
    {{#if evidenceTally.tied}}
      <button type="button" data-action="rollEpilogueTiebreak">{{localize "PROCEDURAL.CaseTracker.EpilogueTiebreak.Roll"}}</button>
    {{/if}}
    {{#if epilogueTiebreakOutcome}}
      <p class="procedural-case-tracker-tiebreak-result">
        {{localize "PROCEDURAL.CaseTracker.EpilogueTiebreak.Title"}} ({{epilogueTiebreakRoll}}): {{epilogueTiebreakOutcomeLabel}}
      </p>
    {{/if}}
```

- [ ] **Step 3: Manual verification**

Foundry app templates have no automated test harness in this repo. Verify by hand once the build/dev environment is available (see Task 8's manual smoke test steps, which cover this).

- [ ] **Step 4: Commit**

```bash
git add templates/apps/case-tracker.hbs module/apps/case-tracker.mjs
git commit -m "feat: add lead-pooling and tie-break sections to the Case Tracker template"
```

---

### Task 7: Full test suite + version bump

**Files:**
- Modify: `system.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing new — this task validates and finalizes the round.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — every existing suite plus the 12 new `lead-pool`/`evidence-tally` tests.

- [ ] **Step 2: Bump the version**

In `system.json`, change:

```json
  "version": "0.12.2",
```

to:

```json
  "version": "0.13.0",
```

In `package.json`, change:

```json
  "version": "0.12.2",
```

to:

```json
  "version": "0.13.0",
```

(Minor bump, matching the precedent set by every prior "rulebook gap fixes" round, each of which bumped the minor version — e.g. Round 2 went 0.9.x → 0.10.0.)

- [ ] **Step 3: Commit**

```bash
git add system.json package.json
git commit -m "chore: bump version to 0.13.0"
```

---

## Self-Review Notes

- **Spec coverage:** Rerun Point pooling (spec §1) → Tasks 1, 3, 4, 6. Epilogue tie-break (spec §2) → Tasks 2, 3, 5, 6. Localization (spec) → Tasks 4, 5. Testing (spec) → Tasks 1, 2, 7. Version bump → Task 7, per the repo's standing convention of bumping on every feature merge.
- **Placeholder scan:** every step has literal code, no "TBD"/"similar to above" — Task 6 repeats the lead-pool template block twice deliberately (first draft, then corrected) to document *why* the naive `subtract` helper approach was rejected in favor of computing `leadPooledThisAct` server-side; the final block is the one to actually leave in the file.
- **Type consistency:** `isValidPool(contributions, cost)` (Task 1) called identically in Task 4. `tallyEvidence(evidence)` (Task 2) called identically in Task 5's action and matches the shape (`{good, bad, tied}`) read by Task 6's template via `context.evidenceTally`. `leadsPooled`/`epilogueTiebreakRoll`/`epilogueTiebreakOutcome` field names match across schema (Task 3), `#formToData`/`_prepareContext` (Tasks 4-5), and template bindings (Task 6).
