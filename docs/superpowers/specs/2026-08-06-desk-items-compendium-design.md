# Desk Items Compendium — Design

## Purpose

The rulebook's Season Mode has a "What's on Your Desk?" mechanic: every
investigator has a personal item on their desk at HQ that informs their
character and can later become the subject of a flashback. Today the Trope
actor sheet only has a free-text `system.deskItem` field — there's no way to
browse a pool of desk-item ideas and drag one onto a sheet the way players
already do with Tropes and second Talents.

This feature adds a new world compendium, **"Procedural: Desk Items,"** full
of ready-made desk-item Items that players can drag onto their Trope's
Equipment list, seeded automatically the same way the existing Tropes and
Second Talents compendiums are.

## Scope

- New data file `data/desk-items.json` containing the rulebook's 12 canonical
  desk items plus ~30 new original entries, heavily flavored around TV
  procedural drama tropes.
- One new entry in `SEED_PACKS` (`module/helpers/seed-compendiums.mjs`) to
  seed the compendium on world launch, following the exact pattern already
  used for Tropes and Second Talents.
- README update noting the new auto-seeded compendium (matching the existing
  "two world compendiums" callout).

## Out of scope

- No schema changes. Desk-item entries use the existing `equipment` item
  type (`EquipmentItemData`: just a `description` field) — no new item type.
- No changes to `system.deskItem`. It remains a separate free-text field on
  the Trope actor for a short flashback note; the dragged Equipment item is
  the "physical" object with its own flavor-text description. The two are
  intentionally decoupled — nothing links them programmatically.
- No changes to sheet templates, document classes, or drag/drop handling.
  `ActorSheetV2`'s built-in drop handling and the Trope sheet's existing
  Equipment list section (`templates/actor/trope-sheet.hbs`) already support
  dragging a compendium Item onto a Trope; the compendium seeder is the only
  moving part this feature touches.
- No test changes. This is content plus one config-array entry; it doesn't
  touch the pure-logic modules that have unit test coverage (dice rules,
  character generator).

## Data format

`data/desk-items.json` is a flat array, matching the shape already used by
`data/second-talents.json`:

```json
[
  {
    "name": "A Sad Little Cactus",
    "img": "icons/svg/mystery-man.svg",
    "system": {
      "description": "Free flavor text describing the item and, where it adds color, why an investigator would keep it on their desk."
    }
  }
]
```

- `img` is `icons/svg/mystery-man.svg` for every entry, matching the
  placeholder-icon convention already used across `tropes.json` and
  `second-talents.json` (no per-item art in this system yet).
- `system.description` is the only field on `EquipmentItemData`, so every
  entry's flavor text lives there.
- The rulebook's 12 canonical entries (from the Odds/Evens "What's on Your
  Desk?" table) are included verbatim as the first 12 entries, followed by
  ~30 new original entries.

## Seeding

Add one object to `SEED_PACKS` in `module/helpers/seed-compendiums.mjs`:

```js
{
  label: "Procedural: Desk Items",
  name: "procedural-desk-items",
  type: "equipment",
  path: "systems/procedural/data/desk-items.json"
}
```

`seedCompendiums()` already loops over `SEED_PACKS`, fetches each path,
creates a world compendium if one with that name doesn't exist yet, and bulk
imports the entries as Items via `Item.createDocuments`. No other code
changes are needed for the pack to appear and be seeded on next world
launch.

## User flow

1. GM launches the world; "Procedural: Desk Items" appears in the
   Compendium Packs sidebar alongside Tropes and Second Talents.
2. A player opens the compendium, browses desk items, and drags one onto
   their Trope actor sheet.
3. It lands in the existing Equipment list section (`items.equipment` in
   `actor-trope-sheet.mjs`), editable/deletable like any other equipment.
4. The player may optionally also jot a short note in the existing
   `system.deskItem` text field (e.g. "the cactus — used it in Ep. 3's
   flashback").

## Verification

Manual smoke test (this system has no Foundry-runtime test harness — see
README's existing testing section):

1. Launch Foundry against a fresh world using the PROCEDURAL! system.
2. Confirm "Procedural: Desk Items" appears in the Compendium Packs sidebar
   with ~42 entries.
3. Drag two or three desk items onto a Trope actor; confirm they appear in
   the Equipment list, and that edit/delete on them works as with any other
   equipment item.
4. Confirm existing compendiums (Tropes, Second Talents) still seed
   correctly — i.e. adding the new `SEED_PACKS` entry didn't break the loop.
