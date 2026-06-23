# Manifest Tulpa

FoundryVTT V13 / dnd5e 5.2.5 module that automates the custom 5th-level Conjuration spell **Manifest Tulpa**.

> **Status:** v1.0.0 — first stable release. The automation has been through twelve-plus smoke cycles; the cast dialog, modification picker, summon wiring, in-combat behaviors, and lifecycle management are all working. The Tulpa now ships with commissioned actor artwork.

## Install

Paste this URL into Foundry's **Install Module** dialog:

```
https://github.com/themrbeasley/manifest-tulpa/releases/latest/download/module.json
```

## Required modules

- dnd5e 5.2.5+
- midi-qol
- dae
- times-up
- sequencer
- portal-lib ("Portal" by theripper93)
- lib-wrapper
- socketlib
- ActiveAuras 0.12.7+ ("Active Auras" by kandashi)
- autoanimations ("Automated Animations" by tposney)
- jb2a_patreon

## Setup notes

**ActiveAuras → "Only check Auras while in combat" (combatOnly):** if this world setting is enabled, Active Auras only scans for aura sources while a combat is active. Harrowing Presence relies on AA to propagate its marker AE to in-range hostiles, so when combatOnly is on **and** no combat is active, the aura will not apply and saves will not be rolled. Either start a combat encounter before casting, or disable the setting under Game Settings → Module Settings → Active Auras. The module logs a `manifest-tulpa | note: ...` line at ready when combatOnly is enabled so you know which mode you're in.

## Development

```bash
npm install
npm test
npm run validate     # pre-release sanity check on hand-edited _source/
npm run build:packs  # convert _source/ → packs/ (LevelDB)
```

Releases are tag-driven: push `vX.Y.Z` to trigger the GitHub Action that builds and publishes.

## How it works

- Cast Manifest Tulpa from the character sheet. The default dnd5e slot dialog runs first.
- After the slot is chosen, the module's modification picker opens (damage type + mods).
- The Tulpa summons via dnd5e's native summon flow (Portal placement), then modifications apply.
- A "Manifest Tulpa (active)" effect appears on the caster — right-click it to dismiss manually.
- The Tulpa is automatically dismissed when any of these happen: 1-hour duration expires, caster hits 0 HP, caster dies, caster re-casts the spell, or the Tulpa token is removed.

## Module architecture

See [docs/superpowers/specs/2026-05-24-manifest-tulpa-design.md](docs/superpowers/specs/2026-05-24-manifest-tulpa-design.md) for the full design.

## Testing

```bash
npm test                                    # Node unit tests (registry, presets, validation)
```

Manual smoke test plan (run in a Foundry world before releasing):

[docs/superpowers/test-plans/2026-05-24-manifest-tulpa-smoke.md](docs/superpowers/test-plans/2026-05-24-manifest-tulpa-smoke.md)
