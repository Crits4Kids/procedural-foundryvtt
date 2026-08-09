# NPC Generator — Design

## Purpose

Add an NPC ally generator that follows the same interaction pattern as the
existing Trope Builder wizard (`module/apps/trope-builder.mjs`): a guided,
multi-step Application launched from a button in the Actor Directory header,
that rolls/chooses its way through the relevant tables and creates a
finished Actor when done.

The NPC data model is much smaller than the Trope/PC one — `NpcActorData`
(`module/data/actor-npc.mjs`) is just `skills` (default +1, per the rulebook
NPC-ally rule) and `personality` (a string, already wired up via the
existing "Roll Personality" button on `actor-npc-sheet.mjs`). Per
`rulebook/source_rulebook.md:1094-1105`, an NPC ally's only other trait is
the Talent granted by a Trope the Showrunner rolls or chooses for them —
they have no stats, no skill allocation, no B-story, no HQ, no second
Talent, no desk item. So the wizard is 3 steps, not the Trope Builder's 11.

## Scope

- `NpcBuilderApplication` (`module/apps/npc-builder.mjs`), modeled on
  `TropeBuilderApplication`: same `HandlebarsApplicationMixin(ApplicationV2)`
  step-index/draft pattern, same `goNext`/`goBack`/`goToStep`/`finish`
  action names.
- Steps: **Personality** → **Trope** → **Review**.
- A second Actor Directory header button ("Generate NPC"), next to the
  existing "Build Trope Character" button.
- Two new pure helpers in `module/helpers/character-generator.mjs`, unit
  tested alongside the existing ones in `character-generator.test.mjs`.

## Out of scope

- No stats, skill allocation, quality, quirk, bstory, second Talent, HQ,
  desk item, or agency name steps — none of these exist on `NpcActorData`,
  and the rulebook explicitly says NPC allies don't have them
  ("NPC allies do not set scenes, use Rerun Points, B-stories, or
  flashbacks").
- No changes to the existing single-field "Roll Personality" button on the
  NPC sheet (`actor-npc-sheet.mjs`) — it still works standalone for
  re-rolling personality on an already-created NPC. The new wizard is an
  additive, alternate entry point for creating a brand-new NPC actor from
  scratch, exactly like the Trope Builder coexists with `actor-trope-sheet.mjs`'s
  own "Randomize" button.
- No in-sheet "Randomize everything" button for NPCs (the second option
  considered and declined during design) — out of scope for this pass.
- No manual free-text override deviation from existing convention: like
  every roll-choose-create step in the Trope Builder, the Personality and
  Trope steps offer Roll, a dropdown of canned options, and a free-text
  field to type your own.

## 1. Data & Helpers

No new data files — `data/npc-personalities.json` (6-entry flat array) and
`data/tropes.json` (11-entry array) already exist and are already
registered in `GENERATOR_DATA_PATHS`.

`module/helpers/character-generator.mjs` gets two new pure functions:

```js
/**
 * NPC personality table: a flat 1d6 roll (data/npc-personalities.json),
 * unlike the qualities/quirks/bstory/hq tables' odds/evens split.
 */
export function rollNpcPersonality(personalities, rng) {
  return personalities[roll1d6(rng) - 1];
}

/**
 * Parses the name out of a personality string, e.g.
 * "Elias Cope, 30. Hot-headed..." -> "Elias Cope". Falls back to the full
 * trimmed string if there's no comma (free-typed personality text).
 */
export function parseNpcName(personality) {
  const [name] = personality.split(",");
  return name.trim();
}
```

`rollTrope` is reused as-is from the existing Trope Builder — no changes
needed there.

## 2. `NpcBuilderApplication`

`module/apps/npc-builder.mjs`, following `trope-builder.mjs`'s shape:

```js
const STEP_IDS = ["personality", "trope", "review"];

#draft = {
  personality: "",
  trope: null
};
```

- **Personality step** reuses the existing generic
  `templates/apps/trope-builder-steps/roll-choose-create.hbs` partial
  (Roll button + dropdown of the 6 canned entries + free-text textarea) —
  it's already data-driven off a `{ label, options, value }` context and
  isn't Trope-specific. `rollTable` action calls
  `rollNpcPersonality(data.npcPersonalities, Math.random)`.
- **Trope step** gets a new, simplified template
  (`templates/apps/npc-builder-steps/trope.hbs`): Roll button + dropdown
  of all 11 Tropes (same list as the PC wizard), showing the selected
  Trope's Talent name/description once chosen. No stat block display, no
  Gifted-stat radio — NPCs never touch stats. `rollTrope` action reuses
  `rollTrope(data.tropes, Math.random)` unchanged from `character-generator.mjs`.
- **Review step** (`templates/apps/npc-builder-steps/review.hbs`): shows
  the derived name (`parseNpcName(draft.personality)`), the full
  personality text, and the chosen Trope + Talent, each with an "Edit"
  link back to its step (same `goToStep` pattern as the Trope Builder's
  review step).

Validation (`#isStepValid`):
- `personality`: non-empty after trim
- `trope`: non-null
- `review`: always true

### Finish

```js
static async #onFinish() {
  const draft = this.#draft;
  const name = parseNpcName(draft.personality);
  const actor = await Actor.create({ name, type: "npc" });

  await actor.update({ "system.personality": draft.personality });

  await Item.createDocuments([
    { name: draft.trope.name, type: "trope", img: draft.trope.img, system: { ...draft.trope.system } },
    {
      name: draft.trope.system.talentName,
      type: "talent",
      img: draft.trope.img,
      system: {
        description: draft.trope.system.talentDescription,
        usesPerAct: draft.trope.system.talentUsesPerAct
      }
    }
  ], { parent: actor });

  await this.close();
  actor.sheet.render(true);
}
```

Skills are left untouched — `NpcActorData.skills` already defaults every
skill to `1` (`buildSkillsSchema(1)`), which is correct per the rulebook's
flat "+1 in every skill" rule and needs no per-skill draft state.

The `trope` item is created for reference/display, matching the NPC
sheet's existing `items.trope` list (`templates/actor/npc-sheet.hbs`); the
`talent` item is the mechanically-relevant one, mirroring how
`generateRandomTrope` (`module/documents/actor.mjs`) derives a Talent item
from a Trope for PCs' second Talent.

Same `#finishing` re-entrancy guard and `try/catch` + `console.error` +
`ui.notifications?.error(...)` pattern as
`TropeBuilderApplication.#onFinish`.

## 3. Directory Button

`module/procedural.mjs`: a second button in the same
`Hooks.on("renderActorDirectory", ...)` handler, following the existing
button's exact structure (icon + localized label, de-dupe against an
already-open instance via `foundry.applications.instances.get(...)`,
`bringToFront()` if found):

```js
const npcButton = document.createElement("button");
npcButton.type = "button";
npcButton.classList.add("procedural-npc-builder-launch");
npcButton.innerHTML = `<i class="fa-solid fa-user-plus"></i> ${game.i18n.localize("PROCEDURAL.NpcBuilder.Launch")}`;
npcButton.addEventListener("click", () => {
  const existing = foundry.applications.instances.get("procedural-npc-builder");
  if (existing) {
    existing.bringToFront();
    return;
  }
  new NpcBuilderApplication().render(true);
});
header.appendChild(npcButton);
```

Guarded the same way against double-injection
(`header.querySelector(".procedural-npc-builder-launch")`).

## 4. Localization

`lang/en.json`: new `PROCEDURAL.NpcBuilder` section with only the two
strings that don't already exist:

```json
"NpcBuilder": {
  "Title": "Build an NPC Ally",
  "Launch": "Generate NPC"
}
```

All other UI strings are reused from the existing `PROCEDURAL.TropeBuilder`
section (`StepIndicator`, `Back`, `Next`, `Finish`, `Edit`, `Roll`,
`ChooseOption`, `OrTypeYourOwn`) since they're generic wizard-chrome text,
not Trope-specific — and from `PROCEDURAL.Actor.Personality` /
`PROCEDURAL.Item.TalentName` / `PROCEDURAL.Item.TalentDescription` /
`TYPES.Item.trope` for field labels.

## Error Handling & Testing

- `#onFinish` follows `TropeBuilderApplication.#onFinish`'s exact
  try/catch + re-entrancy-guard + `ui.notifications?.error(...)` pattern.
- `rollNpcPersonality` and `parseNpcName` are pure functions added to
  `character-generator.mjs` and covered in `character-generator.test.mjs`:
  `rollNpcPersonality` across all 6 roll outcomes (boundary + middle, same
  style as the existing `rollTrope` tests); `parseNpcName` for the normal
  "Name, age. ..." case and the no-comma free-text fallback case.
- No Foundry-runtime test harness exists in this repo (consistent with
  every prior spec) — `NpcBuilderApplication` wiring itself is verified by
  hand, same as `TropeBuilderApplication`.
