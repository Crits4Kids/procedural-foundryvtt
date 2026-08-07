# Desk Items Compendium Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new auto-seeded world compendium, "Procedural: Desk Items," containing 42 draggable Equipment items for the Season Mode "What's on Your Desk?" mechanic, following the same content + seeding pattern already used for Tropes and Second Talents.

**Architecture:** A new flat-array JSON data file (`data/desk-items.json`, same shape as `data/second-talents.json`) plus one new entry in the existing `SEED_PACKS` array in `module/helpers/seed-compendiums.mjs`. No schema, sheet, or document-class changes — entries use the existing `equipment` item type, and the Trope sheet's existing Equipment list section and Foundry's built-in compendium drag/drop already handle the rest.

**Tech Stack:** Vanilla ESM (`.mjs`), Foundry VTT v14 system, Node's built-in test runner (`node --test`) for the one data-shape unit test.

## Global Constraints

- Data file entries must match the shape Foundry's `Item.createDocuments` expects via the existing seeding loop: `{ name, img, system: { description } }` (see `module/helpers/seed-compendiums.mjs:34-39`).
- `img` is `icons/svg/mystery-man.svg` for every entry — the placeholder-icon convention already used in `data/tropes.json` and `data/second-talents.json`.
- No new item type, no schema changes to `EquipmentItemData` (`module/data/item-equipment.mjs`) — it only has a `description` field.
- `system.deskItem` (the free-text field on `TropeActorData`) is untouched — it stays a separate flashback-note field, decoupled from the new compendium.
- Per this repo's standing convention, bump `version` in `system.json` as part of this feature (see `system.json:4`, currently `"0.3.0"`).

---

### Task 1: Author the Desk Items data file with a shape-validation test

**Files:**
- Create: `data/desk-items.json`
- Create: `module/helpers/desk-items-data.test.mjs`

**Interfaces:**
- Produces: `data/desk-items.json` — a JSON array of 42 objects, each `{ name: string, img: "icons/svg/mystery-man.svg", system: { description: string } }`. Task 2 references this file by its runtime-served path `systems/procedural/data/desk-items.json`.

- [ ] **Step 1: Write the failing test**

Create `module/helpers/desk-items-data.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dataPath = fileURLToPath(new URL("../../data/desk-items.json", import.meta.url));

function loadDeskItems() {
  return JSON.parse(readFileSync(dataPath, "utf8"));
}

test("desk-items.json is an array of 42 entries", () => {
  const items = loadDeskItems();
  assert.ok(Array.isArray(items));
  assert.equal(items.length, 42);
});

test("every desk item has a name, the shared placeholder icon, and a description", () => {
  const items = loadDeskItems();
  for (const item of items) {
    assert.equal(typeof item.name, "string");
    assert.ok(item.name.length > 0, `entry missing a name: ${JSON.stringify(item)}`);
    assert.equal(item.img, "icons/svg/mystery-man.svg");
    assert.equal(typeof item.system?.description, "string");
    assert.ok(item.system.description.length > 0, `"${item.name}" has an empty description`);
  }
});

test("desk item names are unique", () => {
  const items = loadDeskItems();
  const names = items.map(i => i.name);
  assert.equal(new Set(names).size, names.length);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `desk-items-data.test.mjs` errors with `ENOENT` (`data/desk-items.json` doesn't exist yet).

- [ ] **Step 3: Write `data/desk-items.json`**

Create `data/desk-items.json` with exactly this content (the rulebook's 12 canonical "What's on Your Desk?" entries, followed by 30 new original entries):

```json
[
  {
    "name": "A Sad Little Cactus",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "Won in an office white elephant exchange, watered on a whim, and now somehow the one thing keeping this desk alive." }
  },
  {
    "name": "An Old Photo of Dad in the War",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "Faded around the edges, tucked into a cheap frame. Nobody at the precinct has ever asked which war." }
  },
  {
    "name": "An Urn with Your Cat's Ashes",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "\"Whiskers is basically still on the team.\" Nobody argues with that logic." }
  },
  {
    "name": "An Old, Patched Stuffed Animal",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "One eye, no ear, held together with duct tape and stubbornness. Older than the badge." }
  },
  {
    "name": "A Word-a-Day Calendar",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "Three years out of date. Still gets flipped every morning like a ritual nobody wants to break." }
  },
  {
    "name": "A Half-Full Jar of Terrible Candy",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "The kind nobody actually likes. Somehow it's never empty." }
  },
  {
    "name": "A Cigarette Case with a Bullet Hole in It",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "Carried every day for a year after the night it stopped a round meant for someone's chest." }
  },
  {
    "name": "A Solved Rubik's Cube",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "Solved once, years ago, and never touched since for fear of ruining the streak." }
  },
  {
    "name": "A Bobblehead of a Local Sports Hero",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "Nods along to every conversation whether it's relevant or not." }
  },
  {
    "name": "A Participation Ribbon from a Hot Dog Eating Contest",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "Framed like a medal of honor. It is, in fact, a participation ribbon." }
  },
  {
    "name": "A Golden Protractor",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "A joke gift for \"always coming at things from the right angle.\" The joke's still funny, four years later." }
  },
  {
    "name": "A Metronome",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "Ticks along during long stakeouts and longer interrogations. Nobody remembers who left it here." }
  },
  {
    "name": "A \"World's Okayest Detective\" Mug",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "A chipped mug, gift from a partner who transferred out years ago. Nobody's had the heart to replace it." }
  },
  {
    "name": "The Unsolved Case File",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "A slim manila folder kept in the bottom drawer, corners worn soft from being pulled out and put back a hundred times." }
  },
  {
    "name": "A Single Burnt-Out Lightbulb",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "Kept from the interrogation room the night of a confession that changed everything. Nobody remembers why it matters. They do." }
  },
  {
    "name": "The Lucky Pen",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "Signed every arrest report for three years running. Runs dry the second anyone else tries to use it." }
  },
  {
    "name": "A Polaroid, Slightly Singed",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "Two rookies grinning outside a burned-out warehouse. Only one of them still works here." }
  },
  {
    "name": "The Dartboard with No Bullseye",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "Someone's face used to be pinned there. Long since taken down, but the pinholes remain." }
  },
  {
    "name": "A Kid's Crayon Drawing of a Police Badge",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "Taped up, curling at the edges. \"To the best detective ever\" in shaky handwriting." }
  },
  {
    "name": "An Evidence Bag, Empty",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "Sealed, labeled, dated. Whatever was inside it was returned to its owner years ago. The bag never got thrown away." }
  },
  {
    "name": "A Rubber Duck Wearing Tiny Handcuffs",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "A gag gift that became a squeeze toy during every tense phone call since." }
  },
  {
    "name": "The Countdown Calendar",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "X's through nearly every day of the year, counting down to a retirement that keeps getting pushed back." }
  },
  {
    "name": "A Cassette Tape, Unlabeled",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "Plays fine. Nobody in the office owns a tape deck anymore, so nobody's heard it in a decade." }
  },
  {
    "name": "A Snow Globe from a City They've Never Been To",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "A gift, or a threat, depending on who's telling the story." }
  },
  {
    "name": "A Chess Piece, Just the Black King",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "Won it off a suspect during an interrogation that went sideways in the most memorable way." }
  },
  {
    "name": "The \"World Famous Chili\" Recipe Card",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "Stained, laminated, guarded jealously. Brought out exactly once a year for the precinct potluck." }
  },
  {
    "name": "A Framed Newspaper Clipping, Yellowed",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "Front page, their name in the byline. They've never let anyone read the whole article out loud." }
  },
  {
    "name": "A Cracked Phone Screen, Kept in a Drawer",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "The last text on it has never been deleted." }
  },
  {
    "name": "A Toy Siren, the Kind That Clips to a Bike",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "A niece's birthday gift, or a nephew's, depending on the day they're asked." }
  },
  {
    "name": "A Stack of Rejected Case Theories",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "Pinned together, each one crossed out except the last, which is circled twice." }
  },
  {
    "name": "A Jar of Bent Paperclips",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "Every one straightened into a tiny useless lockpick, then bent back. A nervous habit nobody's called out." }
  },
  {
    "name": "A Softball Trophy, Precinct League, Third Place",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "The only trophy on the desk. It is proudly, defiantly, the wrong kind of pride." }
  },
  {
    "name": "A Postcard That Was Never Mailed",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "Address filled in, stamp affixed, message half-finished on the back." }
  },
  {
    "name": "A Well-Worn Deck of Cards, Missing the Two of Clubs",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "Used for stakeouts. The missing card is a long story nobody tells the same way twice." }
  },
  {
    "name": "A Tiny Cactus in a \"World's Best Partner\" Pot",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "The pot outlived the partnership. The cactus, somehow, is thriving." }
  },
  {
    "name": "A Sun-Bleached Business Card from a Rival Agency",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "Kept, not thrown away, for reasons that change depending on who's asking." }
  },
  {
    "name": "A Handwritten List Titled \"Things I Got Wrong\"",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "Folded into quarters, tucked under the desk blotter where no one's supposed to see it." }
  },
  {
    "name": "A Chipped Shot Glass from an Undercover Job",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "Never used since. Just sits there as a reminder of a night that almost went very badly." }
  },
  {
    "name": "A Bobblehead Judge with a Missing Gavel Hand",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "A courtroom souvenir from the one case that actually stuck." }
  },
  {
    "name": "A Faded Friendship Bracelet",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "Too small to wear anymore. Nobody at the precinct has ever asked who made it." }
  },
  {
    "name": "A Half-Finished Crossword, Pen Not Pencil",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "Same newspaper for six weeks running. The 14-across clue has been circled in red." }
  },
  {
    "name": "A Small Brass Key That Doesn't Fit Anything in the Building",
    "img": "icons/svg/mystery-man.svg",
    "system": { "description": "Tried it on every lock in HQ. Twice." }
  }
]
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — all three `desk-items-data.test.mjs` assertions succeed, and the existing `dice-rules.test.mjs` / `character-generator.test.mjs` suites still pass unchanged.

- [ ] **Step 5: Commit**

```bash
git add data/desk-items.json module/helpers/desk-items-data.test.mjs
git commit -m "feat: add Desk Items data file with 42 TV-procedural-flavored entries"
```

---

### Task 2: Seed the "Procedural: Desk Items" compendium

**Files:**
- Modify: `module/helpers/seed-compendiums.mjs:1-14` (the `SEED_PACKS` array)

**Interfaces:**
- Consumes: `data/desk-items.json` (produced by Task 1), served at runtime as `systems/procedural/data/desk-items.json`.
- Produces: nothing new consumed by later tasks — this is the last functional change.

- [ ] **Step 1: Add the new pack entry**

In `module/helpers/seed-compendiums.mjs`, change:

```js
const SEED_PACKS = [
  {
    label: "Procedural: Tropes",
    name: "procedural-tropes",
    type: "trope",
    path: "systems/procedural/data/tropes.json"
  },
  {
    label: "Procedural: Second Talents",
    name: "procedural-second-talents",
    type: "talent",
    path: "systems/procedural/data/second-talents.json"
  }
];
```

to:

```js
const SEED_PACKS = [
  {
    label: "Procedural: Tropes",
    name: "procedural-tropes",
    type: "trope",
    path: "systems/procedural/data/tropes.json"
  },
  {
    label: "Procedural: Second Talents",
    name: "procedural-second-talents",
    type: "talent",
    path: "systems/procedural/data/second-talents.json"
  },
  {
    label: "Procedural: Desk Items",
    name: "procedural-desk-items",
    type: "equipment",
    path: "systems/procedural/data/desk-items.json"
  }
];
```

No other lines in the file change — `seedCompendiums()` already loops over every entry in `SEED_PACKS` generically.

- [ ] **Step 2: Sanity-check the module still loads without a syntax error**

This file calls Foundry globals (`game`, `CompendiumCollection`, `Item`) only inside the exported function body, so it can be imported standalone in plain Node to catch typos before ever touching Foundry:

Run: `node -e "import('./module/helpers/seed-compendiums.mjs').then(m => console.log(typeof m.seedCompendiums))"`
Expected: prints `function`, no thrown errors.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS — unaffected by this change (no test imports `seed-compendiums.mjs`, matching this repo's existing convention that Foundry-runtime wiring is verified by hand, not unit tests).

- [ ] **Step 4: Commit**

```bash
git add module/helpers/seed-compendiums.mjs
git commit -m "feat: seed the Procedural: Desk Items compendium on world launch"
```

---

### Task 3: Update README and bump the system version

**Files:**
- Modify: `README.md:8-17` (feature bullets) and `README.md:33-38` (install-and-test walkthrough)
- Modify: `system.json:4` (`version` field)

**Interfaces:**
- Consumes: nothing (documentation + metadata only).
- Produces: nothing consumed by other tasks — this is the final task in the plan.

- [ ] **Step 1: Update the feature bullet list**

In `README.md`, change:

```markdown
- Compendiums auto-populated on first world launch with all 11 Tropes and
  18 second Talents from the rulebook
```

to:

```markdown
- Compendiums auto-populated on first world launch with all 11 Tropes,
  18 second Talents, and 42 Desk Items (12 from the rulebook's "What's on
  Your Desk?" table plus 30 new ones) from the rulebook and beyond
```

- [ ] **Step 2: Update the install walkthrough**

In `README.md`, change:

```markdown
5. On first launch, two world compendiums — "Procedural: Tropes" and
   "Procedural: Second Talents" — are created automatically. Check the
   Compendium Packs sidebar tab to confirm.
6. Create a `trope` Actor, drag a Trope item onto it from the compendium,
   allocate skill points, and start rolling.
```

to:

```markdown
5. On first launch, three world compendiums — "Procedural: Tropes",
   "Procedural: Second Talents", and "Procedural: Desk Items" — are created
   automatically. Check the Compendium Packs sidebar tab to confirm.
6. Create a `trope` Actor, drag a Trope item onto it from the compendium,
   allocate skill points, and start rolling. Drag a Desk Item onto the same
   actor to give them something personal at HQ.
```

- [ ] **Step 3: Bump the system version**

In `system.json`, change:

```json
  "version": "0.3.0",
```

to:

```json
  "version": "0.4.0",
```

(Minor bump for a new feature, per this repo's standing convention of bumping `system.json` version on every feature merge.)

- [ ] **Step 4: Run the full test suite one more time**

Run: `npm test`
Expected: PASS — README and `system.json` changes don't touch tested code paths.

- [ ] **Step 5: Commit**

```bash
git add README.md system.json
git commit -m "docs: document the Desk Items compendium and bump version to 0.4.0"
```

---

## Manual Smoke Test (after all tasks)

This system has no Foundry-runtime test harness (see README) — verify by hand:

1. Symlink/copy the repo into `<FoundryUserData>/Data/systems/procedural` per the README's install steps.
2. Launch Foundry v14, create or open a PROCEDURAL! world.
3. Open the Compendium Packs sidebar tab; confirm "Procedural: Desk Items" is listed with 42 entries, alongside the still-present "Procedural: Tropes" (11) and "Procedural: Second Talents" (18).
4. Open the Desk Items compendium, drag 2-3 different entries onto an existing `trope` Actor sheet.
5. Confirm each dropped item appears under the sheet's Equipment section, and that its ✎ (edit) and ✕ (delete) buttons work as expected.
6. Confirm the actor's existing free-text "Desk Item" field is untouched and still independently editable.
