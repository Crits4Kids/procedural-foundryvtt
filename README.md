# PROCEDURAL! (Foundry VTT System)

A Foundry VTT v14 system implementing the character sheet and core 2d6 dice
mechanics of *PROCEDURAL!*, a tabletop crime-procedural RPG.

## What's in v1

- Trope (PC) and NPC actor sheets — NPC sheets include a 1d6 ally
  personality roll table
- Trope, Talent, and Equipment item types
- Fully automated skill rolls: 2d6 + modifier, Advantage/Disadvantage,
  Critical Failure/Success, "Hurt" status effects, and Rerun Point rerolls
  via a chat card button — plus a "Hurt Again" action that flags a Trope
  Knocked Out when they're hurt while already Hurt, and a one-click button
  that awards the rulebook's +1 Rerun Point for resolving a B-story
- Compendiums shipped as pre-built system packs with all 11 Tropes,
  18 second Talents, and 42 Desk Items (12 from the rulebook's "What's on
  Your Desk?" table plus 30 new ones), present as soon as the system is
  installed — no world-launch seeding step required
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
6. The three compendiums — "Procedural: Tropes", "Procedural: Second
   Talents", and "Procedural: Desk Items" — are already present as system
   packs. Check the Compendium Packs sidebar tab to confirm.
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
Second Talents, Desk Items) already packed in — no extra setup needed.

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
