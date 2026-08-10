# NPC Name/Personality Roll Tables — Design

## Purpose

Two related problems drove this:

1. `data/npc-personalities.json` is a flat 6-entry array of full sentences
   (name + age + personality trait baked into one string). That caps NPC
   variety at 6 total NPCs and is why the "Roll Personality" button's
   recent name-sync fix (#22/#23) only had 6 possible names to test
   against.
2. Every generator table in this codebase (`data/tropes.json`,
   `data/qualities.json`, etc.) is a flat JSON file, hand-edited by a
   developer and shipped in the repo. There's no way for a GM to add their
   own entries without editing JSON and rebuilding.

This pass converts NPC name/personality generation to real Foundry
`RollTable` documents, compiled into compendium packs the same way
`data/tropes.json` already compiles into the `procedural-tropes` Item
pack. That gets GMs the ability to open a table in Foundry and add/edit
entries directly, and — since the draw goes through the table's own
`.roll()` — respects whatever weights a GM sets, with no code change.
Scope also grew to add first/last name tables (name = first + last, not a
single fixed string) and a random age, and to reuse the resulting name
generator in the Trope (PC) builder's name step, which currently has no
"Roll" option at all.

## Scope

- Three new compendium packs, `type: "RollTable"`:
  - `procedural-npc-first-names` (~25 entries)
  - `procedural-npc-last-names` (~25 entries)
  - `procedural-npc-personalities` (~25 entries — personality *trait only*,
    rewritten name/pronoun-free so any trait can pair with any name)
- Age is **not** a table — a dice formula (`2d10+20`, range 22-40)
  evaluated at roll time via Foundry's `Roll` API.
- New Foundry-API-dependent helper module,
  `module/helpers/npc-name-generator.mjs`, exposing the draw functions.
- `NpcBuilderApplication`'s personality step splits into two sub-fields:
  **Name & Age** (Roll + free-text, no dropdown) and **Personality trait**
  (Roll + dropdown of canned options + free-text — same
  roll-choose-create pattern as today).
- `actor-npc-sheet.mjs`'s "Roll Personality" button rerolls all three
  (first name, last name, age) plus the trait and syncs `actor.name`
  (building on the #22/#23 fix, now with real variety behind it).
- `TropeBuilderApplication`'s name step (`templates/apps/trope-builder-steps/name.hbs`)
  gets a "Roll" button next to its existing free-text input, drawing a
  first+last name (no age — Tropes have no age field) from the same two
  name tables.
- `scripts/build-packs.mjs` gets a second build mode: compiling a flat
  JSON array into a single `RollTable` document (vs. today's one-Item-per-array-entry
  mode).

## Out of scope

- No active non-repeat tracking across a season — bigger pools make
  repeats rare in practice, but nothing remembers what's already been
  rolled. Can revisit if it turns out to matter in play.
- No gendered/split first-name tables — one unisex list. Personality trait
  text is written pronoun-free, so there's no grammatical coupling to a
  name's implied gender anyway.
- No changes to any other generator table (qualities, quirks, bstories,
  hq, agency names, drama, directors) — they stay flat JSON + pure
  functions, unchanged.
- No season-scoped or per-NPC "already used" state of any kind.

## 1. Data files

`data/npc-first-names.json` and `data/npc-last-names.json` (new) and
`data/npc-personalities.json` (repurposed, content replaced) are all the
same simple shape: a flat array of strings.

```json
["Elias", "Jennifer", "Dave", "Willow", "Ron", "Cindy", "..."]
```

```json
["Cope", "Thompson", "Hunt", "McClachlan", "Briar", "Huntsman", "..."]
```

```json
[
  "Hot-headed and impulsive, with a jump-first, measure-later attitude.",
  "Measured and cautious, nursing an old knee injury that slows them down.",
  "..."
]
```

~25 entries per file, drafted during implementation (placeholder content
in a crime-drama register, easy to edit in Foundry afterward since
they'll be real RollTable entries once compiled). The existing 6
personality sentences get rewritten to drop their embedded names (e.g.
"...Elias has a jump-first..." → "...with a jump-first..." ) since a
trait can now land on any rolled name, not just the one it shipped with.

Keeping the source format as plain string arrays (rather than
hand-authored range/weight tables) means content stays trivial to author
and diff in PRs — `build-packs.mjs` is what turns each array into a real
`RollTable` document at build time.

## 2. `build-packs.mjs`: RollTable build mode

`PACKS` gains a `documentType` field (`"Item"` for the three existing
entries, `"RollTable"` for the three new ones) plus a `tableName` for the
RollTable ones:

```js
const PACKS = [
  { dataFile: "data/tropes.json", packName: "procedural-tropes", documentType: "Item", itemType: "trope" },
  { dataFile: "data/second-talents.json", packName: "procedural-second-talents", documentType: "Item", itemType: "talent" },
  { dataFile: "data/desk-items.json", packName: "procedural-desk-items", documentType: "Item", itemType: "equipment" },
  { dataFile: "data/npc-first-names.json", packName: "procedural-npc-first-names", documentType: "RollTable", tableName: "NPC First Names" },
  { dataFile: "data/npc-last-names.json", packName: "procedural-npc-last-names", documentType: "RollTable", tableName: "NPC Last Names" },
  { dataFile: "data/npc-personalities.json", packName: "procedural-npc-personalities", documentType: "RollTable", tableName: "NPC Personality Traits" }
];
```

`buildPack` branches on `documentType`. The existing "one Item per array
entry" path is untouched. The new path writes exactly **one** document —
a `RollTable` with one `TableResult` per array entry, equal weight,
sequential ranges, formula `1d<N>`:

```js
function buildRollTableResults(entries, packName) {
  return entries.map((text, i) => ({
    _id: stableId(`${packName}:result:${i}`),
    type: 0, // CONFIG.RollTable.resultTypes.TEXT — plain text result, no document link
    text,
    weight: 1,
    range: [i + 1, i + 1],
    drawn: false
  }));
}
```

This result-building step is a pure function of `(entries, packName)` and
gets a unit test in a new `scripts/build-packs.test.mjs` (`build-packs.mjs`
currently has no tests at all — this is the first). The rest of
`buildPack` — writing the LevelDB pack via `compilePack` — stays
integration-only, same as it already is for the Item path.

Exact `RollTable`/`TableResult` field names (`img` vs `icon`, whether
`description` is required, etc.) get verified against the installed
`@foundryvtt/foundryvtt-cli`/Foundry v14 data model during
implementation — the shape above is the intended structure, not a
guaranteed-correct wire format.

`system.json` gets three new pack declarations, `type: "RollTable"`:

```json
{ "name": "procedural-npc-first-names", "label": "Procedural: NPC First Names", "path": "packs/procedural-npc-first-names", "type": "RollTable", "system": "procedural" }
```

(and the same for last names / personalities).

## 3. Runtime helper: `module/helpers/npc-name-generator.mjs`

Deliberately a **separate module** from `character-generator.mjs`, which
stays pure/Foundry-free so its PC-generation logic keeps working under
plain `node --test`. Everything in this new module touches `game.packs`
and can only run inside Foundry.

```js
const PACK_IDS = {
  firstNames: "procedural.procedural-npc-first-names",
  lastNames: "procedural.procedural-npc-last-names",
  personalities: "procedural.procedural-npc-personalities"
};

const NPC_AGE_FORMULA = "2d10+20";

const cachedTables = {};

async function getTable(key) {
  if (cachedTables[key]) return cachedTables[key];
  try {
    const pack = game.packs.get(PACK_IDS[key]);
    if (!pack) throw new Error(`Missing compendium pack "${PACK_IDS[key]}"`);
    const [table] = await pack.getDocuments();
    cachedTables[key] = table;
    return table;
  } catch (err) {
    console.error("PROCEDURAL | Failed to load NPC roll table", err);
    ui.notifications?.error("PROCEDURAL! failed to load an NPC roll table. Check the console for details.");
    throw err;
  }
}

async function drawText(key) {
  const table = await getTable(key);
  const { results } = await table.roll();
  return results[0].text;
}

export const rollFirstName = () => drawText("firstNames");
export const rollLastName = () => drawText("lastNames");
export const rollPersonalityTrait = () => drawText("personalities");

export async function rollFullName() {
  const [first, last] = await Promise.all([rollFirstName(), rollLastName()]);
  return `${first} ${last}`;
}

export async function rollNpcAge() {
  const roll = await new Roll(NPC_AGE_FORMULA).evaluate();
  return roll.total;
}

export async function getPersonalityTraitOptions() {
  const table = await getTable("personalities");
  return table.results.map(r => r.text);
}
```

Each table is fetched once via `getDocuments()` and cached (mirrors
`cachedGeneratorData` in `generator-data.mjs`); a pack failing to load
logs + notifies rather than silently producing a broken NPC, same
convention as `loadGeneratorData`.

Not unit-testable with the existing plain-Node suite (`game.packs` is a
Foundry runtime global) — an accepted tradeoff, consistent with this
repo's existing convention of hand-verifying `Application` wiring that
can't be exercised outside Foundry.

## 4. `NpcBuilderApplication` changes

`#draft.personality` (single string) splits into `#draft.name` and
`#draft.trait`:

```js
#draft = {
  name: "",
  trait: "",
  trope: null
};
```

The personality step's template splits into two sub-fields:
- **Name & Age**: a Roll button (new `rollName` action →
  `this.#draft.name = \`${await rollFullName()}, ${await rollNpcAge()}\`;`)
  plus a free-text input bound to `draft.name`. No dropdown — a first ×
  last cross product is too large to browse.
- **Personality trait**: keeps the existing generic
  `roll-choose-create.hbs` partial (Roll + dropdown + free-text), now
  backed by `rollPersonalityTrait()` / `getPersonalityTraitOptions()`
  instead of the old flat-JSON `rollNpcPersonality`.

Validation: `personality` step valid when both `name` and `trait` are
non-empty after trim (was just `personality.trim()`).

Review step and `#onFinish` combine the two at the point of Actor
creation, same as before just assembled from two draft fields instead of
one:

```js
static async #onFinish() {
  const draft = this.#draft;
  const name = parseNpcName(draft.name);
  const personality = `${draft.name}. ${draft.trait}`;
  const actor = await Actor.create({ name, type: "npc" });
  await actor.update({ "system.personality": personality });
  // ...Trope/Talent item creation unchanged
}
```

`parseNpcName` (`character-generator.mjs`) is unchanged and still pure —
it's just fed `draft.name` (e.g. `"Elias Cope, 30"`) instead of the full
combined sentence.

## 5. `actor-npc-sheet.mjs` — "Roll Personality" button

Builds on the #22/#23 fix (which already syncs `actor.name`), now
rerolling all three draws instead of picking from a 6-entry array:

```js
static async #onRollPersonality() {
  const [fullName, age, trait] = await Promise.all([
    rollFullName(),
    rollNpcAge(),
    rollPersonalityTrait()
  ]);
  const personality = `${fullName}, ${age}. ${trait}`;
  await this.actor.update({ name: fullName, "system.personality": personality });
}
```

Trope/Talent items remain untouched by this button, per the existing
design (confirmed independent axes — see #22 investigation).

## 6. `TropeBuilderApplication` — name step gets a Roll button

`templates/apps/trope-builder-steps/name.hbs` adds a Roll button next to
the existing free-text input:

```html
<button type="button" data-action="rollName">{{localize "PROCEDURAL.TropeBuilder.Roll"}}</button>
<input type="text" name="stepValue" value="{{draft.name}}" placeholder="...">
```

New action:

```js
static async #onRollName() {
  this.#draft.name = await rollFullName();
  this.render();
}
```

No age (Tropes have no age field), no personality trait (Tropes already
have separate Quality/Quirk/B-Story steps for that kind of flavor). This
is purely a convenience for a player who doesn't have a name in mind yet
— the field stays freely editable either way, matching every other
roll-choose-create step's behavior.

## 7. `generator-data.mjs`

`npcPersonalities` is removed from `GENERATOR_DATA_PATHS` — that data no
longer lives in a directly-fetchable flat JSON file; it's compiled into a
compendium and read through `npc-name-generator.mjs` instead.

## Error Handling & Testing

- `npc-name-generator.mjs`'s `getTable` centralizes error handling
  (console.error + `ui.notifications?.error`), same convention as
  `loadGeneratorData` — callers don't need their own try/catch.
- `NpcBuilderApplication.#onFinish` and `TropeBuilderApplication.#onFinish`
  keep their existing try/catch + re-entrancy-guard pattern unchanged.
- `character-generator.test.mjs`: the `rollNpcPersonality` tests are
  removed (the function itself moves out of `character-generator.mjs`
  entirely, replaced by the Foundry-dependent `rollPersonalityTrait`).
  `parseNpcName` tests are unchanged — the function and its behavior
  don't change, only what's fed into it.
- `scripts/build-packs.test.mjs` (new): unit tests for
  `buildRollTableResults` — correct `range`/`weight`/`text` for a small
  fixture array, boundary cases (1 entry, empty array if that's worth
  guarding against).
- No Foundry-runtime test harness exists in this repo (consistent with
  every prior spec) — `npc-name-generator.mjs`'s draw functions and the
  wizard/sheet wiring that calls them are verified by hand.

## Migration

None needed. `NpcActorData.personality` stays a plain `StringField` —
existing NPC actors' stored text is untouched; only what a *new* roll
produces changes. The old `data/npc-personalities.json` content (6
combined sentences) is replaced outright since nothing reads it directly
at runtime anymore.
