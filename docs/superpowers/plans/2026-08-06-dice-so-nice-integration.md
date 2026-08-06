# Dice So Nice! Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the Dice So Nice! module is active, PROCEDURAL! skill rolls animate as physical 3D dice on the tabletop (visible to all connected players) before the chat card appears; without it, behavior is unchanged.

**Architecture:** Extend the existing pure `dice-rules.mjs` module to report every physical die rolled (not just the 2 kept values), then add a new Foundry-runtime-only bridge module that turns that data into a forced-result Foundry `Roll` and hands it to Dice So Nice!'s animation API. Wire the bridge into `ProceduralActor#rollSkill`, ahead of chat card posting.

**Tech Stack:** Vanilla JS ES modules, Foundry VTT v14 (`Roll`, `foundry.dice.terms.Die`), Dice So Nice! module's `game.dice3d.showForRoll` API, Node's built-in test runner for the pure-logic half.

## Global Constraints

- Target Foundry VTT v14 (same as the rest of this system).
- No new npm dependencies — this touches only vanilla JS and Foundry/browser globals.
- Preserve the existing pure-logic-vs-Foundry-glue split: `dice-rules.mjs` must remain dependency-free and fully unit-testable outside Foundry; only the new bridge module touches Foundry globals.
- All 15 existing tests in `module/helpers/dice-rules.test.mjs` must keep passing unmodified — this is a purely additive change to that module's return shape.
- Full spec: `docs/superpowers/specs/2026-08-06-dice-so-nice-integration-design.md`.

---

### Task 1: Extend `dice-rules.mjs` to report every physical die

**Files:**
- Modify: `module/helpers/dice-rules.mjs`
- Modify (add tests, don't remove existing ones): `module/helpers/dice-rules.test.mjs`

**Interfaces:**
- Consumes: nothing new (still a pure module, `rng: () => number` injectable as before).
- Produces: `resolveDice(mode, rng)` and `computeRoll({...})` both gain a `dice: Array<{ value: number, kept: boolean }>` field on their return object, alongside all existing fields (`die1`, `die2`, `rawTotal`, `modifiedTotal`, etc. — all unchanged). Task 2's bridge module consumes `result.dice` from `computeRoll`'s return value.

- [ ] **Step 1: Write the failing tests**

Add these four test cases to the end of `module/helpers/dice-rules.test.mjs` (keep every existing test as-is — do not remove or rename any of the current 15):

```js
test("resolveDice normal mode reports both dice as kept", () => {
  const rng = queue([3, 5]);
  const result = resolveDice("normal", rng);
  assert.deepEqual(result.dice, [
    { value: 3, kept: true },
    { value: 5, kept: true }
  ]);
});

test("resolveDice advantage reports all four dice with correct kept flags", () => {
  const rng = queue([2, 6, 5, 1]);
  const result = resolveDice("advantage", rng);
  assert.deepEqual(result.dice, [
    { value: 2, kept: false },
    { value: 5, kept: true },
    { value: 6, kept: true },
    { value: 1, kept: false }
  ]);
});

test("resolveDice disadvantage reports three dice with correct kept flags", () => {
  const rng = queue([2, 6, 1]);
  const result = resolveDice("disadvantage", rng);
  assert.deepEqual(result.dice, [
    { value: 2, kept: true },
    { value: 6, kept: false },
    { value: 1, kept: true }
  ]);
});

test("computeRoll includes the dice breakdown from resolveDice", () => {
  const rng = queue([3, 4]);
  const result = computeRoll({ mode: "normal", skillModifier: 0, rng });
  assert.deepEqual(result.dice, [
    { value: 3, kept: true },
    { value: 4, kept: true }
  ]);
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
node --test module/helpers/dice-rules.test.mjs
```
Expected: 15 pre-existing tests PASS, the 4 new tests FAIL (`result.dice` is `undefined`).

- [ ] **Step 3: Implement the `dice` field in `resolveDice`**

Replace the full contents of `resolveDice` in `module/helpers/dice-rules.mjs` with:

```js
export function resolveDice(mode, rng) {
  const first = [rollDie(rng), rollDie(rng)];

  if (mode === "advantage") {
    const second = [rollDie(rng), rollDie(rng)];
    const pair1 = [first[0], second[0]];
    const pair2 = [first[1], second[1]];
    const die1 = Math.max(...pair1);
    const die2 = Math.max(...pair2);
    const keptIndex1 = pair1[0] >= pair1[1] ? 0 : 1;
    const keptIndex2 = pair2[0] >= pair2[1] ? 0 : 1;

    const dice = [
      { value: pair1[0], kept: keptIndex1 === 0 },
      { value: pair1[1], kept: keptIndex1 === 1 },
      { value: pair2[0], kept: keptIndex2 === 0 },
      { value: pair2[1], kept: keptIndex2 === 1 }
    ];

    return { die1, die2, rawTotal: die1 + die2, dice };
  }

  if (mode === "disadvantage") {
    const higherIndex = first[0] >= first[1] ? 0 : 1;
    const lowerIndex = higherIndex === 0 ? 1 : 0;
    const reroll = rollDie(rng);

    const final = [0, 0];
    final[lowerIndex] = first[lowerIndex];
    final[higherIndex] = reroll;

    const dice = [
      { value: first[0], kept: 0 === lowerIndex },
      { value: first[1], kept: 1 === lowerIndex },
      { value: reroll, kept: true }
    ];

    return { die1: final[0], die2: final[1], rawTotal: final[0] + final[1], dice };
  }

  return {
    die1: first[0],
    die2: first[1],
    rawTotal: first[0] + first[1],
    dice: [
      { value: first[0], kept: true },
      { value: first[1], kept: true }
    ]
  };
}
```

- [ ] **Step 4: Thread `dice` through `computeRoll`**

In `computeRoll`, change:

```js
  const { die1, die2, rawTotal } = resolveDice(effectiveMode, rng);
```

to:

```js
  const { die1, die2, rawTotal, dice } = resolveDice(effectiveMode, rng);
```

And in the object `computeRoll` returns, add `dice` alongside the existing fields:

```js
  return {
    die1,
    die2,
    rawTotal,
    modifiedTotal,
    dice,
    skillModifier: effectiveSkillModifier,
    situationalModifier: effectiveSituationalModifier,
    effectiveMode,
    ...tierInfo
  };
```

- [ ] **Step 5: Run tests to verify everything passes**

```bash
node --test module/helpers/dice-rules.test.mjs
```
Expected: all 19 tests pass (15 pre-existing + 4 new), 0 failures.

- [ ] **Step 6: Commit**

```bash
git add module/helpers/dice-rules.mjs module/helpers/dice-rules.test.mjs
git commit -m "feat: report every physical die rolled, not just the kept ones"
```

---

### Task 2: Dice So Nice! bridge and wiring into the roll pipeline

Before writing `dice-so-nice.mjs`, fetch `https://foundryvtt.com/api/` and try to confirm the current namespace for `Die` (the plan assumes `foundry.dice.terms.Die`) and that a `DiceTerm`'s `results` array entries use `{ result, active }` shape. This is the same "best-effort, don't block indefinitely" verification pattern used elsewhere in this project's v1 plan — if inconclusive, proceed with the code below, which reflects a well-established pattern already used by other Foundry systems (e.g. dnd5e's advantage/disadvantage rolls) to show partially-discarded dice via Dice So Nice!.

**Files:**
- Create: `module/helpers/dice-so-nice.mjs`
- Modify: `module/documents/actor.mjs`

**Interfaces:**
- Consumes: `result.dice` from Task 1's `computeRoll` (`Array<{ value: number, kept: boolean }>`).
- Produces: `showDiceSoNice(diceResults, options?)` — an async function, default-export-free (named export), called from `ProceduralActor#rollSkill`.

- [ ] **Step 1: Write `module/helpers/dice-so-nice.mjs`**

```js
export async function showDiceSoNice(diceResults, { synchronize = true } = {}) {
  if (!game.dice3d) return;
  if (!diceResults?.length) return;

  const die = new foundry.dice.terms.Die({ number: diceResults.length, faces: 6 });
  die.results = diceResults.map(entry => ({ result: entry.value, active: entry.kept }));
  die._evaluated = true;

  const roll = Roll.fromTerms([die]);
  roll._evaluated = true;

  await game.dice3d.showForRoll(roll, game.user, synchronize);
}
```

This function is Foundry-runtime-only (uses `game`, `foundry.dice.terms.Die`, `Roll`, all unavailable in plain Node) — same category as `chat-listeners.mjs` and `seed-compendiums.mjs`. `node --check` (syntax only) is the correct verification here, not execution.

If `game.dice3d` is undefined (Dice So Nice! not installed, or installed but inactive in this world), the function returns immediately — no error, no animation, no behavior change from today.

- [ ] **Step 2: Verify syntax**

```bash
node --check module/helpers/dice-so-nice.mjs
```
Expected: no output.

- [ ] **Step 3: Commit the bridge module on its own**

```bash
git add module/helpers/dice-so-nice.mjs
git commit -m "feat: add Dice So Nice! animation bridge"
```

- [ ] **Step 4: Wire it into `ProceduralActor#rollSkill`**

Read the current `module/documents/actor.mjs` first — it should look like this (from the v1 build):

```js
import { computeRoll } from "../helpers/dice-rules.mjs";

const PHYSICAL_SKILLS = new Set(["violence", "reflexes", "coordination"]);

const TIER_CLASS = {
  criticalFailure: "procedural-tier-critical-failure",
  failure: "procedural-tier-failure",
  soSo: "procedural-tier-so-so",
  success: "procedural-tier-success",
  successEffect: "procedural-tier-success-effect"
};

export default class ProceduralActor extends Actor {
  async rollSkill(skillKey, { mode = "normal", situationalModifier = 0 } = {}) {
    const skill = this.system.skills?.[skillKey];
    if (!skill) throw new Error(`Unknown skill: ${skillKey}`);

    const result = computeRoll({
      mode,
      skillModifier: skill.value,
      situationalModifier,
      hurt: this.system.hurt ?? false,
      isPhysicalSkill: PHYSICAL_SKILLS.has(skillKey)
    });

    await this._postRollCard(skillKey, mode, situationalModifier, result);
    return result;
  }
  // ...unchanged methods below (_postRollCard, spendRerunPointAndReroll)
}
```

Add the import at the top:

```js
import { showDiceSoNice } from "../helpers/dice-so-nice.mjs";
```

Change `rollSkill` to await the animation, wrapped in a try/catch so a Dice So Nice! failure can never block the actual roll, right before the existing `_postRollCard` call:

```js
  async rollSkill(skillKey, { mode = "normal", situationalModifier = 0 } = {}) {
    const skill = this.system.skills?.[skillKey];
    if (!skill) throw new Error(`Unknown skill: ${skillKey}`);

    const result = computeRoll({
      mode,
      skillModifier: skill.value,
      situationalModifier,
      hurt: this.system.hurt ?? false,
      isPhysicalSkill: PHYSICAL_SKILLS.has(skillKey)
    });

    try {
      await showDiceSoNice(result.dice);
    } catch (err) {
      console.error("PROCEDURAL | Dice So Nice! animation failed", err);
    }

    await this._postRollCard(skillKey, mode, situationalModifier, result);
    return result;
  }
```

Do not change `_postRollCard` or `spendRerunPointAndReroll` — `spendRerunPointAndReroll` already calls `rollSkill` internally, so it automatically gets the animation too with no further changes needed.

- [ ] **Step 5: Verify syntax**

```bash
node --check module/documents/actor.mjs
```
Expected: no output.

- [ ] **Step 6: Run the full pure-logic test suite as a regression check**

```bash
npm test
```
Expected: all 19 tests pass (unaffected by this task — `actor.mjs` isn't part of the Node-testable surface, but this confirms Task 1 didn't regress).

- [ ] **Step 7: Commit**

```bash
git add module/documents/actor.mjs
git commit -m "feat: trigger Dice So Nice! animation before posting roll chat cards"
```

- [ ] **Step 8: Manual verification (requires a real Foundry v14 client with Dice So Nice! installed)**

This cannot be automated or verified by a subagent — note it as a follow-up for the human, alongside the existing Task 15 smoke-test checklist from the v1 plan:

1. With Dice So Nice! **not** installed/active, roll a skill — confirm behavior is identical to before this change (chat card only, no errors in console).
2. Install and activate Dice So Nice!, reload the world, roll a Normal skill roll — confirm 2 dice animate on the table (visible to all connected clients if testing with 2+ browser sessions), then the chat card appears.
3. Roll with Advantage — confirm 4 dice animate, with 2 visually marked as discarded/dropped (Dice So Nice!'s standard treatment for inactive dice).
4. Roll with Disadvantage — confirm 3 dice animate, with 1 marked discarded.
5. Spend a Rerun Point to reroll — confirm the animation plays again for the reroll.
