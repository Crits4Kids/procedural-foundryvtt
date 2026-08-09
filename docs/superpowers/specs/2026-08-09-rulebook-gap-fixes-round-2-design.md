# Rulebook Gap Fixes, Round 2 — Design

## Purpose

A third rulebook-coverage audit (after PR #16's Drama/B-story-RP/Knockout and
PR #17's Season Mode progression) turned up three more rules with zero
implementation trace:

1. **Director table** (`rulebook/source_rulebook.md:2064-2105`) — a 1d6 table
   (3 named Directors, grouped 1-2/3-4/5-6) the Showrunner rolls to generate
   the season's antagonist-boss NPC.
2. **NPC ally personality table** (`rulebook/source_rulebook.md:1874-1898`) —
   a 1d6 table (6 named personalities) used to portray NPC allies filling out
   a squad when a table has fewer than 4 human players.
3. **Having a Flashback** (`rulebook/source_rulebook.md:1658-1671`) — a
   season-mode interlude option, alternative to working a B-story: a player
   features their desk item in a flashback scene, and on success may replace
   their secondary Talent. "A desk item may only have one flashback."

These are bundled into one spec (matching PR #16's precedent of grouping
several small, independent gap-fixes together) rather than three, since
Director and NPC personality are near-identical in shape to the already-
shipped Roll for Drama, and Flashback — while bigger — is still a single
self-contained mechanic.

## Scope

- `data/directors.json` + `data/npc-personalities.json`, registered in
  `GENERATOR_DATA_PATHS`.
- A Director section (display + "Roll Director" button) on the Season
  Tracker.
- A `personality` field + "Roll Personality" button on the NPC actor sheet.
- A `flashbackUsed` field on `EquipmentItemData`, a "Have a Flashback" button
  on the Trope sheet, and a shared Talent-swap-picker helper reused by both
  Level Up and Flashback.

## Out of scope

- No manual free-text override for any of the three new roll results — this
  matches every existing roll table in the codebase (Drama, HQ, Qualities,
  Agency Name, etc.): reroll to get something different, or ignore the
  button and homebrew it at the table.
- No new "season mode" toggle/flag. No such flag exists anywhere in the
  codebase today — Level Up and Villains are already just always-available
  buttons that a one-shot table simply doesn't use. Flashback follows the
  same precedent rather than inventing new state to gate on.
- No interlude turn-order tracking (who gets "first dibs," passing, etc.,
  per `rulebook/source_rulebook.md:1494-1502`). That's Showrunner table
  management, not app state, exactly like the existing B-story Resolve
  button has no turn-order enforcement either.
- No dice roll captured for the flashback's in-fiction success/fail beat —
  same as B-story, this is narrated at the table. The "Have a Flashback"
  button represents *resolving* a flashback the player already succeeded at,
  mirroring `#onResolveBStory`'s existing pattern exactly (that button also
  assumes success; there's no fail path modeled in the app for B-stories
  either).
- No reset logic for `flashbackUsed` when a desk item is replaced — covered
  under Flashback below, this falls out for free from existing delete
  behavior and deliberately isn't reimplemented as an explicit reset.

## 1. Director Table

### Data

`data/directors.json`, a flat 3-entry array (unlike every existing table's
6+6 odds/evens split — the rulebook's Director table is grouped
1-2/3-4/5-6, so 3 entries suffice):

```json
[
  "...full text for Cynthia Tilman...",
  "...full text for Byron Evers...",
  "...full text for Thomas \"Teddy\" O'Shea..."
]
```

Registered in `module/helpers/generator-data.mjs`'s `GENERATOR_DATA_PATHS`
as `directors: "systems/procedural/data/directors.json"`.

### Schema

`module/data/season-tracker.mjs`: add `director: new StringField({ initial: "" })`.

### App

`module/apps/season-tracker.mjs`: add a `rollDirector` action.

```js
static async #onRollDirector() {
  const generatorData = await loadGeneratorData();
  const roll = rollD6();
  const text = generatorData.directors[Math.ceil(roll / 2) - 1];

  const data = getSeasonTracker().toObject();
  data.director = text;
  try {
    await setSeasonTracker(data);
  } catch (err) {
    console.error("PROCEDURAL | Failed to save the Director roll result", err);
    ui.notifications?.error("PROCEDURAL! failed to save the Director roll. Check the console for details.");
    return;
  }
  this.render();
}
```

`Math.ceil(roll / 2) - 1` maps rolls 1-2→index 0, 3-4→index 1, 5-6→index 2.

### Template

`templates/apps/season-tracker.hbs`: a Director section (display + "Roll
Director" button), same shape as the Case Tracker's Drama section
(read-only `<p>` bound to `context.director`, hidden `<input>` for form
submission, button with `data-action="rollDirector"`).

## 2. NPC Ally Personality Table

### Data

`data/npc-personalities.json`, a flat 6-entry array (the first flat 1-6
table in this data set — every existing table is a 6+6 odds/evens split):

```json
[
  "Elias Cope, 30. Hot-headed and impulsive...",
  "Jennifer Thompson, 40. Measured and cautious...",
  "Dave Hunt, 45. Cold and detached...",
  "Willow McClachlan, 25. Bright-eyed and eager, but naive.",
  "Ron Briar, 32. The class clown, but out of his depth in a fight.",
  "Cindy Huntsman, 30. Methodical and very by-the-book."
]
```

Registered as `npcPersonalities: "systems/procedural/data/npc-personalities.json"`.

### Schema

`module/data/actor-npc.mjs`: add `personality: new StringField({ initial: "" })`.

### Sheet

`module/sheets/actor-npc-sheet.mjs`: add a `rollPersonality` action.

```js
static async #onRollPersonality() {
  const generatorData = await loadGeneratorData();
  const roll = rollD6();
  await this.actor.update({ "system.personality": generatorData.npcPersonalities[roll - 1] });
}
```

No try/catch needed here (unlike the Season/Case Tracker's `game.settings`
writes) — this follows the same pattern as every other single-field
`actor.update()` call in `actor-trope-sheet.mjs` (`#onToggleHurt`,
`#onResolveBStory`, etc.), none of which wrap the update in error handling.

### Template

`templates/actor/npc-sheet.hbs`: a display + "Roll Personality" button,
same shape as the other roll sections.

## 3. Having a Flashback

### Schema

`module/data/item-equipment.mjs`: add `flashbackUsed: new BooleanField({ initial: false })`.

This lives on the Equipment item itself, not the Trope actor. That's the
key design choice: "a desk item may only have one flashback" and "a player
may replace their desk item in the next season" both fall out for free
this way. `actor-trope-sheet.mjs`'s existing `#setDeskItem` already
**deletes** the previous desk item's Equipment document whenever it's
replaced:

```js
if (previousId && previousId !== item.id) {
  await actor.items.get(previousId)?.delete();
}
```

A freshly-created desk item Equipment document always starts with
`flashbackUsed: false` by schema default — no explicit reset logic needed
anywhere, and no way for the flag to leak across desk items.

### Shared Talent-swap picker

`#onLevelUp` (`actor-trope-sheet.mjs:118-197`) currently inlines: building
the `heldElsewhere` dedup set (Talents held by other Trope actors), the
`<select>` of `availableTalents`, and the delete-old/create-new swap. Extract
the "pick and swap the secondary Talent" portion into a private static
helper on the same class:

```js
static async #pickAndSwapTalent(actor, generatorData) {
  const currentTalent = actor.items.find(i => i.type === "talent");
  const heldElsewhere = new Set(
    game.actors
      .filter(a => a.type === "trope" && a.id !== actor.id)
      .flatMap(a => a.items.filter(i => i.type === "talent").map(i => i.name))
  );
  const availableTalents = generatorData.secondTalents.filter(t => !heldElsewhere.has(t.name));

  const talentName = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("PROCEDURAL.Actor.FlashbackTalentSwap") },
    content: `
      <label>${game.i18n.localize("PROCEDURAL.Actor.LevelUpTalentSwap")}
        <select name="talentName">
          ${availableTalents.map(t => `<option value="${t.name}">${t.name}</option>`).join("")}
        </select>
      </label>
    `,
    buttons: [
      {
        action: "confirm",
        label: game.i18n.localize("PROCEDURAL.Actor.LevelUpConfirm"),
        default: true,
        callback: (event, button) => button.form.elements.talentName.value
      },
      { action: "cancel", label: game.i18n.localize("PROCEDURAL.Roll.Cancel"), callback: () => false }
    ],
    rejectClose: false
  });
  if (!talentName) return;

  const talentSource = availableTalents.find(t => t.name === talentName);
  if (!talentSource) return;
  if (currentTalent) await currentTalent.delete();
  await Item.createDocuments(
    [{ name: talentSource.name, type: "talent", img: talentSource.img, system: { ...talentSource.system } }],
    { parent: actor }
  );
}
```

`#onLevelUp` keeps its own dialog (stat/skill radio + talent `<select>`,
where skipping the talent swap is a valid "keep current Talent" choice —
Flashback has no such choice, swapping is the entire point), but delegates
the actual swap execution to this helper once `config.talentName` is
chosen. `#onLevelUp`'s inline swap block (currently lines ~192-197) is
replaced with a call into the shared logic; the `heldElsewhere`/
`availableTalents` computation likewise moves into the helper so both call
sites can't drift out of sync on the dedup rule.

### New action

`actor-trope-sheet.mjs`: add `resolveFlashback` action.

```js
static async #onResolveFlashback() {
  const deskItem = this.actor.items.get(this.actor.system.deskItemId);
  if (!deskItem || deskItem.system.flashbackUsed) return;

  const generatorData = await loadGeneratorData();
  await deskItem.update({ "system.flashbackUsed": true });
  await ProceduralTropeActorSheet.#pickAndSwapTalent(this.actor, generatorData);
}
```

### Template

`templates/actor/trope-sheet.hbs`: a "Have a Flashback" button next to the
desk item display, alongside the existing B-story Resolve button. Hidden
(same convention as other one-shot buttons in this template) once
`context.deskItem.system.flashbackUsed` is true, or if there's no desk item
assigned yet.

## Error Handling & Testing

- `rollDirector` follows `#onRollForDrama`'s existing `try/catch` +
  `ui.notifications?.error(...)` + `console.error("PROCEDURAL | ...")`
  pattern, since it writes through `game.settings`.
- `rollPersonality` and `resolveFlashback` write directly via
  `actor.update()`/`item.update()`, matching every other single-field actor
  update in `actor-trope-sheet.mjs` — none of those wrap in try/catch, and
  this spec doesn't introduce a new convention.
- No Foundry-runtime test harness exists in this repo (confirmed by both
  prior gap-fix specs) — sheet/app wiring for all three features is verified
  by hand, same as the rest of `actor-trope-sheet.mjs`/`case-tracker.mjs`/
  `season-tracker.mjs`/`actor-npc-sheet.mjs`.
- The `#pickAndSwapTalent` extraction stays a private static method on
  `ProceduralTropeActorSheet` (shared between two call sites in the same
  class), not moved into `module/helpers/` — it's DOM/dialog-driven, not
  pure logic, so it doesn't get a `.test.mjs` file, consistent with how
  `validateLevelUpChoice` (the one pure piece of Level Up's logic) is the
  only unit-tested part of that feature today.
