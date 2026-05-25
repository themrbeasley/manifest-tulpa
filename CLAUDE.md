# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A FoundryVTT module being built to automate a custom 5th-level D&D 5e Conjuration spell, "Manifest Tulpa." Target stack: **FoundryVTT V13.351**, **dnd5e 5.2.5**. Distribution: personal use via GitHub Releases (manifest URL install).

The repository is currently **pre-implementation**. Only the design spec and exploratory FoundryVTT JSON exports exist; none of `module.json`, `package.json`, the `modules/` runtime, `_source/`, or the GitHub Actions release workflow has been scaffolded yet.

## Source of truth

- **Spell text (RAW):** [manifest-tulpa.txt](manifest-tulpa.txt) — the player-facing description of the spell. Authoritative for mechanics; ports verbatim into `system.description.value` when the spell item is scrubbed.
- **Architecture & design:** [docs/superpowers/specs/2026-05-24-manifest-tulpa-design.md](docs/superpowers/specs/2026-05-24-manifest-tulpa-design.md) (revision 2, approved). Authoritative for module layout, dependencies, cast/dismiss flow, modification-registry shape, animation presets, dismissal triggers, flag namespace, and the planned build/release pipeline. **Read this before making non-trivial changes.** A revision-history table is at the top.

## Exploratory artifacts at repo root (not shipped)

The `fvtt-*.json` files in the root are world exports from the pre-module exploration phase. They are reference material, not deliverables:

- `fvtt-Actor-tulpa-*.json`, `fvtt-Item-manifest-tulpa-*.json`, `fvtt-ActiveEffect-harrowing-presence.json` — source material for the eventual scrubbed `_source/` JSON (see Section 3 "Compendium asset scrub" in the spec).
- `fvtt-Macro-*.json` (two files) — explicitly superseded by module JS; the design excludes macros from the shipped pack.

When the module is scaffolded, these stay at the repo root as references; the scrubbed versions go into `_source/`.

## Architectural invariants (load-bearing — do not violate)

These are decisions locked during brainstorming and gap-closure. Each has a non-obvious reason in the spec.

1. **Single-funnel dismissal.** A caster-side AE ("Manifest Tulpa (active)") flagged with `tulpaUuid` and `castConfig` is the source of truth that a Tulpa is live. All five dismissal triggers (duration, 0 HP, death, re-cast, manual token delete) work by deleting this one AE; `deleteActiveEffect` does the rest.
2. **Cast flow runs in `postUseActivity`, not `preUseActivity`.** `preUseActivity` fires before dnd5e's slot dialog, so the slot level is unknown. Tradeoff accepted: the slot is consumed before the mod-selection dialog opens; player restores manually if they cancel. **Do not** try to wrap or pre-empt dnd5e's slot-selection — prior attempts have cost weeks of debugging.
3. **Modifications are inserted at summon time**, not pre-baked-and-hidden. The shipped actor template has only base statblock + Manifestation Strike; mods come from `modules/modification-registry.js` and are applied per-cast.
4. **No macros in the compendium.** All behavior lives in `modules/*.js`, hooks registered at `ready`. The two exploratory `fvtt-Macro-*.json` files at the root are not bundled.
5. **Harrowing Presence is two-stage.** An Aura Effects aura on the Tulpa applies a marker AE (carrying `inHarrowingAura: true` + `auraDC`) to in-range hostiles; a global `dnd5e.combatTurnStart` hook reads the marker, rolls the save, and applies `frightened`. Aura Effects 1.5.2's `system.script` is a **synchronous boolean predicate** (compiled via `new Function`) — it cannot `await`, roll, or apply effects, so all imperative work lives in the hook.
6. **dnd5e auto-syncs token disposition at placement.** Do not add a manual `token.document.update({ disposition: 1 })` step; it's redundant.
7. **`times-up` drives the duration-expiry dismissal.** It deletes actor-parented non-transfer AEs when `duration.seconds` expires. Declared as a required dependency.
8. **Flag namespace:** everything under `flags["manifest-tulpa"]` unless interoperating with another module's namespace (`dae`, `midi-qol`, `dnd5e`). Section 7 item 8 of the spec is the canonical flag map.

## Dependencies

The module's `module.json` declares these required: `dnd5e` 5.2.5+, `midi-qol`, `dae`, `times-up`, `sequencer`, `portal-lib` (theripper93's "Portal" — **not** `portal`), `auraeffects` 1.5.2+ (mclemente's "Aura Effects" — **not** `aura-effects`). Recommended: `autoanimations` (tposney's "Automated Animations" — **not** `automated-animations`), `jb2a_patreon`. Section 1 of the spec used the wrong hyphenated IDs for the last two and shipped that way in v0.1.0 (fixed in v0.1.1); `module.json` is canonical, trust the live manifest over the spec on this.

## Build & release (planned — not yet wired)

None of this tooling exists in-repo yet. The spec's Section 8 describes the intended setup:

- `npm run build:packs` — wraps `npx @foundryvtt/foundryvtt-cli package pack <name> --in _source/<name> --out packs/<name>` for each of the two compendium packs (Foundry V13 uses LevelDB).
- `node scripts/validate-pack.js` — pre-release assertions on `_source/` JSON (no leftover modification AEs on the actor, world-export flags stripped, summon activity points at packed UUID, etc.).
- Release: `git tag v0.1.0 && git push origin v0.1.0` triggers `.github/workflows/release.yml`, which builds packs, rewrites `module.json` URLs/version, validates, zips, and publishes the GitHub Release with `module.json` + zip as assets.
- End-user install URL: `https://github.com/themrbeasley/manifest-tulpa/releases/latest/download/module.json`.

## Repository conventions

- `_source/` (planned) is git-tracked; `packs/` (LevelDB build output) is gitignored — see [.gitignore](.gitignore).
- Workflow follows the `superpowers` plugin: brainstorming → spec → `writing-plans` → implementation. Specs live in `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`. The current spec is approved; the next authorized step is `writing-plans`.
