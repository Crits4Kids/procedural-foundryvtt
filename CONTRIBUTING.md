# Contributing to PROCEDURAL!

Thanks for taking an interest in the project. This guide covers how to get set
up, what we expect from a change, and how to get it merged.

By participating, you're expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- **Found a bug?** Open a [Bug Report](../../issues/new?template=bug_report.yml).
- **Have an idea?** Open a [Feature Request](../../issues/new?template=feature_request.yml) —
  especially useful if it's tied to a specific rulebook mechanic that isn't
  implemented yet.
- **Found a security issue?** Don't open a public issue — see
  [SECURITY.md](SECURITY.md).
- **Want to write code?** Read on.

## Getting set up

You'll need Node.js (the CI runs on Node 20) and a local Foundry VTT v14
license to actually run the system.

1. Fork and clone the repo.
2. `npm install`
3. `npm run build:packs` — compiles the JSON source data in `data/` into the
   LevelDB compendium packs `system.json` expects at `packs/` (gitignored,
   not present in a fresh clone; rerun this whenever compendium/pack source
   data changes).
4. Symlink the repo into your Foundry user data directory so you can launch
   it as an installed system:
   ```bash
   ln -s /path/to/this/repo "<FoundryUserData>/Data/systems/procedural"
   ```
   See the README's "Installing locally to test" section for the full
   walkthrough.

For manual QA without touching your live Foundry install, the repo also
ships a disposable Docker instance — see the README's "Local Docker test
instance" section.

## Making a change

- **Pure logic goes in `module/helpers/`, written test-first.** Anything that
  doesn't need the Foundry API (dice math, rating calculations, evidence
  tallies, name-dedup logic, etc.) should be a small dependency-free function
  with an accompanying `*.test.mjs` file using Node's built-in `node:test` —
  this is what `npm test` runs. Foundry-runtime code (sheets, `TypeDataModel`
  classes, document classes, `Application`s) has no automated test
  equivalent and is verified by hand instead.
- **Match the existing architecture.** `ApplicationV2` +
  `HandlebarsApplicationMixin` for sheets/apps, `foundry.abstract.TypeDataModel`
  for data models (no `template.json`), vanilla JS ES modules, Handlebars
  templates, plain CSS. Don't introduce a build step, framework, or new
  dependency without discussing it first in an issue.
- **For any feature big enough to need one, write it down first.** The
  `docs/superpowers/specs/` and `docs/superpowers/plans/` directories hold a
  design-spec-then-implementation-plan document for every non-trivial change
  in this project's history — skim a recent pair before starting something
  similarly sized, and add your own so the rationale survives the PR. Small
  fixes don't need this.
- **No unrelated cleanup.** Keep a PR scoped to the thing it says it does.

## Before you open a PR

1. `npm test` — must pass.
2. If you touched compendium/pack source data, `npm run build:packs`.
3. If you touched anything user-facing, walk the relevant parts of the
   smoke-test checklist (`docs/superpowers/plans/2026-08-05-procedural-system-v1.md`,
   Task 15) against a running Foundry instance.
4. Bump the version in **both** `system.json` and `package.json` — this repo
   keeps them in lockstep on every user-facing change. Skip this for
   docs-only or CI-only changes.

## Opening the PR

Branch off `main`, then open your PR against `main` — the
[PR template](.github/PULL_REQUEST_TEMPLATE.md) will prefill automatically
and asks for the same things as above (summary, related design docs if any,
version bump, test plan). CI runs `npm test` on every PR; it has to be green
before merge.

## Release process (maintainers)

Tagging `vX.Y.Z` and pushing the tag triggers the release workflow, which
runs the tests, verifies the tag matches `system.json`'s version, builds the
packs, and publishes a GitHub Release with `system.json`/`system.zip`
attached. See the README's "Before tagging a release" section for the full
checklist.

## Questions

Open an issue, or reach out at `crits4kids@crits4kids.cc`.
