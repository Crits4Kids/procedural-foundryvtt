# Trope Builder Wizard — Design

**Date:** 2026-08-06
**Status:** Approved for implementation
**Builds on:**
`docs/superpowers/specs/2026-08-05-procedural-system-v1-design.md`,
`docs/superpowers/specs/2026-08-06-random-trope-generator-design.md`

## Goal

A step-by-step wizard that walks a player through the rulebook's character
creation checklist and creates a brand-new Trope actor at the end. Where the
existing "Randomize" button (on the Trope sheet) instantly auto-generates
every field in one click, this wizard gives the player the same "roll,
choose, or create" agency the rulebook describes at each step, matching how
character creation actually plays at the table.

## Scope

**In scope:**
- A new multi-step `ApplicationV2` wizard covering, in order: Name, Trope
  (+ Gifted stat choice), Skills (manual divestment), Quality, Quirk,
  B-story, Second Talent, HQ, Agency Name, then a Review/Finish step.
- A launcher for the wizard from the Actors directory.
- Free re-rolling of every roll-based step, any number of times, for as
  long as the wizard is open (see "Reroll requirement" below).
- Two small refactors to existing code that this feature needs to avoid
  duplicating logic: extracting the shared JSON-data loader out of
  `actor.mjs`, and exporting the skill-divestment cap/minimum rules from
  `character-generator.mjs` as a reusable pure validation function.

**Out of scope:**
- A homebrew/custom Trope *type* designer (authoring a brand-new stat
  block + Talent from scratch) — this wizard only helps a player build a
  *character* using one of the 11 existing Tropes, same as Randomize.
- Per-field reroll controls on an already-finished actor's sheet (e.g. "just
  reroll my Quirk" after character creation is done) — out of scope per an
  explicit decision during design; the existing Randomize button already
  covers "start over completely" on a finished sheet.
- Dice So Nice! animation for the wizard's roll buttons — these are
  character-creation flavor rolls, not the core skill-roll loop DSN was
  integrated for; results are computed and displayed instantly.
- A "Surprise me" random option for Second Talent — the rulebook specifies
  Second Talent as choose-only (no roll table exists for it), and the
  wizard follows that exactly.
- NPC ally creation — the rulebook's NPC-ally flow is a different, simpler
  shape (no stats/skills) and remains a candidate for its own future
  feature.

## Reroll requirement

Every roll-based step (Trope, Quality, Quirk, B-story, HQ, Agency Name)
must be freely re-rollable any number of times while the wizard is open,
including after navigating away and back via Back/Next. This falls out
directly from the architecture: **nothing is written to the actor until
Finish** (see "Apply-on-Finish," below). Every step's answer lives only in
the wizard's in-memory draft object until then, so clicking Roll again, or
hitting Back to revisit an earlier step and rolling it again, is just a
local state overwrite — there is no "already committed" state to undo.

The one exclusion is Rerun Points, which isn't a wizard step at all — it's
fixed at 1 on Finish, identical to Randomize. Second Talent (choose-only)
and Skills (manual divestment) are also not roll-based, per the rulebook,
so "reroll" doesn't apply to them; this was confirmed explicitly during
design rather than assumed.

## Step-by-step interaction model

| # | Step | Player's options |
|---|------|-------------------|
| 1 | **Name** | Free-text input for the actor's name. |
| 2 | **Trope** | Roll 2d6 (reuses `rollTrope`), or pick any of the 11 directly from a dropdown. If the resulting Trope's Talent is "Gifted" (Rookie only), a stat-picker (Mental/Physical/Social) appears for the player's own +3 choice — deliberately *not* reusing Randomize's random Gifted pick, since the rulebook makes this an explicit player decision ("Choose any stat and add +3 to it"). |
| 3 | **Skills** | Manual point allocation across the 3 skills per stat, seeded from the chosen Trope's (Gifted-adjusted) stat block. Live "N points remaining" per stat; Next is disabled until every stat is fully spent and no skill violates the Tech/Lab cap of 2 (or an unmet Trope-specific minimum, e.g. Coroner's "at least 3 in Lab"). |
| 4 | **Quality** | Roll (1d6 odds/evens → 2d6 entry, reuses `rollQualityOrQuirk`), pick any of the 22 entries directly from one flat dropdown (odds+evens merged — the split is just a rolling mechanic, not a meaningful category to the player), or free-text. |
| 5 | **Quirk** | Same three options as Quality, against the Quirk table. |
| 6 | **B-story** | Roll (1d6 odds/evens → 1d6 entry, reuses `rollBStoryOrHq`), pick from a flat 12-entry dropdown, or free-text. |
| 7 | **Second Talent** | Choose-only, per the rulebook — dropdown of the 18 second Talents. No roll button. |
| 8 | **HQ** | Same roll/pick/free-text pattern as B-story. |
| 9 | **Agency Name** | Roll all three tables at once (reuses `rollAgencyName`), or set each of the 3 words independently via its own dropdown, or override the whole name with free-text. |
| — | **Review** | Lists every answer with a Back-to-edit link per field, plus Finish. |

Back is available on every step except Name; Next is disabled until the
current step has a valid value (non-empty text/selection, or — for
Skills — a fully-spent, cap-compliant allocation).

## Architecture

A dedicated `ApplicationV2` wizard, following the same
`HandlebarsApplicationMixin(ApplicationV2)` pattern the two existing actor
sheets already use, rather than a chain of `DialogV2.wait()` calls — a
9-step flow with live validation and Back-navigation doesn't fit
comfortably inside repeated plain-HTML dialogs.

**New files:**
- `module/apps/trope-builder.mjs` — the wizard class. Holds an in-memory
  draft object (`{name, trope, giftedStat, skills, quality, quirk, bStory,
  secondTalent, hq, agencyName}`) and a `currentStep` index; Next/Back/Roll/
  Finish are static action handlers, matching the existing sheets' action
  pattern.
- `templates/apps/trope-builder.hbs` — the shell (header, step indicator,
  Back/Next/Finish footer) that renders one step partial at a time.
- `templates/apps/trope-builder-steps/*.hbs` — one small partial per step
  (`name.hbs`, `trope.hbs`, `skills.hbs`, `quality.hbs`, `quirk.hbs`,
  `bstory.hbs`, `second-talent.hbs`, `hq.hbs`, `agency-name.hbs`,
  `review.hbs`) — keeps each step's markup independently focused rather
  than one large conditional template.
- `module/helpers/generator-data.mjs` — `GENERATOR_DATA_PATHS` and
  `loadGeneratorData()`, extracted out of `module/documents/actor.mjs`
  (moved, not duplicated) so both `ProceduralActor#generateRandomTrope`
  and the wizard share one fetch-and-cache of the 7 JSON data files.

**Modified files:**
- `module/documents/actor.mjs` — `generateRandomTrope()` imports
  `loadGeneratorData` from the new shared module instead of defining it
  locally. No behavior change.
- `module/helpers/character-generator.mjs` — adds an exported pure
  function, `validateSkillAllocation(stats, statNotes, skills)`, built
  from the same `STAT_SKILLS`/`CAPPED_SKILLS`/`parseStatNoteMinimum`
  already private in this file:
  ```js
  // returns:
  {
    valid: boolean,
    remaining: { mental: number, physical: number, social: number },
    violations: string[] // e.g. ["tech exceeds the cap of 2", "lab is below its required minimum of 3"]
  }
  ```
  `divestSkills` (Randomize's auto-divestment) and the wizard's live
  Skills-step validation both read from the same cap/minimum rules — one
  source of truth, no risk of the two drifting apart.
- `module/procedural.mjs` — registers the wizard's launcher. The exact
  Foundry hook (`renderActorDirectory` header-button injection vs. a scene
  control) carries the same kind of Foundry-API-currency risk this
  project has already flagged for `DialogV2` and compendium APIs; the
  implementation plan will call for a `WebFetch` confirmation of the
  current API immediately before writing that piece, same as prior plans
  in this repo have done for similarly uncertain surfaces.
- `lang/en.json` — new keys for the wizard's step titles, field labels,
  and button text.

## Apply-on-Finish

Finish is the only point that touches the database, mirroring
`generateRandomTrope`'s shape:

1. `Actor.create({ name: draft.name, type: "trope" })`.
2. `actor.update({ "system.stats": ..., "system.skills.*.value": ...,
   "system.qualities": ..., "system.quirks": ..., "system.bStory": ...,
   "system.hq": ..., "system.agencyName": ..., "system.rerunPoints": 1 })`.
3. `Item.createDocuments([tropeItem, talentItem], { parent: actor })` —
   same embedded-item shape Randomize already produces (the Trope item's
   `statBlock` reflects the Gifted-adjusted stats, exactly as
   `generateRandomTrope` already does).
4. Open the newly created actor's sheet and close the wizard.

Because actor creation itself happens only on Finish (not when the wizard
launches), closing the wizard early — at any step — leaves no trace: there
is never an orphaned blank actor to clean up.

## Testing

- `validateSkillAllocation` gets unit tests in
  `character-generator.test.mjs`, in the same deterministic style as the
  existing tests — no RNG involved, since this is pure validation, not a
  roll: covers the cap-violation case, the unmet-minimum case, the
  points-remaining-nonzero case, and the fully-valid case.
- The wizard `ApplicationV2` class, its templates, and the directory-button
  launcher are Foundry-runtime-only, like the rest of this codebase's UI
  layer — no automated coverage. Verified by a manual smoke-test checklist
  covering: stepping forward through all 9 steps, using Back to revisit
  and change an earlier step, re-rolling each rollable step at least once,
  deliberately violating then fixing the skill cap on the Skills step,
  Finish, and confirming the resulting actor's shape matches what
  Randomize already produces (same `system.*` fields, same embedded
  Trope/Talent items) — so the two character-creation paths stay
  consistent with each other.
