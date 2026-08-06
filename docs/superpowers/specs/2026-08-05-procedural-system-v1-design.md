# PROCEDURAL! Foundry VTT System — v1 Design

**Date:** 2026-08-05
**Status:** Approved for implementation
**Source material:** `Rulebook/source_rulebook.md`

## Goal

Build a locally-installable Foundry VTT (v14) game system implementing the core
character sheet and dice mechanics of *PROCEDURAL!*, so it can be loaded into a
test world and played end-to-end. Session-structure tooling (acts/scenes/
interludes/evidence tracking) and roll-table compendiums for flavor content
(Quality/Quirk/HQ/Agency Name/Desk Item) are explicitly out of scope for v1.

## Scope

**In scope:**
- Actor types: `trope` (player character), `npc` (allies/suspects)
- Item types: `trope`, `talent`, `equipment`
- Fully automated 2d6 dice engine: success ladder, advantage/disadvantage,
  raw-2/raw-12 crit handling, Hurt status effects, Rerun Point reroll
- Compendiums pre-populated with all 12 Tropes and 14 second Talents from the
  rulebook
- Functional/plain sheet styling

**Out of scope (explicitly deferred, not silently dropped):**
- Act/Scene/Interlude/Arrest Phase/Epilogue structure tracking
- Evidence log (good/bad/unknown tracking)
- Roll-table compendiums for Quality, Quirk, HQ, Agency Name, Desk Item
- Talent "once per act" automated reset (manual checkbox for v1)
- Rerun-Point-pooling for new leads (Showrunner-narrated, not automated)
- Packed LevelDB compendiums via the Foundry CLI (v1 uses JSON auto-seeding
  instead, to avoid requiring a build step for local testing)

## Foundry version & architecture note

Targeting Foundry v14. The project currently has a legacy `template.json`
stub — this design replaces it. Foundry v11+ supports declaring Actor/Item
subtypes directly in `system.json` (`documentTypes`) backed by JS
`DataModel` classes, which supersedes `template.json`. This gives typed
fields, validation, and computed properties, and is the currently
recommended pattern for a system built fresh against a modern version.
`template.json` will be removed once the DataModel classes are in place.

## Data model

### Actor: `trope` (PC)

| Field | Type | Notes |
|---|---|---|
| `stats.mental/physical/social` | number | Point pools from character creation; reference only, never rolled directly |
| `skills.{tech,lab,investigation,violence,reflexes,coordination,cool,intuition,deception}.value` | number | Skill modifiers added to rolls |
| `rerunPoints` | number | Default 1 |
| `hurt` | boolean | Drives disadvantage + modifier suppression (see Dice Engine) |
| `qualities`, `quirks`, `bStory`, `hq`, `agencyName`, `deskItem` | string | Free text (sourced from rulebook roll tables, filled in by player) |
| `biography` | HTML string | |

Embeds: one `trope` Item (starting stats + built-in Talent), any number of
`talent` and `equipment` Items.

### Actor: `npc`

| Field | Type | Notes |
|---|---|---|
| `skills.*.value` | number | All default to 1 (rulebook: NPC allies get +1 to every skill), editable for Showrunner flexibility |

No stats, no Rerun Points, no Hurt tracking — NPC allies don't use these per
the rulebook. Embeds one `trope` or `talent` Item for its ability.

### Item: `trope`

| Field | Type | Notes |
|---|---|---|
| `statBlock.mental/physical/social` | number | Suggested starting allocation |
| `talentName` | string | |
| `talentDescription` | string | |
| `talentUsesPerAct` | number | Default 1 |
| `used` | boolean | Manual toggle, player resets each act |

### Item: `talent` (second Talents)

| Field | Type | Notes |
|---|---|---|
| `description` | string | |
| `usesPerAct` | number | Default 1 (some rulebook Talents are "no limit") |
| `used` | boolean | Manual toggle |

### Item: `equipment`

| Field | Type | Notes |
|---|---|---|
| `description` | string | |

## File structure

```
procedural-foundryvtt/
  system.json
  module/
    procedural.mjs          # entry point, hooks, sheet/data registration
    data/
      actor-trope.mjs        # TropeData extends foundry.abstract.TypeDataModel
      actor-npc.mjs
      item-trope.mjs
      item-talent.mjs
      item-equipment.mjs
    documents/
      actor.mjs               # ProceduralActor — roll orchestration
    sheets/
      actor-trope-sheet.mjs
      actor-npc-sheet.mjs
      item-sheet.mjs
    helpers/
      rolls.mjs               # dice engine
      seed-compendiums.mjs    # first-launch content import
  templates/
    actor/ (trope-sheet.hbs, npc-sheet.hbs)
    item/  (trope-sheet.hbs, talent-sheet.hbs, equipment-sheet.hbs)
    chat/  (roll-card.hbs)
  data/
    tropes.json              # source content for seeding
    second-talents.json
  css/procedural.css
  lang/en.json
```

## Dice / roll engine

Single code path: `ProceduralActor#rollSkill(skillKey, options)`, triggered by
clicking a skill on the sheet. A lightweight dialog lets the player choose
**Normal / Advantage / Disadvantage** and enter an optional situational
modifier (e.g. Partner Bonus +1).

1. **Hurt check:** if `actor.system.hurt` is true, skill modifiers are zeroed
   for the roll entirely, and if the skill is Physical (violence, reflexes,
   coordination), disadvantage is forced regardless of the dialog choice.
2. **Raw dice resolution**, implementing the rulebook's literal wording:
   - *Normal:* 2d6.
   - *Advantage:* roll 2d6 twice; for each die position, keep the higher of
     its two rolls.
   - *Disadvantage:* roll 2d6, identify the higher die, reroll just that die,
     keep the new value.
3. **Critical check on the raw total** (before any modifier):
   - Raw = 2 → **Critical Failure**. Final total is 2; no modifiers of any
     kind apply.
   - Raw = 12 (double sixes) → flag **Critical Success** (in addition to
     landing in the 12+ band).
4. **Otherwise**, total = raw + skill modifier + situational modifier, banded:
   - 3-6 Fail
   - 7-9 So-So
   - 10-11 Success
   - 12+ Success + Positive Effect
5. **Chat card** shows the dice, band label, and total. If
   `rerunPoints > 0` and the result wasn't already a success, the card
   includes a **"Spend Rerun Point & Reroll"** button — decrements Rerun
   Points and reruns the whole roll, posting a new card tagged "(rerolled)".

## Sheets

ApplicationV2 + HandlebarsApplicationMixin. Functional/plain CSS: grid layout
for stats/skills, click-to-roll skill rows, Rerun Points as a numeric
stepper, Hurt as a toggle, embedded Trope/Talent/Equipment as simple item
lists with edit/delete. NPC sheet is a stripped-down variant (skills only,
one talent slot).

## Compendium seeding

`data/tropes.json` and `data/second-talents.json` ship as plain JSON source
(not a packed LevelDB compendium — that requires a CLI build step we don't
need for local testing). On the `ready` hook, if world compendiums named
"Procedural: Tropes" / "Procedural: Second Talents" don't already exist, the
system creates them and imports the JSON as Items automatically. Copy the
folder in, launch Foundry, create a world — content populates itself.

Publishing the system later should switch to a proper packed compendium via
`@foundryvtt/foundryvtt-cli`; noted as future work, not built now.

## Testing plan

Manual smoke-test checklist (no automated test suite — not standard practice
for Foundry systems, and not warranted for this v1):

1. Symlink/copy the repo into Foundry's `Data/systems/procedural`, launch
   v14, confirm the system appears and a world can be created with it.
2. Confirm both compendiums auto-populate on world `ready`.
3. Create a `trope` actor, drag a Trope item onto it, allocate skill points,
   add a second Talent and an Equipment item.
4. Roll a skill Normal / Advantage / Disadvantage; verify die logic and band
   labels.
5. Force (or roll until) a raw-2 and a raw-12 to confirm crit
   fail/crit success handling.
6. Toggle Hurt, confirm Physical rolls get forced disadvantage and skill
   modifiers zero out on all rolls.
7. Spend a Rerun Point via the chat card button, confirm it decrements and
   rerolls.
8. Create an `npc` actor, confirm fixed +1 skills and talent slot work.
