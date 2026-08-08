# Compendium Packing & Release CI/CD — Design

## Purpose

Compendiums currently exist only as a runtime workaround: `seed-compendiums.mjs`
fetches `data/*.json` and copies it into a *world*-owned compendium the first
time each world launches (chosen in the v1 spec specifically to avoid a build
step). That's fine for the maintainer's own git-clone-and-symlink install, but
it doesn't work for distributing the system to other people via GitHub, and
it duplicates compendium content into every world instead of shipping it once
with the system.

This feature switches to real system-level packed compendiums (the standard
Foundry distribution pattern) and adds a GitHub Actions pipeline that builds,
tests, and releases the system so it's installable via a manifest URL.

## Scope

**In scope:**
- A build script that compiles `data/tropes.json`, `data/second-talents.json`,
  and `data/desk-items.json` into LevelDB compendium packs using the official
  `@foundryvtt/foundryvtt-cli` package.
- `system.json` changes: a `"packs"` array declaring the three compendiums,
  plus permanent `"manifest"`/`"download"`/`"url"` fields pointing at stable
  GitHub Releases URLs.
- Removal of `module/helpers/seed-compendiums.mjs` and its call site in
  `module/procedural.mjs` — system packs replace world-seeded compendiums.
- Two GitHub Actions workflows: `test.yml` (push/PR) and `release.yml`
  (tag push), described below.
- README updates: a manifest-URL install method for other users, alongside
  the existing symlink method for local dev/testing.

**Out of scope (explicitly deferred, not silently dropped):**
- Automated version bumping — the maintainer still bumps `system.json`/
  `package.json` by hand; CI only *verifies* the tag matches, it doesn't set
  the version.
- A CHANGELOG file or automated release notes generation — GitHub's
  auto-generated release notes (commit list) are enough for now.
- Draft/prerelease workflow support — every tagged release is published
  directly as "latest."
- Unit tests for `build-packs.mjs` — it's a thin, deterministic wrapper
  around the CLI's `compilePack`, verified by hand the same way
  `seed-compendiums.mjs` was (per the v1 spec's existing rationale for
  Foundry-runtime/IO code).
- Editing compendium content directly inside a running Foundry world —
  `data/*.json` remains the single source of truth, edited by hand.

## Architecture

```
data/*.json  --(npm run build:packs)-->  packs/*/  (LevelDB, gitignored)
                                              |
                                    system.json "packs" array
                                              |
                                    zipped into system.zip
                                              |
                              GitHub Release (tag vX.Y.Z, "latest")
                                    assets: system.json, system.zip
                                              |
                        Foundry "Install System" (manifest URL) --> done
```

- **`scripts/build-packs.mjs`**: reads each `data/*.json` array, maps entries
  to the same `{name, type, img, system}` shape `seed-compendiums.mjs`
  already produces, adds a deterministic `_id` per entry (stable hash of
  `name`, so rebuilding is idempotent and diff-friendly), and calls
  `compilePack()` to write a LevelDB pack directory under `packs/<name>/`.
  Exposed as `npm run build:packs`.
- **`packs/`** is gitignored. It's rebuilt from `data/*.json` on demand
  (`npm run build:packs`, needed once for local symlink-install testing) and
  freshly on every release in CI — `data/*.json` is always the source of
  truth, never the compiled output.
- **`system.json`** gains:
  - `"packs"`: three entries (`procedural-tropes`, `procedural-second-talents`,
    `procedural-desk-items`), each `{name, label, path: "packs/<name>", type: "Item", system: "procedural"}`.
  - `"manifest"`: `https://github.com/mkniller/procedural-foundryvtt/releases/latest/download/system.json`
  - `"download"`: `https://github.com/mkniller/procedural-foundryvtt/releases/latest/download/system.zip`
  - `"url"`: `https://github.com/mkniller/procedural-foundryvtt/`
  These are static — GitHub's "latest release" alias resolves them to the
  right asset automatically, so no per-version templating is needed.
- **`module/helpers/seed-compendiums.mjs`** and its import/call in
  `module/procedural.mjs` are deleted. Any pre-existing world compendiums
  named `world.procedural-*` from earlier testing become orphaned leftovers
  (harmless; can be deleted by hand in Foundry's Compendium sidebar).

## CI/CD workflows

**`.github/workflows/test.yml`** — runs on every push and pull request:
`npm ci` → `npm test` (the existing `dice-rules`, `character-generator`, and
`talent-reset` suites). Pure correctness gate, no release side effects.

**`.github/workflows/release.yml`** — runs on pushing a tag matching `v*`:
1. Checkout, setup Node (20.x), `npm ci`.
2. `npm test` — blocks the release on any test failure.
3. **Version gate**: read `system.json`'s `"version"`; compare against the
   pushed tag with its `v` prefix stripped. Fail the job immediately with a
   clear message (e.g. `tag v0.6.0 does not match system.json version 0.5.2`)
   if they differ, before any build work happens.
4. `npm run build:packs` — compiles `data/*.json` into `packs/*/`.
5. Zip the release payload: `module/`, `css/`, `lang/`, `templates/`,
   `packs/`, `data/` (still read at runtime by the random generator and
   Trope builder wizard), `system.json`, and `template.json` if present —
   into `system.zip`.
6. Create a GitHub Release for the tag (via `softprops/action-gh-release`),
   uploading two assets named exactly `system.json` and `system.zip`, so the
   static "latest" URLs in `system.json` always resolve to this release once
   it's published.

## Error handling

- Build script failures (malformed JSON, CLI compile errors) exit non-zero,
  failing the CI step and blocking the release — no partial or corrupt
  release is ever published.
- The version-gate check runs *before* the build/pack/zip steps, so a
  forgotten version bump fails fast with a clear diagnostic instead of
  burning CI time or publishing a mislabeled release.
- `npm test` failing blocks the release the same way it already blocks any
  CI run.

## Testing / verification

- Existing unit test suites (`dice-rules`, `character-generator`,
  `talent-reset`) run unchanged in both workflows — no new automated tests.
- Manual smoke test for this feature (added to the verification checklist,
  performed once before the first real tagged release):
  1. Run `npm run build:packs` locally; confirm `packs/procedural-tropes/`,
     `packs/procedural-second-talents/`, and `packs/procedural-desk-items/`
     are created.
  2. Symlink-install as today; launch a world; confirm the three compendiums
     appear in the Compendium sidebar pre-populated, with no world-launch
     seeding notification (since `seedCompendiums` no longer exists).
  3. Push a test tag (e.g. `v0.6.0`) to a throwaway branch/fork or dry-run
     the workflow; confirm `release.yml` produces a GitHub Release with
     `system.json` and `system.zip` attached, and that `system.zip`
     extracted locally still has working compendiums.
  4. In a *separate* Foundry instance (not the symlinked dev copy), use
     "Install System" with the manifest URL from `system.json`; confirm
     the system installs and the world launches with compendiums present.

## File structure changes

```
.github/workflows/test.yml       (new)
.github/workflows/release.yml    (new)
scripts/build-packs.mjs          (new)
system.json                      (packs array, manifest/download/url fields)
package.json                     (new "build:packs" script,
                                   @foundryvtt/foundryvtt-cli devDependency)
.gitignore                       (add packs/)
module/procedural.mjs            (remove seedCompendiums import/call)
module/helpers/seed-compendiums.mjs   (deleted)
README.md                        (add manifest-URL install instructions)
```
