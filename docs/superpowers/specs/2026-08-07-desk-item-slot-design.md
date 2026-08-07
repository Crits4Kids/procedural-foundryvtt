# Desk Item Slot — Design

## Purpose

The "Procedural: Desk Items" compendium (added previously) is a pool of
draggable flavor Items, but nothing on the Trope actor tracks *which one* is
currently on a given investigator's desk. Dragging a desk item onto a Trope
sheet today just dumps it into the generic Equipment list, indistinguishable
from a gun or a badge. This feature makes "desk item" a first-class,
single-slot concept on the Trope: a dedicated section on the sheet you can
drag a desk item into, a pick the Randomize button makes automatically, and a
step in the Trope builder wizard.

## Scope

- New `deskItemId` field on `TropeActorData`, referencing the id of the
  embedded `equipment` Item currently occupying the desk-item slot.
- A dedicated "Desk Item" section on the Trope actor sheet: shows the current
  desk item (image, name, description) with edit/delete actions, or an
  empty-state prompt. Acts as its own drop zone — dropping a compendium (or
  world) Item there sets the slot, deleting whatever was in it before.
- The existing free-text `system.deskItem` field is unchanged in behavior,
  only relabeled ("Desk Item Note") since "Desk Item" now names the real
  linked object.
- Randomize (`ProceduralActor#generateRandomTrope`) picks a random entry from
  `data/desk-items.json` and sets it as the desk-item slot, alongside its
  existing Trope/Talent/skills reroll.
- The Trope builder wizard gets a new "deskItem" step (dropdown of all 42
  entries + description, styled exactly like the existing Second Talent
  step), inserted between "hq" and "agencyName". Finishing the wizard creates
  the chosen desk item as an embedded Item and sets `deskItemId`.

## Out of scope

- No change to how dragging non-desk-item Equipment works — the generic
  Equipment list and its drop handling behave exactly as today.
- No change to the free-text note field's semantics — it remains a separate,
  decoupled flashback note; only its sheet label changes.
- No roll-table mechanic for desk items in the wizard (no "Roll" button) —
  matches the existing Second Talent step, the nearest analog (a dropdown
  over a fixed list of named Items, not an Odds/Evens table).
- No Foundry-runtime tests for the sheet or wizard changes — this codebase
  has no Foundry-runtime test harness; those are verified by hand, matching
  every other sheet/wizard feature so far.

## Data model

`module/data/actor-trope.mjs` — add one field to `TropeActorData.defineSchema()`:

```js
deskItemId: new StringField({ initial: "" })
```

Resolved on the sheet via `actor.items.get(actor.system.deskItemId) ?? null`;
a stale/missing id (e.g. after the item was deleted) resolves to `null` and
the slot just renders as empty. No migration needed for existing actors —
the field defaults to `""`.

## Trope actor sheet

`module/sheets/actor-trope-sheet.mjs`:

- `_prepareContext`: add `context.deskItem = this.actor.items.get(this.actor.system.deskItemId) ?? null`.
  Change the `items.equipment` filter to exclude that same id, so the desk
  item never appears twice.
- Override `_onDropItem(event, item)`: call `super._onDropItem(event, item)`
  first (unchanged default create/sort behavior), then, only if the drop
  landed inside `[data-drop-zone="desk-item"]` (`event.target.closest(...)`)
  and the resulting item's type is `equipment`, call a private
  `#setDeskItem(item)` helper that deletes the previous desk item (if any and
  if different from the new one) and updates `system.deskItemId`.
- `#onRandomizeTrope`'s `hasExistingData` check adds `!!s.deskItemId` to its
  list of conditions that trigger the overwrite-confirmation dialog.
- `#onDeleteItem` needs no change — deleting the linked item just leaves a
  dangling `deskItemId` that resolves to `null` on next render.

`templates/actor/trope-sheet.hbs`:

- New section directly after the existing `procedural-text-fields` section:

```hbs
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
```

- The existing free-text field's label changes from
  `PROCEDURAL.Actor.DeskItem` to `PROCEDURAL.Actor.DeskItemNote`.

## Randomize

- `module/helpers/generator-data.mjs`: add `deskItems: "systems/procedural/data/desk-items.json"` to `GENERATOR_DATA_PATHS`.
- `module/helpers/character-generator.mjs`: `generateTrope(data, rng)` adds
  `deskItem: pickRandom(data.deskItems, rng)` to its returned object; JSDoc
  gets a `data.deskItems` entry.
- `module/documents/actor.mjs` (`generateRandomTrope`): include the current
  desk item (if any) in the `staleItems` deletion alongside trope/talent
  items. Add the desk item as a third entry in the same
  `Item.createDocuments` call that creates the trope/talent items, capture
  its id from the returned array, and set `system.deskItemId` via a
  follow-up `this.update(...)` call after that (the main `update()` earlier
  in the method runs before the items exist yet, so it can't include the id).

## Trope builder wizard

`module/apps/trope-builder.mjs`:

- `STEP_IDS`: `[..., "secondTalent", "hq", "deskItem", "agencyName", "review"]`.
- `#draft.deskItem = null` added to the draft shape.
- `_prepareContext`: `context.show.deskItem = stepId === "deskItem"`; when on
  that step, `context.deskItemOptions` built the same way
  `secondTalentOptions` is (map `this.#data.deskItems` to `{name, selected}`).
- `_onRender`: a `deskItem`-step branch wires a `[data-role="desk-item-select"]`
  change listener that sets `this.#draft.deskItem` and re-renders — copy of
  the existing `secondTalent` branch.
- `#isStepValid`: `case "deskItem": return this.#draft.deskItem !== null;`
- `#onFinish`: `Item.createDocuments` gets a third entry for the desk item
  (`{ name: draft.deskItem.name, type: "equipment", img: draft.deskItem.img, system: { ...draft.deskItem.system } }`);
  after creation, `actor.update({ "system.deskItemId": <created desk item's id> })`.
- `static PARTS.form.templates` gets
  `"systems/procedural/templates/apps/trope-builder-steps/desk-item.hbs"`.

`templates/apps/trope-builder.hbs`: add
`{{#if show.deskItem}}{{> "systems/procedural/templates/apps/trope-builder-steps/desk-item.hbs"}}{{/if}}`.

New `templates/apps/trope-builder-steps/desk-item.hbs`, copied from
`second-talent.hbs`'s shape:

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

`templates/apps/trope-builder-steps/review.hbs`: add a row between HQ and
Agency Name:

```hbs
<dt>{{localize "PROCEDURAL.Actor.DeskItem"}}</dt>
<dd>{{draft.deskItem.name}} <button type="button" data-action="goToStep" data-step="deskItem">{{localize "PROCEDURAL.TropeBuilder.Edit"}}</button></dd>
```

## Localization

`lang/en.json`, under `PROCEDURAL.Actor`:

- `"DeskItem": "Desk Item"` (repurposed — now labels the slot/review row,
  previously labeled the free-text field)
- `"DeskItemNote": "Desk Item Note"` (new — the free-text field's new label)
- `"DeskItemEmpty": "Drag a Desk Item here from the Procedural: Desk Items compendium."` (new)

## CSS

`css/procedural.css`: small additions following existing conventions —
`.procedural-desk-item`, `.procedural-desk-item-card` (flex row: image, text,
buttons), `.procedural-desk-item-img` (thumbnail sizing matching other item
icons if any exist, otherwise a sensible fixed size), `.procedural-desk-item-empty`
(muted placeholder text).

## Testing

`module/helpers/character-generator.test.mjs`: add a `DESK_ITEMS_FIXTURE`
array (2-3 entries, matching the shape of `SECOND_TALENTS_FIXTURE`), pass
`deskItems: DESK_ITEMS_FIXTURE` into the `generateTrope` wiring test's input,
and assert `result.deskItem.name` equals the expected fixture entry for the
fixed `rng`.

## User flow

1. A player drags a desk item from the "Procedural: Desk Items" compendium
   onto the new "Desk Item" section of their Trope sheet (not the general
   Equipment list). It appears there with its description; dragging a
   different one later replaces it.
2. Clicking Randomize rerolls the Trope, skills, and flavor fields as today,
   and now also rerolls the desk item.
3. Building a new Trope through the wizard includes a "choose your desk
   item" step (between HQ and Agency Name) before the review screen.

## Verification

Manual smoke test (no Foundry-runtime test harness):

1. Drag a desk item onto a Trope sheet's new Desk Item section; confirm it
   appears there (not in Equipment), with edit/delete working.
2. Drag a second desk item into the same section; confirm the first one is
   deleted and replaced.
3. Drag a non-desk-item Equipment item onto the rest of the sheet; confirm
   it still lands in the generic Equipment list, unaffected.
4. Click Randomize; confirm a desk item is picked and replaces any existing
   one.
5. Run the Trope builder wizard end to end; confirm the new "deskItem" step
   appears between HQ and Agency Name, is required to advance, shows on the
   review screen, and results in the finished actor having that desk item
   in its new sheet section.
6. `npm test` passes with the updated `character-generator.test.mjs`.
