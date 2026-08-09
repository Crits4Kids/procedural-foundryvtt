# Rulebook Gap Fixes — Design

## Purpose

A full pass of `rulebook/source_rulebook.md` against the current implementation
turned up several rules with no code, data, or explicit deferral trace at all
(unlike the v1 design doc's deliberate deferrals, which have since shipped).
This spec covers three small, independent fixes chosen from that audit:

1. **Roll for Drama** (rulebook:1925) — an optional team-flavor roll table
   used at the start of a session, with no `data/*.json` file and no UI,
   unlike every other rulebook roll table (Quality/Quirk/HQ/Agency
   Name/Desk Item all have one).
2. **B-story → Rerun Point** (rulebook:715) — "resolving a character's
   B-story immediately grants them 1 additional Rerun Point" has no code
   path; a player has to remember to self-award it via the existing
   `rerunPoints` number field.
3. **Double-Hurt Knockout** (rulebook:1566) — "if a player character is hurt
   and they would get hurt again, they are knocked out for 1d6 hours...
   healed at the start of the next act." `hurt` is currently a plain boolean
   with no concept of a second hit.

A separate, larger Season Mode progression spec (Agency Rating, Villains,
Leveling Up) follows this one and is out of scope here.

## Scope

- `data/drama.json` + a "Roll for Drama" action on the Case Tracker.
- A "Resolve (+1 Rerun Point)" button on the Trope sheet's B-story field.
- A `knockedOut` field on `TropeActorData`, a "Hurt Again" action on the
  Trope sheet, and extending the Case Tracker's existing act-change hook to
  auto-heal it (alongside `hurt`).

## Out of scope

- No lock/guard preventing repeated B-story Rerun Point awards — the party
  already self-manages `rerunPoints` as a freely-editable number field, and
  season-mode B-stories can resolve more than once over a season, so a hard
  one-time lock would fight the rulebook rather than help.
- No change to the existing Hurt checkbox's toggle behavior — it keeps
  meaning on/off = hurt/healed. "Hurt Again" is an additive action, not a
  repurposing of the checkbox.
- Plain `hurt` (not knocked out) still requires manual healing via HQ
  rest/Field Medic Talent in the general case, per the existing behavior —
  but per the user's explicit choice, the act-change hook clears **both**
  `hurt` and `knockedOut` unconditionally, same trigger as the existing
  Talent reset. This is a deliberate simplification of the letter of the
  rule (which only guarantees auto-heal for the knockout case) in favor of
  reusing one hook and one mental model ("new act = clean slate for
  temporary conditions"), matching how `talent-reset.mjs` already
  unconditionally clears `used` regardless of `usesPerAct`.
- No NPC-side Hurt/Knocked Out tracking — the rulebook ties this to player
  characters only (NPC allies have no stats/Hurt per `actor-npc.mjs`).
- Roll for Drama's result is Case Tracker session state (like Evidence), not
  per-actor state — it isn't tied to any individual Trope.
- No Foundry-runtime tests for the sheet button wiring or Case Tracker
  action — this codebase has no Foundry-runtime test harness; verified by
  hand, same as the rest of `case-tracker.mjs` and the actor sheets. Pure
  helpers get unit tests as usual.

## 1. Roll for Drama

### Data

`data/drama.json`, matching `data/qualities.json`'s shape:

```json
{
  "odds": ["...6 entries from the rulebook's Odds 1d6 table..."],
  "evens": ["...6 entries from the rulebook's Evens 1d6 table..."]
}
```

Registered in `module/helpers/generator-data.mjs`'s `GENERATOR_DATA_PATHS` as
`drama: "systems/procedural/data/drama.json"`, loaded via the existing
`loadGeneratorData()` cache — the Case Tracker app calls this the same way
`character-generator.mjs` and `trope-builder.mjs` already do.

### Dice helper

`module/helpers/dice-rules.mjs` gains one new export:

```js
/**
 * @param {() => number} rng - returns a float in [0,1), like Math.random
 * @returns {number} 1-6
 */
export function rollD6(rng = Math.random) {
  return rollDie(rng);
}
```

(`rollDie` already exists as a private helper in this file; this just
exposes it for single-die rolls used outside the 2d6 skill-roll path.)

### Case Tracker integration

- `module/data/case-tracker.mjs`: add `drama: new StringField({ initial: "" })`
  to the schema.
- `module/apps/case-tracker.mjs`: add a `rollForDrama` action.
  1. `await loadGeneratorData()`, read `.drama`.
  2. Roll two `rollD6()` calls: `tableRoll` picks Odds (odd) or Evens
     (even), `entryRoll` (1-6) picks the array index (`entryRoll - 1`).
  3. `setCaseTracker({ ...current, drama: text })`.
  4. Post a chat message: `"Roll for Drama (${tableRoll}, ${entryRoll}): ${text}"`.
- `templates/apps/case-tracker.hbs`: a "Roll for Drama" button and a
  read-only display of `context.drama` (empty state: no button disabled,
  it can be re-rolled any time — rerolling is harmless, matches the
  rulebook's "entirely optional" framing).

## 2. B-story → Rerun Point

`module/sheets/actor-trope-sheet.mjs`: add a `resolveBStory` action that
calls `this.actor.update({ "system.rerunPoints": this.actor.system.rerunPoints + 1 })`.

`templates/actor/trope-sheet.hbs`: a small button next to the existing
B-story `<textarea>`, labeled "Resolve (+1 Rerun Point)".

No schema change, no chat message (this mirrors how the Rerun Points field
itself is silently editable today — a chat announcement would be new
behavior for this actor, not requested).

## 3. Double-Hurt Knockout

### Schema

`module/data/actor-trope.mjs`: add `knockedOut: new BooleanField({ initial: false })`
alongside the existing `hurt` field.

### Sheet

`module/sheets/actor-trope-sheet.mjs`: add a `hurtAgain` action, available
only when `system.hurt === true` (guard in the action handler; the button
itself is conditionally rendered via `{{#if system.hurt}}` in the template
so it's not visible at all while healthy):

1. `const hours = rollD6();` (import `rollD6` from `dice-rules.mjs`).
2. `await this.actor.update({ "system.knockedOut": true });`
3. Post a chat message: `"${actor.name} is hurt again and knocked out for ${hours} hours!"`.

`templates/actor/trope-sheet.hbs`: the "Hurt Again" button appears next to
the Hurt checkbox only when `system.hurt` is checked, and a "Knocked Out"
indicator (e.g. a small badge/label) shows when `system.knockedOut` is true.

### Auto-heal on act change

New pure helper `module/helpers/hurt-reset.mjs`, same shape convention as
`talent-reset.mjs`:

```js
/**
 * @param {Array<{id: string, system: {hurt: boolean, knockedOut: boolean}}>} actors
 * @returns {string[]} actor ids that need healing
 */
export function findActorsToHeal(actors) {
  return actors
    .filter(a => a.system?.hurt === true || a.system?.knockedOut === true)
    .map(a => a.id);
}
```

`module/apps/case-tracker.mjs`: in the same act-change branch that already
calls `resetTalentUses(data.act)`, add a call to a new `healActors()`
function:

1. Build the plain shape: `game.actors.map(a => ({ id: a.id, system: { hurt: a.system.hurt, knockedOut: a.system.knockedOut } }))` — only meaningful for `trope`-type actors, but NPCs never have these fields `true` so no type filter is needed (mirrors how `resetTalentUses` doesn't filter by actor type either).
2. Call `findActorsToHeal(actors)`.
3. For each id, `game.actors.get(id).update({ "system.hurt": false, "system.knockedOut": false })`.
4. Same try/catch + `ui.notifications` pattern as `resetTalentUses` (error on
   failure without blocking the act save; info notification with a count,
   silent if zero).

## Testing

- `module/helpers/dice-rules.test.mjs`: add cases for `rollD6` (range 1-6,
  deterministic with a stubbed rng).
- `module/helpers/hurt-reset.test.mjs` (new): unit tests for
  `findActorsToHeal` — no actors, actor with neither flag, actor with only
  `hurt`, actor with only `knockedOut`, actor with both, multiple actors
  mixed.
- Roll for Drama's table/entry selection logic is trivial enough (two
  `rollD6()` calls plus array indexing) that it's exercised via the same
  `rollD6` unit tests rather than a separate table-selection test — there's
  no independent pure function to isolate since the odd/even branch lives
  directly in the Case Tracker action.

Runnable via `npm test`.

## User flow

- **Drama:** GM opens the Case Tracker at session start, clicks "Roll for
  Drama," sees the flavor text appear in the app and in chat.
- **B-story:** A player's B-story resolves in an interlude scene; they click
  "Resolve (+1 Rerun Point)" on their sheet; their Rerun Points count ticks
  up by one.
- **Knockout:** A player who is already Hurt fails another physically risky
  roll; the GM or player clicks "Hurt Again"; chat announces the knockout
  hours; the Knocked Out badge appears. Next time the GM advances the Act
  field on the Case Tracker, both Hurt and Knocked Out clear automatically
  for every affected actor, alongside the existing Talent reset
  notification.

## Verification

Manual smoke test (no Foundry-runtime test harness):

1. Open the Case Tracker, click "Roll for Drama" a few times; confirm the
   displayed text changes and a chat message posts each time, and the value
   persists (reopen the app, still shown).
2. On a Trope sheet, write a B-story, click "Resolve (+1 Rerun Point)";
   confirm Rerun Points increments by exactly 1 per click.
3. Check Hurt on a Trope sheet; confirm the "Hurt Again" button appears
   only now (not before). Click it; confirm a chat message with an hours
   value 1-6 posts and a Knocked Out indicator appears.
4. Open the Case Tracker and change Act; confirm both Hurt and Knocked Out
   clear on that actor, alongside the existing Talent-reset notification
   (extend its count or add a second notification — implementer's choice,
   note in the PR description).
5. `npm test` passes with the new `rollD6` and `hurt-reset.test.mjs` cases.
