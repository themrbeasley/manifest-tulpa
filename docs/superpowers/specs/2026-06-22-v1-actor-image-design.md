# v1.0.0 — Tulpa Actor Default Image + First Stable Release

**Date:** 2026-06-22
**Status:** Approved design
**Target stack:** FoundryVTT V13.351, dnd5e 5.2.5
**Predecessor:** v0.1.18 (current shipped version)

---

## Overview

Two coupled changes, shipped together as the module's first stable release:

1. **Actor art.** The Tulpa actor currently ships with the dnd5e placeholder `systems/dnd5e/icons/svg/actors/npc.svg` on both its sheet portrait and its prototype-token texture. Replace both with a commissioned portrait bundled into the module (`assets/tulpa.jpg`).
2. **Version bump to 1.0.0.** The module has been through twelve+ smoke cycles and is working well. Promote it from `0.1.x` to its first stable `1.0.0` release, with the accompanying CHANGELOG, smoke-plan, and docs updates.

The image is a commissioned, watermarked asset; the user has granted explicit affirmative permission to bundle it for this personal-use module.

This is the smallest possible "real release" — no mechanics, animation, or flow changes. It exists to give the Tulpa a face and to draw the 1.0 line.

---

## Architecture

### 1. Asset placement

- Copy `D:\Downloads\tulpa.jpg` → `assets/tulpa.jpg`.
- Repo `assets/` is served at runtime as `modules/manifest-tulpa/assets/`, so the canonical reference string is `modules/manifest-tulpa/assets/tulpa.jpg` (matching the existing `manifest_tulpa_icon.webp` convention used by the spell's `img`).
- Ship as JPEG. Foundry supports `.jpg` natively; the file is 46 KB; no image-conversion tooling is available on this machine, and adding a build-time converter is out of scope for a one-file art swap. `.gitignore` does not exclude `assets/` or `*.jpg`, so the binary is git-tracked normally.

### 2. Source edit — `_source/manifest-tulpa-actors/Actor.tulpa.json`

`_source/` is the hand-edited source of truth (CLAUDE.md source-tree discipline). Two string fields change, nothing else:

| Field | From | To |
|---|---|---|
| `img` (line 4) | `systems/dnd5e/icons/svg/actors/npc.svg` | `modules/manifest-tulpa/assets/tulpa.jpg` |
| `prototypeToken.texture.src` (line 614) | `systems/dnd5e/icons/svg/actors/npc.svg` | `modules/manifest-tulpa/assets/tulpa.jpg` |

- `img` is the actor-sheet portrait.
- `prototypeToken.texture.src` is the map token. The block already sets `"fit": "contain"`, so a portrait-orientation image is **letterboxed** into the 1×1 token square rather than stretched — no token-scaling work is required.
- No other actor field is touched: `effects` stays `[]`, `items` unchanged, `_id` (`manifesttulpaA01`) and all `_key` values unchanged. The validator (`scripts/validate-pack.js`) imposes **no** constraint on actor `img`/token `src`, so this edit is validator-safe.

### 3. Regression lock — `tests/spell-source.test.mjs`

Per source-tree discipline, every corrected `_source/` field gets a matching assertion in the same commit. Add one `test(...)` block asserting:

- `actor.img === "modules/manifest-tulpa/assets/tulpa.jpg"`
- `actor.prototypeToken.texture.src === "modules/manifest-tulpa/assets/tulpa.jpg"`
- `existsSync(resolve(ROOT, "assets/tulpa.jpg"))` is `true` — so a future edit that points at the asset path but forgets to commit the binary also fails the build.

(`actor`, `readFileSync`, `existsSync`, `resolve`, `ROOT` are already imported in the file.)

### 4. Version bump → 1.0.0

- `module.json`: `"version": "0.1.18"` → `"1.0.0"`.
- `CLAUDE.md`: the "Current version" line is stale (reads **v0.1.15** while the module is on 0.1.18). Correct it to **v1.0.0** and add a locked-fields row to the source-tree-discipline table for the actor `img` / `prototypeToken.texture.src` lock.

### 5. CHANGELOG

New top entry `## [1.0.0] — 2026-06-22`, Keep-a-Changelog format:
- **Added** — the commissioned Tulpa portrait on the actor sheet and map token.
- A short note framing 1.0.0 as the first stable milestone after twelve+ smoke cycles.

### 6. Smoke plan

Add v1.0.0 regression rows to `docs/superpowers/test-plans/2026-05-24-manifest-tulpa-smoke.md`:
- Actor-sheet portrait renders the bundled art (not `npc.svg`).
- A summoned Tulpa token renders the art, contained in the 1×1 square (not `npc.svg`).

### 7. README / docs polish

Light pass on `README.md` marking v1.0.0 as the first stable release (status/install framing). No restructure.

### 8. Release flow (per the "release before smoke" rule)

The module installs via the GitHub Release manifest URL, so the tag+push must precede smoke-testing.

1. `npm test` (with the new assertions) → green.
2. `npm run validate` → "Validation passed."
3. `npm run build:packs` → packs rebuild cleanly.
4. Commit all changes; tag `v1.0.0`; push branch + tag.
5. `.github/workflows/release.yml` rebuilds packs, rewrites `module.json` URLs/version, validates, zips, and publishes the GitHub Release.
6. User installs v1.0.0 and smoke-tests the art.

---

## Verification gate

The three npm scripts (`test`, `validate`, `build:packs`) must all pass before the `v1.0.0` tag is pushed. The new test assertions are the regression lock; the validator confirms the actor still satisfies pack constraints; `build:packs` confirms the edited source compiles into LevelDB.

---

## Out of scope

- Image format conversion (webp/png) — shipping JPEG as-is.
- Bespoke token-specific art (separate portrait vs. token images) — one image for both.
- Any spell mechanics, cast/dismiss flow, animation, or dependency change.
- Token scale/offset tuning beyond the existing `fit: "contain"` default.

---

## Revision history

| Revision | Date | What changed |
|---|---|---|
| 1 | 2026-06-22 | Initial approved design: actor portrait swap (sheet + token) + v1.0.0 first-stable release. |
