# Local Docker test instance — design

## Problem

The only way to see a change running in a real Foundry client was to tag a
release, then update the maintainer's live Foundry install to pull it via the
manifest URL. That live install is also the one used for actual play, so an
untested change could land somewhere player-visible before it had been
clicked through by hand.

## Decision

Run a second, disposable Foundry instance in Docker (`docker-compose.yml`),
isolated from the live desktop-app install, with this repo mounted directly
as the `procedural` system. Testing a change no longer requires a tag —
just a container restart and a walk through the smoke-test checklist.

Rejected alternatives (scope explicitly excluded per maintainer preference):
Quench (in-Foundry automated assertions) and a full headless Playwright E2E
pipeline. Both add real setup/maintenance cost; the manual-QA loop below was
judged sufficient for a one-maintainer project at this stage. Revisit if
regressions start slipping through manual testing.

## Architecture

- **Image**: `ghcr.io/felddy/foundryvtt`, pinned to major version 14 via
  `FOUNDRY_VERSION` (defaults to `14`, matching `system.json`'s
  `compatibility.verified`). The image downloads and licenses Foundry itself
  from the maintainer's account credentials (or a timed release URL if 2FA is
  enabled).
- **Data directory**: `./.docker-data` — a plain host-directory bind mount
  for `/data`, *not* a Docker-managed named volume. This matters: Foundry
  initializes `Data/systems/` on first boot by writing a `README.txt` into
  it. When `/data` was a named volume, Docker auto-created that missing path
  as root before mounting, and the container's non-root process couldn't
  write into it (`EACCES`). A host bind mount doesn't have that problem.
  Gitignored; holds the license, world data, and downloaded Foundry build.
- **System mount**: a second, explicit bind mount —
  `.:/data/Data/systems/procedural:ro` — puts the repo directly at the path
  Foundry expects for an installed system. (A host-side symlink was tried
  first, matching the desktop app's existing "Installing locally to test"
  approach, but doesn't work here: Docker Desktop bind mounts only expose the
  one tree that's explicitly mounted, so a symlink pointing at an arbitrary
  host path like `/Users/.../procedural-foundryvtt` is invisible/dangling
  inside the container.) Read-only since nothing needs to write into the
  system's own directory at runtime — except `packs/`, below.
- **Packs mount**: a *third*, read-write bind mount — `./packs:/data/Data/systems/procedural/packs`
  — layered on top of the read-only system mount. LevelDB (the compendium
  pack format) writes a `LOCK` file and temp files even when a pack is only
  being opened for reading, so the blanket `:ro` mount above broke every
  compendium: Foundry logged `IO error: .../000001.dbtmp: Read-only file
  system` and `Database failed to open` for each pack, and the world loaded
  with no Tropes/Talents/Desk Items/RollTables available. `packs/` needs to
  stay writable even though nothing should durably persist there.
- **Hostname**: pinned to a fixed value (`procedural-foundry-test`).
  Foundry's license verification is tied to the container hostname; without
  a stable one, Docker assigns a random ID each restart and licensing breaks
  on every restart.
- **Port**: host `30001` → container `30000`, chosen to avoid colliding with
  the live desktop app's default `30000`.
- **Credentials**: `.env` (gitignored), templated by `.env.example`.
- **Stale lock gotcha**: if the container is stopped uncleanly (e.g.
  `docker compose up` recreating it right after a config change, without a
  graceful shutdown), Foundry can leave behind a lock *directory* at
  `.docker-data/Config/options.json.lock` that isn't cleaned up — Docker
  Desktop's bind-mount locking doesn't reliably release across an abrupt
  stop. The next boot then fails immediately with "Foundry VTT cannot start
  in this directory which is already locked by another process." Fix: `rm
  -rf .docker-data/Config/options.json.lock` and restart. Not automated
  (rare enough in practice); documented here so it's recognizable if it
  recurs.

## Workflow

Documented in the README under "Local Docker test instance" and "Before
tagging a release": edit code → `npm test` → `npm run build:packs` if pack
data changed → relaunch the persistent test World in the container → walk
the smoke-test checklist → only then bump `system.json`/`package.json`
version and tag.

## Out of scope

- Automating World/actor setup (Playwright or similar) — manual click-through
  only, for now.
- Migrating the live/production Foundry install to Docker — this only covers
  a new, separate test instance.
