# Talent Act Reset — Design

## Purpose

The rulebook says a second Talent "may only be used once per act unless
otherwise specified as having no limit." `TalentItemData` already has a
`used` checkbox (`module/data/item-talent.mjs`) that players tick manually,
but nothing ever clears it — once checked, a Talent stays unusable for the
rest of the game unless a player remembers to untick it by hand. This
feature makes the Case Tracker's Act field the source of truth: changing it
automatically clears every Talent's `used` checkbox, world-wide.

## Scope

- A new pure helper, `module/helpers/talent-reset.mjs`, exporting
  `findTalentsToReset(actors)`: given a plain array of actor-shaped objects,
  returns the `{actorId, itemId}` pairs for every embedded Talent item that
  currently has `used === true`.
- `CaseTrackerApplication#onSubmit` (`module/apps/case-tracker.mjs`) detects
  when the submitted `act` differs from the previously stored `act`, and on
  a change, calls a new `resetTalentUses()` function that maps `game.actors`
  into the plain shape, runs it through `findTalentsToReset`, and applies the
  resulting updates via `updateEmbeddedDocuments`.
- A `ui.notifications.info` message reporting how many Talents were reset.

## Out of scope

- No manual "Reset Talents" button — the user confirmed automatic-on-act-change
  is the only trigger needed.
- No filtering by `usesPerAct` (e.g. skipping "no limit" Talents) — those
  Talents' `used` checkbox is simply never ticked by players in practice, so
  clearing it unconditionally is harmless and keeps the logic simple.
- No change to `TalentItemData`'s schema — `used` and `usesPerAct` already
  exist and are unchanged by this feature.
- No reset on world load or on any trigger other than a Case Tracker act-field
  change (e.g. not tied to advancing scenes or interludes).
- No Foundry-runtime tests for `resetTalentUses` or the `#onSubmit` change —
  this codebase has no Foundry-runtime test harness; verified by hand, same
  as the rest of `case-tracker.mjs`.

## Pure helper

`module/helpers/talent-reset.mjs`:

```js
/**
 * @param {Array<{id: string, items: Array<{id: string, type: string, system: {used: boolean}}>}>} actors
 * @returns {Array<{actorId: string, itemId: string}>}
 */
export function findTalentsToReset(actors) {
  const updates = [];
  for (const actor of actors) {
    for (const item of actor.items ?? []) {
      if (item.type === "talent" && item.system?.used === true) {
        updates.push({ actorId: actor.id, itemId: item.id });
      }
    }
  }
  return updates;
}
```

No Foundry globals — takes and returns plain data, same shape convention as
`character-generator.mjs`'s pure functions.

## Case Tracker integration

`module/apps/case-tracker.mjs`:

- `#onSubmit(event, form)`: before calling `setCaseTracker`, read the
  previous act via `getCaseTracker().act`. After a successful
  `setCaseTracker`, if the new `act` differs from the previous one, call
  `await CaseTrackerApplication.#resetTalentUses()`.
- New private static `#resetTalentUses()`:
  1. Build the plain shape: `game.actors.map(a => ({ id: a.id, items: a.items.map(i => ({ id: i.id, type: i.type, system: { used: i.system.used } })) }))`.
  2. Call `findTalentsToReset(actors)`.
  3. Group the resulting pairs by `actorId`, and for each actor call
     `actor.updateEmbeddedDocuments("Item", [{ _id: itemId, "system.used": false }, ...])`.
  4. Wrap the update loop in try/catch: on failure, `console.error` and
     `ui.notifications.error("PROCEDURAL! failed to reset Talents. Check the console for details.")`,
     matching the existing error-handling pattern used elsewhere in this file
     — but this failure must not roll back or block the act-number save that
     already happened.
  5. On success, if any Talents were reset,
     `ui.notifications.info(`PROCEDURAL! reset ${count} Talent${count === 1 ? "" : "s"} for Act ${newAct}.`)`.
     If none were reset, no notification (avoids noise on every act change
     when no Talents happen to be checked).

No changes to `templates/apps/case-tracker.hbs` — this is a side effect of
the existing Act field, not a new UI element.

## Testing

`module/helpers/talent-reset.test.mjs` (new): unit tests for
`findTalentsToReset` covering:
- No actors → empty array.
- Actor with no items → empty array.
- Actor with a used Talent → one pair returned.
- Actor with an unused Talent → no pair returned.
- Actor with a non-Talent item (e.g. `equipment`) that happens to have
  `system.used` → ignored (type filter matters, not just field presence).
- Multiple actors, mixed used/unused Talents → only the used ones, correctly
  attributed to their actor.

Runnable via `npm test`, alongside the existing `dice-rules` and
`character-generator` suites.

## User flow

1. GM opens the Case Tracker, changes the Act field from 1 to 2, and the
   form auto-saves (existing `submitOnChange` behavior).
2. Every Talent item on every actor in the world that currently has its
   "Used" checkbox ticked gets automatically unticked.
3. The GM sees a notification: "PROCEDURAL! reset 3 Talents for Act 2."
4. Players opening their Trope sheet see their Talent(s) available again
   with no manual action needed.

## Verification

Manual smoke test (no Foundry-runtime test harness):

1. Create two Trope actors, each with a Talent item; tick "Used" on one of
   them (leave the other unticked).
2. Open the Case Tracker as GM and change Act from 1 to 2; confirm a
   notification reports "reset 1 Talent for Act 2."
3. Confirm the previously-used Talent's checkbox is now unticked on its
   sheet, and the already-unused one is unaffected.
4. Change the Act field again without any Talents currently used; confirm
   no notification appears (no-op, no noise).
5. Change a field other than Act (e.g. Scene, Turn Order); confirm no
   Talent reset happens.
6. `npm test` passes with the new `talent-reset.test.mjs` suite.
