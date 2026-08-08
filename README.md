# PROCEDURAL! (Foundry VTT System)

A Foundry VTT v14 system implementing the character sheet and core 2d6 dice
mechanics of *PROCEDURAL!*, a tabletop crime-procedural RPG.

## What's in v1

- Trope (PC) and NPC actor sheets
- Trope, Talent, and Equipment item types
- Fully automated skill rolls: 2d6 + modifier, Advantage/Disadvantage,
  Critical Failure/Success, "Hurt" status effects, and Rerun Point rerolls
  via a chat card button
- Compendiums auto-populated on first world launch with all 11 Tropes,
  18 second Talents, and 42 Desk Items (12 from the rulebook's "What's on
  Your Desk?" table plus 30 new ones)
- A GM-only Case Tracker app (scene controls) for tracking act/scene,
  interludes, the arrest phase, evidence, and interrogations over the
  course of a session — changing the Act field automatically clears every
  Talent's "Used" checkbox world-wide

Flavor roll-tables (Quality/Quirk/HQ/etc) are intentionally out of scope for
this v1 — see `docs/superpowers/specs/2026-08-05-procedural-system-v1-design.md`
for the full scope rationale.

## Installing locally to test

1. Locate your Foundry VTT user data directory (check the Setup screen's
   Configuration tab if you're not sure where it is).
2. Symlink or copy this repository into `<UserData>/Data/systems/procedural`:
   ```bash
   ln -s /path/to/this/repo "<UserData>/Data/systems/procedural"
   ```
3. Launch Foundry VTT (v14), and on the Setup screen confirm "PROCEDURAL!"
   appears in the systems list.
4. Create a new World using the PROCEDURAL! system, then launch it.
5. On first launch, three world compendiums — "Procedural: Tropes",
   "Procedural: Second Talents", and "Procedural: Desk Items" — are created
   automatically. Check the Compendium Packs sidebar tab to confirm.
6. Create a `trope` Actor, drag a Trope item onto it from the compendium,
   allocate skill points, and start rolling. Drag a Desk Item onto the
   sheet's dedicated "Desk Item" section to give them something personal at
   HQ (dragging a new one replaces the old one) — the separate "Desk Item
   Note" free-text field stays for a short flashback note. Randomize and
   the Trope builder wizard both pick/set a desk item automatically too.

## Running the automated tests

The dice engine (`module/helpers/dice-rules.mjs`) is pure, dependency-free
logic and has full unit test coverage runnable outside Foundry:

```bash
npm test
```

Everything else in this system is Foundry-runtime UI code (sheets, document
classes, compendium seeding) with no equivalent outside a running Foundry
client — that's verified by hand per the smoke-test checklist in
`docs/superpowers/plans/2026-08-05-procedural-system-v1.md` (Task 15).
