# Interrogations — Design

**Date:** 2026-08-06
**Status:** Approved for implementation
**Builds on:** `docs/superpowers/specs/2026-08-06-case-tracker-design.md`

## Goal

A third section of the existing GM-only Case Tracker implementing the
rulebook's **Interrogations** mechanic (`rulebook/source_rulebook.md:1430`):
when a suspect is interrogated, the Showrunner secretly rolls 2d6 — the
result (2-12) is how many meaningful questions the players may ask before
the suspect clams up. The tool rolls that number privately and lets the GM
track it down as questions get asked, across as many interrogations as a
case needs.

This was explicitly called out as deferred in the Case Tracker design doc's
scope note ("Partner Bonus tracking and Interrogation tooling ... not part
of this feature") — the next rulebook chunk not yet covered by any tool in
this system.

## Scope

**In scope:**
- A repeatable "Interrogations" list inside the existing Case Tracker
  window, following the same list pattern as the Evidence Log
- "Start Interrogation" button: secretly rolls 2d6 (no chat card, no
  animation, GM-only — matches "secretly rolls" exactly) and appends a new
  entry with the rolled total as its starting questions-remaining count
- Each entry: suspect name (freeform text, no Actor link), questions
  remaining (editable number, plus a quick "−1" button), notes, delete
- Entries persist across window close/reopen, same as Evidence rows

**Out of scope (explicitly deferred, not silently dropped):**
- Any chat card, whisper, or Dice So Nice animation for the roll — the
  rulebook is explicit the Showrunner rolls *secretly*; even a
  GM-whispered chat card would create a persistent log a player could
  later see over someone's shoulder or via `/dice log`-style tools. Pure
  in-app roll, nothing broadcast.
- Linking an entry to an actual NPC/suspect Actor document — freeform text
  is enough for v1, consistent with how `turnOrder` is freeform rather than
  actor-linked.
- Enforcing anything about what counts as a "meaningful question" or
  auto-ending the interrogation at zero — same philosophy as the rest of
  Case Tracker: a scratchpad the Showrunner updates by hand, not a rules
  engine. Reaching 0 doesn't lock the row or hide the buttons.
- Partner Bonus tracking — a separate deferred item, not part of this
  feature.

## Data model

### `CaseTrackerData` (`module/data/case-tracker.mjs`)

Add one new `ArrayField` alongside the existing `evidence` field:

| Field | Type | Notes |
|---|---|---|
| `interrogations` | ArrayField of SchemaField `{id, suspect, questionsRemaining, notes}` | `id` is `foundry.utils.randomID()`, same role as `evidence[].id`. `questionsRemaining` is a NumberField, integer, min 0, initial 0 |

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

## Foundry integration

### `CaseTrackerApplication` (`module/apps/case-tracker.mjs`)

No new imports needed — this reuses `resolveDice` from the existing pure
dice engine (`module/helpers/dice-rules.mjs`), the same function
`computeRoll` already calls for skill rolls. `resolveDice("normal",
Math.random)` returns `{ die1, die2, rawTotal, dice }` for a plain,
un-modified 2d6 roll — exactly the mechanic the rulebook specifies, and
already unit-tested, so no new pure-logic code is needed for the roll
itself.

Additions to the existing class, mirroring the Evidence Log's shape
exactly:

- `DEFAULT_OPTIONS.actions` gains `startInterrogation`,
  `decrementInterrogation`, `deleteInterrogation`.
- `_prepareContext` gains `context.interrogations = data.interrogations`
  (no per-entry transform needed — unlike Evidence's `statusOptions`,
  there's no enum field here, so the raw array maps straight to the
  template).
- `#formToData` gains `interrogations: Object.values(expanded.interrogations
  ?? {})`, same as the existing `evidence` line.
- `#onStartInterrogation()`: reads current form data via the existing
  `#formToData(this.form)` helper, rolls `resolveDice("normal",
  Math.random).rawTotal`, pushes `{ id: foundry.utils.randomID(), suspect:
  "", questionsRemaining: rawTotal, notes: "" }`, calls `setCaseTracker`,
  re-renders. Same try/catch-and-notify error handling as
  `#onAddEvidence`.
- `#onDeleteInterrogation(event, target)`: identical shape to
  `#onDeleteEvidence`, keyed off `data-interrogation-id`.
- `#onDecrementInterrogation(event, target)`: the "−1" button's handler,
  keyed off `data-interrogation-id` like the other two. Implemented as a
  `data-action` that reads/writes the setting (not a client-side-only DOM
  tweak), so the new value survives a window close without requiring the
  GM to separately trigger the form's submit-on-change first.

## UI

Appended to `templates/apps/case-tracker.hbs`, as a new `<section>` after
the existing Evidence Log section (last thing in the root `<section>`):

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

`decrementInterrogation` follows the same handler shape as
`deleteInterrogation`: read `data-interrogation-id` off the closest row,
`#formToData(this.form)`, find the matching entry, `Math.max(0,
entry.questionsRemaining - 1)`, save, re-render. Routing it through a
`data-action` (rather than mutating the `<input>` client-side) keeps this
consistent with every other mutation in the app — all state changes go
through `setCaseTracker` + re-render, none live only in the DOM.

CSS: reuse `.procedural-case-tracker-evidence-list` /
`-evidence-row`'s grid layout conventions for
`.procedural-case-tracker-interrogation-list` /
`-interrogation-row` (new classes, same structure — a 4-column row:
suspect / counter / notes / delete). No new visual language introduced.

New `lang/en.json` keys, inside the existing `"CaseTracker"` object:

```json
"Interrogations": "Interrogations",
"StartInterrogation": "Start Interrogation",
"InterrogationSuspect": "Suspect",
"InterrogationNotes": "Notes"
```

## Error handling

Same as the rest of Case Tracker: `setCaseTracker` calls in the new action
handlers are wrapped in try/catch, logging to console and showing a
`ui.notifications.error` on failure, matching `#onAddEvidence` /
`#onDeleteEvidence` exactly. No error handling around the roll itself —
`resolveDice` is a pure function with no failure mode.

## Testing

No new unit tests — `resolveDice` is already fully covered by
`module/helpers/dice-rules.test.mjs`, and this feature adds no other
pure-logic code (same testing profile as the rest of Case Tracker: entirely
Foundry-runtime UI plus a settings read/write).

Manual verification, added as a follow-up to the existing Case Tracker
checklist:

1. As GM, open the Case Tracker, click "Start Interrogation". Confirm a new
   row appears with a questions-remaining value between 2 and 12, and that
   no chat card was posted anywhere.
2. Type a suspect name and a note into the row; click "−1" twice; confirm
   the counter decreases by 1 each click and doesn't go below 0. Manually
   edit the number field directly and confirm that value sticks too.
3. Close and reopen the Case Tracker; confirm the row's suspect name,
   counter, and notes all persisted exactly as left.
4. Add a second interrogation entry; confirm both rows track independently
   (decrementing one doesn't affect the other).
5. Delete the first row; confirm it disappears and the second row's data is
   unaffected.
