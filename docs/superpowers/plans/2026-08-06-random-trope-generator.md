# Random Trope Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Randomize" button on the Trope actor sheet that runs the rulebook's full character-creation checklist and leaves a playable Trope actor: a rolled Trope with stats divested into skills, a Quality, a Quirk, a B-story, an HQ, an Agency Name, a second Talent, and 1 Rerun Point.

**Architecture:** A pure, dependency-free `character-generator.mjs` module (same convention as `dice-rules.mjs`: every random draw takes an injected `rng`, fully unit-testable with Node's test runner, zero Foundry globals) implements every roll-table rule. A thin Foundry-glue method on `ProceduralActor` loads the JSON data tables, calls the pure module, then writes the result onto the actor and creates embedded Trope/Talent items. A sheet button with a confirm-before-overwrite dialog triggers it.

**Tech Stack:** Foundry VTT v14 (`ActorSheetV2`, `DialogV2.wait`, `Item.createDocuments`, `actor.deleteEmbeddedDocuments`), vanilla JS ES modules, Handlebars, Node's built-in test runner (`node:test`) for the pure logic.

## Global Constraints

- Target Foundry VTT v14 (same as the rest of this system).
- No new npm dependencies.
- Preserve the pure-logic-vs-Foundry-glue split: `character-generator.mjs` must remain dependency-free and fully unit-testable outside Foundry, with every random draw taking an injected `rng = Math.random` parameter — same convention as `module/helpers/dice-rules.mjs`.
- All existing tests in `module/helpers/dice-rules.test.mjs` must keep passing unmodified.
- New data files (`qualities.json`, `quirks.json`, `bstories.json`, `hq.json`, `agency-names.json`) must be transcribed verbatim from the rulebook, using the odds/evens (or table1/2/3) shapes fixed by the design doc.
- Full spec: `docs/superpowers/specs/2026-08-06-random-trope-generator-design.md`.

---

### Task 1: New flavor roll-table data files

**Files:**
- Create: `data/qualities.json`
- Create: `data/quirks.json`
- Create: `data/bstories.json`
- Create: `data/hq.json`
- Create: `data/agency-names.json`

**Interfaces:**
- Consumes: nothing (static content).
- Produces: the exact JSON shapes Task 3's `rollQualityOrQuirk`, `rollBStoryOrHq`, and `rollAgencyName` expect: `{ odds: string[11] }` / `{ evens: string[11] }` for Quality/Quirk (index 0 = 2d6 sum of 2, index 10 = sum of 12); `{ odds: string[6] }` / `{ evens: string[6] }` for B-story/HQ (index 0 = 1d6 roll of 1); `{ table1: string[6], table2: string[6], table3: string[6] }` for Agency Name.

- [ ] **Step 1: Create `data/qualities.json`**

```json
{
  "odds": ["Plucky", "Dogged", "Tough", "Honest", "Efficient", "Clever", "Shrewd", "Kind", "Astute", "Empathetic", "Foodie"],
  "evens": ["Loyal", "Relaxed", "Zen", "Wise", "Unflappable", "Crafty", "Diligent", "Studious", "Steadfast", "Relentless", "Uncompromising"]
}
```

- [ ] **Step 2: Create `data/quirks.json`**

```json
{
  "odds": ["Impatient", "Condescending", "Hungry", "Oral fixation", "Procrastinator", "Shy", "Colorblind", "Superfan (player defined)", "Workaholic", "Silly", "Distracted"],
  "evens": ["Irritable", "Phobic (player defined)", "Narcissist", "Impulsive", "Luddite", "Blowhard", "Obsessed (player defined)", "Science-denier", "Geek", "Perfectionist", "Overly religious"]
}
```

- [ ] **Step 3: Create `data/bstories.json`**

```json
{
  "odds": [
    "Your new puppy is destroying your house while you are working.",
    "A prior adventure just went viral and you've become an internet sensation because of it.",
    "Your \"wild\" identical twin just rolled into town and needs a favor.",
    "You're taking a magic class and it's finals week.",
    "You have your dreaded high school reunion coming up, and it's time to put the past behind you.",
    "An old sports injury has flared up, causing issues for you."
  ],
  "evens": [
    "An old flame has re-entered your life, will you rekindle the relationship or snuff it out?",
    "Your teenager was caught with some drugs at school.",
    "A reporter is bugging you to give an interview about some past exploit/scandal.",
    "Your significant other is tired of your work coming first and seems ready to leave you.",
    "You own a struggling side business that is about to go belly up.",
    "You testified against an old corrupt buddy and they were fired. Now they're making your life hell."
  ]
}
```

- [ ] **Step 4: Create `data/hq.json`**

```json
{
  "odds": [
    "A former funeral parlor",
    "A former beauty salon",
    "A luxury RV",
    "A former firehouse",
    "Basement of a history museum",
    "A supposedly haunted house"
  ],
  "evens": [
    "A classic, boring office suite",
    "Upstairs from a charming diner",
    "An ancient church",
    "Next door to a yoga studio that is always complaining about the noise",
    "A restored farmhouse on the outskirts of town",
    "A former children's pizza restaurant, complete with creepy animatronic animals"
  ]
}
```

- [ ] **Step 5: Create `data/agency-names.json`**

```json
{
  "table1": ["Federal", "Bureau of", "Department of", "National", "State", "United Nations"],
  "table2": ["Crime", "Investigation", "Criminal Science", "Homicide", "Murder", "Justice"],
  "table3": ["Squad", "Agency", "Department", "Investigators", "Force", "Organization"]
}
```

- [ ] **Step 6: Validate all five files parse and have the right shape**

```bash
node -e "
const fs = require('fs');
const files = {
  'data/qualities.json': ['odds', 11, 'evens', 11],
  'data/quirks.json': ['odds', 11, 'evens', 11],
  'data/bstories.json': ['odds', 6, 'evens', 6],
  'data/hq.json': ['odds', 6, 'evens', 6],
  'data/agency-names.json': ['table1', 6, 'table2', 6, 'table3', 6]
};
for (const [file, spec] of Object.entries(files)) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (let i = 0; i < spec.length; i += 2) {
    const key = spec[i], len = spec[i + 1];
    if (!Array.isArray(data[key]) || data[key].length !== len) {
      throw new Error(\`\${file}.\${key} should have \${len} entries, got \${data[key]?.length}\`);
    }
  }
  console.log(file, 'OK');
}
"
```
Expected: all five files print `OK`, no errors thrown.

- [ ] **Step 7: Commit**

```bash
git add data/qualities.json data/quirks.json data/bstories.json data/hq.json data/agency-names.json
git commit -m "feat: add flavor roll-table data for Quality, Quirk, B-story, HQ, and Agency Name"
```

---

### Task 2: `character-generator.mjs` — Trope roll, Gifted, skill divestment

**Files:**
- Create: `module/helpers/character-generator.mjs`
- Create: `module/helpers/character-generator.test.mjs`

**Interfaces:**
- Consumes: nothing Foundry-specific. Trope entries have the same shape as `data/tropes.json` rows: `{ name, img, system: { statBlock: {mental,physical,social}, statNotes, talentName, talentDescription, talentUsesPerAct } }`.
- Produces (used by Task 3 in the same file, and by Task 4's Foundry glue indirectly through `generateTrope`):
  - `rollTrope(tropes: Array<TropeEntry>, rng: () => number): TropeEntry` — picks by a 2d6 sum, `tropes[sum-2]`.
  - `applyGifted(trope: TropeEntry, stats: {mental,physical,social}, rng: () => number): {mental,physical,social}` — if `trope.system.talentName === "Gifted"`, returns a new stats object with +3 on one randomly chosen stat; otherwise returns `stats` unchanged.
  - `divestSkills(stats: {mental,physical,social}, statNotes: string, rng: () => number): {tech,lab,investigation,violence,reflexes,coordination,cool,intuition,deception}` (all 9 keys always present, numbers) — randomly distributes each stat's points across its 3 skills, capping Tech/Lab at 2 unless `statNotes` names that skill with an "at least N in Tech/Lab" minimum, which is applied first and lifts the cap for that skill only.

- [ ] **Step 1: Write the failing tests**

Create `module/helpers/character-generator.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { rollTrope, applyGifted, divestSkills } from "./character-generator.mjs";

function queue(values) {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i += 1;
    return (v - 1) / 6;
  };
}

function fixedRng(values) {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i += 1;
    return v;
  };
}

function tropeFixture(name, statBlock, statNotes, talentName) {
  return {
    name,
    img: "icons/svg/mystery-man.svg",
    system: { statBlock, statNotes, talentName, talentDescription: `${talentName} description`, talentUsesPerAct: 1 }
  };
}

const ROOKIE = tropeFixture("Rookie", { mental: 1, physical: 1, social: 1 }, "", "Gifted");
const CORONER = tropeFixture("Coroner", { mental: 5, physical: 1, social: 0 }, "At least 3 in Lab", "Pathologist");
const HARD_BOILED = tropeFixture("Hard-boiled", { mental: 2, physical: 3, social: 1 }, "", "Quick on the Draw");
const SHOT_CALLER = tropeFixture("Shot-caller", { mental: 2, physical: 2, social: 2 }, "", "Experienced");
const TECHIE = tropeFixture("Techie", { mental: 5, physical: 0, social: 1 }, "At least 3 in Tech", "Hack Attack");
const LAB_TECH = tropeFixture("Lab Tech", { mental: 5, physical: 0, social: 1 }, "At least 3 in Lab", "Enhance!");
const STREETWISE = tropeFixture("Streetwise", { mental: 1, physical: 2, social: 3 }, "", "Connected");
const EX_SPOOK = tropeFixture("Ex-Spook", { mental: 1, physical: 4, social: 1 }, "", "Shadow in the Dark");
const PROFILER = tropeFixture("Profiler", { mental: 2, physical: 1, social: 3 }, "", "Inside Your Mind");
const LEGAL_LIAISON = tropeFixture("Legal Liaison", { mental: 3, physical: 0, social: 3 }, "", "Legalese");
const SHADES = tropeFixture("Shades", { mental: 0, physical: 3, social: 3 }, "", "Irresistible");

const FIXTURE_TROPES = [
  ROOKIE, CORONER, HARD_BOILED, SHOT_CALLER, TECHIE, LAB_TECH,
  STREETWISE, EX_SPOOK, PROFILER, LEGAL_LIAISON, SHADES
];

test("rollTrope picks the Trope at 2d6 sum 2 (low boundary)", () => {
  const rng = queue([1, 1]);
  assert.equal(rollTrope(FIXTURE_TROPES, rng).name, "Rookie");
});

test("rollTrope picks the Trope at 2d6 sum 12 (high boundary)", () => {
  const rng = queue([6, 6]);
  assert.equal(rollTrope(FIXTURE_TROPES, rng).name, "Shades");
});

test("rollTrope picks the Trope at a middle sum", () => {
  const rng = queue([3, 4]); // sum 7
  assert.equal(rollTrope(FIXTURE_TROPES, rng).name, "Lab Tech");
});

test("applyGifted adds +3 to the randomly picked stat when the Talent is Gifted", () => {
  const rng = fixedRng([0.99]); // floor(0.99*3) = 2 -> "social"
  const result = applyGifted(ROOKIE, { mental: 1, physical: 1, social: 1 }, rng);
  assert.deepEqual(result, { mental: 1, physical: 1, social: 4 });
});

test("applyGifted leaves stats unchanged for a non-Gifted Talent", () => {
  const rng = fixedRng([0.1]);
  const result = applyGifted(CORONER, { mental: 5, physical: 1, social: 0 }, rng);
  assert.deepEqual(result, { mental: 5, physical: 1, social: 0 });
});

test("divestSkills caps Tech and Lab at 2 with no statNotes minimum", () => {
  const rng = fixedRng([0]); // always picks the first eligible skill
  const skills = divestSkills({ mental: 5, physical: 0, social: 0 }, "", rng);
  assert.deepEqual(skills, {
    tech: 2, lab: 2, investigation: 1,
    violence: 0, reflexes: 0, coordination: 0,
    cool: 0, intuition: 0, deception: 0
  });
});

test("divestSkills applies an 'at least N in Lab' minimum before random distribution", () => {
  const rng = fixedRng([0]);
  const skills = divestSkills({ mental: 5, physical: 0, social: 0 }, "At least 3 in Lab", rng);
  assert.deepEqual(skills, {
    tech: 2, lab: 3, investigation: 0,
    violence: 0, reflexes: 0, coordination: 0,
    cool: 0, intuition: 0, deception: 0
  });
});

test("divestSkills waives the cap for the skill named in statNotes", () => {
  const rng = fixedRng([0]);
  const skills = divestSkills({ mental: 5, physical: 0, social: 0 }, "At least 3 in Tech", rng);
  assert.deepEqual(skills, {
    tech: 5, lab: 0, investigation: 0,
    violence: 0, reflexes: 0, coordination: 0,
    cool: 0, intuition: 0, deception: 0
  });
});

test("divestSkills leaves Physical skills uncapped", () => {
  const rng = fixedRng([0]);
  const skills = divestSkills({ mental: 0, physical: 3, social: 0 }, "", rng);
  assert.deepEqual(skills, {
    tech: 0, lab: 0, investigation: 0,
    violence: 3, reflexes: 0, coordination: 0,
    cool: 0, intuition: 0, deception: 0
  });
});

test("Gifted's stat bonus flows into skill divestment", () => {
  const giftRng = fixedRng([0.5]); // floor(0.5*3) = 1 -> "physical"
  const stats = applyGifted(ROOKIE, { mental: 1, physical: 1, social: 1 }, giftRng);
  assert.deepEqual(stats, { mental: 1, physical: 4, social: 1 });

  const divestRng = fixedRng([0]);
  const skills = divestSkills(stats, ROOKIE.system.statNotes, divestRng);
  assert.deepEqual(skills, {
    tech: 1, lab: 0, investigation: 0,
    violence: 4, reflexes: 0, coordination: 0,
    cool: 1, intuition: 0, deception: 0
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test module/helpers/character-generator.test.mjs
```
Expected: FAIL — `character-generator.mjs` doesn't exist yet (module not found).

- [ ] **Step 3: Write `module/helpers/character-generator.mjs`**

```js
const STAT_SKILLS = {
  mental: ["tech", "lab", "investigation"],
  physical: ["violence", "reflexes", "coordination"],
  social: ["cool", "intuition", "deception"]
};

const CAPPED_SKILLS = { tech: 2, lab: 2 };

function roll1d6(rng) {
  return Math.floor(rng() * 6) + 1;
}

/**
 * @param {Array<object>} tropes - 11 entries ordered for 2d6 sums 2-12 (same order as data/tropes.json)
 * @param {() => number} rng
 */
export function rollTrope(tropes, rng) {
  const sum = roll1d6(rng) + roll1d6(rng);
  return tropes[sum - 2];
}

/**
 * Rookie's "Gifted" Talent lets the player add +3 to a stat of their choice
 * during character creation. Picks one at random when the rolled Trope has
 * that Talent; returns stats unchanged otherwise.
 * @param {{system: {talentName: string}}} trope
 * @param {{mental: number, physical: number, social: number}} stats
 * @param {() => number} rng
 */
export function applyGifted(trope, stats, rng) {
  if (trope.system.talentName !== "Gifted") return stats;
  const keys = ["mental", "physical", "social"];
  const picked = keys[Math.floor(rng() * keys.length)];
  return { ...stats, [picked]: stats[picked] + 3 };
}

function parseStatNoteMinimum(statNotes) {
  const match = /at least (\d+) in (Tech|Lab)/i.exec(statNotes ?? "");
  if (!match) return null;
  return { skill: match[2].toLowerCase(), minimum: Number(match[1]) };
}

function divestStat(statName, points, statNotes, rng) {
  const skillKeys = STAT_SKILLS[statName];
  const values = Object.fromEntries(skillKeys.map(key => [key, 0]));
  let remaining = points;

  const noteMin = parseStatNoteMinimum(statNotes);
  if (noteMin && skillKeys.includes(noteMin.skill)) {
    const applied = Math.min(noteMin.minimum, remaining);
    values[noteMin.skill] = applied;
    remaining -= applied;
  }

  const isEligible = (skill) => {
    const cap = CAPPED_SKILLS[skill];
    if (cap === undefined) return true;
    if (noteMin && noteMin.skill === skill) return true;
    return values[skill] < cap;
  };

  while (remaining > 0) {
    const eligible = skillKeys.filter(isEligible);
    if (eligible.length === 0) break; // defensive: no Trope in current data can exhaust this
    const picked = eligible[Math.floor(rng() * eligible.length)];
    values[picked] += 1;
    remaining -= 1;
  }

  return values;
}

/**
 * Distributes each stat's points across its 3 skills, respecting the
 * Tech/Lab cap of 2 (waived for a skill named in statNotes, e.g.
 * "At least 3 in Lab") and applying that named minimum first.
 * @param {{mental: number, physical: number, social: number}} stats
 * @param {string} statNotes
 * @param {() => number} rng
 */
export function divestSkills(stats, statNotes, rng) {
  return {
    ...divestStat("mental", stats.mental, statNotes, rng),
    ...divestStat("physical", stats.physical, statNotes, rng),
    ...divestStat("social", stats.social, statNotes, rng)
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test module/helpers/character-generator.test.mjs
```
Expected: all 10 tests pass.

- [ ] **Step 5: Run the full suite as a regression check**

```bash
npm test
```
Expected: all `dice-rules.test.mjs` tests plus the 10 new tests pass, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add module/helpers/character-generator.mjs module/helpers/character-generator.test.mjs
git commit -m "feat: add Trope roll, Gifted, and skill divestment logic"
```

---

### Task 3: `character-generator.mjs` — flavor tables, Agency Name, second Talent, and `generateTrope`

**Files:**
- Modify: `module/helpers/character-generator.mjs`
- Modify (add tests, don't remove Task 2's): `module/helpers/character-generator.test.mjs`

**Interfaces:**
- Consumes: `rollTrope`, `applyGifted`, `divestSkills` from Task 2 (same file).
- Produces (consumed by Task 4's `ProceduralActor#generateRandomTrope`):
  - `rollQualityOrQuirk(table: {odds: string[11], evens: string[11]}, rng): string` — 1d6 picks Odds (odd) or Evens (even), then 2d6 (sum 2-12) picks the entry.
  - `rollBStoryOrHq(table: {odds: string[6], evens: string[6]}, rng): string` — 1d6 picks Odds/Evens, then 1d6 (1-6) picks the entry.
  - `rollAgencyName(tables: {table1: string[6], table2: string[6], table3: string[6]}, rng): string` — one 1d6 pick per table, joined with spaces.
  - `pickRandom(list: Array<T>, rng): T` — uniform random pick.
  - `generateTrope(data, rng = Math.random): GeneratedTrope` — the public entry point, where `data = { tropes, secondTalents, qualities, quirks, bstories, hq, agencyNames }` (each matching its `data/*.json` file's shape) and `GeneratedTrope = { trope, stats, skills, quality, quirk, bStory, hq, agencyName, secondTalent, rerunPoints }`. `trope` and `secondTalent` retain the full `{name, img, system}` shape of their source entry; `trope.system.statBlock` is overwritten with the (Gifted-adjusted) final `stats` so the returned Trope reflects what ends up on the actor.

- [ ] **Step 1: Write the failing tests**

Append to `module/helpers/character-generator.test.mjs` (keep every existing test):

```js
import { rollQualityOrQuirk, rollBStoryOrHq, rollAgencyName, pickRandom, generateTrope } from "./character-generator.mjs";

const QUALITIES_FIXTURE = {
  odds: ["Plucky", "Dogged", "Tough", "Honest", "Efficient", "Clever", "Shrewd", "Kind", "Astute", "Empathetic", "Foodie"],
  evens: ["Loyal", "Relaxed", "Zen", "Wise", "Unflappable", "Crafty", "Diligent", "Studious", "Steadfast", "Relentless", "Uncompromising"]
};

const QUIRKS_FIXTURE = {
  odds: ["Impatient", "Condescending", "Hungry", "Oral fixation", "Procrastinator", "Shy", "Colorblind", "Superfan", "Workaholic", "Silly", "Distracted"],
  evens: ["Irritable", "Phobic", "Narcissist", "Impulsive", "Luddite", "Blowhard", "Obsessed", "Science-denier", "Geek", "Perfectionist", "Overly religious"]
};

const BSTORIES_FIXTURE = {
  odds: ["Puppy chaos", "Viral fame", "Wild twin", "Magic class finals", "High school reunion", "Old sports injury"],
  evens: ["Old flame", "Teen caught with drugs", "Reporter digging", "Partner wants out", "Struggling side business", "Corrupt buddy retaliating"]
};

const HQ_FIXTURE = {
  odds: ["Former funeral parlor", "Former beauty salon", "Luxury RV", "Former firehouse", "Museum basement", "Haunted house"],
  evens: ["Boring office suite", "Above a diner", "Ancient church", "Next to a yoga studio", "Restored farmhouse", "Former pizza restaurant"]
};

const AGENCY_NAMES_FIXTURE = {
  table1: ["Federal", "Bureau of", "Department of", "National", "State", "United Nations"],
  table2: ["Crime", "Investigation", "Criminal Science", "Homicide", "Murder", "Justice"],
  table3: ["Squad", "Agency", "Department", "Investigators", "Force", "Organization"]
};

const SECOND_TALENTS_FIXTURE = [
  { name: "Sentinel", img: "icons/svg/mystery-man.svg", system: { description: "Sentinel description", usesPerAct: 1 } },
  { name: "Drama Queen", img: "icons/svg/mystery-man.svg", system: { description: "Drama Queen description", usesPerAct: 1 } }
];

test("rollQualityOrQuirk selects the Odds table on an odd 1d6 and looks up by 2d6 sum", () => {
  const rng = queue([1, 3, 4]); // 1 -> odd/Odds; then 3+4=7
  assert.equal(rollQualityOrQuirk(QUALITIES_FIXTURE, rng), "Clever");
});

test("rollQualityOrQuirk selects the Evens table on an even 1d6", () => {
  const rng = queue([2, 5, 5]); // 2 -> even/Evens; then 5+5=10
  assert.equal(rollQualityOrQuirk(QUALITIES_FIXTURE, rng), "Steadfast");
});

test("rollBStoryOrHq selects the Odds (small stakes) table and 1d6 entry", () => {
  const rng = queue([3, 4]); // 3 -> odd/Odds; then entry 4
  assert.equal(rollBStoryOrHq(BSTORIES_FIXTURE, rng), "Magic class finals");
});

test("rollBStoryOrHq selects the Evens (large stakes) table and 1d6 entry", () => {
  const rng = queue([6, 2]); // 6 -> even/Evens; then entry 2
  assert.equal(rollBStoryOrHq(BSTORIES_FIXTURE, rng), "Teen caught with drugs");
});

test("rollAgencyName concatenates one 1d6 pick per table in order", () => {
  const rng = queue([1, 2, 5]);
  assert.equal(rollAgencyName(AGENCY_NAMES_FIXTURE, rng), "Federal Investigation Force");
});

test("pickRandom returns the entry at the computed index", () => {
  const rng = fixedRng([0.6]);
  assert.equal(pickRandom(["a", "b", "c", "d"], rng), "c");
});

test("generateTrope wires every roll together into one result", () => {
  const rng = fixedRng([0]); // every rng() call returns 0 -> always the first option/index

  const result = generateTrope({
    tropes: FIXTURE_TROPES,
    secondTalents: SECOND_TALENTS_FIXTURE,
    qualities: QUALITIES_FIXTURE,
    quirks: QUIRKS_FIXTURE,
    bstories: BSTORIES_FIXTURE,
    hq: HQ_FIXTURE,
    agencyNames: AGENCY_NAMES_FIXTURE
  }, rng);

  assert.equal(result.trope.name, "Rookie");
  assert.equal(result.trope.system.talentName, "Gifted");
  assert.deepEqual(result.trope.system.statBlock, { mental: 4, physical: 1, social: 1 });
  assert.deepEqual(result.stats, { mental: 4, physical: 1, social: 1 });
  assert.deepEqual(result.skills, {
    tech: 2, lab: 2, investigation: 0,
    violence: 1, reflexes: 0, coordination: 0,
    cool: 1, intuition: 0, deception: 0
  });
  assert.equal(result.quality, "Plucky");
  assert.equal(result.quirk, "Impatient");
  assert.equal(result.bStory, "Puppy chaos");
  assert.equal(result.hq, "Former funeral parlor");
  assert.equal(result.agencyName, "Federal Crime Squad");
  assert.equal(result.secondTalent.name, "Sentinel");
  assert.equal(result.rerunPoints, 1);
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
node --test module/helpers/character-generator.test.mjs
```
Expected: Task 2's 10 tests PASS, the 7 new tests FAIL (`rollQualityOrQuirk` etc. not exported / undefined).

- [ ] **Step 3: Append the flavor-roll functions and `generateTrope` to `module/helpers/character-generator.mjs`**

Add to the end of the file (after `divestSkills`):

```js
function rollOddsEvens(table, rng) {
  const selector = roll1d6(rng);
  return selector % 2 === 1 ? table.odds : table.evens;
}

/**
 * Quality/Quirk tables: 1d6 picks Odds vs Evens, then 2d6 (sum 2-12) picks
 * the entry within that table (data/qualities.json & data/quirks.json).
 */
export function rollQualityOrQuirk(table, rng) {
  const pool = rollOddsEvens(table, rng);
  const sum = roll1d6(rng) + roll1d6(rng);
  return pool[sum - 2];
}

/**
 * B-story/HQ tables: 1d6 picks Odds vs Evens, then 1d6 (1-6) picks the
 * entry within that table (data/bstories.json & data/hq.json).
 */
export function rollBStoryOrHq(table, rng) {
  const pool = rollOddsEvens(table, rng);
  const index = roll1d6(rng);
  return pool[index - 1];
}

/**
 * Agency Name: one 1d6 roll per table (data/agency-names.json), joined
 * with spaces, e.g. "Federal Investigation Squad".
 */
export function rollAgencyName(tables, rng) {
  const part1 = tables.table1[roll1d6(rng) - 1];
  const part2 = tables.table2[roll1d6(rng) - 1];
  const part3 = tables.table3[roll1d6(rng) - 1];
  return `${part1} ${part2} ${part3}`;
}

export function pickRandom(list, rng) {
  return list[Math.floor(rng() * list.length)];
}

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
 * @param {() => number} [rng]
 */
export function generateTrope(data, rng = Math.random) {
  const { tropes, secondTalents, qualities, quirks, bstories, hq, agencyNames } = data;

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
    rerunPoints: 1
  };
}
```

- [ ] **Step 4: Run tests to verify everything passes**

```bash
node --test module/helpers/character-generator.test.mjs
```
Expected: all 17 tests pass (10 from Task 2 + 7 new), 0 failures.

- [ ] **Step 5: Run the full suite as a regression check**

```bash
npm test
```
Expected: all tests across both `.test.mjs` files pass.

- [ ] **Step 6: Commit**

```bash
git add module/helpers/character-generator.mjs module/helpers/character-generator.test.mjs
git commit -m "feat: add flavor-table rolls and the generateTrope orchestrator"
```

---

### Task 4: `ProceduralActor#generateRandomTrope` (Foundry glue)

**Files:**
- Modify: `module/documents/actor.mjs`

**Interfaces:**
- Consumes: `generateTrope(data, rng?)` from Task 3, and the 7 data files (`data/tropes.json`, `data/second-talents.json`, `data/qualities.json`, `data/quirks.json`, `data/bstories.json`, `data/hq.json`, `data/agency-names.json`) via `fetch`.
- Produces: `ProceduralActor#generateRandomTrope(): Promise<GeneratedTrope>` — an async instance method Task 5's sheet button calls. Deletes any existing embedded `trope`/`talent` items on the actor, updates `system.stats`, `system.skills.*.value`, `system.qualities`, `system.quirks`, `system.bStory`, `system.hq`, `system.agencyName`, `system.rerunPoints`, and creates new embedded `trope`/`talent` items. Returns the same `GeneratedTrope` object `generateTrope` produced.

- [ ] **Step 1: Read the current file**

`module/documents/actor.mjs` currently looks like this (unchanged from the v1/DSN builds):

```js
import { computeRoll } from "../helpers/dice-rules.mjs";
import { showDiceSoNice } from "../helpers/dice-so-nice.mjs";

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
    // ...unchanged...
  }

  async _postRollCard(skillKey, mode, situationalModifier, result) {
    // ...unchanged...
  }

  async spendRerunPointAndReroll(skillKey, mode, situationalModifier) {
    // ...unchanged...
  }
}
```

- [ ] **Step 2: Add the import and the data-loading helper**

At the top of `module/documents/actor.mjs`, add the new import alongside the existing ones:

```js
import { generateTrope } from "../helpers/character-generator.mjs";
```

After the `TIER_CLASS` constant (still outside the class), add:

```js
const GENERATOR_DATA_PATHS = {
  tropes: "systems/procedural/data/tropes.json",
  secondTalents: "systems/procedural/data/second-talents.json",
  qualities: "systems/procedural/data/qualities.json",
  quirks: "systems/procedural/data/quirks.json",
  bstories: "systems/procedural/data/bstories.json",
  hq: "systems/procedural/data/hq.json",
  agencyNames: "systems/procedural/data/agency-names.json"
};

let cachedGeneratorData = null;

async function loadGeneratorData() {
  if (cachedGeneratorData) return cachedGeneratorData;
  const entries = await Promise.all(
    Object.entries(GENERATOR_DATA_PATHS).map(async ([key, path]) => {
      const response = await fetch(path);
      return [key, await response.json()];
    })
  );
  cachedGeneratorData = Object.fromEntries(entries);
  return cachedGeneratorData;
}
```

- [ ] **Step 3: Add `generateRandomTrope` to the `ProceduralActor` class**

Add this method inside the class, after `spendRerunPointAndReroll`:

```js
  async generateRandomTrope() {
    const data = await loadGeneratorData();
    const result = generateTrope(data);

    const staleItems = this.items.filter(i => i.type === "trope" || i.type === "talent");
    if (staleItems.length) {
      await this.deleteEmbeddedDocuments("Item", staleItems.map(i => i.id));
    }

    await this.update({
      "system.stats": result.stats,
      "system.skills.tech.value": result.skills.tech,
      "system.skills.lab.value": result.skills.lab,
      "system.skills.investigation.value": result.skills.investigation,
      "system.skills.violence.value": result.skills.violence,
      "system.skills.reflexes.value": result.skills.reflexes,
      "system.skills.coordination.value": result.skills.coordination,
      "system.skills.cool.value": result.skills.cool,
      "system.skills.intuition.value": result.skills.intuition,
      "system.skills.deception.value": result.skills.deception,
      "system.qualities": result.quality,
      "system.quirks": result.quirk,
      "system.bStory": result.bStory,
      "system.hq": result.hq,
      "system.agencyName": result.agencyName,
      "system.rerunPoints": result.rerunPoints
    });

    await Item.createDocuments([
      { name: result.trope.name, type: "trope", img: result.trope.img, system: result.trope.system },
      { name: result.secondTalent.name, type: "talent", img: result.secondTalent.img, system: result.secondTalent.system }
    ], { parent: this });

    return result;
  }
```

- [ ] **Step 4: Verify syntax**

```bash
node --check module/documents/actor.mjs
```
Expected: no output.

- [ ] **Step 5: Run the full pure-logic test suite as a regression check**

```bash
npm test
```
Expected: all tests pass (unaffected — `actor.mjs` is Foundry-runtime-only, not part of the Node-testable surface).

- [ ] **Step 6: Commit**

```bash
git add module/documents/actor.mjs
git commit -m "feat: add ProceduralActor#generateRandomTrope"
```

---

### Task 5: Sheet button, confirm dialog, and localization

Before writing the confirm-dialog code, fetch `https://foundryvtt.com/api/` (via WebFetch) and confirm `foundry.applications.api.DialogV2.wait`'s button `callback(event, button)` signature is unchanged from what `actor-trope-sheet.mjs` already uses in `#onRollSkill` — this plan reuses that exact proven pattern rather than a new API surface, so the risk here is low, but worth a quick confirmation per this project's established API-currency practice (see `docs/superpowers/plans/2026-08-05-procedural-system-v1.md`, "Before you start" section).

**Files:**
- Modify: `lang/en.json`
- Modify: `templates/actor/trope-sheet.hbs`
- Modify: `module/sheets/actor-trope-sheet.mjs`

**Interfaces:**
- Consumes: `this.actor.generateRandomTrope()` from Task 4.
- Produces: a `randomizeTrope` sheet action, wired the same way as the sheet's existing `rollSkill`/`toggleHurt`/etc. actions.

- [ ] **Step 1: Add localization strings**

In `lang/en.json`, inside the `"Actor"` object, add three new keys (after `"DeskItem": "Desk Item"`):

```json
      "DeskItem": "Desk Item",
      "Randomize": "Randomize",
      "RandomizeConfirm": "This will overwrite the current Trope, skills, and flavor fields. Continue?",
      "Confirm": "Confirm"
```

- [ ] **Step 2: Verify the JSON is still valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('lang/en.json', 'utf8')); console.log('OK')"
```
Expected: `OK`.

- [ ] **Step 3: Add the button to the sheet header**

In `templates/actor/trope-sheet.hbs`, change the header from:

```html
  <header class="procedural-sheet-header">
    <img class="procedural-sheet-img" src="{{actor.img}}" data-action="editImage" data-edit="img" alt="{{actor.name}}">
    <input class="procedural-sheet-name" type="text" name="name" value="{{actor.name}}">
  </header>
```

to:

```html
  <header class="procedural-sheet-header">
    <img class="procedural-sheet-img" src="{{actor.img}}" data-action="editImage" data-edit="img" alt="{{actor.name}}">
    <input class="procedural-sheet-name" type="text" name="name" value="{{actor.name}}">
    <button type="button" class="procedural-randomize-btn" data-action="randomizeTrope">
      {{localize "PROCEDURAL.Actor.Randomize"}}
    </button>
  </header>
```

- [ ] **Step 4: Wire the action and handler in `actor-trope-sheet.mjs`**

Change the `DEFAULT_OPTIONS.actions` block from:

```js
    actions: {
      rollSkill: ProceduralTropeActorSheet.#onRollSkill,
      toggleHurt: ProceduralTropeActorSheet.#onToggleHurt,
      createItem: ProceduralTropeActorSheet.#onCreateItem,
      editItem: ProceduralTropeActorSheet.#onEditItem,
      deleteItem: ProceduralTropeActorSheet.#onDeleteItem
    }
```

to:

```js
    actions: {
      rollSkill: ProceduralTropeActorSheet.#onRollSkill,
      toggleHurt: ProceduralTropeActorSheet.#onToggleHurt,
      createItem: ProceduralTropeActorSheet.#onCreateItem,
      editItem: ProceduralTropeActorSheet.#onEditItem,
      deleteItem: ProceduralTropeActorSheet.#onDeleteItem,
      randomizeTrope: ProceduralTropeActorSheet.#onRandomizeTrope
    }
```

Then add this method to the class, after `#onDeleteItem`:

```js
  static async #onRandomizeTrope() {
    const hasExistingData = this.actor.items.some(i => i.type === "trope") || !!this.actor.system.qualities;

    if (hasExistingData) {
      const confirmed = await foundry.applications.api.DialogV2.wait({
        window: { title: game.i18n.localize("PROCEDURAL.Actor.Randomize") },
        content: `<p>${game.i18n.localize("PROCEDURAL.Actor.RandomizeConfirm")}</p>`,
        buttons: [
          {
            action: "confirm",
            label: game.i18n.localize("PROCEDURAL.Actor.Confirm"),
            default: true,
            callback: () => true
          },
          {
            action: "cancel",
            label: game.i18n.localize("PROCEDURAL.Roll.Cancel"),
            callback: () => false
          }
        ],
        rejectClose: false
      });
      if (!confirmed) return;
    }

    await this.actor.generateRandomTrope();
  }
```

- [ ] **Step 5: Verify syntax**

```bash
node --check module/sheets/actor-trope-sheet.mjs
```
Expected: no output.

- [ ] **Step 6: Run the full test suite as a final regression check**

```bash
npm test
```
Expected: all tests pass (this task doesn't touch the Node-testable surface).

- [ ] **Step 7: Commit**

```bash
git add lang/en.json templates/actor/trope-sheet.hbs module/sheets/actor-trope-sheet.mjs
git commit -m "feat: add a Randomize button to the Trope sheet"
```

---

### Task 6: Manual verification

**Files:** none (verification only, using a running Foundry v14 client — same setup as the existing smoke-test checklist in `docs/superpowers/plans/2026-08-05-procedural-system-v1.md`, Task 15).

This cannot be automated or verified by a subagent — note it as a follow-up for the human.

- [x] **Step 1: Run the full automated suite one more time**

```bash
npm test
```
Expected: all tests pass.

- [x] **Step 2: Launch the world used for the existing smoke test** (or create a fresh one per Task 15 steps 1-4 of the v1 plan if none exists), and create a blank `trope` Actor.

- [x] **Step 3: Click "Randomize" on the blank actor.** Confirm no confirm-dialog appears (nothing to overwrite yet), and that afterward:
  - The header stats and all 9 skill inputs are populated with numbers that add up to the displayed Trope's stat totals (spot-check against the Trope's stat block, e.g. if Coroner was rolled, confirm Lab is at least 3).
  - Qualities, Quirks, B-Story, HQ, and Agency Name text fields are all populated with rulebook-style text.
  - Rerun Points shows 1.
  - The Trope list shows exactly one item (name matches the rolled Trope, e.g. "Rookie"), and the Talent list shows exactly one item (a second Talent, e.g. "Sentinel") — open each to confirm their stat block/description match what's expected for that roll.

- [x] **Step 4: Click "Randomize" again on the now-populated actor.** Confirm the overwrite confirmation dialog appears with the expected text, Cancel leaves everything unchanged, and confirming re-rolls everything — in particular, confirm the Trope/Talent item lists still show exactly one item each afterward (not two), proving the old ones were deleted rather than accumulated.

- [x] **Step 5: Roll a skill on the freshly randomized actor** (e.g. click one of the populated skill buttons) to confirm the generated skill values feed correctly into the existing roll pipeline — the chat card's modifier should match the sheet's displayed skill value.

- [x] **Step 6: Repeat step 3 a handful of times on fresh actors until a Rookie is rolled** (2 on 2d6, roughly 1-in-36 odds — reroll a few actors if needed), to specifically confirm the Gifted-stat-pick path: one of Mental/Physical/Social should visibly be 3 higher than Rookie's baseline of 1, and the skill points divested from that stat should sum to the boosted total.

- [ ] **Step 7: Final commit (if any fixes were needed during manual verification)** — not applicable, no fixes were needed during manual verification.

```bash
git add -A
git commit -m "fix: address issues found during random Trope generator manual verification"
```
