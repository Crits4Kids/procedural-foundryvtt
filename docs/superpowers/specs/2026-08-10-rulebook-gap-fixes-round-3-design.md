# Rulebook Gap Fixes, Round 3 — Design

## Purpose

A fourth rulebook-coverage audit (after PR #16's Drama/B-story-RP/Knockout, PR #17's
Season Mode progression, and PR #20's Director/NPC personality/Flashback) turned up
two more rules with zero implementation trace, both scoped to the Case Tracker:

1. **Rerun Point pooling for a new lead** (`rulebook/source_rulebook.md:689-694`) —
   "Rerun Points may also be spent to generate new leads. Players may pool their
   Rerun Points in any combination, spending X amount of points to obtain a new
   clue from the Showrunner, where X is the number of human players in the game...
   only once per act."
2. **Epilogue evidence tie-break roll** (`rulebook/source_rulebook.md:1481-1485`) —
   "If there is a tie for good and bad evidence, the Showrunner will roll to
   determine the outcome (odds against players, evens for)."

Bundled into one spec, matching the precedent of prior rounds grouping small
independent gap-fixes together — both are Case Tracker-only, don't touch actor
sheets, and are similar in size to Round 1's individual fixes.

## Scope

- A `leadsPooled` per-act flag + `poolRerunPoints` action on the Case Tracker,
  spending Rerun Points off Trope actors directly.
- An evidence good/bad tally + `rollEpilogueTiebreak` action on the Case Tracker,
  shown only when the tally is tied.
- Two new pure helpers (`lead-pool.mjs`, `evidence-tally.mjs`) with unit tests,
  matching the `hurt-reset.mjs` precedent of keeping the one piece of real logic
  testable and separate from app/DOM wiring.

## Out of scope

- No new "human player" setting. `X` (the pool's cost) is derived as
  `game.actors.filter(a => a.type === "trope").length` — one Trope actor per
  human player is already the system's working assumption everywhere else
  (`healActors`, `resetTalentUses`, character generation all key off the `trope`
  actor type with no separate player-count concept anywhere in the codebase).
- No automatic clue text/table for the new lead — the rulebook says the
  Showrunner "obtains a new clue," which is GM improv, not a roll table (unlike
  Drama/Director/NPC personality, which are explicitly named 1d6 tables in the
  rulebook). The button announces the pool succeeded in chat; the GM narrates
  the clue and adds it as a new Evidence row by hand via the existing "Add
  Evidence" button.
- No lock preventing a pool once Rerun Points run low — validated by requiring
  pledged contributions to sum to exactly `X`, same spirit as the existing
  reroll spend guard (`spendRerunPointAndReroll` returns `null` if a single
  actor can't afford it).
- No "submitted to trial" flag on evidence. The rulebook's "players may choose
  which evidence to submit to trial" implies a subset, but no such flag exists
  today and adding one is a bigger, separate change. This spec tallies **all**
  evidence currently marked `good` or `bad` (ignoring `unknown`), which is the
  data the app already has.
- No roll button shown for a 0-0 tie (no evidence entered yet) — trivially
  "tied" but not a meaningful game state to roll on.
- No Foundry-runtime tests for the sheet/app wiring — this codebase has no
  Foundry-runtime test harness (confirmed by all three prior gap-fix specs);
  verified by hand. Pure helpers get `node --test` unit tests as usual.

## 1. Rerun Point Pooling

### Data

`module/data/case-tracker.mjs`: add `leadsPooled: new ArrayField(new BooleanField({ initial: false }), { initial: [false, false, false] })`,
mirroring the existing `interludes` field exactly (one flag per act, three acts).

### Pure helper

`module/helpers/lead-pool.mjs`:

```js
/**
 * @param {Record<string, number>} contributions - actorId -> Rerun Points pledged
 * @param {number} cost - Rerun Points required (number of human players)
 * @returns {boolean} true if the pledged total exactly matches cost
 */
export function isValidPool(contributions, cost) {
  if (cost <= 0) return false;
  const total = Object.values(contributions).reduce((sum, n) => sum + (Number(n) || 0), 0);
  return total === cost;
}
```

### Case Tracker action

`module/apps/case-tracker.mjs`: add a `poolRerunPoints` action.

1. Read `data.leadsPooled[data.act - 1]`; if already `true`, warn
   ("already pooled this act") and return.
2. `const tropeActors = game.actors.filter(a => a.type === "trope");`
   `const cost = tropeActors.length;` if `cost === 0`, warn and return.
3. Open a `DialogV2` listing every Trope actor (name + current
   `system.rerunPoints`) with a number input defaulting to `0`, capped at that
   actor's current Rerun Points (`min="0" max="{{actor.system.rerunPoints}}"`).
   Confirm callback returns `{ actorId: pledgedAmount }` for every actor
   (including 0s); Cancel returns `null`.
4. If cancelled, return. Otherwise `isValidPool(contributions, cost)` — if
   false, `ui.notifications?.error(...)` with the required total and return
   (no deduction, no flag set, so the GM can retry).
5. For every actor with a pledge `> 0`, `actor.update({ "system.rerunPoints":
   actor.system.rerunPoints - amount })`.
6. Set `data.leadsPooled[data.act - 1] = true`, `await setCaseTracker(data)`,
   wrapped in the same try/catch + `console.error` + `ui.notifications.error`
   pattern as every other Case Tracker action.
7. Post a chat message announcing the pool succeeded (cost only — no clue
   text, per Out of scope).
8. `this.render()`.

### Template

`templates/apps/case-tracker.hbs`: a new section near Interludes with a
"Pool Rerun Points for a Lead" button (`data-action="poolRerunPoints"`) and,
when `context.leadsPooled[context.act - 1]` is true, a "used this act" note
instead of the button. Three hidden checkboxes
(`<input type="checkbox" name="leadsPooled.{{index}}" {{#if used}}checked{{/if}} hidden>`)
round-trip the flags through `submitOnChange`, the same technique the
existing visible `interludes` checkboxes already use, just with the native
HTML `hidden` attribute so they aren't user-editable.

`#formToData` gains `leadsPooled: Object.values(expanded.leadsPooled ?? {})`,
matching the existing `interludes` line exactly.

`_prepareContext` gains `context.leadsPooled = data.leadsPooled;` and reuses
the existing `context.act`.

## 2. Epilogue Evidence Tie-break

### Data

`module/data/case-tracker.mjs`: add
`epilogueTiebreakRoll: new NumberField({ initial: 0, integer: true, min: 0, max: 6 })`
and `epilogueTiebreakOutcome: new StringField({ initial: "", choices: ["", "against", "for"] })`.

### Pure helper

`module/helpers/evidence-tally.mjs`:

```js
/**
 * @param {Array<{status: string}>} evidence
 * @returns {{good: number, bad: number, tied: boolean}}
 */
export function tallyEvidence(evidence) {
  const good = evidence.filter(e => e.status === "good").length;
  const bad = evidence.filter(e => e.status === "bad").length;
  return { good, bad, tied: good === bad && good + bad > 0 };
}
```

### Case Tracker action

`module/apps/case-tracker.mjs`: add a `rollEpilogueTiebreak` action.

1. `const { tied } = tallyEvidence(data.evidence);` if not tied, warn and
   return (mirrors the guard pattern of `poolRerunPoints`).
2. `const roll = rollD6(); const outcome = roll % 2 === 1 ? "against" : "for";`
   (odds against the players, evens for — same odd/even convention already
   used by `rollForDrama`'s table selection).
3. `data.epilogueTiebreakRoll = roll; data.epilogueTiebreakOutcome = outcome;`
   `setCaseTracker(data)`, same try/catch pattern as `rollForDrama`.
4. Post a chat message with the roll and outcome label.
5. `this.render()`.

### Template

`templates/apps/case-tracker.hbs`: in the Evidence Log section, show the
good/bad tally (`context.evidenceTally.good` / `.bad`) below the evidence
list. When `context.evidenceTally.tied` is true, show a "Roll Tie-break"
button (`data-action="rollEpilogueTiebreak"`). When
`context.epilogueTiebreakOutcome` is non-empty, show the stored roll +
outcome label. Hidden inputs round-trip `epilogueTiebreakRoll` and
`epilogueTiebreakOutcome` through the form, same technique as the existing
`drama` hidden input.

`_prepareContext` gains:

```js
context.evidenceTally = tallyEvidence(data.evidence);
context.epilogueTiebreakRoll = data.epilogueTiebreakRoll;
context.epilogueTiebreakOutcome = data.epilogueTiebreakOutcome;
context.epilogueTiebreakOutcomeLabel = data.epilogueTiebreakOutcome
  ? game.i18n.localize(`PROCEDURAL.CaseTracker.EpilogueTiebreak.${data.epilogueTiebreakOutcome}`)
  : "";
```

(Localizing server-side into a plain string, not a dynamic key lookup in the
template, matches how `context.director`/`context.drama` already store final
display text rather than requiring a Handlebars helper — this codebase
registers no custom Handlebars helpers.)

`#formToData` gains `epilogueTiebreakRoll: Number(expanded.epilogueTiebreakRoll) || 0`
and `epilogueTiebreakOutcome: expanded.epilogueTiebreakOutcome ?? ""`.

## Localization

New `lang/en.json` keys under `PROCEDURAL.CaseTracker`:

```json
"PoolRerunPoints": "Pool Rerun Points for a Lead",
"PoolRerunPointsPrompt": "Pool {cost} Rerun Points total (in any combination) to obtain a new clue from the Showrunner.",
"PoolRerunPointsConfirm": "Pool Points",
"PoolRerunPointsInvalid": "Pledged Rerun Points must total exactly {cost}.",
"PoolRerunPointsAnnounce": "The players pool {cost} Rerun Points to obtain a new clue from the Showrunner!",
"PoolRerunPointsUsed": "Already pooled for a lead this act.",
"PoolRerunPointsNoPlayers": "There are no player characters to pool Rerun Points.",
"EvidenceTally": "Good / Bad Evidence",
"EpilogueTiebreak": {
  "Title": "Epilogue Tie-break Roll",
  "Roll": "Roll Tie-break",
  "against": "Against the players",
  "for": "For the players"
}
```

`PoolRerunPointsPrompt`, `PoolRerunPointsInvalid`, and `PoolRerunPointsAnnounce`
are read with `game.i18n.format(key, { cost })`, matching the existing
`HurtAgainMessage` precedent in `actor-trope-sheet.mjs`.

## Error Handling & Testing

- `poolRerunPoints` and `rollEpilogueTiebreak` follow `rollForDrama`'s existing
  try/catch + `ui.notifications?.error(...)` + `console.error("PROCEDURAL |
  ...")` pattern for the `setCaseTracker` write.
- `module/helpers/lead-pool.test.mjs` (new): `isValidPool` — empty
  contributions, exact match, over-pledge, under-pledge, zero cost, contribution
  values that are non-numeric/missing.
- `module/helpers/evidence-tally.test.mjs` (new): `tallyEvidence` — no
  evidence, all unknown, good > bad, bad > good, tied non-zero, tied zero
  (0-0, not "tied" per this helper's contract).
- Runnable via `npm test`.

## User flow

- **Pooling:** Players are stuck on the case. The GM opens the Case Tracker,
  clicks "Pool Rerun Points for a Lead," and a dialog lists every PC with
  their current Rerun Points. The table agrees who's contributing what; the
  GM fills in the numbers so they sum to the party size, confirms, and each
  contributing actor's Rerun Points drop by their pledge. A chat message
  announces the pool. The GM narrates a new clue and adds it via "Add
  Evidence" as usual. The button now shows "already pooled this act" until
  the Act field changes.
- **Tie-break:** At Epilogue, the GM has marked evidence good/bad throughout
  the case. The tally under the Evidence Log shows e.g. "2 / 2" and a "Roll
  Tie-break" button appears. The GM clicks it; a chat message announces the
  d6 result and whether it favors or opposes the players; the same result is
  saved and displayed in the app.

## Verification

Manual smoke test (no Foundry-runtime test harness):

1. Create 2 Trope actors with Rerun Points. Open the Case Tracker, click
   "Pool Rerun Points for a Lead." Confirm the dialog lists both actors.
   Pledge amounts that don't sum to 2; confirm the error and that no Rerun
   Points were deducted. Reopen, pledge amounts summing to 2; confirm both
   actors' Rerun Points update correctly and a chat message posts. Confirm
   the button is replaced by "already pooled this act" text. Change the Act
   field; confirm the button reappears for the new act.
2. On the Case Tracker, add evidence entries and mark 2 good / 2 bad; confirm
   the tally shows "2 / 2" and the "Roll Tie-break" button appears. Click it;
   confirm a chat message posts with a 1-6 roll and against/for outcome, and
   the result persists (reopen the app, still shown). Change one entry to
   break the tie; confirm the button disappears.
3. `npm test` passes with the new `lead-pool.test.mjs` and
   `evidence-tally.test.mjs` cases.
