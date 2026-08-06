# Random Trope Generator — Design

**Date:** 2026-08-06
**Status:** Approved for implementation
**Builds on:** `docs/superpowers/specs/2026-08-05-procedural-system-v1-design.md`

## Goal

A one-click "Randomize" action on the Trope actor sheet that runs the
rulebook's character-creation checklist end to end and leaves a fully
playable Trope actor: a rolled Trope (with stats divested into skills), a
Quality, a Quirk, a B-story, an HQ, an Agency Name, a second Talent, and 1
Rerun Point. Only the character's name/portrait and freeform biography are
left for the player, since the rulebook has no table for those.

This intentionally brings the flavor roll-tables (Quality/Quirk/B-story/HQ/
Agency Name) into scope, which v1's design doc explicitly deferred — the
generator cannot be "fully functional" without them.

## Scope

**In scope:**
- New data files for the five flavor roll-tables (Quality, Quirk, B-story,
  HQ, Agency Name), transcribed from the rulebook
- A pure, dependency-free generator module (`character-generator.mjs`)
  implementing the roll logic, unit-tested via `npm test`
- Foundry-glue wiring: an actor method that applies a generated result,
  embedded Trope/Talent Item creation, and a sheet button with a
  confirm-before-overwrite dialog

**Out of scope:**
- Character name generation — no such table exists in the rulebook
- NPC ally generation (the rulebook's NPC-ally flow reuses Trope rolls but
  skips stats/skills entirely — different enough to be its own feature if
  wanted later)
- World-uniqueness enforcement for second Talent or Trope (the rulebook
  already handles clashes as a social/roll-off step between players; the
  existing manual workflow doesn't enforce this either, so the generator
  doesn't either)
- Any change to the manual character-creation path (dragging a Trope item
  onto a blank actor by hand) — Randomize is an additional, optional path

## Rulebook ambiguity: resolving the flavor table rolls

The rulebook's Quality/Quirk/HQ/B-story tables are all introduced with
"Roll 1d6 for the table then roll 1d6 on the table," but the transcribed
Quality and Quirk tables list entries for sums **2 through 12** (11 rows),
which only a 2d6 roll produces — a 1d6 roll can't reach past 6. HQ and
B-story tables list entries **1 through 6** (6 rows), which a 1d6 roll does
match. This is read as a documentation artifact from the source PDF, not a
real rules difference between the tables. Resolved as:

- **Quality / Quirk:** roll 1d6 to choose Odds vs. Evens (odd → Odds table,
  even → Evens table), then roll **2d6** (sum 2-12) to pick the entry —
  matching the Trope table's own established 2d6-over-11-entries shape.
- **B-story / HQ:** roll 1d6 to choose Odds vs. Evens, then roll **1d6**
  (1-6) to pick the entry — the table sizes already match a 1d6 as written.
- **Agency Name:** three independent tables of 6 entries each (unambiguous
  in the rulebook), one 1d6 roll per table, concatenated in order.

## New data files

Mirroring the existing `data/tropes.json` / `data/second-talents.json`
convention (flat, fetchable JSON, not tied to any code):

- `data/qualities.json` — `{ "odds": [11 strings], "evens": [11 strings] }`,
  index 0 corresponds to a 2d6 roll of 2, index 10 to a roll of 12.
- `data/quirks.json` — same shape as `qualities.json`.
- `data/bstories.json` — `{ "odds": [6 strings], "evens": [6 strings] }`,
  index 0 corresponds to a 1d6 roll of 1. `odds` holds the "Small Stakes"
  entries, `evens` the "Large Stakes" entries.
- `data/hq.json` — same shape as `bstories.json`.
- `data/agency-names.json` — `{ "table1": [6], "table2": [6], "table3": [6] }`.

## Pure logic module: `module/helpers/character-generator.mjs`

Follows the exact convention `dice-rules.mjs` already established: every
random draw takes an injected `rng = Math.random` (`() => number in [0,1)`),
so the whole module is unit-testable with a deterministic fake RNG, with no
Foundry globals referenced anywhere in the file.

```js
export function generateTrope({ tropes, secondTalents, qualities, quirks, bstories, hq, agencyNames }, rng = Math.random)
```

`tropes` and `secondTalents` are the same array shapes as
`data/tropes.json` / `data/second-talents.json`. Returns:

```js
{
  trope: { name, img, statBlock, statNotes, talentName, talentDescription, talentUsesPerAct },
  stats: { mental, physical, social },       // == trope.statBlock, plus Gifted's +3 if rolled
  skills: { tech, lab, investigation, violence, reflexes, coordination, cool, intuition, deception },
  quality: string,
  quirk: string,
  bStory: string,
  hq: string,
  agencyName: string,
  secondTalent: { name, description, usesPerAct },
  rerunPoints: 1
}
```

### Sub-algorithms

- **Trope roll:** 2d6, look up `tropes[sum - 2]` (array is already ordered
  2→12 to match `data/tropes.json`'s current row order).
- **Gifted:** if `trope.talentName === "Gifted"` (only true for Rookie),
  pick one of `mental`/`physical`/`social` uniformly at random and add 3 to
  it before divestment runs, so the bonus is baked into both the divested
  skills and the stat total shown on the generated Trope item.
- **Skill divestment**, run once per stat against its 3 associated skills
  (`SKILL_KEYS` groupings from `shared.mjs`: mental→tech/lab/investigation,
  physical→violence/reflexes/coordination, social→cool/intuition/deception):
  1. Parse `trope.statNotes` with `/at least (\d+) in (Tech|Lab)/i`. If it
     matches and the named skill belongs to the stat being divested, assign
     that minimum to the skill first and subtract it from the remaining
     pool.
  2. Repeatedly pick a uniformly random skill (from the 3) that still has
     remaining "room" and award it 1 point, until the stat's point pool is
     exhausted. "Room" means: Tech and Lab stop being eligible once they
     reach 2, **unless** they're the skill named by `statNotes` (that skill
     has no cap beyond the stat total). Investigation and all
     Physical/Social skills are never capped.
  3. If every remaining skill is capped out before the pool is exhausted
     (only possible for a stat ≥ 7, which no current Trope has), any
     leftover points are dropped rather than looping forever — documented
     as a defensive edge case, not an expected path with today's data.
- **Quality/Quirk/B-story/HQ:** per the resolved table-roll rules above.
- **Agency Name:** one 1d6 roll per table, `` `${t1} ${t2} ${t3}` ``.
- **Second Talent:** uniform pick from `secondTalents`.

## Foundry integration

### `ProceduralActor#generateRandomTrope()` (`module/documents/actor.mjs`)

1. Loads the six JSON data files via `fetch` (trope/second-talent files
   already exist; the five new flavor files are added per above), cached
   at module scope after first load so repeated randomization on the same
   client doesn't re-fetch.
2. Calls `generateTrope(data, Math.random)`.
3. Deletes any existing embedded `trope`/`talent` items on the actor
   (`this.items.filter(i => ["trope","talent"].includes(i.type))`), so
   re-rolling doesn't accumulate duplicates.
4. `this.update({...})` with `system.stats`, `system.skills.*.value`,
   `system.qualities`, `system.quirks`, `system.bStory`, `system.hq`,
   `system.agencyName`, `system.rerunPoints`.
5. `Item.createDocuments([...], { parent: this })` — one `trope`-type item
   built from `result.trope` (its `statBlock` reflects the Gifted-adjusted
   stats, not the raw compendium data, so the embedded item matches what's
   on the actor sheet) and one `talent`-type item built from
   `result.secondTalent`.

### Sheet button (`templates/actor/trope-sheet.hbs` / `actor-trope-sheet.mjs`)

- A button in the header, next to the name field, `data-action="randomizeTrope"`.
- Handler: if the actor already has an embedded `trope` item or a non-empty
  `system.qualities`, show a `DialogV2.wait` confirm ("This will overwrite
  the current Trope, skills, and flavor fields — continue?"/Cancel) — same
  pattern as the existing roll-mode dialog in this file. Otherwise skip
  straight to generating.
- On confirm (or if nothing to overwrite): `await this.actor.generateRandomTrope()`,
  then the sheet re-renders from the actor update as usual.

### Localization

New `PROCEDURAL.Actor.Randomize` and `PROCEDURAL.Actor.RandomizeConfirm`
strings added to `lang/en.json`, following the existing key structure.

## Error handling

`generateRandomTrope` doesn't need defensive error handling beyond what
already exists in the codebase: if a fetch fails, it throws and the button
handler's `await` propagates that as an uncaught rejection surfaced by
Foundry's own error UI — consistent with how `seed-compendiums.mjs` already
treats fetch failures as write-to-console-and-notify rather than something
this feature needs to newly solve.

## Testing

- `module/helpers/character-generator.test.mjs`: unit tests using the same
  `queue(values)` deterministic-rng helper pattern as
  `dice-rules.test.mjs`. Covers: 2d6 Trope lookup at the boundaries (2 and
  12) and a middle value; Gifted stat selection and its effect on
  divestment; skill divestment respecting the Tech/Lab cap of 2 for a
  Trope with no `statNotes`; divestment honoring an "at least 3 in Lab"
  minimum (Coroner) and an "at least 3 in Tech" minimum (Techie); odd/even
  table selection plus entry lookup for Quality/Quirk (2d6) and B-story/HQ
  (1d6); Agency Name concatenation order.
- `generateRandomTrope`, the sheet button, and the confirm dialog are
  Foundry-runtime-only and get manual verification, added as a step to the
  existing smoke-test checklist in
  `docs/superpowers/plans/2026-08-05-procedural-system-v1.md`: randomize a
  blank actor and confirm every field populates and an embedded Trope +
  Talent item appear; randomize again on a populated actor and confirm the
  overwrite dialog appears and old items are replaced, not duplicated.
