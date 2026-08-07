# Case Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A GM-only "Case Tracker" window, opened from a Token scene-control button, that tracks the rulebook's Game Structure (act/scene counters, turn order, Interlude/Arrest Phase/Epilogue notes) and a good/bad/unknown Evidence Log — a flexible scratchpad the Showrunner edits by hand, not a rules-enforcing wizard.

**Architecture:** A single world-scoped setting (`procedural.caseTracker`) typed with a new plain `foundry.abstract.DataModel` (`CaseTrackerData`) holds all state — one record for the whole world, matching the "single active case" scope decision. A single `HandlebarsApplicationMixin(ApplicationV2)` class (`CaseTrackerApplication`) renders that state as one auto-saving form (`submitOnChange: true`, no explicit Save button) plus a couple of `data-action` buttons for adding/deleting Evidence rows, which mutate the setting directly and re-render. No draft/step machinery like the Trope builder wizard — this app is a live view over the setting, not a linear flow.

**Tech Stack:** Foundry VTT v14 (`ApplicationV2`, `HandlebarsApplicationMixin`, `foundry.abstract.DataModel`, `game.settings`), vanilla JS ES modules, Handlebars (`{{#each}}`, `{{#if}}`, `{{localize}}` — all already proven in this codebase), plain CSS.

## Global Constraints

- Target Foundry VTT v14 (same as the rest of this system).
- No new npm dependencies.
- All existing tests must keep passing unmodified (`npm test`).
- This feature has no pure-logic module and no unit tests — per the design spec, it's entirely Foundry-runtime UI plus a settings read/write, verified with `node --check` for syntax and a manual verification task at the end of this plan (same pattern used by the two prior feature plans in this repo).
- **Avoid Handlebars helpers whose exact v14 signature isn't already proven in this codebase.** `{{localize}}`, `{{#each array as |value|}}`, `{{#each array as |value index|}}` (used for `system.skills` in `templates/actor/trope-sheet.hbs`), and `{{#if}}`/`{{#unless}}` are all already proven — safe to reuse freely. Do **not** use `{{eq}}`, `{{or}}`, or `{{selectOptions}}` — precompute booleans/selected-flags in JS context instead, exactly like `tropeOptions`/`secondTalentOptions` already do in `module/apps/trope-builder.mjs`.
- Full spec: `docs/superpowers/specs/2026-08-06-case-tracker-design.md`.

## Before you start: a local Foundry v14 install is available as ground truth

This machine has a real Foundry VTT v14 client installed at
`/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app/` — its
`client/` directory is the actual shipped source, and is the authoritative
answer to any "does this Foundry API work the way I think it does" question
this plan raises. Prefer grepping it directly over guessing or web-fetching
docs, e.g.:

```bash
grep -rn "getSceneControlButtons" "/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app/client/"
```

**Two APIs this plan depends on were verified against that install before writing any code below — both are easy to get wrong by guessing:**

1. **`getSceneControlButtons` is an object-of-controls hook in v14, not the old array API.** `Hooks.on("getSceneControlButtons", controls => { controls.tokens.tools.myTool = {...} })` — confirmed via the JSDoc example in `client/hooks.mjs`. Task 4 below already uses this shape.
2. **A plain `ApplicationV2` (not a `DocumentSheetV2`) does NOT get form auto-save for free — and the template must NOT contain its own `<form>` tag.** `this.form` (the element `_attachFrameListeners` binds `submit`/`change` listeners to) only resolves if `DEFAULT_OPTIONS.window.contentTag === "form"` — confirmed in `client/applications/api/application.mjs` (`get form()`) and by reading a real core example (`client/applications/settings/dependency-resolution.mjs`, which sets `window: { contentTag: "form" }` and whose own template's root element is a plain `<section>`, not a `<form>`). Setting `window.contentTag: "form"` makes the app's own content wrapper the `<form>` element; if the template *also* opens with `<form>`, you get an invalid nested `<form>` and submission breaks. **Task 2 below already reflects this** — `CaseTrackerApplication` sets `window.contentTag: "form"` and `templates/apps/case-tracker.hbs` roots on `<section>`, not `<form>`. Do not "fix" this by adding a `<form>` tag to the template.

---

### Task 1: `CaseTrackerData` model and world setting registration

**Files:**
- Create: `module/data/case-tracker.mjs`
- Modify: `module/procedural.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces: `export default class CaseTrackerData extends foundry.abstract.DataModel`, registered as `game.settings.get("procedural", "caseTracker")` (returns a `CaseTrackerData` instance) / `game.settings.set("procedural", "caseTracker", plainObject)`. Task 2's `CaseTrackerApplication` reads/writes this setting by name — no import of `CaseTrackerData` needed there, since settings access goes through `game.settings`, not a direct class reference.

- [ ] **Step 1: Create `module/data/case-tracker.mjs`**

```js
export default class CaseTrackerData extends foundry.abstract.DataModel {
  static defineSchema() {
    const { SchemaField, StringField, NumberField, BooleanField, ArrayField } = foundry.data.fields;

    return {
      act: new NumberField({ required: true, integer: true, initial: 1, min: 1 }),
      scene: new NumberField({ required: true, integer: true, initial: 1, min: 1 }),
      turnOrder: new StringField({ initial: "" }),
      interludes: new ArrayField(new BooleanField({ initial: false }), { initial: [false, false, false] }),
      arrestPhaseTriggered: new BooleanField({ initial: false }),
      arrestPhaseNotes: new StringField({ initial: "" }),
      epilogueNotes: new StringField({ initial: "" }),
      evidence: new ArrayField(
        new SchemaField({
          id: new StringField({ required: true }),
          description: new StringField({ initial: "" }),
          status: new StringField({ initial: "unknown", choices: ["good", "bad", "unknown"] }),
          notes: new StringField({ initial: "" })
        }),
        { initial: [] }
      )
    };
  }
}
```

This is a plain `foundry.abstract.DataModel`, not `TypeDataModel` — it isn't backing an Actor/Item subtype, just typing a world setting, matching the design spec's rationale.

- [ ] **Step 2: Register the setting in `module/procedural.mjs`**

Add the import at the top, alongside the other data-model imports:

```js
import CaseTrackerData from "./data/case-tracker.mjs";
```

Add this line inside the existing `Hooks.once("init", () => { ... })` block, right after the existing `CONFIG.Item.dataModels.equipment = EquipmentItemData;` line:

```js
  game.settings.register("procedural", "caseTracker", {
    scope: "world",
    config: false,
    type: CaseTrackerData
  });
```

- [ ] **Step 3: Verify syntax**

```bash
node --check module/data/case-tracker.mjs
node --check module/procedural.mjs
```
Expected: no output from either.

- [ ] **Step 4: Run the full test suite as a regression check**

```bash
npm test
```
Expected: all tests pass (this task adds no Node-testable code, so the count should match whatever the suite already reports going into this task).

- [ ] **Step 5: Commit**

```bash
git add module/data/case-tracker.mjs module/procedural.mjs
git commit -m "feat: add CaseTrackerData model and register the caseTracker world setting"
```

---

### Task 2: `CaseTrackerApplication` shell and Structure section

**Files:**
- Create: `module/apps/case-tracker.mjs`
- Create: `templates/apps/case-tracker.hbs`
- Modify: `css/procedural.css`
- Modify: `lang/en.json`

**Interfaces:**
- Consumes: the `procedural.caseTracker` world setting registered in Task 1.
- Produces: `export default class CaseTrackerApplication extends HandlebarsApplicationMixin(ApplicationV2)`. Task 3 adds evidence-related context, actions, and template markup to this same class/template. Task 4's scene-controls launcher does `new CaseTrackerApplication().render(true)` and looks up the running instance via `foundry.applications.instances.get("procedural-case-tracker")`.

- [ ] **Step 1: Create `module/apps/case-tracker.mjs`**

```js
const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ApplicationV2 } = foundry.applications.api;

function getCaseTracker() {
  return game.settings.get("procedural", "caseTracker");
}

async function setCaseTracker(data) {
  await game.settings.set("procedural", "caseTracker", data);
}

export default class CaseTrackerApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "procedural-case-tracker",
    classes: ["procedural", "case-tracker"],
    position: { width: 480, height: 640 },
    window: {
      title: "PROCEDURAL.CaseTracker.Title",
      resizable: true,
      contentTag: "form"
    },
    form: {
      handler: CaseTrackerApplication.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    }
  };

  static PARTS = {
    form: { template: "systems/procedural/templates/apps/case-tracker.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const data = getCaseTracker().toObject();

    context.act = data.act;
    context.scene = data.scene;
    context.turnOrder = data.turnOrder;
    context.interludes = data.interludes.map((used, index) => ({
      index,
      used,
      label: `${game.i18n.localize("PROCEDURAL.CaseTracker.Interlude")} ${index + 1}`
    }));
    context.arrestPhaseTriggered = data.arrestPhaseTriggered;
    context.arrestPhaseNotes = data.arrestPhaseNotes;
    context.epilogueNotes = data.epilogueNotes;

    return context;
  }

  static async #onSubmit(event, form, formData) {
    const expanded = foundry.utils.expandObject(formData.object);
    await setCaseTracker({
      act: expanded.act ?? 1,
      scene: expanded.scene ?? 1,
      turnOrder: expanded.turnOrder ?? "",
      interludes: Object.values(expanded.interludes ?? {}),
      arrestPhaseTriggered: expanded.arrestPhaseTriggered ?? false,
      arrestPhaseNotes: expanded.arrestPhaseNotes ?? "",
      epilogueNotes: expanded.epilogueNotes ?? "",
      evidence: []
    });
  }
}
```

Note the hard-coded `evidence: []` in `#onSubmit` — a deliberate, tracked placeholder for Task 3, which replaces it with real evidence-row parsing once the Evidence Log section exists. Until Task 3 lands, this app has no evidence UI at all, so there's nothing to lose by not preserving it here.

`foundry.utils.expandObject` turns dot-notation form field names (e.g. `interludes.0`, `interludes.1`) into a plain object keyed by index (`{0: false, 1: true, ...}`), **not** a real array — `Object.values(...)` is required to get back a real array before it's stored, since `CaseTrackerData.interludes` is an `ArrayField`. This was confirmed by reading `expandObject`/`setProperty` in `common/utils/helpers.mjs` on the local v14 install.

- [ ] **Step 2: Create `templates/apps/case-tracker.hbs`**

Root element is `<section>`, not `<form>` — see the "Before you start" note above for why.

```hbs
<section class="procedural-sheet procedural-case-tracker">
  <div class="procedural-builder-row">
    <label>{{localize "PROCEDURAL.CaseTracker.Act"}}
      <input type="number" name="act" value="{{act}}" min="1" step="1">
    </label>
    <label>{{localize "PROCEDURAL.CaseTracker.Scene"}}
      <input type="number" name="scene" value="{{scene}}" min="1" step="1">
    </label>
  </div>

  <label class="procedural-case-tracker-field">
    {{localize "PROCEDURAL.CaseTracker.TurnOrder"}}
    <textarea name="turnOrder" class="procedural-builder-freetext" placeholder="{{localize 'PROCEDURAL.CaseTracker.TurnOrderPlaceholder'}}">{{turnOrder}}</textarea>
  </label>

  <fieldset class="procedural-case-tracker-interludes">
    <legend>{{localize "PROCEDURAL.CaseTracker.Interludes"}}</legend>
    {{#each interludes as |interlude|}}
      <label>
        <input type="checkbox" name="interludes.{{interlude.index}}" {{#if interlude.used}}checked{{/if}}>
        {{interlude.label}}
      </label>
    {{/each}}
  </fieldset>

  <fieldset class="procedural-case-tracker-arrest-phase">
    <legend>
      <label>
        <input type="checkbox" name="arrestPhaseTriggered" {{#if arrestPhaseTriggered}}checked{{/if}}>
        {{localize "PROCEDURAL.CaseTracker.ArrestPhaseTriggered"}}
      </label>
    </legend>
    <textarea name="arrestPhaseNotes" class="procedural-builder-freetext" placeholder="{{localize 'PROCEDURAL.CaseTracker.ArrestPhaseNotes'}}">{{arrestPhaseNotes}}</textarea>
  </fieldset>

  <label class="procedural-case-tracker-field">
    {{localize "PROCEDURAL.CaseTracker.EpilogueNotes"}}
    <textarea name="epilogueNotes" class="procedural-builder-freetext">{{epilogueNotes}}</textarea>
  </label>
</section>
```

- [ ] **Step 3: Add styles to `css/procedural.css`**

Append to the end of the file:

```css
.procedural-case-tracker {
  height: 100%;
  overflow-y: auto;
}

.procedural-case-tracker-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.procedural-case-tracker-interludes,
.procedural-case-tracker-arrest-phase {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.procedural-case-tracker-arrest-phase legend label {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
```

- [ ] **Step 4: Add localization strings to `lang/en.json`**

Add a new `CaseTracker` object inside the existing `"PROCEDURAL"` object, as a new top-level sibling of `TropeBuilder` (after it — remember the trailing comma on `TropeBuilder`'s closing line):

```json
    "CaseTracker": {
      "Title": "Case Tracker",
      "Act": "Act",
      "Scene": "Scene",
      "TurnOrder": "Turn Order",
      "TurnOrderPlaceholder": "One name per line",
      "Interludes": "Interludes",
      "Interlude": "Interlude",
      "ArrestPhaseTriggered": "Arrest Phase Triggered",
      "ArrestPhaseNotes": "Arrest Phase Notes",
      "EpilogueNotes": "Epilogue Notes"
    }
```

Verify the JSON is still valid:

```bash
node -e "JSON.parse(require('fs').readFileSync('lang/en.json', 'utf8')); console.log('OK')"
```
Expected: `OK`.

- [ ] **Step 5: Verify syntax**

```bash
node --check module/apps/case-tracker.mjs
```
Expected: no output.

- [ ] **Step 6: Run the full test suite as a regression check**

```bash
npm test
```
Expected: all tests pass (this task adds no Node-testable code).

- [ ] **Step 7: Commit**

```bash
git add module/apps/case-tracker.mjs templates/apps/case-tracker.hbs css/procedural.css lang/en.json
git commit -m "feat: add Case Tracker app shell with the Structure section"
```

---

### Task 3: Evidence Log section

**Files:**
- Modify: `module/apps/case-tracker.mjs`
- Modify: `templates/apps/case-tracker.hbs`
- Modify: `css/procedural.css`
- Modify: `lang/en.json`

**Interfaces:**
- Consumes: `CaseTrackerApplication` (Task 2).
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Add the `addEvidence`/`deleteEvidence` actions to `DEFAULT_OPTIONS`**

In `module/apps/case-tracker.mjs`, add an `actions` block to `DEFAULT_OPTIONS` (as a new sibling of `form`):

```js
    form: {
      handler: CaseTrackerApplication.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    },
    actions: {
      addEvidence: CaseTrackerApplication.#onAddEvidence,
      deleteEvidence: CaseTrackerApplication.#onDeleteEvidence
    }
```

- [ ] **Step 2: Add the `EVIDENCE_STATUSES` constant**

Add this above the `getCaseTracker`/`setCaseTracker` helper functions:

```js
const EVIDENCE_STATUSES = ["good", "bad", "unknown"];
```

- [ ] **Step 3: Add evidence context to `_prepareContext`**

Add this block right after `context.epilogueNotes = data.epilogueNotes;` (before `return context;`):

```js
    context.evidence = data.evidence.map(entry => ({
      id: entry.id,
      description: entry.description,
      notes: entry.notes,
      statusOptions: EVIDENCE_STATUSES.map(status => ({
        value: status,
        label: game.i18n.localize(`PROCEDURAL.CaseTracker.Status.${status}`),
        selected: status === entry.status
      }))
    }));
```

- [ ] **Step 4: Replace the `evidence: []` placeholder in `#onSubmit`**

Change:

```js
      evidence: []
```

to:

```js
      evidence: Object.values(expanded.evidence ?? {})
```

- [ ] **Step 5: Add the `#onAddEvidence` and `#onDeleteEvidence` static handlers**

Add these methods after `#onSubmit`:

```js
  static async #onAddEvidence() {
    const data = getCaseTracker().toObject();
    data.evidence.push({ id: foundry.utils.randomID(), description: "", status: "unknown", notes: "" });
    await setCaseTracker(data);
    this.render();
  }

  static async #onDeleteEvidence(event, target) {
    const id = target.closest("[data-evidence-id]").dataset.evidenceId;
    const data = getCaseTracker().toObject();
    data.evidence = data.evidence.filter(entry => entry.id !== id);
    await setCaseTracker(data);
    this.render();
  }
```

- [ ] **Step 6: Add the Evidence Log section to the template**

In `templates/apps/case-tracker.hbs`, add this section right before the closing `</section>` tag (i.e. as the last thing inside the root `<section>`, after the Epilogue Notes `<label>`):

```hbs
  <section class="procedural-case-tracker-evidence">
    <h2>{{localize "PROCEDURAL.CaseTracker.EvidenceLog"}}</h2>

    <ul class="procedural-case-tracker-evidence-list">
      {{#each evidence as |entry index|}}
        <li class="procedural-case-tracker-evidence-row" data-evidence-id="{{entry.id}}">
          <input type="hidden" name="evidence.{{index}}.id" value="{{entry.id}}">
          <input type="text" name="evidence.{{index}}.description" value="{{entry.description}}" placeholder="{{localize 'PROCEDURAL.CaseTracker.EvidenceDescription'}}">
          <select name="evidence.{{index}}.status">
            {{#each entry.statusOptions as |opt|}}
              <option value="{{opt.value}}" {{#if opt.selected}}selected{{/if}}>{{opt.label}}</option>
            {{/each}}
          </select>
          <textarea name="evidence.{{index}}.notes" class="procedural-builder-freetext" placeholder="{{localize 'PROCEDURAL.CaseTracker.EvidenceNotes'}}">{{entry.notes}}</textarea>
          <button type="button" data-action="deleteEvidence">{{localize "PROCEDURAL.CaseTracker.Delete"}}</button>
        </li>
      {{/each}}
    </ul>

    <button type="button" data-action="addEvidence">{{localize "PROCEDURAL.CaseTracker.AddEvidence"}}</button>
  </section>
```

The `<input type="hidden" name="evidence.{{index}}.id">` is what lets `#onSubmit` round-trip each row's `id` through the form without cross-referencing the old array by position — every field needed to reconstruct an evidence entry lives in the form itself.

- [ ] **Step 7: Add evidence styles to `css/procedural.css`**

Append to the end of the file:

```css
.procedural-case-tracker-evidence-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.procedural-case-tracker-evidence-row {
  display: grid;
  grid-template-columns: 2fr 1fr 2fr auto;
  gap: 0.5rem;
  align-items: start;
  border: 1px solid #666;
  border-radius: 4px;
  padding: 0.5rem;
}

.procedural-case-tracker-evidence-row .procedural-builder-freetext {
  min-height: 2.5rem;
}
```

- [ ] **Step 8: Add localization strings to `lang/en.json`**

Add these keys inside the `"CaseTracker"` object added in Task 2, after `"EpilogueNotes"` (remember the trailing comma):

```json
      "EvidenceLog": "Evidence Log",
      "AddEvidence": "Add Evidence",
      "EvidenceDescription": "Description",
      "EvidenceNotes": "Notes",
      "Delete": "Delete",
      "Status": {
        "good": "Good",
        "bad": "Bad",
        "unknown": "Unknown"
      }
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
Expected: all tests pass.

- [ ] **Step 11: Commit**

```bash
git add module/apps/case-tracker.mjs templates/apps/case-tracker.hbs css/procedural.css lang/en.json
git commit -m "feat: add the Case Tracker's Evidence Log section"
```

---

### Task 4: Scene-controls launcher (GM-only)

**Files:**
- Modify: `module/procedural.mjs`

**Interfaces:**
- Consumes: `CaseTrackerApplication` (Task 2/3).
- Produces: nothing new consumed by later tasks — this is the last piece of glue needed for the feature to be reachable in the UI.

- [ ] **Step 1: Import `CaseTrackerApplication`**

Add this import to `module/procedural.mjs`, alongside the existing `TropeBuilderApplication` import:

```js
import CaseTrackerApplication from "./apps/case-tracker.mjs";
```

- [ ] **Step 2: Register the scene-controls tool**

Add this hook registration at the end of `module/procedural.mjs`, after the existing `Hooks.on("renderActorDirectory", ...)` block:

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

This is added to the existing "tokens" control group (not a new control group) — a single utility button, matching the pattern Foundry's own `getSceneControlButtons` documentation example uses. `visible: game.user.isGM` is re-evaluated every time scene controls are rebuilt, so non-GM users never see this tool at all, and `title` is a raw localization key (auto-localized by the core scene-controls template, the same convention `window.title` already uses elsewhere in this codebase) rather than a pre-localized string.

- [ ] **Step 3: Verify syntax**

```bash
node --check module/procedural.mjs
```
Expected: no output.

- [ ] **Step 4: Run the full test suite as a regression check**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add module/procedural.mjs
git commit -m "feat: add a GM-only scene-controls launcher for the Case Tracker"
```

---

### Task 5: Version bump

**Files:**
- Modify: `system.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks — this is a standing repo policy (bump the version on every feature PR/merge), not something the Case Tracker feature itself depends on.

- [ ] **Step 1: Bump the version in `system.json`**

Change:

```json
  "version": "0.1.0",
```

to:

```json
  "version": "0.2.0",
```

A minor bump — this PR adds a new feature (not a fix, not a breaking change), consistent with semver.

- [ ] **Step 2: Bump the version in `package.json`**

Change:

```json
  "version": "0.1.0",
```

to:

```json
  "version": "0.2.0",
```

Kept in sync with `system.json` — the two currently match and nothing in this repo distinguishes them, so letting them diverge would just be a future source of confusion.

- [ ] **Step 3: Verify both files are still valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('system.json', 'utf8')); JSON.parse(require('fs').readFileSync('package.json', 'utf8')); console.log('OK')"
```
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add system.json package.json
git commit -m "chore: bump version to 0.2.0 for the Case Tracker feature"
```

---

### Task 6: Manual verification

**Files:** none (verification only, using a running Foundry v14 client — same setup as the existing smoke-test checklists in `docs/superpowers/plans/2026-08-05-procedural-system-v1.md` Task 15, `docs/superpowers/plans/2026-08-06-random-trope-generator.md` Task 6, and `docs/superpowers/plans/2026-08-06-trope-builder-wizard.md` Task 9).

This cannot be automated or verified by a subagent — note it as a follow-up for the human.

- [ ] **Step 1: Run the full automated suite one more time**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 2: Confirm the launcher is GM-only**

As GM, open the Token scene controls. Confirm a Case Tracker tool (magnifying-glass icon) appears in the toolbar and its tooltip reads "Case Tracker". Click it and confirm the window opens. Then log in as (or impersonate, via Foundry's "Assume Role") a non-GM player and confirm the tool is not present in the Token controls at all.

- [ ] **Step 3: Confirm the Structure section persists**

As GM, open the Case Tracker. Set Act to 2, Scene to 3, type a few names into Turn Order (one per line), check Interlude 2's checkbox, check the Arrest Phase Triggered checkbox and type a note, and type an Epilogue note. Close the window, reopen it via the scene-control tool, and confirm every value you entered is still there exactly as entered.

- [ ] **Step 4: Confirm the Evidence Log persists and rows behave independently**

Click "Add Evidence" twice. On the first row, type a description, select "Good", and type a note. On the second row, type a different description and select "Bad". Close and reopen the window — confirm both rows persisted with their correct description/status/notes and in the same order. Click Delete on the first row, confirm it disappears and the second row (now the only one) still has its own correct data — not the deleted row's data.

- [ ] **Step 5: Confirm reopening the app reuses the existing window**

With the Case Tracker open, click the scene-control tool again. Confirm it brings the existing window to the front rather than opening a second window.

- [ ] **Step 6: Confirm the system version**

On the Setup screen (or a world's Configuration tab), confirm "PROCEDURAL!" now reports version 0.2.0.

- [ ] **Step 7: Final commit (if any fixes were needed during manual verification)**

```bash
git add -A
git commit -m "fix: address issues found during Case Tracker manual verification"
```
