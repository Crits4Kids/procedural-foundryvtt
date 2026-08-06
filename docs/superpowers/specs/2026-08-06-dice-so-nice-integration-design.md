# Dice So Nice! Integration — Design

**Date:** 2026-08-06
**Status:** Approved for implementation
**Builds on:** `docs/superpowers/specs/2026-08-05-procedural-system-v1-design.md`

## Goal

When the Dice So Nice! module is installed and active, skill rolls made through
this system should animate as physical 3D dice on the virtual tabletop —
visible to all connected players — before the chat card with the result
appears. Without Dice So Nice! installed, behavior is unchanged from today
(chat card only).

## Scope

**In scope:**
- Extending the pure dice engine (`module/helpers/dice-rules.mjs`) to report
  every physical die rolled, not just the two kept values
- A new Foundry-glue module that builds a forced-result `Roll` from that data
  and triggers Dice So Nice!'s animation API
- Wiring that module into `ProceduralActor#rollSkill`, ahead of chat card
  posting, so it covers Normal/Advantage/Disadvantage rolls and Rerun Point
  rerolls uniformly (they all share one code path)

**Out of scope:**
- Any Dice So Nice! configuration UI (die color/texture presets, etc.) — this
  system only triggers the animation, players configure their own DSN
  appearance via DSN's own settings, as normal
- Sound effects beyond whatever Dice So Nice! itself plays by default

## Data flow extension: `dice-rules.mjs`

`resolveDice(mode, rng)` currently rolls more dice internally than it reports:

- **Advantage**: rolls 4 d6 (two pairs), keeps the higher of each pair,
  discards the other 2
- **Disadvantage**: rolls 2 d6, identifies the higher one, rerolls it (3 dice
  total), keeps the final 2
- **Normal**: rolls exactly 2 d6, keeps both

Today it only returns the 2 kept values (`die1`, `die2`). This change adds a
`dice` array to its return value listing every physical die rolled, each
tagged with whether it was kept or discarded:

```js
// Advantage example return shape (illustrative):
{
  die1: 5, die2: 6, rawTotal: 11,
  dice: [
    { value: 2, kept: false }, { value: 6, kept: true },  // pair 1
    { value: 5, kept: true },  { value: 1, kept: false }  // pair 2
  ]
}
```

This is purely additive — `die1`, `die2`, and `rawTotal` are unchanged, so no
existing consumer or test breaks. `computeRoll()` passes the `dice` array
through to its own return value unchanged, alongside the fields it already
returns.

The order dice appear in the array doesn't need to match any particular
visual arrangement — Dice So Nice! lays out multiple dice of a roll
automatically.

## Dice So Nice! bridge: `module/helpers/dice-so-nice.mjs`

A new, Foundry-runtime-only module (like `chat-listeners.mjs` and
`seed-compendiums.mjs`, not unit-testable outside Foundry — consistent with
the existing pure-logic-vs-Foundry-glue split in this codebase) exports one
function, roughly:

```js
export async function showDiceSoNice(diceResults, { synchronize = true } = {}) {
  if (!game.dice3d) return; // not installed/active — no-op
  // ...build a Roll with a forced-result Die term from diceResults,
  // marking discarded entries inactive so Dice So Nice! grays them out...
  await game.dice3d.showForRoll(roll, game.user, synchronize);
}
```

- Takes the `dice` array from a `computeRoll()` result.
- Builds a single `Die` term (`faces: 6`, `number: diceResults.length`) with
  pre-set `results`, each carrying `active: entry.kept` — this is the same
  mechanism Foundry's own "keep highest/lowest" roll modifiers use to show
  discarded dice grayed out, so Dice So Nice! renders it correctly without
  any special-casing on its end.
- Calls `game.dice3d.showForRoll(roll, game.user, true)` — `synchronize: true`
  broadcasts the animation to every connected client, not just the roller,
  matching "show the rolls on the table."
- If `game.dice3d` is undefined (module not installed, or installed but not
  active in the current world), the function returns immediately. No error,
  no console noise, no behavior change.

## Wiring into the roll pipeline

In `module/documents/actor.mjs`, `ProceduralActor#rollSkill` calls
`showDiceSoNice(result.dice)` and awaits it **before** calling
`_postRollCard(...)`. This means: if Dice So Nice! is active, players watch
the physical dice land first, then the chat card with the computed result
appears — avoiding a card that "spoils" the outcome while dice are still
animating. If Dice So Nice! isn't active, the await resolves immediately
(no-op) and behavior is identical to today.

This single call site covers every roll path in the system — Normal,
Advantage, Disadvantage, and Rerun Point rerolls (`spendRerunPointAndReroll`
calls `rollSkill` internally) — with no per-call-site special-casing needed.

## Error handling

`showDiceSoNice` is wrapped in a try/catch at its call site in `rollSkill`
(not inside `showDiceSoNice` itself) so that if Dice So Nice!'s API throws
(e.g. a version mismatch), the failure is logged to console but never blocks
the actual skill roll or chat card from completing — the dice mechanic itself
must never depend on an optional cosmetic module working correctly.

## Testing

No new unit tests needed for `dice-so-nice.mjs` itself (Foundry/DSN-runtime
only, same category as `chat-listeners.mjs`/`seed-compendiums.mjs`).

The `dice` array addition to `resolveDice`/`computeRoll` **is** unit-testable
and should be covered in `module/helpers/dice-rules.test.mjs`: verify the
correct number of entries and correct `kept` flags for Normal (2, both kept),
Advantage (4, 2 kept/2 discarded matching which pair-member won), and
Disadvantage (3, the rerolled die and the untouched lower die kept, the
original higher die discarded).

Manual verification (added as a follow-up step to the existing smoke-test
checklist, not a new full pass): with Dice So Nice! installed and active,
confirm dice visibly animate on the table for a Normal, Advantage, and
Disadvantage roll, with Advantage/Disadvantage showing the correct extra
grayed-out dice. Confirm rolls still work identically with Dice So Nice!
either not installed or disabled.
