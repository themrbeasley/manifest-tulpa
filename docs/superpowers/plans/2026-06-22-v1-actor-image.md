# v1.0.0 — Tulpa Actor Image + First Stable Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Tulpa actor's `npc.svg` placeholder (sheet portrait + map token) with a bundled commissioned portrait, regression-lock it, and cut the module's first stable release `v1.0.0`.

**Architecture:** Edit the hand-maintained `_source/` actor JSON (the source of truth — no generator), lock the two image fields plus the on-disk asset with three new assertions in `tests/spell-source.test.mjs`, bump the version, update the release docs (CHANGELOG, CLAUDE.md, smoke plan, README), verify with the three npm scripts, then tag and push to trigger the GitHub Release workflow.

**Tech Stack:** FoundryVTT module (ES2022, no bundler); Node `node:test` unit tests; `foundryvtt-cli` pack build; GitHub Actions tag-driven release.

## Global Constraints

Every task's requirements implicitly include this section. Values copied verbatim from the spec / CLAUDE.md:

- **Target stack:** FoundryVTT V13.351, dnd5e 5.2.5. Do not change any dependency, mechanic, cast/dismiss flow, or animation.
- **Image permission:** the user has granted **explicit affirmative permission** to bundle the commissioned (watermarked) image `D:\Downloads\tulpa.jpg` as the Tulpa actor's default art for this personal-use module. This authorization is the basis for shipping it.
- **Canonical asset reference string** (exact, used in three files): `modules/manifest-tulpa/assets/tulpa.jpg`. Repo `assets/` is served at runtime as `modules/manifest-tulpa/assets/`.
- **Source-tree discipline (STANDING ORDER):** `_source/*.json` is hand-edited canonical JSON. Edit it directly — that IS the fix. In the **same commit**, add a matching regression assertion in `tests/spell-source.test.mjs`. **Never** create or restore a generator/scrub script that reads outside `_source/` and writes back (kills hand edits / re-introduces the v0.1.13 silent regression). `scripts/scrub-source.mjs` must stay absent.
- **Validator-safe:** `scripts/validate-pack.js` imposes **no** constraint on actor `img` or `prototypeToken.texture.src`. The image swap is validator-safe; do not weaken any validator/test assertion.
- **Verification gate:** `npm test && npm run validate && npm run build:packs` must all pass before the `v1.0.0` tag is pushed.
- **Release model (release-before-smoke):** the module installs via the GitHub Release manifest URL, so the tag + push must happen **before** the user can smoke-test. Tag-driven: pushing `v1.0.0` triggers `.github/workflows/release.yml`.
- **Git:** work on `main` (every prior release commit in this repo is main-line; the release tag must point at a main commit). `packs/` is gitignored — `build:packs` output is never committed. End commit messages with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `assets/tulpa.jpg` | Create (copy binary) | The bundled commissioned portrait (46 KB JPEG). |
| `_source/manifest-tulpa-actors/Actor.tulpa.json` | Modify (2 string fields) | Point `img` + `prototypeToken.texture.src` at the bundled asset. |
| `tests/spell-source.test.mjs` | Modify (append 3 tests) | Lock actor `img`, token `src`, and on-disk asset presence. |
| `module.json` | Modify (1 field) | Version `0.1.18` → `1.0.0`. |
| `CLAUDE.md` | Modify (2 spots) | "Current version" → v1.0.0; new locked-fields row. |
| `CHANGELOG.md` | Modify (prepend entry) | `## [1.0.0]` release notes. |
| `docs/superpowers/test-plans/2026-05-24-manifest-tulpa-smoke.md` | Modify (header + new section) | R61/R62 regression rows; fix stale range label. |
| `README.md` | Modify (add status line) | Mark v1.0.0 first stable release. |

---

### Task 1: Bundle the portrait and swap the actor art (regression-locked)

**Files:**
- Create: `assets/tulpa.jpg` (copy of `D:\Downloads\tulpa.jpg`)
- Modify: `_source/manifest-tulpa-actors/Actor.tulpa.json` (line 4 `img`; line 614 `prototypeToken.texture.src`)
- Test: `tests/spell-source.test.mjs` (append new block at end of file)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the file `assets/tulpa.jpg` on disk and the canonical reference string `modules/manifest-tulpa/assets/tulpa.jpg` set on `actor.img` and `actor.prototypeToken.texture.src`. Later tasks (CHANGELOG, smoke, CLAUDE.md) reference these by the same exact string.

- [ ] **Step 1: Copy the image into the bundled assets directory**

Run (from repo root):
```bash
cp "D:/Downloads/tulpa.jpg" "assets/tulpa.jpg"
ls -l assets/tulpa.jpg
```
Expected: `assets/tulpa.jpg` exists, ~46 KB. (If `cp` is unavailable, use PowerShell `Copy-Item "D:\Downloads\tulpa.jpg" "assets\tulpa.jpg"`.)

- [ ] **Step 2: Write the failing tests**

Append this block to the **end** of `tests/spell-source.test.mjs` (the file already imports `existsSync`, `resolve`, and defines `ROOT` and `actor`):

```javascript
// --- v1.0.0 actor-art lock ---
// The Tulpa actor sheet portrait (img) and prototype-token texture both shipped
// the dnd5e npc.svg placeholder through v0.1.18. v1.0.0 swaps them for the
// bundled commission. Lock both fields AND the on-disk asset so that a future
// edit which points at the asset but forgets to commit the binary — or reverts
// either field to npc.svg — fails `npm test` before tag.

test("actor img points at the bundled portrait (v1.0.0)", () => {
  assert.equal(actor.img, "modules/manifest-tulpa/assets/tulpa.jpg");
});

test("actor prototype-token texture points at the bundled portrait (v1.0.0)", () => {
  assert.equal(actor.prototypeToken?.texture?.src, "modules/manifest-tulpa/assets/tulpa.jpg");
});

test("the bundled Tulpa portrait asset exists on disk (v1.0.0)", () => {
  assert.ok(
    existsSync(resolve(ROOT, "assets/tulpa.jpg")),
    "assets/tulpa.jpg must be committed alongside the actor img/token reference"
  );
});
```

- [ ] **Step 3: Run the new tests to verify they fail**

Run:
```bash
npm test
```
Expected: FAIL. The two `assert.equal` tests fail because `actor.img` and `actor.prototypeToken.texture.src` still equal `systems/dnd5e/icons/svg/actors/npc.svg`. The `existsSync` test should PASS (the asset was copied in Step 1) — that is fine; it is the on-disk guard, not the field guard.

- [ ] **Step 4: Swap the actor `img` field**

In `_source/manifest-tulpa-actors/Actor.tulpa.json`, replace (line 4):
```json
  "img": "systems/dnd5e/icons/svg/actors/npc.svg",
```
with:
```json
  "img": "modules/manifest-tulpa/assets/tulpa.jpg",
```

- [ ] **Step 5: Swap the prototype-token texture `src`**

In the same file, inside the `prototypeToken.texture` block (line 614), replace:
```json
      "src": "systems/dnd5e/icons/svg/actors/npc.svg",
```
with:
```json
      "src": "modules/manifest-tulpa/assets/tulpa.jpg",
```
(The two strings are distinguishable: the actor-level one is keyed `"img":`, the token one is keyed `"src":` and indented six spaces. Leave every other field in the `texture` block — `fit: "contain"`, anchors, scale, tint — untouched.)

- [ ] **Step 6: Confirm no other `npc.svg` reference remains in the actor**

Run:
```bash
grep -n "npc.svg" _source/manifest-tulpa-actors/Actor.tulpa.json || echo "clean: no npc.svg references"
```
Expected: `clean: no npc.svg references`. (If any remain, they are additional art fields the spec did not anticipate — stop and report rather than guessing.)

- [ ] **Step 7: Run tests to verify they pass**

Run:
```bash
npm test
```
Expected: PASS — all three new v1.0.0 tests green, and the full suite green (previous total was 124 → now 127).

- [ ] **Step 8: Run the validator and pack build**

Run:
```bash
npm run validate
npm run build:packs
```
Expected: `Validation passed.` and the packs build cleanly (`All packs built.` or equivalent). This confirms the actor still satisfies pack constraints and the edited source compiles into LevelDB. `packs/` output is gitignored — do not stage it.

- [ ] **Step 9: Commit**

```bash
git add assets/tulpa.jpg _source/manifest-tulpa-actors/Actor.tulpa.json tests/spell-source.test.mjs
git commit -m "$(cat <<'EOF'
feat(actor): bundle commissioned Tulpa portrait on sheet + token

Swap the npc.svg placeholder on actor.img and
prototypeToken.texture.src for modules/manifest-tulpa/assets/tulpa.jpg.
Lock both fields plus the on-disk asset in tests/spell-source.test.mjs
(v1.0.0 actor-art lock). prototypeToken already uses fit:"contain", so
the portrait is letterboxed into the 1x1 token square, not stretched.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Version bump and release documentation

**Files:**
- Modify: `module.json:5` (version)
- Modify: `CLAUDE.md` ("Current version" line + locked-fields table row)
- Modify: `CHANGELOG.md` (prepend `## [1.0.0]` entry)
- Modify: `docs/superpowers/test-plans/2026-05-24-manifest-tulpa-smoke.md` (H2 range label + new `### v1.0.0` section)
- Modify: `README.md` (add status line)

**Interfaces:**
- Consumes: the canonical asset string and the three new test names from Task 1 (the CHANGELOG and smoke rows reference them).
- Produces: a repo whose declared version is `1.0.0` and whose docs describe the release. No code interface for later tasks.

- [ ] **Step 1: Bump the module version**

In `module.json`, replace:
```json
  "version": "0.1.18",
```
with:
```json
  "version": "1.0.0",
```
(Leave every other field, including the `releases/latest/download/...` URLs, unchanged — the release workflow rewrites URLs/version at publish time, but the committed source should read `1.0.0` for repo hygiene.)

- [ ] **Step 2: Correct the CLAUDE.md "Current version" line**

In `CLAUDE.md`, replace:
```
Current version: **v0.1.15**
```
with:
```
Current version: **v1.0.0**
```
(The line currently reads `Current version: **v0.1.15** (see [CHANGELOG.md](CHANGELOG.md) and [module.json](module.json)).` — only the bold version token changes; the rest of the sentence stays.)

- [ ] **Step 3: Add a locked-fields row to CLAUDE.md**

In `CLAUDE.md`, in the "**Fields locked by tests or the validator**" table, insert a new row immediately **after** this existing Actor row:
```
| Actor | `_key` (recursive) | computed `!actors[.items[.effects]]!…` | validator |
```
The new row:
```
| Actor | `img` + `prototypeToken.texture.src` | `modules/manifest-tulpa/assets/tulpa.jpg` | tests/spell-source.test.mjs (v1.0.0 actor-art lock) |
```
(It belongs in the Actor block, before the first `| Spell | ...` row.)

- [ ] **Step 4: Prepend the CHANGELOG entry**

In `CHANGELOG.md`, insert this entry directly above the current top entry `## [0.1.18] — 2026-06-18`:

```markdown
## [1.0.0] — 2026-06-22

> First **stable** release. After twelve-plus smoke cycles the automation is solid — cast dialog, modification picker, summon wiring, in-combat behaviors, and lifecycle management all working — so the module graduates from `0.1.x` to `1.0.0`. The only functional change in this release is cosmetic: the Tulpa actor finally has a face. Its sheet portrait and map token shipped the generic dnd5e `npc.svg` placeholder through v0.1.18; v1.0.0 replaces both with a commissioned portrait bundled into the module. No mechanics, cast/dismiss flow, animation, or dependency changes.

### Added

- **Commissioned Tulpa portrait on the actor sheet and map token.** A new bundled asset [`assets/tulpa.jpg`](assets/tulpa.jpg) (served at runtime as `modules/manifest-tulpa/assets/tulpa.jpg`) replaces the `systems/dnd5e/icons/svg/actors/npc.svg` placeholder on both the actor `img` (sheet portrait) and `prototypeToken.texture.src` (map token) in [`_source/manifest-tulpa-actors/Actor.tulpa.json`](_source/manifest-tulpa-actors/Actor.tulpa.json). The prototype token already used `fit: "contain"`, so the portrait is letterboxed into the 1×1 token square rather than stretched. The actor `img`, the token `src`, and the on-disk presence of the asset are locked by three new assertions in [tests/spell-source.test.mjs](tests/spell-source.test.mjs) (v1.0.0 actor-art lock).

### Internal

- **Version bumped `0.1.18` → `1.0.0`** in [module.json](module.json). The `CLAUDE.md` "Current version" line — which had drifted to v0.1.15 — is corrected to v1.0.0, and a new locked-fields row records the actor-art lock.
- **Smoke matrix extended** with R61/R62 (actor portrait on sheet + token) in [docs/superpowers/test-plans/2026-05-24-manifest-tulpa-smoke.md](docs/superpowers/test-plans/2026-05-24-manifest-tulpa-smoke.md).
- **Test count 124 → 127.** `npm test` green; `npm run validate` → "Validation passed." (the validator imposes no constraint on actor `img`/token `src`, so the swap is validator-safe); `npm run build:packs` rebuilds cleanly. No generator was created or restored — the actor JSON was hand-edited and locked in the same commit, per source-tree discipline.
```
(Confirm the "124 → 127" figures against the actual `npm test` pass count from Task 1 Step 7; the delta is exactly +3. Correct both numbers if the pre-change baseline differs.)

- [ ] **Step 5: Fix the stale smoke-plan range label and add the v1.0.0 section**

In `docs/superpowers/test-plans/2026-05-24-manifest-tulpa-smoke.md`:

(a) Replace the H2 header:
```
## Regression checks (v0.1.4 → v0.1.13)
```
with:
```
## Regression checks (v0.1.4 → v1.0.0)
```

(b) Insert this new section immediately **after** the last R60 row of the `### v0.1.18 fixes` table and **before** the `## Cast flow happy path (verifies Tasks 10, 11)` header:

```markdown
### v1.0.0 additions — first stable release

| # | Check | Why |
|---|---|---|
| R61 | Open the **Tulpa actor sheet** (drag from the Actors compendium, or inspect a summoned Tulpa). The portrait shows the commissioned Tulpa artwork, **not** the generic dnd5e `npc.svg` silhouette. Verify in the console: `game.actors.getName("Tulpa")?.img` (or a summoned token's `actor.img`) equals `"modules/manifest-tulpa/assets/tulpa.jpg"`. | v1.0.0: the actor `img` placeholder `systems/dnd5e/icons/svg/actors/npc.svg` was swapped for the bundled commission `assets/tulpa.jpg`. Locked by the actor-art assertions in [tests/spell-source.test.mjs](../../../tests/spell-source.test.mjs). |
| R62 | Cast Manifest Tulpa and place the token. The **map token** renders the commissioned artwork (letterboxed into the 1×1 square via `fit: "contain"`), **not** the `npc.svg` silhouette. Verify in the console: `canvas.tokens.placeables.find(p => p.actor?.name === "Tulpa")?.document.texture.src` equals `"modules/manifest-tulpa/assets/tulpa.jpg"`. | v1.0.0: `prototypeToken.texture.src` swapped from `npc.svg` to the bundled commission; `fit: "contain"` was already set so the portrait is contained, not stretched. Locked by the actor-art assertions in [tests/spell-source.test.mjs](../../../tests/spell-source.test.mjs). |
```

- [ ] **Step 6: Add a status line to the README**

In `README.md`, replace:
```markdown
# Manifest Tulpa

FoundryVTT V13 / dnd5e 5.2.5 module that automates the custom 5th-level Conjuration spell **Manifest Tulpa**.
```
with:
```markdown
# Manifest Tulpa

FoundryVTT V13 / dnd5e 5.2.5 module that automates the custom 5th-level Conjuration spell **Manifest Tulpa**.

> **Status:** v1.0.0 — first stable release. The automation has been through twelve-plus smoke cycles; the cast dialog, modification picker, summon wiring, in-combat behaviors, and lifecycle management are all working. The Tulpa now ships with commissioned actor artwork.
```

- [ ] **Step 7: Run the full verification gate**

Run:
```bash
npm test
npm run validate
npm run build:packs
```
Expected: 127 tests pass; `Validation passed.`; packs build cleanly. (Docs-only changes plus the version bump should not affect tests, but run the gate so the release commit is known-green.)

- [ ] **Step 8: Commit**

```bash
git add module.json CLAUDE.md CHANGELOG.md README.md docs/superpowers/test-plans/2026-05-24-manifest-tulpa-smoke.md
git commit -m "$(cat <<'EOF'
chore(release): bump to v1.0.0 — first stable release

Version 0.1.18 -> 1.0.0. CHANGELOG [1.0.0] entry, smoke-plan R61/R62
rows (+ corrected range label), CLAUDE.md current-version line and
locked-fields row, README status line. Docs + version only.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Cut the v1.0.0 release (orchestrator-performed — do NOT delegate the push)

This task publishes a public GitHub Release and is irreversible. The user has durably authorized the full release (tag + push). Perform it directly (not via a subagent), and report the outcome.

**Files:** none (git tag + push only).

**Interfaces:**
- Consumes: the two release commits from Tasks 1 and 2 on `main`.
- Produces: tag `v1.0.0` and the published GitHub Release.

- [ ] **Step 1: Final pre-tag verification**

Run:
```bash
npm test && npm run validate && npm run build:packs
git status --short
git log --oneline -3
```
Expected: all three scripts green; working tree clean (no unstaged changes except gitignored `packs/`); the top two commits are the Task 1 (actor portrait) and Task 2 (release bump) commits on `main`.

- [ ] **Step 2: Tag v1.0.0**

```bash
git tag v1.0.0
```

- [ ] **Step 3: Push main and the tag**

```bash
git push origin main
git push origin v1.0.0
```
Pushing the tag triggers `.github/workflows/release.yml` (rebuild packs → rewrite `module.json` URLs/version → validate → zip → publish the GitHub Release with `module.json` + zip).

- [ ] **Step 4: Verify the release published**

```bash
gh run list --workflow=release.yml --limit 3
gh release view v1.0.0
```
Expected: the release workflow run for `v1.0.0` succeeds; `gh release view v1.0.0` shows the published release with `module.json` and `manifest-tulpa.zip` assets attached. Report the release URL to the user so they can install and smoke-test (R61/R62).

---

## Self-Review

**1. Spec coverage** — every spec section maps to a task:
- Spec §1 (asset placement) → Task 1 Step 1.
- Spec §2 (source edit: `img` + token `src`) → Task 1 Steps 4–5.
- Spec §3 (regression lock: img, token, existsSync) → Task 1 Step 2 (three assertions).
- Spec §4 (version bump → 1.0.0; CLAUDE.md version line + locked-fields row) → Task 2 Steps 1–3.
- Spec §5 (CHANGELOG [1.0.0]) → Task 2 Step 4.
- Spec §6 (smoke-plan rows) → Task 2 Step 5 (R61/R62, + stale-label fix).
- Spec §7 (README polish) → Task 2 Step 6.
- Spec §8 (release flow: test/validate/build → tag → push → publish) → Task 1 Step 8, Task 2 Step 7, Task 3.
- Spec "Verification gate" → Task 1 Step 8, Task 2 Step 7, Task 3 Step 1.
- No spec requirement is left without a task.

**2. Placeholder scan** — no "TBD/TODO/handle edge cases" placeholders. The only deferred figure is the "124 → 127" test count, which is a concrete predicted value (+3 over the v0.1.18 baseline of 124) with an explicit confirm-against-actual instruction — not a vague placeholder.

**3. Type/string consistency** — the canonical asset string `modules/manifest-tulpa/assets/tulpa.jpg` is identical in Task 1 (actor edit + test assertions), Task 2 Step 3 (locked-fields row), Step 4 (CHANGELOG), and Step 5 (smoke rows). The three test names referenced are the three added in Task 1 Step 2. The R-numbers (R61, R62) follow the smoke plan's existing last row (R60). No mismatches found.
