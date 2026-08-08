# Compendium Packing & Release CI/CD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three data compendiums (Tropes, Second Talents, Desk Items) as real system-level LevelDB packs instead of runtime world-seeded copies, and add a GitHub Actions pipeline that tests every push/PR and builds+releases an installable system zip on every version tag.

**Architecture:** A Node build script (`scripts/build-packs.mjs`) uses the official `@foundryvtt/foundryvtt-cli` package to compile `data/*.json` into gitignored `packs/*/` LevelDB directories declared in `system.json`'s new `packs` array. The old `seed-compendiums.mjs` runtime workaround is deleted. Two GitHub Actions workflows handle CI (`test.yml`, on push/PR) and release (`release.yml`, on `v*` tag push: test → verify tag matches `system.json` version → build packs → zip → publish a GitHub Release with `system.json` and `system.zip` assets, which `system.json`'s static `manifest`/`download` URLs point at via GitHub's "latest release" alias).

**Tech Stack:** Node.js (ESM, `node --test`), `@foundryvtt/foundryvtt-cli` (LevelDB pack compilation), GitHub Actions, `softprops/action-gh-release`.

## Global Constraints

- Foundry compatibility: minimum/verified version `14` (from `system.json`, unchanged).
- `data/*.json` remains the single source of truth for compendium content — never hand-edit `packs/*` output.
- `packs/` (and any build scratch directory) must be gitignored — CI always rebuilds from `data/*.json`.
- GitHub repo is `mkniller/procedural-foundryvtt` (from `git remote -v`) — all release URLs use this path.
- CI Node version: 20.x (`actions/setup-node@v4`, `node-version: "20"`).
- No unit tests for `scripts/build-packs.mjs` itself (IO/CLI wrapper, verified by hand) — this matches the existing project convention that Foundry-runtime/IO code (e.g. the old `seed-compendiums.mjs`) has no automated tests, while pure logic (`dice-rules.mjs`, `character-generator.mjs`, `talent-reset.mjs`) does.
- Version bumps in `system.json`/`package.json` stay manual; CI only verifies the tag matches, never writes the version itself.

---

### Task 1: Pack-building script

**Files:**
- Create: `scripts/build-packs.mjs`
- Modify: `package.json` (add `@foundryvtt/foundryvtt-cli` devDependency, add `"build:packs"` script)
- Modify: `.gitignore` (add `packs/` and `.pack-src/`)

**Interfaces:**
- Consumes: `data/tropes.json`, `data/second-talents.json`, `data/desk-items.json` (existing files, each a JSON array of `{name, img, system}` objects — same shape `seed-compendiums.mjs` already reads).
- Produces: `packs/procedural-tropes/`, `packs/procedural-second-talents/`, `packs/procedural-desk-items/` (LevelDB directories) when run via `npm run build:packs`. Later tasks (system.json's `packs` array, the release workflow) depend on these exact three directory names existing under `packs/`.

This task has no automated test per the Global Constraints — IO/CLI-wrapper code verified by running the script and inspecting output, same as `seed-compendiums.mjs`'s existing convention.

- [ ] **Step 1: Install the Foundry CLI as a devDependency**

Run: `npm install --save-dev @foundryvtt/foundryvtt-cli`

Expected: `package.json` gains a `"devDependencies"` block with `"@foundryvtt/foundryvtt-cli"`, and `package-lock.json` is created/updated.

- [ ] **Step 2: Write the build script**

Create `scripts/build-packs.mjs`:

```js
import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

const PACKS = [
  { dataFile: "data/tropes.json", packName: "procedural-tropes", itemType: "trope" },
  { dataFile: "data/second-talents.json", packName: "procedural-second-talents", itemType: "talent" },
  { dataFile: "data/desk-items.json", packName: "procedural-desk-items", itemType: "equipment" }
];

function stableId(seed) {
  const hash = createHash("sha256").update(seed).digest();
  let id = "";
  for (let i = 0; i < 16; i++) {
    id += ID_ALPHABET[hash[i] % ID_ALPHABET.length];
  }
  return id;
}

async function buildPack({ dataFile, packName, itemType }) {
  const entries = JSON.parse(await readFile(path.join(ROOT, dataFile), "utf8"));
  const srcDir = path.join(ROOT, ".pack-src", packName);
  const destDir = path.join(ROOT, "packs", packName);

  await rm(srcDir, { recursive: true, force: true });
  await mkdir(srcDir, { recursive: true });

  for (const entry of entries) {
    const id = stableId(`${packName}:${entry.name}`);
    const document = {
      _id: id,
      name: entry.name,
      type: itemType,
      img: entry.img,
      system: entry.system,
      effects: [],
      folder: null,
      sort: 0,
      ownership: { default: 0 },
      flags: {}
    };
    await writeFile(path.join(srcDir, `${id}.json`), JSON.stringify(document, null, 2));
  }

  await rm(destDir, { recursive: true, force: true });
  await compilePack(srcDir, destDir, { log: true });
  await rm(srcDir, { recursive: true, force: true });

  console.log(`PROCEDURAL | Built pack "${packName}" (${entries.length} entries)`);
}

for (const pack of PACKS) {
  await buildPack(pack);
}
```

- [ ] **Step 3: Add the npm script**

In `package.json`, update `"scripts"` to:

```json
  "scripts": {
    "test": "node --test module/**/*.test.mjs scripts/**/*.test.mjs",
    "build:packs": "node scripts/build-packs.mjs"
  }
```

(The `scripts/**/*.test.mjs` glob addition is for Task 4's version-check helper test — harmless now since no such file exists yet.)

- [ ] **Step 4: Gitignore the build output**

In `.gitignore`, add:

```
packs/
.pack-src/
```

- [ ] **Step 5: Run the build script and verify output**

Run: `npm run build:packs`

Expected: console logs `PROCEDURAL | Built pack "procedural-tropes" (11 entries)`, `... "procedural-second-talents" (18 entries)`, `... "procedural-desk-items" (42 entries)`. Then run `ls packs/procedural-tropes` and confirm it contains LevelDB files (e.g. `CURRENT`, `MANIFEST-*`, `*.log` or `*.ldb`), and `ls .pack-src` confirms the directory was cleaned up (should not exist, since it's removed after each pack completes — the last `rm` in `buildPack` removes it; running `ls .pack-src` should print "No such file or directory").

- [ ] **Step 6: Commit**

```bash
git add scripts/build-packs.mjs package.json package-lock.json .gitignore
git commit -m "feat: add build script to compile compendium data into LevelDB packs"
```

---

### Task 2: Declare packs and manifest URLs in system.json

**Files:**
- Modify: `system.json`

**Interfaces:**
- Consumes: the three pack names from Task 1 (`procedural-tropes`, `procedural-second-talents`, `procedural-desk-items`) and their `packs/<name>` paths.
- Produces: a `system.json` that Foundry can install via manifest URL and that resolves the three packs at `packs/<name>` relative to the system root. Task 6 (release workflow) relies on the `manifest`/`download` URLs defined here being correct.

No automated test — this is a static manifest file. Verified in Task 7's manual smoke test (installing via the manifest URL) and by re-running `npm test` to confirm nothing else broke.

- [ ] **Step 1: Add the packs array and manifest URLs**

In `system.json`, after the `"version"` field, add:

```json
  "manifest": "https://github.com/mkniller/procedural-foundryvtt/releases/latest/download/system.json",
  "download": "https://github.com/mkniller/procedural-foundryvtt/releases/latest/download/system.zip",
  "url": "https://github.com/mkniller/procedural-foundryvtt/",
```

And after the `"languages"` array (before `"documentTypes"`), add:

```json
  "packs": [
    {
      "name": "procedural-tropes",
      "label": "Procedural: Tropes",
      "path": "packs/procedural-tropes",
      "type": "Item",
      "system": "procedural"
    },
    {
      "name": "procedural-second-talents",
      "label": "Procedural: Second Talents",
      "path": "packs/procedural-second-talents",
      "type": "Item",
      "system": "procedural"
    },
    {
      "name": "procedural-desk-items",
      "label": "Procedural: Desk Items",
      "path": "packs/procedural-desk-items",
      "type": "Item",
      "system": "procedural"
    }
  ],
```

- [ ] **Step 2: Validate the JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('system.json'))" && echo OK`

Expected: `OK` (confirms no syntax errors from the manual edit).

- [ ] **Step 3: Commit**

```bash
git add system.json
git commit -m "feat: declare compendium packs and manifest URLs in system.json"
```

---

### Task 3: Remove world-seeded compendium code

**Files:**
- Delete: `module/helpers/seed-compendiums.mjs`
- Modify: `module/procedural.mjs:11` (remove import), `module/procedural.mjs:54-56` (remove the `ready` hook)

**Interfaces:**
- Consumes: nothing new.
- Produces: `module/procedural.mjs` with no reference to `seedCompendiums` or `Hooks.once("ready", ...)`. No later task depends on this file beyond it compiling/loading cleanly.

- [ ] **Step 1: Delete the old seeding helper**

```bash
rm module/helpers/seed-compendiums.mjs
```

- [ ] **Step 2: Remove its import and hook from module/procedural.mjs**

Remove line 11:
```js
import { seedCompendiums } from "./helpers/seed-compendiums.mjs";
```

Remove lines 54-56:
```js
Hooks.once("ready", () => {
  seedCompendiums().catch(err => console.error("PROCEDURAL | Compendium seeding failed", err));
});
```

- [ ] **Step 3: Confirm no other references remain**

Run: `grep -rn "seedCompendiums\|seed-compendiums" module/ templates/`

Expected: no output (empty).

- [ ] **Step 4: Run the existing test suite**

Run: `npm test`

Expected: all existing suites (`dice-rules`, `character-generator`, `talent-reset`, etc.) still PASS — this file had no test coverage of its own, so removing it shouldn't change test results at all.

- [ ] **Step 5: Commit**

```bash
git add module/procedural.mjs
git rm module/helpers/seed-compendiums.mjs
git commit -m "refactor: remove runtime world-compendium seeding in favor of system packs"
```

---

### Task 4: Version-tag check helper (TDD)

**Files:**
- Create: `scripts/check-version-tag.mjs`
- Test: `scripts/check-version-tag.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `tagMatchesVersion(tag, version)` (pure function, exported) and a CLI entry point that reads `system.json`'s `"version"` and compares it against a tag string passed as `process.argv[2]`, exiting with code `1` and a descriptive `console.error` message on mismatch, or exiting `0` silently on match. Task 6 (release workflow) invokes this script directly: `node scripts/check-version-tag.mjs "$TAG_NAME"`.

- [ ] **Step 1: Write the failing test**

Create `scripts/check-version-tag.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { tagMatchesVersion } from "./check-version-tag.mjs";

test("matches when tag has 'v' prefix and equals version", () => {
  assert.equal(tagMatchesVersion("v0.6.0", "0.6.0"), true);
});

test("matches when tag has no prefix and equals version", () => {
  assert.equal(tagMatchesVersion("0.6.0", "0.6.0"), true);
});

test("does not match when versions differ", () => {
  assert.equal(tagMatchesVersion("v0.6.0", "0.5.2"), false);
});

test("does not match on trailing whitespace", () => {
  assert.equal(tagMatchesVersion("v0.6.0\n", "0.6.0"), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/check-version-tag.test.mjs`

Expected: FAIL — `check-version-tag.mjs` does not exist yet (module not found error).

- [ ] **Step 3: Implement the helper and CLI entry point**

Create `scripts/check-version-tag.mjs`:

```js
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function tagMatchesVersion(tag, version) {
  const normalizedTag = tag.startsWith("v") ? tag.slice(1) : tag;
  return normalizedTag === version;
}

async function main() {
  const tag = process.argv[2];
  if (!tag) {
    console.error("PROCEDURAL | check-version-tag: no tag argument provided");
    process.exit(1);
  }

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const systemManifest = JSON.parse(await readFile(path.join(root, "system.json"), "utf8"));

  if (!tagMatchesVersion(tag, systemManifest.version)) {
    console.error(
      `PROCEDURAL | tag "${tag}" does not match system.json version "${systemManifest.version}"`
    );
    process.exit(1);
  }

  console.log(`PROCEDURAL | tag "${tag}" matches system.json version "${systemManifest.version}"`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test scripts/check-version-tag.test.mjs`

Expected: PASS (4 tests).

- [ ] **Step 5: Run the full suite to confirm the new glob picks it up**

Run: `npm test`

Expected: PASS, including the 4 new `check-version-tag` tests alongside the existing suites (confirms the `scripts/**/*.test.mjs` glob added in Task 1 works).

- [ ] **Step 6: Manually verify the CLI entry point**

Run: `node scripts/check-version-tag.mjs "v$(node -p "require('./system.json').version")"`

Expected: prints `PROCEDURAL | tag "v0.5.2" matches system.json version "0.5.2"` (or whatever the current version is) and exits 0. Then run `node scripts/check-version-tag.mjs "v0.0.1"` and confirm it prints the mismatch error and exits non-zero (check with `echo $?`).

- [ ] **Step 7: Commit**

```bash
git add scripts/check-version-tag.mjs scripts/check-version-tag.test.mjs
git commit -m "feat: add version-tag check helper for release CI"
```

---

### Task 5: Test workflow (push/PR)

**Files:**
- Create: `.github/workflows/test.yml`

**Interfaces:**
- Consumes: `npm test` (existing script, now covering `module/**/*.test.mjs` and `scripts/**/*.test.mjs`).
- Produces: nothing consumed by later tasks — this is a standalone CI gate.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/test.yml`:

```yaml
name: Test

on:
  push:
    branches: ["**"]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npm test
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci: run npm test on every push and pull request"
```

---

### Task 6: Release workflow (tag push)

**Files:**
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: `npm run build:packs` (Task 1), `system.json`'s `packs`/`manifest`/`download` fields (Task 2), `scripts/check-version-tag.mjs` (Task 4).
- Produces: a GitHub Release, on tag push, with `system.json` and `system.zip` assets — this is the end deliverable of the whole plan, verified manually in Task 7.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags: ["v*"]

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - run: npm ci

      - run: npm test

      - name: Verify tag matches system.json version
        run: node scripts/check-version-tag.mjs "${{ github.ref_name }}"

      - name: Build compendium packs
        run: npm run build:packs

      - name: Zip release payload
        run: |
          FILES="module css lang templates packs data system.json"
          if [ -f template.json ]; then FILES="$FILES template.json"; fi
          zip -r system.zip $FILES

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: |
            system.json
            system.zip
          generate_release_notes: true
```

(`template.json` is included only if present — confirmed absent from this repo today, since `system.json`'s `documentTypes` field already covers Actor/Item type declarations, so the plain `FILES` list is what actually runs.)

- [ ] **Step 2: Verify the zip step logic locally**

Run:
```bash
npm run build:packs
FILES="module css lang templates packs data system.json"
if [ -f template.json ]; then FILES="$FILES template.json"; fi
zip -r /tmp/system-test.zip $FILES
unzip -l /tmp/system-test.zip | tail -5
rm /tmp/system-test.zip
```

Expected: the zip is created without error and `unzip -l` lists files without error.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add tag-triggered release workflow that builds and publishes the system"
```

---

### Task 7: README install instructions and end-to-end verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: the manifest URL from Task 2 (`system.json`'s `"manifest"` field).
- Produces: nothing consumed by other tasks — this is the final documentation + verification task for the whole plan.

- [ ] **Step 1: Add a manifest-install section to README.md**

In `README.md`, after the `## Installing locally to test` section's final line (currently ending "...both pick/set a desk item automatically too."), add a new section:

```markdown
## Installing from GitHub

For anyone other than the maintainer: in Foundry VTT's Setup screen, go to
the "Game Systems" tab, click "Install System", and paste this manifest URL:

```
https://github.com/mkniller/procedural-foundryvtt/releases/latest/download/system.json
```

This always installs the latest tagged release, with compendiums (Tropes,
Second Talents, Desk Items) already packed in — no extra setup needed.
```

- [ ] **Step 2: Commit the README change**

```bash
git add README.md
git commit -m "docs: add manifest-URL install instructions for GitHub releases"
```

- [ ] **Step 3: Manual end-to-end smoke test (local, pre-release)**

Run: `npm run build:packs`, then confirm via symlink install (per the existing "Installing locally to test" README steps) that the world's Compendium sidebar shows "Procedural: Tropes", "Procedural: Second Talents", and "Procedural: Desk Items" pre-populated on world launch, with **no** seeding notification (since `seedCompendiums` no longer runs). Drag a Trope from the compendium onto an actor and confirm it works exactly as before.

- [ ] **Step 4: Push and confirm CI**

Run: `git push` (pushes all commits from Tasks 1-7 on the current branch), then open the repo's Actions tab and confirm the `Test` workflow run succeeds.

- [ ] **Step 5: Tag and confirm the release workflow**

After merging to `main` and bumping `system.json`/`package.json` to a new version (per existing project convention), run:
```bash
git tag v<new-version>
git push origin v<new-version>
```
Confirm in the Actions tab that `Release` succeeds, and that the repo's Releases page shows the new tag with `system.json` and `system.zip` attached.

- [ ] **Step 6: Install via manifest URL in a separate Foundry instance**

In a Foundry instance other than the maintainer's symlinked dev copy, use "Install System" with `https://github.com/mkniller/procedural-foundryvtt/releases/latest/download/system.json`. Confirm the system installs, a world launches successfully, and the three compendiums are present and populated.
