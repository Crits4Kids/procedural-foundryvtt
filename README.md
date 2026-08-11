# PROCEDURAL! (Foundry VTT System)

A Foundry VTT v14 system implementing the character sheet and core 2d6 dice
mechanics of *PROCEDURAL!*, a tabletop crime-procedural RPG.

## What's in v1

- Trope (PC) and NPC actor sheets — NPC sheets roll a name, age, and
  personality trait for the ally from three Foundry `RollTable`
  compendiums (first names, last names, personality traits) plus a
  dice-formula age, and can reroll all three at once from a "Roll
  Personality" button. Both actor types also have a guided, multi-step
  "builder" wizard (Actor Directory buttons) that rolls or lets you
  choose your way through the relevant tables and creates the finished
  actor on Finish — for NPCs, that's the ally's name, age, personality,
  and a Trope-derived Talent
- Trope, Talent, and Equipment item types
- Fully automated skill rolls: 2d6 + modifier, Advantage/Disadvantage,
  Critical Failure/Success, "Hurt" status effects, and Rerun Point rerolls
  via a chat card button — plus a "Hurt Again" action that flags a Trope
  Knocked Out when they're hurt while already Hurt, and a one-click button
  that awards the rulebook's +1 Rerun Point for resolving a B-story
- Compendiums shipped as pre-built system packs with all 11 Tropes,
  18 second Talents, and 42 Desk Items (12 from the rulebook's "What's on
  Your Desk?" table plus 30 new ones), plus three NPC RollTable
  compendiums (25 first names, 25 last names, 25 personality traits),
  present as soon as the system is installed — no world-launch seeding
  step required
- A GM-only Case Tracker app (scene controls) for tracking act/scene,
  interludes, the arrest phase, evidence, interrogations, and a "Roll for
  Drama" team-flavor table over the course of a session — changing the Act
  field automatically clears every Talent's "Used" checkbox (including each
  Trope's own built-in Talent) and heals every Hurt/Knocked Out actor, for
  every actor in the Actors directory
- A GM-only Season Tracker app (scene controls) for Season Mode: records
  each of a season's 6 episode outcomes, computes the running Agency
  Rating, shows the matching rulebook Director-reaction text, rolls a 1d6
  Director table for the season's antagonist-boss NPC, and offers
  one-click (double-grant-guarded) buttons to award the party's Rerun
  Point and Level Up benchmarks. Leveling Up is a dialog on the Trope
  sheet (appears once a Level Up is available) for the +1 stat / divested
  skill / optional second-Talent swap; a season-mode "Have a Flashback"
  button on the desk item offers the same Talent swap, once per desk
  item. Villains are tracked as a simple list with a 3-or-more warning

Rerun Point pooling to generate new leads stays Showrunner-narrated rather
than automated, by design — see
`docs/superpowers/specs/2026-08-05-procedural-system-v1-design.md` for the
full scope rationale behind this and other early v1 boundaries.

## Installing locally to test

1. Locate your Foundry VTT user data directory (check the Setup screen's
   Configuration tab if you're not sure where it is).
2. Symlink or copy this repository into `<UserData>/Data/systems/procedural`:
   ```bash
   ln -s /path/to/this/repo "<UserData>/Data/systems/procedural"
   ```
3. Run `npm run build:packs` from the repo to compile the source data into
   the LevelDB packs `system.json` expects at `packs/` (this directory is
   gitignored and isn't present in a fresh clone).
4. Launch Foundry VTT (v14), and on the Setup screen confirm "PROCEDURAL!"
   appears in the systems list.
5. Create a new World using the PROCEDURAL! system, then launch it.
6. The six compendiums — "Procedural: Tropes", "Procedural: Second
   Talents", "Procedural: Desk Items", "Procedural: NPC First Names",
   "Procedural: NPC Last Names", and "Procedural: NPC Personality
   Traits" — are already present as system packs. Check the Compendium
   Packs sidebar tab to confirm.
7. Create a `trope` Actor, drag a Trope item onto it from the compendium,
   allocate skill points, and start rolling. Drag a Desk Item onto the
   sheet's dedicated "Desk Item" section to give them something personal at
   HQ (dragging a new one replaces the old one) — the separate "Desk Item
   Note" free-text field stays for a short flashback note. Randomize and
   the Trope builder wizard both pick/set a desk item automatically too.

## Installing from GitHub

For anyone other than the maintainer: in Foundry VTT's Setup screen, go to
the "Game Systems" tab, click "Install System", and paste this manifest URL:

```
https://github.com/Crits4Kids/procedural-foundryvtt/releases/latest/download/system.json
```

This always installs the latest tagged release, with compendiums (Tropes,
Second Talents, Desk Items, NPC First Names, NPC Last Names, NPC
Personality Traits) already packed in — no extra setup needed.

## Running the automated tests

The dice engine (`module/helpers/dice-rules.mjs`) is pure, dependency-free
logic and has full unit test coverage runnable outside Foundry:

```bash
npm test
```

Everything else in this system is Foundry-runtime UI code (sheets, document
classes) with no equivalent outside a running Foundry client — that's
verified by hand per the smoke-test checklist in
`docs/superpowers/plans/2026-08-05-procedural-system-v1.md` (Task 15).

## Local Docker test instance

For manual QA against a real Foundry client without touching your live
install or waiting for a tagged release, `docker-compose.yml` runs a second,
disposable Foundry instance with this repo mounted directly as the
`procedural` system.

1. Copy `.env.example` to `.env` and fill in your Foundry account credentials
   (or a timed release URL if you have 2FA — see the comments in
   `docker-compose.yml`) plus an admin key.
2. `npm run build:packs` (needed before first launch too — `packs/` is
   gitignored and doesn't exist in a fresh clone).
3. `docker compose up -d`, then open `http://localhost:30001` (first run only:
   accept the EULA, then create one persistent World using the PROCEDURAL!
   system — reuse it for every future test rather than recreating it).
4. After editing code: rerun `npm run build:packs` if compendium/pack source
   data changed, then relaunch the World in the browser (Foundry doesn't
   hot-reload system code, so a relaunch is needed after `.mjs`/template
   changes too).

`.docker-data/` (the container's Foundry user-data directory, including its
license and world data) is gitignored and safe to delete any time to reset
the test instance from scratch.

**Troubleshooting:** if the container exits immediately with "Foundry VTT
cannot start in this directory which is already locked by another process"
(can happen after `docker compose up` recreates the container right after a
config change), remove the stale lock and restart:
```bash
rm -rf .docker-data/Config/options.json.lock
docker compose up -d
```

## Before tagging a release

1. `npm test`
2. `npm run build:packs`
3. Walk the relevant parts of the smoke-test checklist above against the
   Docker test instance, focused on whatever changed
4. Bump the version in both `system.json` and `package.json`
5. Tag and push
