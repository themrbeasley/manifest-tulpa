# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A FoundryVTT module that automates a custom 5th-level D&D 5e Conjuration spell, "Manifest Tulpa." Target stack: **FoundryVTT V13.351**, **dnd5e 5.2.5**. Distribution: personal use via GitHub Releases (manifest URL install).

Current version: **v0.1.15** (see [CHANGELOG.md](CHANGELOG.md) and [module.json](module.json)). The runtime in [modules/](modules/), the hand-edited `_source/` JSON, the compendium packs in `packs/`, the build/validate scripts in [scripts/](scripts/), the [test suite](tests/), and the [release workflow](.github/workflows/release.yml) are all wired and have been through twelve smoke cycles.

## Quick commands

```bash
npm test                # node --test → runs tests/*.test.mjs
npm run build:packs     # scripts/build-packs.mjs → packs _source/ into LevelDB packs/
npm run validate        # scripts/validate-pack.js → pre-release assertions on _source/
```

Release: `git tag v0.1.X && git push origin v0.1.X` triggers [.github/workflows/release.yml](.github/workflows/release.yml), which rebuilds packs, rewrites `module.json` URLs/version, validates, zips, and publishes the GitHub Release with `module.json` + zip as assets. End-user install URL: `https://github.com/themrbeasley/manifest-tulpa/releases/latest/download/module.json`.

## Runtime map ([modules/](modules/))

- [init.js](modules/init.js) — registers all hooks at `ready`. No macros; everything dispatches from here.
- [cast-flow.js](modules/cast-flow.js) / [cast-dialog.js](modules/cast-dialog.js) — `preUseActivity` (slot capture) + `postSummon` (placement→dialog) cast pipeline + the mod-selection dialog (see invariant 2).
- [dismiss-flow.js](modules/dismiss-flow.js) — single-funnel dismissal driven by deletion of the caster-side anchor AE (invariant 1).
- [harrowing-presence-hook.js](modules/harrowing-presence-hook.js) — imperative half of the two-stage Harrowing Presence pattern; reads the marker placed by Active Auras (invariant 5).
- [modification-registry.js](modules/modification-registry.js) — mods applied at summon time (invariant 3).
- [animations.js](modules/animations.js) / [animation-presets.js](modules/animation-presets.js) — Sequencer + JB2A + AutoAnimations pipeline; includes the in-flight asset-missing fallback.
- [tulpa-hp-watcher.js](modules/tulpa-hp-watcher.js), [initiative.js](modules/initiative.js), [chat-cards.js](modules/chat-cards.js), [constants.js](modules/constants.js) — supporting subsystems.

## Source of truth

- **Spell text (RAW):** [manifest-tulpa.txt](manifest-tulpa.txt) — the player-facing description of the spell. Authoritative for *mechanics* (what the spell does). The shipped HTML in [`_source/manifest-tulpa-spells/Item.manifest-tulpa.json`](_source/manifest-tulpa-spells/Item.manifest-tulpa.json) `system.description.value` is hand-maintained from this text — there is no generator that copies one into the other (see the "Source-tree discipline" section below for why).
- **Architecture & design:** [docs/superpowers/specs/2026-05-24-manifest-tulpa-design.md](docs/superpowers/specs/2026-05-24-manifest-tulpa-design.md) (revision 2, approved). Authoritative for module layout, dependencies, cast/dismiss flow, modification-registry shape, animation presets, dismissal triggers, flag namespace, and the planned build/release pipeline. **Read this before making non-trivial changes.** A revision-history table is at the top.

## Source-tree discipline — STANDING ORDER (read before editing anything under `_source/` or `packs/`)

> **`_source/` is the source of truth. It is hand-edited canonical JSON. There is no generator — none, gone, deleted. If you write a generator that reads anything outside `_source/` and writes back into `_source/`, you are recreating the v0.1.13 silent-regression bug and `tests/spell-source.test.mjs` will fail.**

What `_source/` is:
- The **only** authoritative inputs to the shipped compendium packs.
- Two files: [`_source/manifest-tulpa-spells/Item.manifest-tulpa.json`](_source/manifest-tulpa-spells/Item.manifest-tulpa.json) (the spell) and [`_source/manifest-tulpa-actors/Actor.tulpa.json`](_source/manifest-tulpa-actors/Actor.tulpa.json) (the actor).
- Hand-maintained. Edit them with your editor. Run `npm test && npm run validate && npm run build:packs` to confirm the edit is shape-correct and ships.

What `_source/` is **not**:
- It is not generated from `manifest-tulpa.txt`. The spell prose in `system.description.value` is hand-maintained HTML synced from the txt file — there is no script that does this, on purpose.
- It is not generated from any `fvtt-*.json` export. Those exports were pre-development brainstorming artifacts and have lived in [`archive/`](archive/) since v0.1.15. **Do not read them. Do not parse them. Do not "scrub" them.** They are wrong (wrong range, wrong target, wrong material component, wrong consumption flag, wrong damage types) and would re-introduce the v0.1.13 silent regression. See [archive/README.md](archive/README.md).

**The rule, when fixing any bug whose visible symptom is in `_source/`:**

1. **Edit `_source/*.json` directly.** It is the source of truth — patching it IS the fix.
2. **Add a regression assertion in [`tests/spell-source.test.mjs`](tests/spell-source.test.mjs)** for the field you just corrected. The pattern is `assert.equal(spell.system.X, "expected")`. If the field cannot regress without the test failing, the bug class is dead.
3. **Run `npm test && npm run validate && npm run build:packs`** to confirm.

**Fields locked by tests or the validator** (touching any of these without updating the corresponding assertion will break the build):

| Side | Field | Canonical value | Locked by |
|---|---|---|---|
| Actor | `_id` | `manifesttulpaA01` | [tests/spell-source.test.mjs](tests/spell-source.test.mjs) |
| Actor | `effects` | `[]` | [scripts/validate-pack.js](scripts/validate-pack.js) |
| Actor | `items` | filtered to `KEEP_ITEM_NAMES` (Manifestation Strike variants) | validator |
| Actor | Manifestation Strike damage types | `["bludgeoning"]` placeholder (final type set by `cast-flow.js` at summon time) | validator |
| Actor | `flags.ActiveAuras` + world flags | absent | validator |
| Actor | `_key` (recursive) | computed `!actors[.items[.effects]]!…` | validator |
| Spell | `_id` | `manifesttulpaS01` | tests/spell-source.test.mjs |
| Spell | `img` | `modules/manifest-tulpa/assets/manifest_tulpa_icon.webp` | tests/spell-source.test.mjs |
| Spell | `system.identifier` | `"manifest-tulpa"` | tests/spell-source.test.mjs |
| Spell | `system.source.rules` | `"2024"` | tests/spell-source.test.mjs |
| Spell | `system.range` | `{value: 30, units: "ft"}` | tests/spell-source.test.mjs (v0.1.13 silent-regression lock) |
| Spell | `system.target.affects.type` | `"space"` | tests/spell-source.test.mjs (v0.1.13 lock) |
| Spell | `system.materials.value` | crystal-shard text, must NOT mention hair/blood | tests/spell-source.test.mjs (v0.1.13 lock) |
| Spell | `system.materials.consumed` | `false` | tests/spell-source.test.mjs (v0.1.13 lock) |
| Spell | `system.materials.cost` | `100` | tests/spell-source.test.mjs |
| Spell | summon activity `range.override` | `true`, value 30 ft | tests/spell-source.test.mjs (v0.1.13 lock) |
| Spell | summon activity `target.affects.type` | `"space"`, `target.override: true` | tests/spell-source.test.mjs (v0.1.13 lock) |
| Spell | summon activity `profiles[].uuid` | `Compendium.manifest-tulpa.manifest-tulpa-actors.Actor.manifesttulpaA01` | validator + tests/spell-source.test.mjs |
| Spell | summon activity `consumption.scaling.allowed` | `false` | validator + tests/spell-source.test.mjs |
| Spell | `system.description.value` | hand-maintained HTML from [manifest-tulpa.txt](manifest-tulpa.txt); must NOT contain the front-matter header (Manifest Tulpa / Level 5 Conjuration / Casting Time / Range / Components / Duration) | tests/spell-source.test.mjs (R36 lock) |
| Spell | `system.description.value` (table) | contains `<table>`, `<th>AC</th>`, `<th>HP maximum</th>` | tests/spell-source.test.mjs (v0.1.16 structure lock) |
| Spell | `system.description.value` (enrichers) | contains `[[lookup @attributes.spellmod]]{...}` and `[[40 + 5 * @details.level]]{...}` | tests/spell-source.test.mjs (v0.1.16 enricher lock) |
| Spell | `system.description.value` (sections) | contains `<h4>` for Morphic / Combat / Resistance / Movement / Skill Affinity / Special | tests/spell-source.test.mjs (v0.1.16 structure lock) |
| Spell | `system.description.value` (mod names) | `<strong>` on Reinforced Form, Empowered Strikes, Fly Speed, Telepathic Link (sample) | tests/spell-source.test.mjs (v0.1.16 structure lock) |
| Spell | `system.description.chat` | non-empty, < 1500 chars, mentions Tulpa + dismiss; no R36 header strings | tests/spell-source.test.mjs (v0.1.16 chat-card lock) |
| Tooling | `scripts/scrub-source.mjs` | absent | tests/spell-source.test.mjs (anti-generator lock) |

**If you need to change a locked field**, edit `_source/` and update the matching assertion in `tests/spell-source.test.mjs` in the same commit. Never relax an assertion to make a test pass without first asking "is the new value actually correct?"

**Anti-pattern: rebuilding the scrub script.** It will read fvtt-* exports (or even `_source/` itself!) and write back, which kills your hand edits or re-introduces the pre-dev wrong values. v0.1.13 cost two patch releases (v0.1.13 → v0.1.15) because of exactly this. If you need a one-shot transform across the source tree, write it as a one-off script, run it once, and delete the script in the same commit. **v0.1.16 is another precedent:** the description-polish work was implemented entirely by hand-editing `_source/manifest-tulpa-spells/Item.manifest-tulpa.json` and adding five new structure-lock tests in the same commit. No new script, no regenerator, no round-trip — just edit, lock, ship.

## Architectural invariants (load-bearing — do not violate)

These are decisions locked during brainstorming and gap-closure. Each has a non-obvious reason in the spec.

1. **Single-funnel dismissal.** A caster-side AE ("Manifest Tulpa (active)") flagged with `tulpaUuid` and `castConfig` is the source of truth that a Tulpa is live. All five dismissal triggers (duration, 0 HP, death, re-cast, manual token delete) work by deleting this one AE; `deleteActiveEffect` does the rest.
2. **Cast flow runs in `dnd5e.postSummon` (placement→dialog) with a `dnd5e.preUseActivity` slot-capture sidecar.** The post-placement work cannot live in `dnd5e.postUseActivity`: dnd5e dispatches that hook via `Hooks.call` (short-circuits on the first `return false`), so any other module returning falsy from a prior listener swallows ours and the cast silently fails after the slot is consumed (REG-1, v0.1.12 smoke; fixed v0.1.13). `dnd5e.postSummon` is dispatched via `Hooks.callAll` ([summon.mjs:222](.understand-anything/dnd5e-research/dnd5e/module/documents/activity/summon.mjs)) and is therefore short-circuit-safe; it also passes `createdTokens` directly, eliminating the locate-helpers scan v0.1.11–v0.1.12 needed. The slot level is captured in `dnd5e.preUseActivity` into a module-local `SLOT_CAPTURE` Map keyed by `activity.uuid` (our handler never returns false, so the short-circuit risk is irrelevant to us); `postSummon` reads + deletes the entry. Tradeoff (unchanged): the slot is still consumed before the mod-selection dialog opens, because consumption happens inside dnd5e's `_finalizeUsage` between `preUseActivity` and `placeSummons`; player restores manually if they cancel. **Do not** try to wrap or pre-empt dnd5e's slot-selection, and **do not** move the post-placement work back to `postUseActivity` — both paths have cost weeks of debugging.
3. **Modifications are inserted at summon time**, not pre-baked-and-hidden. The shipped actor template has only base statblock + Manifestation Strike; mods come from `modules/modification-registry.js` and are applied per-cast.
4. **No macros in the compendium.** All behavior lives in `modules/*.js`, hooks registered at `ready`. The exploratory `fvtt-Macro-*.json` files now under [`archive/`](archive/) are not bundled.
5. **Harrowing Presence is two-stage.** An Active Auras (kandashi) aura on the Tulpa propagates a marker AE (carrying `inHarrowingAura: true` + `auraDC`) onto in-range hostiles via `foundry.utils.duplicate`, which carries both the `changes` array (flag-key writes) and the foreign-namespace `flags["manifest-tulpa"]` bag intact; the imperative save runs from a `dnd5e.combatRecovery` listener (signature `(combatant, periods, results)`) gated on `periods.includes("turnStart")` — that's how dnd5e 5.2.5 signals "this combatant's turn just started" from `Combatant5e.recoverCombatUses` ([dnd5e/module/documents/combatant.mjs](.understand-anything/dnd5e-research/dnd5e/module/documents/combatant.mjs)). AA propagates effects but doesn't roll or save — that's why the imperative half lives in the hook. The propagation engine was swapped from Aura Effects 1.5.2 to Active Auras 0.12.7 in v0.1.11 because AE 1.5.2's V13 registration path for AE-typed sources on synthetic/unlinked actors never landed the marker (broken from v0.1.6 through v0.1.10). v0.1.11 also originally registered `dnd5e.combatTurnStart` — a hook string dnd5e never emits — so the save never auto-fired; v0.1.12 (smoke Observation 2) corrected this to `dnd5e.combatRecovery`. One AA-specific setup gotcha: the world setting `ActiveAuras.combatOnly`, when `true`, gates all propagation behind an active combat — including the placement-time marker. The module does not override this; v0.1.12 README + `init.js` ready log call it out.
6. **dnd5e auto-syncs token disposition at placement.** Do not add a manual `token.document.update({ disposition: 1 })` step; it's redundant.
7. **`times-up` drives the duration-expiry dismissal.** It deletes actor-parented non-transfer AEs when `duration.seconds` expires. Declared as a required dependency.
8. **Flag namespace:** everything under `flags["manifest-tulpa"]` unless interoperating with another module's namespace (`dae`, `midi-qol`, `dnd5e`). Section 7 item 8 of the spec is the canonical flag map.

## Dependencies

The module's `module.json` declares these required: `dnd5e` 5.2.5+, `midi-qol`, `dae`, `times-up`, `sequencer`, `portal-lib` (theripper93's "Portal" — **not** `portal`), `lib-wrapper`, `socketlib`, `ActiveAuras` 0.12.7+ (kandashi's "Active Auras" — **not** `active-auras` and **not** `auraeffects`; the propagation engine was swapped from mclemente's Aura Effects 1.5.2 in v0.1.11, see invariant 5), `autoanimations` (tposney's "Automated Animations" — **not** `automated-animations`), `jb2a_patreon`. `autoanimations` and `jb2a_patreon` were `recommends` through v0.1.8 and promoted to `requires` for v0.1.9; the in-flight asset-missing fallback in `animations.js` still applies because individual JB2A asset versions can vary, but the modules themselves must be present. `lib-wrapper` and `socketlib` are AA's runtime peers and entered `requires` in v0.1.11 alongside the AA swap. `module.json` is canonical for module IDs — the hyphenated-ID pitfall has bitten this module before (Section 1 of the spec shipped wrong IDs for `autoanimations`/`jb2a_patreon` in v0.1.0, fixed v0.1.1), so trust the live manifest over the spec/CLAUDE.md when they disagree.

## Repository conventions

- `_source/` is git-tracked, hand-edited canonical JSON (see "Source-tree discipline" above); `packs/` is the LevelDB build output and is gitignored — see [.gitignore](.gitignore).
- Workflow follows the `superpowers` plugin: brainstorming → spec → `writing-plans` → implementation → smoke. Specs live in [docs/superpowers/specs/](docs/superpowers/specs/); plans in [docs/superpowers/plans/](docs/superpowers/plans/); per-version smoke reports in [docs/superpowers/test-plans/](docs/superpowers/test-plans/).
- **Smoke governance:** [docs/superpowers/test-plans/2026-05-24-manifest-tulpa-smoke.md](docs/superpowers/test-plans/2026-05-24-manifest-tulpa-smoke.md) is the canonical regression matrix. R1–R45 (functional) **and** A1–A9 (animation) are graded `PASS` / `FAIL` / `BLOCKED` every smoke — never "Not exercised this session." When a functional R-bug and a cosmetic A-bug collide, R still wins the fix-order slot; A doesn't lose its grade. Per-version reports follow the `YYYY-MM-DD-vX.Y.Z-smoke-report.md` naming convention.
- Before tagging a release, update both [CHANGELOG.md](CHANGELOG.md) **and** the smoke plan regression rows (see the v0.1.6 course-correction memory) — not just the per-version report.
