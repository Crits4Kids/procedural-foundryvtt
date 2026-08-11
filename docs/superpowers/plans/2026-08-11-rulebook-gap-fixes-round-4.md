# Rulebook Gap Fixes, Round 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the two remaining rulebook mechanics identified in Round 4's audit: Trope/second-Talent duplicate prevention at character creation, and the culprit-escape +2 bad evidence penalty at Epilogue.

**Architecture:** `rollTrope()` gains rejection-sampling exclusion (reroll away from already-held names, preserving its weighted 2d6 table) and `generateTrope()` threads that through for both Trope and second Talent. Three call sites (`ProceduralActor.generateRandomTrope()`, `TropeBuilderApplication`, `NpcBuilderApplication`) compute a "held elsewhere" name set using the exact `game.actors.filter(...).flatMap(...)` pattern `actor-trope-sheet.mjs`'s existing `#getAvailableTalents()` already uses for Level Up/Flashback. Separately, `tallyEvidence()` gains a `culpritEscaped` option that adds a fixed +2 to the bad count, backed by a new `culpritEscaped` boolean field on `CaseTrackerData` and a plain form checkbox — no new Case Tracker action, since it's a form field flowing through the existing `submitOnChange`/`#formToData` round-trip.

**Tech Stack:** Foundry VTT ApplicationV2/HandlebarsApplicationMixin, Foundry DataModel schema fields, Handlebars templates, vanilla JS (`.mjs`), `node --test` for unit tests.

## Global Constraints

- No Foundry-runtime test harness exists in this repo — only pure helpers (`character-generator.mjs`, `evidence-tally.mjs`) get `.test.mjs` files; app/sheet/template wiring is verified by hand (matches all three prior gap-fix rounds).
- `rollTrope`'s exclusion is rejection sampling (reroll on collision), never array-filter-then-index — filtering the input array before the 2d6-sum lookup would shift every sum-to-Trope mapping and corrupt the weighted table.
- `pickRandom()`'s signature is untouched (still generic, also used for desk items which need no dedup); second-Talent exclusion is applied by filtering the list *before* calling it.
- Every exclusion falls back to the unrestricted list/roll if applying it would empty the pool — this feature must never block character creation.
- NPC Trope dedup only excludes Tropes held by `trope`-type (human player) actors, never other NPCs.
- `culpritEscaped` is a plain checkbox with no visibility gating (mirrors `arrestPhaseNotes`), and every consumer of evidence tallies — both the `_prepareContext` display and the `#onRollEpilogueTiebreak` action's own tied-check — must pass `{ culpritEscaped: data.culpritEscaped }` so the tie-break button and the roll it triggers never disagree.
- Bump both `system.json` and `package.json` versions together, per this repo's every-round convention (minor bump).

---

## File Structure

- Modify `module/helpers/character-generator.mjs` — `rollTrope` gains exclusion; `generateTrope` gains an `exclude` param.
- Modify `module/helpers/character-generator.test.mjs` — new exclusion/fallback test cases.
- Modify `module/documents/actor.mjs` — `generateRandomTrope()` computes and passes held-name sets.
- Modify `module/apps/trope-builder.mjs` — Trope/second-Talent dropdowns filtered, roll button excludes.
- Modify `module/apps/npc-builder.mjs` — Trope dropdown filtered, roll button excludes.
- Modify `module/helpers/evidence-tally.mjs` — `tallyEvidence` gains a `culpritEscaped` option.
- Modify `module/helpers/evidence-tally.test.mjs` — new `culpritEscaped` test cases.
- Modify `module/data/case-tracker.mjs` — add `culpritEscaped` schema field.
- Modify `module/apps/case-tracker.mjs` — thread `culpritEscaped` through `_prepareContext`, `#formToData`, and `#onRollEpilogueTiebreak`.
- Modify `templates/apps/case-tracker.hbs` — add the `culpritEscaped` checkbox.
- Modify `lang/en.json` — add `PROCEDURAL.CaseTracker.CulpritEscaped`.
- Modify `system.json`, `package.json` — version bump.

---

### Task 1: `rollTrope`/`generateTrope` dedup support

**Files:**
- Modify: `module/helpers/character-generator.mjs`
- Test: `module/helpers/character-generator.test.mjs`

**Interfaces:**
- Produces: `rollTrope(tropes: object[], rng: () => number, excludeNames?: string[]): object` — used by Task 2, 3, 4.
- Produces: `generateTrope(data: object, rng?: () => number, exclude?: { tropeNames?: string[], secondTalentNames?: string[] }): object` — used by Task 2.

- [ ] **Step 1: Write the failing tests**

Append to `module/helpers/character-generator.test.mjs` (after the existing three `rollTrope` tests, i.e. after the "picks the Trope at a middle sum" test and before the `applyGifted` tests):

```js
test("rollTrope rerolls away from a single excluded name", () => {
  const rng = queue([1, 1, 3, 4]); // sum 2 (Rookie, excluded) -> reroll -> sum 7 (Lab Tech)
  assert.equal(rollTrope(FIXTURE_TROPES, rng, ["Rookie"]).name, "Lab Tech");
});

test("rollTrope rerolls past multiple consecutive excluded results", () => {
  const rng = queue([1, 1, 6, 6, 3, 4]); // Rookie, then Shades, both excluded -> Lab Tech
  assert.equal(rollTrope(FIXTURE_TROPES, rng, ["Rookie", "Shades"]).name, "Lab Tech");
});

test("rollTrope falls back to an unrestricted roll when every Trope is excluded", () => {
  const rng = queue([1, 1]);
  const allNames = FIXTURE_TROPES.map(t => t.name);
  assert.equal(rollTrope(FIXTURE_TROPES, rng, allNames).name, "Rookie");
});

test("rollTrope gives up after 30 rerolls and returns the colliding result rather than looping forever", () => {
  const rng = queue([1, 1]); // always sum 2 -> Rookie, which is excluded every time
  assert.equal(rollTrope(FIXTURE_TROPES, rng, ["Rookie"]).name, "Rookie");
});
```

Append to `module/helpers/character-generator.test.mjs` (right after the existing "generateTrope wires every roll together into one result" test):

```js
test("generateTrope excludes a held second Talent from the possible outputs", () => {
  const rng = fixedRng([0]); // would normally pick the first option everywhere
  const result = generateTrope({
    tropes: FIXTURE_TROPES,
    secondTalents: SECOND_TALENTS_FIXTURE,
    qualities: QUALITIES_FIXTURE,
    quirks: QUIRKS_FIXTURE,
    bstories: BSTORIES_FIXTURE,
    hq: HQ_FIXTURE,
    agencyNames: AGENCY_NAMES_FIXTURE,
    deskItems: DESK_ITEMS_FIXTURE
  }, rng, { secondTalentNames: ["Sentinel"] });

  assert.equal(result.secondTalent.name, "Drama Queen");
});

test("generateTrope falls back to the full second Talent list when every option is excluded", () => {
  const rng = fixedRng([0]);
  const result = generateTrope({
    tropes: FIXTURE_TROPES,
    secondTalents: SECOND_TALENTS_FIXTURE,
    qualities: QUALITIES_FIXTURE,
    quirks: QUIRKS_FIXTURE,
    bstories: BSTORIES_FIXTURE,
    hq: HQ_FIXTURE,
    agencyNames: AGENCY_NAMES_FIXTURE,
    deskItems: DESK_ITEMS_FIXTURE
  }, rng, { secondTalentNames: ["Sentinel", "Drama Queen"] });

  assert.equal(result.secondTalent.name, "Sentinel");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL. `rollTrope(FIXTURE_TROPES, rng, [...])` currently ignores its third argument (extra JS args are silently dropped, not an error), so e.g. the "rerolls away from a single excluded name" test gets back "Rookie" instead of "Lab Tech". Similarly `generateTrope`'s new `exclude` tests get back "Sentinel" instead of "Drama Queen" for the first new case.

- [ ] **Step 3: Implement the exclusion in `rollTrope`**

In `module/helpers/character-generator.mjs`, replace:

```js
export function rollTrope(tropes, rng) {
  const sum = roll1d6(rng) + roll1d6(rng);
  return tropes[sum - 2];
}
```

with:

```js
/**
 * @param {Array<object>} tropes - 11 entries ordered for 2d6 sums 2-12 (same order as data/tropes.json)
 * @param {() => number} rng
 * @param {string[]} [excludeNames] - Trope names to reroll away from (e.g. Tropes other
 *   players already hold). Uses rejection sampling, not array filtering, so the weighted
 *   2d6 table stays intact. Falls back to an unrestricted roll if every Trope is excluded,
 *   or after 30 rerolls, rather than looping forever or blocking character creation.
 */
export function rollTrope(tropes, rng, excludeNames = []) {
  const excluded = new Set(excludeNames);
  if (excluded.size >= tropes.length) {
    const sum = roll1d6(rng) + roll1d6(rng);
    return tropes[sum - 2];
  }

  for (let attempt = 0; attempt < 30; attempt++) {
    const sum = roll1d6(rng) + roll1d6(rng);
    const candidate = tropes[sum - 2];
    if (!excluded.has(candidate.name)) return candidate;
  }

  const sum = roll1d6(rng) + roll1d6(rng);
  return tropes[sum - 2];
}
```

- [ ] **Step 4: Thread exclusion through `generateTrope`**

In the same file, replace:

```js
export function generateTrope(data, rng = Math.random) {
  const { tropes, secondTalents, qualities, quirks, bstories, hq, agencyNames, deskItems } = data;

  const rolledTrope = rollTrope(tropes, rng);
  const stats = applyGifted(rolledTrope, { ...rolledTrope.system.statBlock }, rng);
  const skills = divestSkills(stats, rolledTrope.system.statNotes, rng);

  return {
    trope: {
      ...rolledTrope,
      system: { ...rolledTrope.system, statBlock: stats }
    },
    stats,
    skills,
    quality: rollQualityOrQuirk(qualities, rng),
    quirk: rollQualityOrQuirk(quirks, rng),
    bStory: rollBStoryOrHq(bstories, rng),
    hq: rollBStoryOrHq(hq, rng),
    agencyName: rollAgencyName(agencyNames, rng),
    secondTalent: pickRandom(secondTalents, rng),
    deskItem: pickRandom(deskItems, rng),
    rerunPoints: 1
  };
}
```

with:

```js
/**
 * Runs the full PROCEDURAL! character-creation checklist and returns a
 * plain result object. This function touches no Foundry API — the caller
 * (module/documents/actor.mjs) is responsible for applying the result to
 * an actor.
 * @param {object} data
 * @param {Array<object>} data.tropes - data/tropes.json shape
 * @param {Array<object>} data.secondTalents - data/second-talents.json shape
 * @param {{odds: string[], evens: string[]}} data.qualities - data/qualities.json shape
 * @param {{odds: string[], evens: string[]}} data.quirks - data/quirks.json shape
 * @param {{odds: string[], evens: string[]}} data.bstories - data/bstories.json shape
 * @param {{odds: string[], evens: string[]}} data.hq - data/hq.json shape
 * @param {{table1: string[], table2: string[], table3: string[]}} data.agencyNames - data/agency-names.json shape
 * @param {Array<object>} data.deskItems - data/desk-items.json shape
 * @param {() => number} [rng]
 * @param {{tropeNames?: string[], secondTalentNames?: string[]}} [exclude] - names already
 *   held by other characters, to avoid duplicating. Falls back to the unfiltered list for
 *   second Talent if excluding would leave no options.
 */
export function generateTrope(data, rng = Math.random, exclude = {}) {
  const { tropes, secondTalents, qualities, quirks, bstories, hq, agencyNames, deskItems } = data;
  const { tropeNames = [], secondTalentNames = [] } = exclude;

  const rolledTrope = rollTrope(tropes, rng, tropeNames);
  const stats = applyGifted(rolledTrope, { ...rolledTrope.system.statBlock }, rng);
  const skills = divestSkills(stats, rolledTrope.system.statNotes, rng);

  const excludedSecondTalents = new Set(secondTalentNames);
  const availableSecondTalents = secondTalents.filter(t => !excludedSecondTalents.has(t.name));
  const secondTalentPool = availableSecondTalents.length ? availableSecondTalents : secondTalents;

  return {
    trope: {
      ...rolledTrope,
      system: { ...rolledTrope.system, statBlock: stats }
    },
    stats,
    skills,
    quality: rollQualityOrQuirk(qualities, rng),
    quirk: rollQualityOrQuirk(quirks, rng),
    bStory: rollBStoryOrHq(bstories, rng),
    hq: rollBStoryOrHq(hq, rng),
    agencyName: rollAgencyName(agencyNames, rng),
    secondTalent: pickRandom(secondTalentPool, rng),
    deskItem: pickRandom(deskItems, rng),
    rerunPoints: 1
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, all `character-generator` tests green (existing tests plus the 6 new ones).

- [ ] **Step 6: Commit**

```bash
git add module/helpers/character-generator.mjs module/helpers/character-generator.test.mjs
git commit -m "feat: add Trope/second-Talent exclusion to rollTrope and generateTrope"
```

---

### Task 2: `generateRandomTrope()` dedup wiring

**Files:**
- Modify: `module/documents/actor.mjs`

**Interfaces:**
- Consumes: `generateTrope(data, rng, exclude)` (Task 1).

- [ ] **Step 1: Compute held-name sets and pass them to `generateTrope`**

In `module/documents/actor.mjs`, replace:

```js
  async generateRandomTrope() {
    const data = await loadGeneratorData();
    const result = generateTrope(data);
```

with:

```js
  async generateRandomTrope() {
    const data = await loadGeneratorData();
    const otherTropeActors = game.actors.filter(actor => actor.type === "trope" && actor.id !== this.id);
    const heldTropeNames = otherTropeActors.flatMap(actor => actor.items.filter(item => item.type === "trope").map(item => item.name));
    const heldSecondTalentNames = otherTropeActors.flatMap(actor => actor.items.filter(item => item.type === "talent").map(item => item.name));
    const result = generateTrope(data, Math.random, {
      tropeNames: heldTropeNames,
      secondTalentNames: heldSecondTalentNames
    });
```

The rest of the method (staleItems cleanup, `actor.update`, `Item.createDocuments`) is unchanged.

- [ ] **Step 2: Run the test suite as a sanity check**

Run: `npm test`
Expected: PASS. This file has no dedicated test suite (Foundry `Actor` subclass — no runtime harness in this repo per Global Constraints); this just confirms no syntax error and Task 1's tests still pass.

- [ ] **Step 3: Commit**

```bash
git add module/documents/actor.mjs
git commit -m "feat: exclude other players' Trope/second Talent when randomizing a character"
```

---

### Task 3: Trope Builder wizard dedup wiring

**Files:**
- Modify: `module/apps/trope-builder.mjs`

**Interfaces:**
- Consumes: `rollTrope(tropes, rng, excludeNames)` (Task 1).

- [ ] **Step 1: Add private helpers for held names**

In `module/apps/trope-builder.mjs`, add these two private methods directly after the `#stepId` getter (right before `async _prepareContext(options) {`):

```js
  #heldTropeNames() {
    return game.actors
      .filter(actor => actor.type === "trope")
      .flatMap(actor => actor.items.filter(item => item.type === "trope").map(item => item.name));
  }

  #heldSecondTalentNames() {
    return game.actors
      .filter(actor => actor.type === "trope")
      .flatMap(actor => actor.items.filter(item => item.type === "talent").map(item => item.name));
  }
```

(No `actor.id !== this.id` self-exclusion here, unlike Task 2 — the wizard's character doesn't exist as an actor yet, so every current `trope`-type actor is fair game to exclude against.)

- [ ] **Step 2: Filter the Trope step's dropdown options**

Replace the `if (stepId === "trope")` block inside `_prepareContext`:

```js
    if (stepId === "trope") {
      context.tropeOptions = this.#data.tropes.map(t => ({
        name: t.name,
        selected: t.name === (this.#draft.trope?.name ?? "")
      }));
```

with:

```js
    if (stepId === "trope") {
      const heldTropeNames = new Set(this.#heldTropeNames());
      const availableTropes = this.#data.tropes.filter(t => !heldTropeNames.has(t.name));
      const tropePool = availableTropes.length ? availableTropes : this.#data.tropes;
      context.tropeOptions = tropePool.map(t => ({
        name: t.name,
        selected: t.name === (this.#draft.trope?.name ?? "")
      }));
```

(The rest of that `if` block — `context.statKeys`, `context.isGifted`, etc. — is unchanged; only the `context.tropeOptions` assignment changes, so leave everything after it in place.)

- [ ] **Step 3: Filter the second-Talent step's dropdown options**

Replace:

```js
    if (stepId === "secondTalent") {
      context.secondTalentOptions = this.#data.secondTalents.map(t => ({
        name: t.name,
        selected: t.name === (this.#draft.secondTalent?.name ?? "")
      }));
    }
```

with:

```js
    if (stepId === "secondTalent") {
      const heldSecondTalentNames = new Set(this.#heldSecondTalentNames());
      const availableSecondTalents = this.#data.secondTalents.filter(t => !heldSecondTalentNames.has(t.name));
      const secondTalentPool = availableSecondTalents.length ? availableSecondTalents : this.#data.secondTalents;
      context.secondTalentOptions = secondTalentPool.map(t => ({
        name: t.name,
        selected: t.name === (this.#draft.secondTalent?.name ?? "")
      }));
    }
```

- [ ] **Step 4: Exclude held Tropes from the "Roll" button**

Replace:

```js
  static #onRollTrope() {
    const trope = rollTrope(this.#data.tropes, Math.random);
    this.#setTrope(trope);
  }
```

with:

```js
  static #onRollTrope() {
    const trope = rollTrope(this.#data.tropes, Math.random, this.#heldTropeNames());
    this.#setTrope(trope);
  }
```

- [ ] **Step 5: Run the test suite as a sanity check**

Run: `npm test`
Expected: PASS. This ApplicationV2 subclass has no dedicated test suite (no Foundry-runtime harness); this confirms no syntax error and prior tests still pass.

- [ ] **Step 6: Commit**

```bash
git add module/apps/trope-builder.mjs
git commit -m "feat: exclude other players' Trope/second Talent in the Trope Builder wizard"
```

---

### Task 4: NPC Generator dedup wiring

**Files:**
- Modify: `module/apps/npc-builder.mjs`

**Interfaces:**
- Consumes: `rollTrope(tropes, rng, excludeNames)` (Task 1).

- [ ] **Step 1: Add a private helper for held Trope names**

In `module/apps/npc-builder.mjs`, add this private method directly after the `#stepId` getter (right before `async _prepareContext(options) {`):

```js
  #heldTropeNames() {
    return game.actors
      .filter(actor => actor.type === "trope")
      .flatMap(actor => actor.items.filter(item => item.type === "trope").map(item => item.name));
  }
```

(Only `trope`-type actors, i.e. human players — per the rulebook, NPC allies only need to differ from human players' Tropes, not from each other.)

- [ ] **Step 2: Filter the Trope step's dropdown options**

Replace the `if (stepId === "trope")` block inside `_prepareContext`:

```js
    if (stepId === "trope") {
      context.tropeOptions = this.#data.tropes.map(t => ({
        name: t.name,
        selected: t.name === (this.#draft.trope?.name ?? "")
      }));
    }
```

with:

```js
    if (stepId === "trope") {
      const heldTropeNames = new Set(this.#heldTropeNames());
      const availableTropes = this.#data.tropes.filter(t => !heldTropeNames.has(t.name));
      const tropePool = availableTropes.length ? availableTropes : this.#data.tropes;
      context.tropeOptions = tropePool.map(t => ({
        name: t.name,
        selected: t.name === (this.#draft.trope?.name ?? "")
      }));
    }
```

- [ ] **Step 3: Exclude held Tropes from the "Roll" button**

Replace:

```js
  static #onRollTrope() {
    this.#draft.trope = rollTrope(this.#data.tropes, Math.random);
    this.render();
  }
```

with:

```js
  static #onRollTrope() {
    this.#draft.trope = rollTrope(this.#data.tropes, Math.random, this.#heldTropeNames());
    this.render();
  }
```

- [ ] **Step 4: Run the test suite as a sanity check**

Run: `npm test`
Expected: PASS. No dedicated test suite for this file (no Foundry-runtime harness); confirms no syntax error and prior tests still pass.

- [ ] **Step 5: Commit**

```bash
git add module/apps/npc-builder.mjs
git commit -m "feat: exclude human players' Tropes when generating an NPC ally"
```

---

### Task 5: `tallyEvidence` culprit-escape support

**Files:**
- Modify: `module/helpers/evidence-tally.mjs`
- Test: `module/helpers/evidence-tally.test.mjs`

**Interfaces:**
- Produces: `tallyEvidence(evidence: Array<{status: string}>, options?: { culpritEscaped?: boolean }): {good: number, bad: number, tied: boolean}` — used by Task 6.

- [ ] **Step 1: Write the failing tests**

Append to `module/helpers/evidence-tally.test.mjs`:

```js
test("tallyEvidence adds 2 bad when culpritEscaped is true, even with no evidence", () => {
  assert.deepEqual(tallyEvidence([], { culpritEscaped: true }), { good: 0, bad: 2, tied: false });
});

test("tallyEvidence's culpritEscaped bonus can create a tie", () => {
  const evidence = [{ status: "good" }, { status: "good" }];
  assert.deepEqual(tallyEvidence(evidence, { culpritEscaped: true }), { good: 2, bad: 2, tied: true });
});

test("tallyEvidence's culpritEscaped bonus can break an existing tie", () => {
  const evidence = [{ status: "good" }, { status: "bad" }];
  assert.deepEqual(tallyEvidence(evidence, { culpritEscaped: true }), { good: 1, bad: 3, tied: false });
});

test("tallyEvidence defaults culpritEscaped to false, matching pre-existing call sites", () => {
  const evidence = [{ status: "good" }, { status: "bad" }];
  assert.deepEqual(tallyEvidence(evidence), { good: 1, bad: 1, tied: true });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL. The current `tallyEvidence(evidence)` takes only one parameter — a second argument is silently ignored, not an error — so e.g. the first new test gets back `{ good: 0, bad: 0, tied: false }` instead of `{ good: 0, bad: 2, tied: false }`.

- [ ] **Step 3: Implement `culpritEscaped`**

Replace the full contents of `module/helpers/evidence-tally.mjs`:

```js
/**
 * @param {Array<{status: string}>} evidence
 * @param {{culpritEscaped?: boolean}} [options] - culpritEscaped adds a fixed 2 to the
 *   bad count, per the rulebook's "add 2 pieces of bad evidence" arrest-phase-escape rule.
 * @returns {{good: number, bad: number, tied: boolean}}
 */
export function tallyEvidence(evidence, { culpritEscaped = false } = {}) {
  const good = evidence.filter(e => e.status === "good").length;
  const bad = evidence.filter(e => e.status === "bad").length + (culpritEscaped ? 2 : 0);
  return { good, bad, tied: good === bad && good + bad > 0 };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, all `evidence-tally` tests green (existing 6 plus the 4 new ones).

- [ ] **Step 5: Commit**

```bash
git add module/helpers/evidence-tally.mjs module/helpers/evidence-tally.test.mjs
git commit -m "feat: add culpritEscaped option to tallyEvidence"
```

---

### Task 6: Case Tracker culprit-escape wiring

**Files:**
- Modify: `module/data/case-tracker.mjs`
- Modify: `module/apps/case-tracker.mjs`
- Modify: `templates/apps/case-tracker.hbs`
- Modify: `lang/en.json`

**Interfaces:**
- Consumes: `tallyEvidence(evidence, options)` (Task 5).
- Produces: `CaseTrackerData` schema field `culpritEscaped: boolean`; `context.culpritEscaped` in `_prepareContext`; `culpritEscaped` in `#formToData`'s return shape.

- [ ] **Step 1: Add the schema field**

In `module/data/case-tracker.mjs`, replace:

```js
      arrestPhaseTriggered: new BooleanField({ initial: false }),
      arrestPhaseNotes: new StringField({ initial: "" }),
```

with:

```js
      arrestPhaseTriggered: new BooleanField({ initial: false }),
      culpritEscaped: new BooleanField({ initial: false }),
      arrestPhaseNotes: new StringField({ initial: "" }),
```

- [ ] **Step 2: Add the localization key**

In `lang/en.json`, inside the `"CaseTracker"` object, replace:

```json
      "ArrestPhaseTriggered": "Arrest Phase Triggered",
      "ArrestPhaseNotes": "Arrest Phase Notes",
```

with:

```json
      "ArrestPhaseTriggered": "Arrest Phase Triggered",
      "CulpritEscaped": "Culprit Escaped (adds 2 bad evidence at Epilogue)",
      "ArrestPhaseNotes": "Arrest Phase Notes",
```

- [ ] **Step 3: Wire `_prepareContext`, `#formToData`, and the tie-break action**

In `module/apps/case-tracker.mjs`, replace:

```js
    context.arrestPhaseTriggered = data.arrestPhaseTriggered;
    context.arrestPhaseNotes = data.arrestPhaseNotes;
```

with:

```js
    context.arrestPhaseTriggered = data.arrestPhaseTriggered;
    context.culpritEscaped = data.culpritEscaped;
    context.arrestPhaseNotes = data.arrestPhaseNotes;
```

Replace:

```js
    context.evidenceTally = tallyEvidence(data.evidence);
```

with:

```js
    context.evidenceTally = tallyEvidence(data.evidence, { culpritEscaped: data.culpritEscaped });
```

Replace:

```js
      arrestPhaseTriggered: expanded.arrestPhaseTriggered ?? false,
      arrestPhaseNotes: expanded.arrestPhaseNotes ?? "",
```

with:

```js
      arrestPhaseTriggered: expanded.arrestPhaseTriggered ?? false,
      culpritEscaped: !!expanded.culpritEscaped,
      arrestPhaseNotes: expanded.arrestPhaseNotes ?? "",
```

Replace, in `#onRollEpilogueTiebreak`:

```js
  static async #onRollEpilogueTiebreak() {
    const data = CaseTrackerApplication.#formToData(this.form);
    const { tied } = tallyEvidence(data.evidence);
    if (!tied) return;
```

with:

```js
  static async #onRollEpilogueTiebreak() {
    const data = CaseTrackerApplication.#formToData(this.form);
    const { tied } = tallyEvidence(data.evidence, { culpritEscaped: data.culpritEscaped });
    if (!tied) return;
```

This last change matters: without it, the tie-break button's visibility (driven by `context.evidenceTally.tied`, which *does* account for `culpritEscaped`) could disagree with what the button does when clicked (which re-derives `tied` from scratch) — a case where the escape bonus creates a tie would show the button but silently no-op on click.

- [ ] **Step 4: Add the template checkbox**

In `templates/apps/case-tracker.hbs`, replace:

```hbs
  <fieldset class="procedural-case-tracker-arrest-phase">
    <legend>
      <label>
        <input type="checkbox" name="arrestPhaseTriggered" {{#if arrestPhaseTriggered}}checked{{/if}}>
        {{localize "PROCEDURAL.CaseTracker.ArrestPhaseTriggered"}}
      </label>
    </legend>
    <textarea name="arrestPhaseNotes" class="procedural-builder-freetext" placeholder="{{localize 'PROCEDURAL.CaseTracker.ArrestPhaseNotes'}}">{{arrestPhaseNotes}}</textarea>
  </fieldset>
```

with:

```hbs
  <fieldset class="procedural-case-tracker-arrest-phase">
    <legend>
      <label>
        <input type="checkbox" name="arrestPhaseTriggered" {{#if arrestPhaseTriggered}}checked{{/if}}>
        {{localize "PROCEDURAL.CaseTracker.ArrestPhaseTriggered"}}
      </label>
    </legend>
    <label>
      <input type="checkbox" name="culpritEscaped" {{#if culpritEscaped}}checked{{/if}}>
      {{localize "PROCEDURAL.CaseTracker.CulpritEscaped"}}
    </label>
    <textarea name="arrestPhaseNotes" class="procedural-builder-freetext" placeholder="{{localize 'PROCEDURAL.CaseTracker.ArrestPhaseNotes'}}">{{arrestPhaseNotes}}</textarea>
  </fieldset>
```

- [ ] **Step 5: Run the test suite as a sanity check**

Run: `npm test`
Expected: PASS. Confirms no syntax error and Task 5's `evidence-tally` tests (plus everything else) still pass; the app/template wiring itself has no automated test per Global Constraints.

- [ ] **Step 6: Commit**

```bash
git add module/data/case-tracker.mjs module/apps/case-tracker.mjs templates/apps/case-tracker.hbs lang/en.json
git commit -m "feat: add culprit-escape evidence penalty to the Case Tracker"
```

---

### Task 7: Full test suite, manual verification, and version bump

**Files:**
- Modify: `system.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing new — this task validates and finalizes the round.

- [ ] **Step 1: Run the full automated test suite**

Run: `npm test`
Expected: PASS — every existing suite plus the 10 new tests from Tasks 1 and 5.

- [ ] **Step 2: Manual smoke test in a running Foundry instance**

No Foundry-runtime test harness exists in this repo (Global Constraints), so verify these by hand:

1. Create two Trope actors. Use "Randomize" on the first (note its Trope and second Talent). Use "Randomize" on the second several times; confirm it never lands on the first actor's Trope or second Talent name.
2. Open the Trope Builder wizard for a third character. On the Trope step, confirm the dropdown omits the two already-claimed Tropes, and clicking "Roll" never lands on them either. On the second-Talent step, confirm the dropdown omits the two already-claimed second Talents.
3. Open the NPC Generator with at least one Trope actor present. On the Trope step, confirm the dropdown and "Roll" button both skip that actor's Trope.
4. Open the Case Tracker. In the Arrest Phase section, add 2 good evidence entries and 0 bad (tally reads "2 / 0", not tied, no tie-break button). Check "Culprit Escaped"; confirm the tally becomes "2 / 2" and the "Roll Tie-break" button appears. Click it; confirm a chat message posts and the result persists. Uncheck "Culprit Escaped"; confirm the tally reverts to "2 / 0" and the "Roll Tie-break" button disappears.

- [ ] **Step 3: Bump the version**

In `system.json`, change:

```json
  "version": "0.13.0",
```

to:

```json
  "version": "0.14.0",
```

In `package.json`, change:

```json
  "version": "0.13.0",
```

to:

```json
  "version": "0.14.0",
```

(Minor bump, matching the precedent set by every prior "rulebook gap fixes" round.)

- [ ] **Step 4: Commit**

```bash
git add system.json package.json
git commit -m "chore: bump version to 0.14.0"
```

---

## Self-Review Notes

- **Spec coverage:** Trope/second-Talent dedup (spec §1) → Tasks 1-4. Culprit-escape evidence penalty (spec §2) → Tasks 5-6. Localization → Task 6. Testing → Tasks 1, 5, 7. Version bump → Task 7.
- **Placeholder scan:** every step has literal, complete code — no "TBD"/"similar to above."
- **Type consistency:** `rollTrope(tropes, rng, excludeNames)` (Task 1) called identically by Tasks 2-4. `generateTrope(data, rng, { tropeNames, secondTalentNames })` (Task 1) called identically by Task 2. `tallyEvidence(evidence, { culpritEscaped })` (Task 5) called identically by both call sites touched in Task 6 (`_prepareContext` and `#onRollEpilogueTiebreak`). Field name `culpritEscaped` matches across the schema (Task 6 Step 1), `#formToData`/`_prepareContext` (Task 6 Step 3), and the template binding (Task 6 Step 4).
- **Correction found during planning:** the design spec stated `#onRollEpilogueTiebreak` needed no change, since it "already reads `evidenceTally.tied`" — but the action actually calls `tallyEvidence(data.evidence)` directly, bypassing `context.evidenceTally` entirely. Task 6 Step 3 fixes this so the tie-break button and the roll it triggers can't disagree about whether the tally is tied.
