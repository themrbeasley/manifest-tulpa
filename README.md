# Manifest Tulpa

FoundryVTT V13 / dnd5e 5.2.5 module that automates the custom 5th-level Conjuration spell **Manifest Tulpa**.

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
- portal-lib
- aura-effects 1.5.2+

## Recommended

- automated-animations
- jb2a_patreon

## Development

```bash
npm install
npm test
npm run scrub        # rebuild _source/ from world exports
npm run validate     # pre-release sanity check
npm run build:packs  # convert _source/ → packs/ (LevelDB)
```

Releases are tag-driven: push `vX.Y.Z` to trigger the GitHub Action that builds and publishes.
