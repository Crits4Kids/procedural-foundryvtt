# Rulebook Gap Fixes, Round 4 — Design

## Purpose

A fifth rulebook-coverage audit (after PR #16's Drama/B-story-RP/Knockout, PR #17's
Season Mode progression, PR #20's Director/NPC personality/Flashback, and PR #29's
Rerun Point pooling/Epilogue tie-break) turned up two more rules with zero
implementation trace:

1. **Trope / second Talent dedup at character creation**
   (`rulebook/source_rulebook.md:395-398, 850`) — "Every player should have a
   different Trope. If two players want to play the same Trope, have them discuss
   or roll off 2d6..." and "Each second Talent may only be chosen once. If players
   want the same second Talent they may discuss or roll off for it." NPC allies
   get the same treatment against human players' Tropes
   (`rulebook/source_rulebook.md:1097-1099`): "The players may choose (or roll)
   for the NPC ally Tropes, and they should be different from the Tropes chosen
   by the human players."
2. **Culprit-escape evidence penalty**
   (`rulebook/source_rulebook.md:2296-2307`) — "If the culprit manages to escape
   the players, in the epilogue they are picked up by law enforcement and still
   stand trial. If this happens, add 2 pieces of bad evidence when tabulating the
   epilogue trial result."

Bundled into one spec, matching the precedent of prior rounds grouping small
independent gap-fixes together. Two other candidates from the audit — the "Good
Cop" Talent's 1d6-more-questions effect, and a purely cosmetic "perfect season"
medal flag — were considered and explicitly deferred; see Out of scope.

## Scope

- `rollTrope()` gains rejection-sampling exclusion so a rolled Trope can avoid a
  set of already-held names without corrupting its weighted 2d6 table.
- `generateTrope()` threads that exclusion through for both Trope and second
  Talent.
- `TropeBuilderApplication` and `NpcBuilderApplication` filter their manual
  dropdowns and wire the same exclusion into their "Roll" buttons.
- A `culpritEscaped` flag on the Case Tracker that adds a fixed +2 to the bad
  evidence tally already computed by Round 3's `tallyEvidence()`.

## Out of scope

- **"Good Cop" Talent (1 Rerun Point → 1d6 more interrogation questions,
  `rulebook/source_rulebook.md:912-917`).** Every other named Talent effect in
  this codebase (Sentinel, Gambler, Fan Favorite, Field Medic, etc.) is left as
  pure narrative/manual play — Talents are just a name + `usesPerAct`/`used`
  toggle (`module/data/item-talent.mjs`), never mechanically automated.
  Automating Good Cop alone would be the first exception to that rule for no
  strong reason; the GM can already award more questions by hand via the
  existing `questionsRemaining` number input.
- **Perfect-season (rating 12) medal flag
  (`rulebook/source_rulebook.md:2164-2166`).** Purely cosmetic, no mechanical
  payload, consistent with the other untracked narrative-only Season Tracker
  beats (Ep2/Ep4 Director warnings, Ep5 ultimatum) that already have no state.
- **NPC-vs-NPC Trope dedup.** The rulebook only requires NPC ally Tropes to
  differ from the *human players'* Tropes, not from each other. `NpcBuilderApplication`
  excludes Tropes held by `trope`-type actors only.
- **NPC second Talent dedup.** NPCs never get a second Talent — "NPC allies only
  have the Talent assigned by their Trope" (`rulebook/source_rulebook.md:1099-1102`),
  confirmed by `NpcBuilderApplication` having no second-Talent step at all.
- **A literal "roll off 2d6, higher wins" conflict-resolution UI.** The rulebook's
  fallback for a collision is a live table negotiation between players, which
  doesn't map to a single-actor automated flow. Instead, collisions are avoided
  before they happen: dropdowns simply omit taken options, and roll buttons
  reroll away from taken results. This is a stronger guarantee than the
  rulebook's manual fallback, not a weaker one.
- **No hard lock when every option is taken.** If exclusion would empty the
  pool (implausible with 11 Tropes and a handful of players/NPCs, but possible
  for second Talents in a large group), the code falls back to the unrestricted
  list rather than blocking character creation — same "never lock out play"
  precedent as Round 3's pooling guard.
- **No change to `pickRandom()`'s signature.** It stays a generic uniform
  picker (also used for desk items, which need no dedup); exclusion for second
  Talent is applied by filtering its input list at the call site instead.
- **No visible "+2 (culprit escaped)" breakdown.** The Evidence Log's existing
  `good / bad` tally display already reflects the adjusted numbers once the
  flag is set; a separate annotation isn't needed for the tie-break math to be
  legible.
- **No gating of the `culpritEscaped` checkbox behind `arrestPhaseTriggered`.**
  Mirrors how `arrestPhaseNotes` is already a free-standing field in the same
  fieldset with no visibility condition — kept simple, and a Showrunner who
  toggles it out of order self-corrects by unchecking it.

## 1. Trope / Second Talent Dedup

### Pure helpers (`module/helpers/character-generator.mjs`)

`rollTrope(tropes, rng, excludeNames = [])`: reroll (up to 30 attempts) whenever
the 2d6 result's name is in `excludeNames`; if every trope is excluded (or 30
rerolls all collide), return the plain unrestricted roll. Rejection sampling
preserves the correct relative odds among the remaining tropes — filtering the
input array first would shift every sum-to-index mapping and corrupt the table.

```js
export function rollTrope(tropes, rng, excludeNames = []) {
  const excluded = new Set(excludeNames);
  if (excluded.size >= tropes.length) return tropes[roll1d6(rng) + roll1d6(rng) - 2];

  for (let attempt = 0; attempt < 30; attempt++) {
    const candidate = tropes[roll1d6(rng) + roll1d6(rng) - 2];
    if (!excluded.has(candidate.name)) return candidate;
  }
  return tropes[roll1d6(rng) + roll1d6(rng) - 2];
}
```

`generateTrope(data, rng = Math.random, exclude = {})` gains
`exclude.tropeNames` and `exclude.secondTalentNames` (both default `[]`):

```js
export function generateTrope(data, rng = Math.random, exclude = {}) {
  const { tropeNames = [], secondTalentNames = [] } = exclude;
  const { tropes, secondTalents, /* ...unchanged... */ } = data;

  const rolledTrope = rollTrope(tropes, rng, tropeNames);
  // ...stats/skills unchanged...

  const talentPool = secondTalents.filter(t => !secondTalentNames.includes(t.name));
  const secondTalent = pickRandom(talentPool.length ? talentPool : secondTalents, rng);

  return { /* ...unchanged shape, secondTalent as computed above... */ };
}
```

### Call sites

All three reuse the exact `heldElsewhere` construction already established by
`actor-trope-sheet.mjs`'s `#getAvailableTalents()`.

**`module/documents/actor.mjs`, `generateRandomTrope()`:**

```js
const heldTropeNames = game.actors
  .filter(a => a.type === "trope" && a.id !== this.id)
  .flatMap(a => a.items.filter(i => i.type === "trope").map(i => i.name));
const heldSecondTalentNames = game.actors
  .filter(a => a.type === "trope" && a.id !== this.id)
  .flatMap(a => a.items.filter(i => i.type === "talent").map(i => i.name));

const result = generateTrope(data, Math.random, {
  tropeNames: heldTropeNames,
  secondTalentNames: heldSecondTalentNames
});
```

**`module/apps/trope-builder.mjs`:**

- `_prepareContext`, when `stepId === "trope"`: compute `heldTropeNames` (all
  `trope`-type actors, no self to exclude — the actor doesn't exist yet during
  the wizard) and filter `context.tropeOptions` to omit them, falling back to
  the unfiltered list if that would empty it.
- Same for `stepId === "secondTalent"` with `heldSecondTalentNames` and
  `context.secondTalentOptions`.
- `#onRollTrope()`: pass `heldTropeNames` as `rollTrope`'s third argument
  instead of calling it bare.

**`module/apps/npc-builder.mjs`:**

- `_prepareContext`, when `stepId === "trope"`: compute `heldTropeNames` from
  `trope`-type actors only (per Out of scope, NPCs aren't cross-excluded against
  each other) and filter `context.tropeOptions` the same way.
- `#onRollTrope()`: pass `heldTropeNames` into `rollTrope`.

### Testing

`module/helpers/character-generator.test.mjs` gains cases for `rollTrope`:
no exclusions (unchanged behavior), one excluded name (reroll away from it,
verified over many seeded RNG sequences), all names excluded (falls back to
unrestricted roll rather than looping forever), and a fixed RNG sequence that
would only ever land on excluded results at first, proving the reroll actually
converges. Plus a `generateTrope` case confirming `exclude.secondTalentNames`
removes that name from the possible outputs, and an empty-pool fallback case.

## 2. Culprit-Escape Evidence Penalty

### Data (`module/data/case-tracker.mjs`)

```js
culpritEscaped: new BooleanField({ initial: false }),
```

Added next to `arrestPhaseTriggered` in the schema.

### Pure helper (`module/helpers/evidence-tally.mjs`)

```js
/**
 * @param {Array<{status: string}>} evidence
 * @param {{culpritEscaped?: boolean}} [options]
 * @returns {{good: number, bad: number, tied: boolean}}
 */
export function tallyEvidence(evidence, { culpritEscaped = false } = {}) {
  const good = evidence.filter(e => e.status === "good").length;
  const bad = evidence.filter(e => e.status === "bad").length + (culpritEscaped ? 2 : 0);
  return { good, bad, tied: good === bad && good + bad > 0 };
}
```

This is the only change to the helper's contract; the existing two-argument
call in `case-tracker.mjs`'s `_prepareContext` becomes:

```js
context.evidenceTally = tallyEvidence(data.evidence, { culpritEscaped: data.culpritEscaped });
```

No change to `rollEpilogueTiebreak` or any other consumer — they already read
`evidenceTally.tied`/`.good`/`.bad`, which now reflect the penalty automatically.

### Template (`templates/apps/case-tracker.hbs`)

A second checkbox inside the existing Arrest Phase `<fieldset>`, directly below
`arrestPhaseTriggered`:

```html
<label>
  <input type="checkbox" name="culpritEscaped" {{#if culpritEscaped}}checked{{/if}}>
  {{localize "PROCEDURAL.CaseTracker.CulpritEscaped"}}
</label>
```

`_prepareContext` gains `context.culpritEscaped = data.culpritEscaped;`.
`#formToData` gains `culpritEscaped: !!expanded.culpritEscaped` (same
plain-checkbox round-trip already used by `arrestPhaseTriggered`).

## Localization

New `lang/en.json` keys:

```json
"CulpritEscaped": "Culprit Escaped (adds 2 bad evidence at Epilogue)"
```

Under `PROCEDURAL.CaseTracker`, next to `ArrestPhaseNotes`. No new keys needed
for item 1 — the Trope/Talent builder UIs render existing option lists, just
filtered, with no new strings.

## Error Handling & Testing

- No new Case Tracker *actions* are introduced (unlike Rounds 1-3) — item 2 is
  a plain form field flowing through the existing `submitOnChange`/`#formToData`
  path, so there's no new try/catch surface to add.
- `module/helpers/character-generator.test.mjs`: cases listed under Testing
  above, run via `npm test`.
- `module/helpers/evidence-tally.test.mjs`: add `culpritEscaped: true` cases —
  0 good/0 bad raw (still not tied: bad becomes 2, good stays 0), 2 good/0 bad
  raw becoming tied at 2/2, 1 good/1 bad raw (already tied *without* the flag)
  becoming *not* tied at 1/3 once the flag is set, and `culpritEscaped`
  omitted/`false` matching the pre-existing behavior exactly (regression
  guard for the Round 3 call site).
- No Foundry-runtime tests — same rationale as all three prior rounds (no
  runtime test harness in this codebase); both changes are verified by hand
  per the Verification section below.

## User flow

- **Character creation:** A GM randomizes a second player's Trope; the roll
  transparently skips over the Trope the first player already has (no error,
  no visible retry — it just never lands there). In the Trope Builder wizard,
  the manual Trope dropdown simply doesn't list Tropes already claimed by
  other characters, and the same is true for the second-Talent dropdown. The
  NPC Generator's Trope step and roll button likewise skip Tropes already held
  by human players' Tropes.
- **Culprit escape:** During the Arrest Phase, the culprit gets away. The GM
  checks "Culprit Escaped" in the Case Tracker's Arrest Phase section. At
  Epilogue, the Evidence Log's good/bad tally already reads 2 higher on the bad
  side than the raw evidence entries would suggest, so the tie-break trigger
  (Round 3) and the Showrunner's final trial read both automatically account
  for the penalty.

## Verification

Manual smoke test (no Foundry-runtime test harness):

1. Create two Trope actors. Randomize the first (note its Trope and second
   Talent). Randomize the second several times; confirm it never lands on the
   first actor's Trope or second Talent. Open the Trope Builder wizard for a
   third character; confirm the Trope and second-Talent dropdowns both omit
   the two already-claimed values, and that clicking "Roll" on the Trope step
   never lands on them either.
2. Open the NPC Generator with at least one Trope actor present; confirm its
   Trope dropdown and roll button both skip that actor's Trope.
3. On the Case Tracker, add 2 good evidence entries and 0 bad (tally "2 / 0",
   not tied). Check "Culprit Escaped"; confirm the tally becomes "2 / 2" and
   the tie-break button appears. Uncheck it; confirm the button disappears and
   the tally reverts to "2 / 0". Add 1 bad evidence entry (raw "2 / 1", not
   tied) and check "Culprit Escaped" again; confirm the tally reads "2 / 3"
   and is not flagged tied.
4. `npm test` passes with the updated `character-generator.test.mjs` and
   `evidence-tally.test.mjs` cases.
