# Changelog

All notable changes to **Manifest Tulpa** are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] — 2026-05-25

### Fixed

- **`module.json` required/recommended IDs.** v0.1.0 declared `aura-effects` and `automated-animations` — those are the human-readable names, not the Foundry module IDs. Foundry flagged both as missing on install even when the correct modules were present. Corrected to `auraeffects` (mclemente's "Aura Effects") and `autoanimations` (tposney's "Automated Animations").

## [0.1.0] — 2026-05-25

Initial public release. Ships the full automation of the 5th-level Conjuration spell *Manifest Tulpa* for FoundryVTT V13 + dnd5e 5.2.5.

> **Known issue (fixed in 0.1.1):** declared the wrong Foundry IDs for Aura Effects and Automated Animations, causing Foundry to flag them as missing dependencies even when installed.

### Added

- **Spell + summoned actor compendia.** Two LevelDB packs — `manifest-tulpa-spells` (the spell item with a `summon` activity) and `manifest-tulpa-actors` (the base Tulpa statblock). Source JSON lives in `_source/`; packs are built at release time.
- **Cast-time dialog.** Player picks one damage type (force / radiant / psychic) and 0-N modifications grouped by category (Form, Combat, Movement, Skill, Utility). Slot-based budget (2 at spell-slot 5, +1 per upcast, capped at 6).
- **Modification registry.** 15 modifications across item-patch, item-insert, AE-only, and aura-with-marker kinds:
  - Form: Reinforced Form, Unsettling Form, Vital Surge, Size Shift (Tiny / Small / Large / Huge — mutually exclusive)
  - Combat: Empowered Strikes, Multiattack, Harrowing Presence, Relentless
  - Movement: Fly Speed
  - Skill: Skill Affinity (Stealth / Perception / Insight / Athletics)
  - Utility: Resistance, Telepathic Link
- **Cast flow (`dnd5e.postUseActivity`).** Runs *after* dnd5e's native slot dialog so the slot level is known. Sets strike damage type, applies modifications, creates the caster-side anchor AE, arms the Relentless watcher, aligns initiative, plays the manifest animation, and posts the cast chat card. Orphan tokens are cleaned up if the player cancels or exceeds the slot budget.
- **Single-funnel dismissal.** A caster-side AE flagged with `flags["manifest-tulpa"].tulpaUuid` is the source-of-truth for an active Tulpa. All five dismissal triggers flow through `deleteActiveEffect`:
  1. Duration expiry (1 hour, via `times-up`)
  2. Tulpa drops to 0 HP (DAE `specialDuration: zeroHP`)
  3. Caster dies (DAE `specialDuration: isDeath`)
  4. Caster re-casts (previous anchor deleted at cast-start)
  5. GM manually deletes the Tulpa token (`preDeleteToken` hook)
- **Harrowing Presence aura.** Two-stage: an Aura Effects aura on the Tulpa applies a marker AE (carrying `inHarrowingAura: true` + `auraDC`) to in-range hostiles; a global `dnd5e.combatTurnStart` hook reads the marker, rolls Wis save vs. caster's spell DC, and applies `frightened` on failure (auto-clears next turn via `times-up`).
- **Relentless watcher.** `preUpdateActor` intercept clamps HP to 1 the first time the Tulpa would drop to 0, posts the Relentless chat card, plays the visual, and disarms itself. Watchers are restored on world load for any live anchor.
- **Shared initiative.** When cast during active combat, the Tulpa enters the tracker at the caster's initiative − 0.01 (directly after).
- **Animations.** Sequencer-backed manifest / dismiss / Relentless effects with damage-type tinting (force=blue, radiant=gold, psychic=magenta). Gracefully degrade with a single console warning when `jb2a_patreon` is absent — mechanics still work.
- **Chat cards.** Localized cast, dismiss, Relentless, telepathic-link, and warning cards in `lang/en.json`.
- **Build & release tooling.**
  - `scripts/scrub-source.mjs` — strips world-export flags from `_source/` JSON.
  - `scripts/validate-pack.js` — pre-release assertions (no leftover modification AEs, summon UUID points at packed actor, no scaling, etc.). Includes positive + injection unit tests.
  - `scripts/build-packs.mjs` — wraps `@foundryvtt/foundryvtt-cli` to produce LevelDB packs.
  - `.github/workflows/release.yml` — tag-driven release (`v*`): rewrites `module.json` version + download URL, validates, tests, builds packs, zips the module, and publishes via `softprops/action-gh-release@v2`.
- **Manual smoke-test plan.** [docs/superpowers/test-plans/2026-05-24-manifest-tulpa-smoke.md](docs/superpowers/test-plans/2026-05-24-manifest-tulpa-smoke.md) covers every modification, all 5 dismissal triggers, the aura, Relentless, shared initiative, session reload, and required-module failure modes.

### Required modules

- `dnd5e` ≥ 5.2.5
- `midi-qol`
- `dae`
- `times-up`
- `sequencer`
- `portal-lib` (theripper93's "Portal" — **not** `portal`)
- `auraeffects` ≥ 1.5.2 ("Aura Effects" by mclemente)

### Recommended modules

- `jb2a_patreon` — for full manifest / dismiss / Relentless visuals
- `autoanimations` — for strike animations ("Automated Animations" by tposney)

### Known limitations

- The exact applied-effect schema slot used by Aura Effects 1.5.2 (`system.appliedEffect` vs. another key) could not be verified outside a real Foundry runtime. Marker propagation should be verified in-world per smoke-test step *Harrowing Presence #3*; if the marker flags are missing on the propagated NPC AE, re-wire the `aura+marker` branch in [modules/cast-flow.js](modules/cast-flow.js).

### Install

End-user manifest URL:

```
https://github.com/themrbeasley/manifest-tulpa/releases/latest/download/module.json
```

[0.1.1]: https://github.com/themrbeasley/manifest-tulpa/releases/tag/v0.1.1
[0.1.0]: https://github.com/themrbeasley/manifest-tulpa/releases/tag/v0.1.0
