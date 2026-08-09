# Season Mode Progression — Design

## Purpose

The rulebook-coverage audit found three Season Mode mechanics with zero
code or data trace, and — unlike the v1 design doc's deliberate
deferrals — none of them were ever explicitly scoped out:

1. **Agency Rating** (rulebook:2118, "OUTCOMES AND RATINGS") — each of a
   season's 6 episodes resolves Successful (+2) / Neutral (0) /
   Unsuccessful (−1); the running total drives Director reactions and
   benchmarks after episodes 1, 2, 3, 5, and 6.
2. **Leveling Up** (rulebook:2176) — unlocked after episode 3 (if rating
   ≤ 0) and after episode 6 (if playing another season): +1 to a stat,
   divested into a skill capped at 3, plus an optional second-Talent swap.
3. **Villains** (rulebook:2189) — NPCs created by player actions during a
   season, tracked as a list; an active Villain in a scene forces
   disadvantage on all rolls (narrated, not enforced); 3+ Villains draws
   the Director's attention.

This spec covers all three as one subsystem — they share season-level
state (the current episode's outcomes drive both the Rerun Point grants
and the Level Up unlock) and were validated together in brainstorming
rather than decomposed further.

## Scope

- A new GM-only `SeasonTrackerApplication`, its own scene-control button,
  backed by a new `seasonTracker` world setting (`SeasonTrackerData`).
- Agency Rating: 6 fixed episode-outcome slots; the running rating is
  computed from them, never stored redundantly.
- Benchmark reactions: rulebook flavor text shown as read-only reference,
  plus one-click "Grant" buttons for the two mechanical payoffs (Rerun
  Point awards, Level Up unlocks), each guarded against being clicked
  twice.
- Leveling Up: a banked `levelUpsAvailable` counter on `TropeActorData`
  (mirroring how `rerunPoints` already works), a "Level Up" button on the
  Trope sheet, and a `DialogV2` for the stat/skill/Talent-swap choice.
- Villains: a plain list on the Season Tracker (name, reason, active
  toggle), no new Actor documents.

## Out of scope

- **Villain disadvantage is not enforced by the roll engine.** The
  rulebook's "disadvantage on all rolls in that scene" is party-wide and
  scene-scoped — a different shape from the existing per-actor Hurt rule
  that `computeRoll`/`dice-rules.mjs` already handles. Automating it means
  a new shared state the roll engine has to check on every roll and the
  GM has to remember to clear; per the user's explicit choice, this stays
  reference-only. Players/GM apply it via the roll dialog's existing
  Advantage/Disadvantage choice, same as any other GM-narrated modifier.
- **No fake Director dialogue.** Benchmark text is the rulebook's own
  flavor description of what the Director does (e.g. "the Director may
  issue a warning"), not generated roleplay — the GM still voices the
  Director.
- **No automatic case-to-case reset of the existing Case Tracker.** How
  the Case Tracker's per-case fields (evidence, interrogations, etc.)
  relate to starting a new episode is unchanged and untouched by this
  spec — that's a pre-existing gap (nothing resets Case Tracker state
  between cases today) that this feature does not address.
- **No automatic detection of "are we playing another season."** The
  ep6 Level Up unlock is gated only on episode 6 having a recorded
  outcome, not on a rating threshold (the rulebook's condition is
  "if playing another season," a GM judgment call, not a formula) — the
  GM decides whether to click the Grant button.
- **No enforcement that a swapped-in Talent is actually unused elsewhere**
  beyond the single query described below at the moment the Level Up
  dialog opens — if two players level up in the same instant and both
  grab the same freed-up Talent, the second `actor.update` simply
  overwrites the same Item name with no server-side lock. This mirrors the
  existing Trope Builder's Talent-selection approach (no locking there
  either) and is an acceptable, extremely low-probability race for a
  single-GM-narrated game.
- **No UI for removing/undoing a recorded episode outcome's side effects**
  beyond changing the dropdown back to blank — since Rerun Point/Level Up
  grants are guarded booleans (not re-derived from the outcome each time),
  unsetting an episode's outcome after a Grant button was already clicked
  does not claw back the grant. This is intentional: it matches how
  Rerun Points and Talent uses are already free-standing, GM-adjusted
  numbers elsewhere in this codebase, not values recomputed from history.

## Data model

`module/data/season-tracker.mjs` (new), `SeasonTrackerData extends foundry.abstract.DataModel`:

```js
export default class SeasonTrackerData extends foundry.abstract.DataModel {
  static defineSchema() {
    const { SchemaField, StringField, BooleanField, ArrayField } = foundry.data.fields;

    return {
      episodes: new ArrayField(
        new SchemaField({
          outcome: new StringField({ initial: "", choices: ["", "successful", "neutral", "unsuccessful"] })
        }),
        { initial: [{ outcome: "" }, { outcome: "" }, { outcome: "" }, { outcome: "" }, { outcome: "" }, { outcome: "" }] }
      ),
      ep3RerunGranted: new BooleanField({ initial: false }),
      ep5RerunGranted: new BooleanField({ initial: false }),
      ep3LevelUpGranted: new BooleanField({ initial: false }),
      ep6LevelUpGranted: new BooleanField({ initial: false }),
      villains: new ArrayField(
        new SchemaField({
          id: new StringField({ required: true }),
          name: new StringField({ initial: "" }),
          reason: new StringField({ initial: "" }),
          active: new BooleanField({ initial: true })
        }),
        { initial: [] }
      )
    };
  }
}
```

`episodes` is always exactly 6 entries (indices 0-5 = episodes 1-6) —
never added to or removed from, only each entry's `outcome` changes.

`module/data/actor-trope.mjs` gains one field, alongside the existing
`rerunPoints`:

```js
levelUpsAvailable: new NumberField({ required: true, integer: true, initial: 0, min: 0 }),
```

## Pure logic: `module/helpers/season-benchmarks.mjs` (new)

All rating/benchmark math is pure and unit-tested, taking/returning plain
data — same convention as `dice-rules.mjs`, `talent-reset.mjs`,
`hurt-reset.mjs`.

```js
const OUTCOME_POINTS = { successful: 2, neutral: 0, unsuccessful: -1 };

/**
 * @param {Array<{outcome: string}>} episodes
 * @returns {number} sum of point values for every episode with a set outcome
 */
export function computeRating(episodes) {
  return episodes.reduce((total, ep) => total + (OUTCOME_POINTS[ep.outcome] ?? 0), 0);
}

/**
 * @param {Array<{outcome: string}>} episodes
 * @returns {number} count of episodes with a non-empty outcome
 */
export function countRecordedEpisodes(episodes) {
  return episodes.filter(ep => ep.outcome !== "").length;
}
```

Benchmark eligibility (e.g. "ep3 Rerun Point grant available") is computed
directly in the app from `computeRating`/`countRecordedEpisodes` plus the
episode-specific threshold — there's no separate "eligibility" pure
function per benchmark because each one is a single inline comparison
(e.g. `countRecordedEpisodes(episodes) >= 3 && computeRating(episodes.slice(0, 3)) === 6 && !ep3RerunGranted`)
that's clearer written once at its call site than abstracted into five
near-identical one-line functions.

## Pure logic: `module/helpers/level-up.mjs` (new)

```js
/**
 * @param {object} params
 * @param {"mental"|"physical"|"social"} params.stat
 * @param {string} params.skillKey
 * @param {Record<string, number>} params.currentSkills - skillKey -> current value
 * @returns {{valid: boolean, reason?: string}}
 */
export function validateLevelUpChoice({ stat, skillKey, currentSkills }) {
  if (!stat) return { valid: false, reason: "noStat" };
  if (!skillKey || !(skillKey in currentSkills)) return { valid: false, reason: "noSkill" };
  if (currentSkills[skillKey] >= 3) return { valid: false, reason: "skillAtCap" };
  return { valid: true };
}
```

This mirrors the shape of `character-generator.mjs`'s existing
`divestSkills` cap logic but is deliberately a fresh, small function
rather than a shared import — `divestSkills` handles the very different
problem of distributing a whole skill-point pool across a random
character during generation, not validating one player-chosen increment.

## Season Tracker app

`module/apps/season-tracker.mjs` (new), `ApplicationV2` +
`HandlebarsApplicationMixin`, same shell shape as `CaseTrackerApplication`:
GM-only (`if (!game.user.isGM) throw new Error(...)` in `_prepareContext`,
matching the existing Case Tracker), backed by
`game.settings.get/set("procedural", "seasonTracker")`.

**Context prepared per render:**
- `episodes`: the 6 outcome entries, each with a `statusOptions`-style
  list for the `<select>` (blank/successful/neutral/unsuccessful), same
  pattern the Case Tracker already uses for Evidence status.
- `rating`: `computeRating(data.episodes)`.
- `recordedCount`: `countRecordedEpisodes(data.episodes)`.
- Per-benchmark flags computed inline (ep2 warning text visible once
  `recordedCount >= 2`, ep3 text/buttons once `recordedCount >= 3`, etc.)
  — each benchmark's flavor text is always shown once its episode is
  recorded, regardless of whether the numeric threshold was hit, so the
  GM sees the "no reaction" case too (e.g. "rating is fine, no warning").
- `villains`: the list, plus `villainWarning: villains.filter(v => v.active).length >= 3`.

**Actions:**
- `recordEpisodeOutcome` — form-driven (a `<select>` per episode row,
  `submitOnChange: true`, same as the Case Tracker's fields), no
  dedicated action needed beyond the form handler.
- `grantEp3Rerun`, `grantEp5Rerun` — each: if not already granted (guard
  field), loop `game.actors.filter(a => a.type === "trope")` and
  `await actor.update({ "system.rerunPoints": actor.system.rerunPoints + 1 })`
  for each, then set the guard boolean, `ui.notifications.info(...)` with
  a count, same try/catch + `console.error("PROCEDURAL | ...")` pattern as
  `resetTalentUses`/`healActors` in `case-tracker.mjs`.
- `grantEp3LevelUp`, `grantEp6LevelUp` — same shape, incrementing
  `system.levelUpsAvailable` by 1 on every `trope` actor instead of
  `rerunPoints`.
- `addVillain`, `deleteVillain`, `toggleVillainActive` — same list-row
  add/delete pattern as the Case Tracker's Evidence log.

**Template:** `templates/apps/season-tracker.hbs` (new) — 6 episode rows
(select + inline benchmark text + conditional Grant buttons), a rating
display, and a Villains section mirroring the Evidence log's list-row
markup.

## Trope sheet: Level Up

`module/sheets/actor-trope-sheet.mjs` gains a `levelUp` action, visible
only when `system.levelUpsAvailable > 0` (template-level
`{{#if system.levelUpsAvailable}}` guard, same pattern as the existing
`{{#if system.hurt}}` guard for "Hurt Again").

`#onLevelUp` opens a `DialogV2` (same weight as the existing roll dialog):
- Radio buttons for `mental`/`physical`/`social`.
- A skill `<select>` populated from `this.actor.system.skills`, with
  options at-or-above value 3 rendered `disabled` (mirrors how the
  rulebook's cap is "cannot improve a skill already at 3+", so those
  options are simply not choosable, not just rejected after submit).
- An optional Talent-swap `<select>` ("Keep current Talent" as the default
  option, plus every Item named in the "Procedural: Second Talents"
  compendium whose name is not currently held by any *other* `trope`
  actor's embedded `talent` item — computed via
  `game.actors.filter(a => a.type === "trope" && a.id !== this.actor.id).flatMap(a => a.items.filter(i => i.type === "talent").map(i => i.name))`
  and filtering the compendium list against that set).

On confirm: `validateLevelUpChoice(...)` gates the stat/skill part (should
never fail given the disabled options, but the pure function is still the
single source of truth, exercised by its own unit tests independent of
the dialog); then one `actor.update({ "system.stats.<stat>": +1, "system.skills.<skillKey>.value": +1, "system.levelUpsAvailable": -1 })`
plus, if a Talent swap was chosen, delete the old `talent` item and create
the new one from the compendium source (same
`Item.createDocuments([...], { parent: this })` pattern
`generateRandomTrope` already uses for Talent items).

## Registration

`module/procedural.mjs`:
- Import `SeasonTrackerData` and `SeasonTrackerApplication`.
- `CONFIG.Actor.dataModels.trope = TropeActorData` line is unaffected
  (the new field lives inside the existing `TropeActorData` schema, no
  new Actor type).
- `game.settings.register("procedural", "seasonTracker", { scope: "world", config: false, type: SeasonTrackerData })`,
  directly after the existing `caseTracker` registration.
- A second entry in the `Hooks.on("getSceneControlButtons", ...)` block,
  `proceduralSeasonTracker`, same shape as `proceduralCaseTracker` (GM-only
  visibility, singleton-instance re-focus pattern), `order` one higher.

## Testing

- `module/helpers/season-benchmarks.test.mjs` (new): `computeRating` —
  empty episodes (0), all blank (0), one of each outcome, all six
  successful (12, the "perfect rating" case), unset entries mixed with
  set ones. `countRecordedEpisodes` — 0, partial, all 6.
- `module/helpers/level-up.test.mjs` (new): valid choice, missing stat,
  missing/unknown skill key, skill already at cap (3), skill already
  above cap (defensive — shouldn't happen via the UI's disabled options,
  but the pure function must still reject it).
- No Foundry-runtime tests for the app/sheet/dialog wiring, consistent
  with the rest of this codebase — verified by hand.

## User flow

1. GM opens the Season Tracker (new scene-control button) at the start of
   a season, records Episode 1's outcome after that case resolves.
2. After Episode 2's outcome is recorded, if the rating is below 2, the
   Director-warning flavor text appears (read-only) — GM roleplays it.
3. After Episode 3, if rating = 6, a "Grant +1 Rerun Point to the party"
   button appears; clicking it updates every Trope actor once and
   disables itself. If rating ≤ 0, a "Grant Level Up to the party" button
   appears similarly, and the Director-freakout flavor text is shown.
4. A player whose Trope now has `levelUpsAvailable > 0` sees a "Level Up"
   button on their sheet; using it walks them through the stat/skill/
   Talent-swap dialog once, decrementing their counter by 1.
5. GM adds Villains as they emerge from play (name + reason); each has an
   active/resolved toggle. Once 3 are active, the tracker flags it.
6. Episodes 4-6 follow the same recording pattern; Episode 5's rating-10
   Rerun Point grant and Episode 6's perfect-12 flavor text and Level Up
   grant work the same way.

## Verification

Manual smoke test (no Foundry-runtime test harness):

1. Open the Season Tracker; record Episode 1 as Successful, Episode 2 as
   Unsuccessful; confirm the ep2 warning text appears (rating is 1, below
   the <2 threshold) and the displayed rating reads 1.
2. Record Episode 3 as Successful (rating now 3); confirm neither ep3
   Grant button appears (rating isn't 6 or ≤0). Change Episode 3 to
   Neutral (rating 1); still no Grant buttons. Change Episode 1 to
   Unsuccessful and Episode 3 to Successful so the running rating after
   3 episodes is exactly 6; confirm the Rerun Point Grant button appears.
3. Click the Rerun Point Grant button; confirm every Trope actor's Rerun
   Points increments by exactly 1, a notification reports the count, and
   the button disappears/disables on re-render. Change an episode outcome
   afterward; confirm the button does not reappear (guarded).
4. Set episode outcomes so the rating after 3 episodes is 0 or below;
   confirm the Level Up Grant button appears; click it; confirm every
   Trope actor's `levelUpsAvailable` increments by 1.
5. On a Trope sheet with `levelUpsAvailable > 0`, confirm the "Level Up"
   button is visible; on one with 0, confirm it is not. Use it: pick a
   stat, pick a skill below cap, confirm the stat and skill both
   increment by 1 and `levelUpsAvailable` decrements by 1. Repeat while
   trying to pick a skill already at 3 — confirm it's not selectable.
6. Swap a Talent during Level Up; confirm the old Talent item is removed
   and the new one is added with the compendium's data. Confirm a Talent
   currently held by a different Trope actor does not appear as an option.
7. Add three Villains and mark them all active; confirm the "Director has
   noticed" flavor line appears. Mark one resolved; confirm it disappears
   again.
8. `npm test` passes with the new `season-benchmarks.test.mjs` and
   `level-up.test.mjs` suites.
