# Interrogations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third "Interrogations" section to the existing GM-only Case Tracker window, implementing the rulebook's Interrogations mechanic — a secret 2d6 roll (2-12) that sets how many meaningful questions the players get before a suspect clams up, tracked as a repeatable, editable list.

**Architecture:** Extend `CaseTrackerData` (`module/data/case-tracker.mjs`) with a new `interrogations` `ArrayField`, and extend `CaseTrackerApplication` (`module/apps/case-tracker.mjs`) with three new `data-action` handlers (`startInterrogation`, `decrementInterrogation`, `deleteInterrogation`) plus the corresponding template markup — following the exact same add/delete-row pattern already used for the Evidence Log, with one addition: "Start Interrogation" doesn't add a blank row, it rolls `resolveDice("normal", Math.random)` (the same pure dice-engine function skill rolls already use) and seeds the row's `questionsRemaining` with the roll's `rawTotal`. No chat card, no Dice So Nice animation — the roll is private to the GM.

**Tech Stack:** Foundry VTT v14 (`ApplicationV2`, `HandlebarsApplicationMixin`, `foundry.abstract.DataModel`, `game.settings`), vanilla JS ES modules, Handlebars, plain CSS. No new npm dependencies.

## Global Constraints

- Target Foundry VTT v14 (same as the rest of this system).
- No new npm dependencies.
- All existing tests must keep passing unmodified (`npm test`).
- This feature has no new pure-logic module and no new unit tests — it reuses `resolveDice` from `module/helpers/dice-rules.mjs`, which is already fully covered by `module/helpers/dice-rules.test.mjs`. Verified with `node --check` for syntax and a manual verification task at the end of this plan, same pattern as the Case Tracker plan (`docs/superpowers/plans/2026-08-06-case-tracker.md`).
- **Avoid Handlebars helpers whose exact v14 signature isn't already proven in this codebase.** `{{localize}}`, `{{#each array as |value index|}}`, and `{{#if}}` are proven (used throughout `templates/apps/case-tracker.hbs`) — safe to reuse. Do not introduce `{{eq}}`, `{{or}}`, or `{{selectOptions}}`.
- The roll must never produce a chat card, whisper, or Dice So Nice animation — the rulebook is explicit the Showrunner rolls *secretly*. Do not call `showDiceSoNice` or post to chat from the new handler.
- Full spec: `docs/superpowers/specs/2026-08-06-interrogations-design.md`.

---

### Task 1: Add `interrogations` field to `CaseTrackerData`

**Files:**
- Modify: `module/data/case-tracker.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces: `CaseTrackerData` instances now have an `interrogations` array field, each entry shaped `{ id: string, suspect: string, questionsRemaining: number, notes: string }`. Task 2 reads/writes this via `game.settings.get("procedural", "caseTracker")` / `.set(...)`, exactly like it already does for `evidence`.

- [ ] **Step 1: Add the `interrogations` field to the schema**

In `module/data/case-tracker.mjs`, add a new field to the object returned by `defineSchema()`, as a sibling of `evidence` (after it, before the closing `};`):

```js
      interrogations: new ArrayField(
        new SchemaField({
          id: new StringField({ required: true }),
          suspect: new StringField({ initial: "" }),
          questionsRemaining: new NumberField({ required: true, integer: true, initial: 0, min: 0 }),
          notes: new StringField({ initial: "" })
        }),
        { initial: [] }
      )
```

The file already destructures `SchemaField`, `StringField`, `NumberField`, `ArrayField` at the top of `defineSchema()` (used for `evidence`), so no new imports or destructuring are needed. Remember to add a trailing comma after the existing `evidence: ...)` field's closing `)` now that `interrogations` follows it.

- [ ] **Step 2: Verify syntax**

```bash
node --check module/data/case-tracker.mjs
```
Expected: no output.

- [ ] **Step 3: Run the full test suite as a regression check**

```bash
npm test
```
Expected: all 41 tests pass (this task adds no Node-testable code, so the count should be unchanged from before this task).

- [ ] **Step 4: Commit**

```bash
git add module/data/case-tracker.mjs
git commit -m "feat: add interrogations field to CaseTrackerData"
```

---

### Task 2: Interrogations section — app logic, template, styles, localization

**Files:**
- Modify: `module/apps/case-tracker.mjs`
- Modify: `templates/apps/case-tracker.hbs`
- Modify: `css/procedural.css`
- Modify: `lang/en.json`

**Interfaces:**
- Consumes: `interrogations` field on `CaseTrackerData` (Task 1); `resolveDice` from `module/helpers/dice-rules.mjs` (already exported, already used by `module/documents/actor.mjs`).
- Produces: nothing consumed by later tasks — this is the last code change needed for the feature to be usable end to end.

- [ ] **Step 1: Import `resolveDice` in `module/apps/case-tracker.mjs`**

Add this import at the top of the file:

```js
import { resolveDice } from "../helpers/dice-rules.mjs";
```

- [ ] **Step 2: Register the three new actions**

In `DEFAULT_OPTIONS.actions`, add the two new entries as siblings of the existing `addEvidence`/`deleteEvidence` (the block currently reads exactly):

```js
    actions: {
      addEvidence: CaseTrackerApplication.#onAddEvidence,
      deleteEvidence: CaseTrackerApplication.#onDeleteEvidence
    }
```

Change it to:

```js
    actions: {
      addEvidence: CaseTrackerApplication.#onAddEvidence,
      deleteEvidence: CaseTrackerApplication.#onDeleteEvidence,
      startInterrogation: CaseTrackerApplication.#onStartInterrogation,
      decrementInterrogation: CaseTrackerApplication.#onDecrementInterrogation,
      deleteInterrogation: CaseTrackerApplication.#onDeleteInterrogation
    }
```

- [ ] **Step 3: Add `interrogations` to `_prepareContext`**

In `_prepareContext`, right after the existing `context.evidence = data.evidence.map(...)` block (before `return context;`), add:

```js
    context.interrogations = data.interrogations;
```

No per-entry transform is needed — unlike `evidence`, there's no enum field here, so the raw array (already plain objects from `.toObject()`) maps straight to the template.

- [ ] **Step 4: Add `interrogations` to `#formToData`**

In the static `#formToData(form)` method, add a new line to the returned object, as a sibling of the existing `evidence: Object.values(expanded.evidence ?? {})` line:

```js
      interrogations: Object.values(expanded.interrogations ?? {})
```

- [ ] **Step 5: Add the `#onStartInterrogation`, `#onDecrementInterrogation`, and `#onDeleteInterrogation` static handlers**

Add these three methods after the existing `#onDeleteEvidence` method:

```js
  static async #onStartInterrogation() {
    const data = CaseTrackerApplication.#formToData(this.form);
    const { rawTotal } = resolveDice("normal", Math.random);
    data.interrogations.push({
      id: foundry.utils.randomID(),
      suspect: "",
      questionsRemaining: rawTotal,
      notes: ""
    });
    try {
      await setCaseTracker(data);
    } catch (err) {
      console.error("PROCEDURAL | Failed to start an interrogation in the Case Tracker", err);
      ui.notifications?.error("PROCEDURAL! failed to start the interrogation. Check the console for details.");
      return;
    }
    this.render();
  }

  static async #onDecrementInterrogation(event, target) {
    const id = target.closest("[data-interrogation-id]").dataset.interrogationId;
    const data = CaseTrackerApplication.#formToData(this.form);
    const entry = data.interrogations.find(item => item.id === id);
    entry.questionsRemaining = Math.max(0, entry.questionsRemaining - 1);
    try {
      await setCaseTracker(data);
    } catch (err) {
      console.error("PROCEDURAL | Failed to decrement an interrogation in the Case Tracker", err);
      ui.notifications?.error("PROCEDURAL! failed to update the interrogation. Check the console for details.");
      return;
    }
    this.render();
  }

  static async #onDeleteInterrogation(event, target) {
    const id = target.closest("[data-interrogation-id]").dataset.interrogationId;
    const data = CaseTrackerApplication.#formToData(this.form);
    data.interrogations = data.interrogations.filter(entry => entry.id !== id);
    try {
      await setCaseTracker(data);
    } catch (err) {
      console.error("PROCEDURAL | Failed to delete an interrogation from the Case Tracker", err);
      ui.notifications?.error("PROCEDURAL! failed to delete the interrogation. Check the console for details.");
      return;
    }
    this.render();
  }
```

`resolveDice("normal", Math.random)` returns `{ die1, die2, rawTotal, dice }` for a plain, unmodified 2d6 roll (`rawTotal` is `die1 + die2`, range 2-12) — exactly the mechanic the rulebook specifies. Nothing here posts a chat card or calls `showDiceSoNice`; the roll is visible only in the GM's Case Tracker window, matching "the Showrunner secretly rolls."

- [ ] **Step 6: Add the Interrogations section to the template**

In `templates/apps/case-tracker.hbs`, add this section right before the closing `</section>` tag of the root section (i.e. as the last thing in the file, after the existing Evidence Log `</section>`):

```hbs
  <section class="procedural-case-tracker-interrogations">
    <h2>{{localize "PROCEDURAL.CaseTracker.Interrogations"}}</h2>

    <ul class="procedural-case-tracker-interrogation-list">
      {{#each interrogations as |entry index|}}
        <li class="procedural-case-tracker-interrogation-row" data-interrogation-id="{{entry.id}}">
          <input type="hidden" name="interrogations.{{index}}.id" value="{{entry.id}}">
          <input type="text" name="interrogations.{{index}}.suspect" value="{{entry.suspect}}" placeholder="{{localize 'PROCEDURAL.CaseTracker.InterrogationSuspect'}}">
          <div class="procedural-case-tracker-interrogation-counter">
            <button type="button" data-action="decrementInterrogation">-1</button>
            <input type="number" name="interrogations.{{index}}.questionsRemaining" value="{{entry.questionsRemaining}}" min="0" step="1">
          </div>
          <textarea name="interrogations.{{index}}.notes" class="procedural-builder-freetext" placeholder="{{localize 'PROCEDURAL.CaseTracker.InterrogationNotes'}}">{{entry.notes}}</textarea>
          <button type="button" data-action="deleteInterrogation">{{localize "PROCEDURAL.CaseTracker.Delete"}}</button>
        </li>
      {{/each}}
    </ul>

    <button type="button" data-action="startInterrogation">{{localize "PROCEDURAL.CaseTracker.StartInterrogation"}}</button>
  </section>
```

Same round-trip pattern as Evidence rows: the hidden `id` input lets `#formToData` reconstruct each entry from the form without cross-referencing the old array by position.

- [ ] **Step 7: Add interrogation styles to `css/procedural.css`**

Append to the end of the file:

```css
.procedural-case-tracker-interrogation-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.procedural-case-tracker-interrogation-row {
  display: grid;
  grid-template-columns: 2fr 1fr 2fr auto;
  gap: 0.5rem;
  align-items: start;
  border: 1px solid #666;
  border-radius: 4px;
  padding: 0.5rem;
}

.procedural-case-tracker-interrogation-row .procedural-builder-freetext {
  min-height: 2.5rem;
}

.procedural-case-tracker-interrogation-counter {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.procedural-case-tracker-interrogation-counter input[type="number"] {
  width: 3.5rem;
}
```

This mirrors `.procedural-case-tracker-evidence-list` / `-evidence-row` exactly (same 4-column grid: text / counter / notes / delete), with one addition (`-interrogation-counter`) for the −1 button + number input pairing.

- [ ] **Step 8: Add localization strings to `lang/en.json`**

Add these keys inside the existing `"CaseTracker"` object, after `"Delete": "Delete",` and before the `"Status"` block (remember the trailing comma after `"Delete": "Delete"` already exists — insert the new keys between it and `"Status"`):

```json
      "Interrogations": "Interrogations",
      "StartInterrogation": "Start Interrogation",
      "InterrogationSuspect": "Suspect",
      "InterrogationNotes": "Notes",
```

Verify the JSON is still valid:

```bash
node -e "JSON.parse(require('fs').readFileSync('lang/en.json', 'utf8')); console.log('OK')"
```
Expected: `OK`.

- [ ] **Step 9: Verify syntax**

```bash
node --check module/apps/case-tracker.mjs
```
Expected: no output.

- [ ] **Step 10: Run the full test suite as a regression check**

```bash
npm test
```
Expected: all 41 tests pass (this task adds no Node-testable code).

- [ ] **Step 11: Commit**

```bash
git add module/apps/case-tracker.mjs templates/apps/case-tracker.hbs css/procedural.css lang/en.json
git commit -m "feat: add the Case Tracker's Interrogations section"
```

---

### Task 3: Version bump

**Files:**
- Modify: `system.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks — standing repo policy (bump the version on every feature PR/merge), not something this feature depends on.

- [ ] **Step 1: Bump the version in `system.json`**

Change:

```json
  "version": "0.2.0",
```

to:

```json
  "version": "0.3.0",
```

A minor bump — this PR adds a new feature (not a fix, not a breaking change), consistent with semver and the version history of this repo (0.1.0 → 0.2.0 for the Case Tracker feature).

- [ ] **Step 2: Bump the version in `package.json`**

Change:

```json
  "version": "0.2.0",
```

to:

```json
  "version": "0.3.0",
```

Kept in sync with `system.json`.

- [ ] **Step 3: Verify both files are still valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('system.json', 'utf8')); JSON.parse(require('fs').readFileSync('package.json', 'utf8')); console.log('OK')"
```
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add system.json package.json
git commit -m "chore: bump version to 0.3.0 for the Interrogations feature"
```

---

### Task 4: Manual verification

**Files:** none (verification only, using a running Foundry v14 client — same setup as the existing smoke-test checklist in `docs/superpowers/plans/2026-08-06-case-tracker.md` Task 6).

This cannot be automated or verified by a subagent — note it as a follow-up for the human.

- [ ] **Step 1: Run the full automated suite one more time**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 2: Confirm "Start Interrogation" rolls secretly and adds a row**

As GM, open the Case Tracker, scroll to the new Interrogations section, and click "Start Interrogation". Confirm a new row appears with a questions-remaining value between 2 and 12. Confirm no chat message was posted (check the chat log) and no Dice So Nice animation played.

- [ ] **Step 3: Confirm the −1 button and manual edits both work**

Type a suspect name and a note into the row. Click the "−1" button twice; confirm the counter decreases by 1 each time and stops at 0 (doesn't go negative). Manually type a different number directly into the counter field and tab away; confirm that value sticks.

- [ ] **Step 4: Confirm persistence across window close/reopen**

Close the Case Tracker window and reopen it via the scene-control tool. Confirm the row's suspect name, counter value, and notes all persisted exactly as left.

- [ ] **Step 5: Confirm multiple interrogations track independently**

Click "Start Interrogation" again to add a second row. Give it a different suspect name and decrement its counter once. Confirm the first row's data is unaffected. Delete the first row and confirm the second row's data is still correct (not the deleted row's data).

- [ ] **Step 6: Confirm the system version**

On the Setup screen (or a world's Configuration tab), confirm "PROCEDURAL!" now reports version 0.3.0.

- [ ] **Step 7: Final commit (if any fixes were needed during manual verification)**

```bash
git add -A
git commit -m "fix: address issues found during Interrogations manual verification"
```
