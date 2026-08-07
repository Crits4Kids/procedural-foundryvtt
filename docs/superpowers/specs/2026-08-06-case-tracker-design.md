# Case Tracker — Design

**Date:** 2026-08-06
**Status:** Approved for implementation
**Builds on:** `docs/superpowers/specs/2026-08-05-procedural-system-v1-design.md`

## Goal

A GM-only session-structure and evidence-tracking tool implementing the
rulebook's **Game Structure** (`rulebook/source_rulebook.md:1124`) and
**Leads & Evidence** (`rulebook/source_rulebook.md:1367`) sections — three
acts of player-guided scenes, interludes, the Arrest Phase, the Epilogue,
and a good/bad/unknown evidence log. This is the last major chunk of the
rulebook that v1's design doc explicitly deferred (see "Out of scope" in
that spec); the Trope sheet, random Trope generator, and Trope builder
wizard now cover character creation end to end, so this is the next
logical addition.

## Scope

**In scope:**
- A single world-level "Case Tracker" window covering act/scene counters,
  a turn-order note, interlude/Arrest Phase/Epilogue tracking, and an
  evidence log with good/bad/unknown status per entry
- GM-only visibility and access — the tool and its launcher are invisible
  to players entirely
- A scene-controls button to open it

**Out of scope (explicitly deferred, not silently dropped):**
- Enforcing the rulebook's structure (fixed scene counts per act, turn
  order gating who sets the next scene, auto-triggering interludes/Arrest
  Phase at the "correct" beat) — this is a flexible tracker the Showrunner
  updates by hand, not a rules engine. Tables deviate from the printed
  structure constantly; the tool should reflect state, not gate it.
- Multiple concurrent/named cases (season mode with several episodes) —
  v1 supports one active case at a time; the Showrunner clears/edits
  fields by hand between episodes.
- Per-entry evidence visibility to players (a "revealed" flag players
  could see) — the whole tracker is GM-only for v1, so this doesn't apply
  yet. Could be a future feature if the group wants a shared version.
- Automated turn-order rolling (1d6 per player via the existing dice
  engine) — turn order is a plain freeform note, not a structured,
  actor-linked, rollable list.
- Partner Bonus tracking and Interrogation tooling (rulebook sections
  adjacent to Game Structure) — not part of this feature.

## Data model

### `CaseTrackerData` (`module/data/case-tracker.mjs`)

A plain `foundry.abstract.DataModel` (not `TypeDataModel` — this isn't an
Actor/Item subtype, just structured data for a world setting, per
Foundry's own recommended pattern for typed settings).

| Field | Type | Notes |
|---|---|---|
| `act` | NumberField, default 1 | Free-standing counter, not clamped to 1-3 |
| `scene` | NumberField, default 1 | Free-standing counter |
| `turnOrder` | StringField | Multi-line freeform text, one name per line |
| `interludes` | ArrayField of 3 BooleanFields | "used" checkbox per Interlude 1/2/3 |
| `arrestPhaseTriggered` | BooleanField | |
| `arrestPhaseNotes` | StringField | Freeform |
| `epilogueNotes` | StringField | Freeform |
| `evidence` | ArrayField of SchemaField `{id, description, status, notes}` | `status` is a StringField enum: `good` / `bad` / `unknown`. `id` is a generated identifier (`foundry.utils.randomID()`) used as the delete/edit key |

## Foundry integration

### Settings registration (`module/procedural.mjs`, `init` hook)

```js
game.settings.register("procedural", "caseTracker", {
  scope: "world",
  config: false,
  type: CaseTrackerData
});
```

One record for the whole world — matches the "single active case"
decision. No case-switcher UI.

### `CaseTrackerApplication` (`module/apps/case-tracker.mjs`)

`HandlebarsApplicationMixin(ApplicationV2)`, following the same shape as
`TropeBuilderApplication`. Key differences from that app:

- Gated to `game.user.isGM` — constructor/render path bails (and the
  launcher button is never shown) for non-GM users, mirroring the
  existing `Actor.canUserCreate` check on the directory launcher.
- Singleton: reuses an existing open instance rather than creating a
  duplicate window, via the same `foundry.applications.instances.get(...)`
  check documented in Foundry's own `getSceneControlButtons` hook example.
- Auto-saving form instead of draft-then-submit: `PARTS.form.form = {
  handler: CaseTrackerApplication.#onSubmit, submitOnChange: true }`
  (verified against the local v14 source — this is the standard
  ApplicationV2 mechanism, already distinct from the trope-builder's
  explicit step/draft flow because this tool is a live scratchpad open
  throughout a session, not a linear wizard). The submit handler writes
  `foundry.utils.expandObject(formData.object)` straight to the
  `caseTracker` world setting.
- Evidence rows are added/removed via `data-action="addEvidence"` /
  `data-action="deleteEvidence"` buttons, the same action-button pattern
  used for item lists elsewhere in this codebase, mutating the setting's
  `evidence` array and re-rendering.

### Scene-controls launcher

Added via the `getSceneControlButtons` hook (verified against the local
v14 source — this is the documented v13+ shape, an object of controls
each with an object of tools, not the old array API):

```js
Hooks.on("getSceneControlButtons", controls => {
  controls.tokens.tools.proceduralCaseTracker = {
    name: "proceduralCaseTracker",
    title: "PROCEDURAL.CaseTracker.Title",
    icon: "fa-solid fa-magnifying-glass",
    order: Object.keys(controls.tokens.tools).length,
    button: true,
    visible: game.user.isGM,
    onChange: () => CaseTrackerApplication.open()
  };
});
```

Added to the existing "tokens" control group rather than a new control
group — this is a single utility button, not a full toolset, and this
matches the pattern Foundry's own documentation example uses.

## UI

One window, one scrollable form, two sections (no tabs — small enough to
not need them):

1. **Structure:** Act and Scene number inputs; a turn-order textarea;
   three Interlude-used checkboxes (labeled Interlude 1/2/3); an Arrest
   Phase checkbox with a notes field; an Epilogue notes field.
2. **Evidence Log:** a repeatable list. Each row: a description text
   input, a Good/Bad/Unknown select, a notes textarea, and a delete
   button. An "Add Evidence" button at the bottom appends a blank row.

Template: `templates/apps/case-tracker.hbs`.

## Error handling

None beyond what ApplicationV2's built-in form submission already
provides. This is GM-only scratch data with no downstream consumers (no
other feature reads `caseTracker` state) — consistent with how little
defensive code the rest of this codebase carries for its own sheets.

## Testing

No pure logic module here (unlike `dice-rules.mjs` /
`character-generator.mjs`), so no unit tests — this is entirely
Foundry-runtime UI plus a settings read/write. Added as a step to the
existing smoke-test checklist in
`docs/superpowers/plans/2026-08-05-procedural-system-v1.md`:

1. As GM, confirm the Case Tracker tool appears in the Token scene
   controls; click it and confirm the window opens.
2. Edit every field (act, scene, turn order, all three interlude
   checkboxes, Arrest Phase checkbox + notes, Epilogue notes), close the
   window, reopen it, and confirm every value persisted.
3. Add two evidence entries with different statuses, delete one, reopen
   the window, and confirm the remaining entry and its fields persisted.
4. Log in as (or impersonate) a non-GM player and confirm the scene
   control tool is not visible and the window cannot be opened.
