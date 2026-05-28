# archive/ — pre-development FoundryVTT exports

These files were exported from a Foundry world during the brainstorming /
prototyping phase of this module (pre-v0.1.0). They have been **fundamentally
wrong** since v0.1.2 — wrong range, wrong target type, wrong material
component, wrong consumption flag, wrong damage types on the actor's strikes,
and so on. They were *never* meant to be authoritative once the module had a
hand-tuned `_source/` tree.

**Do not read, parse, or "scrub" these files. Ever.** They are kept in-tree
only so they remain greppable in git history; they are not inputs to any
build, validate, test, or release tool.

Authoritative source of truth for the shipped artifacts:

- Hand-edited JSON under [`_source/manifest-tulpa-spells/`](../_source/manifest-tulpa-spells/) and
  [`_source/manifest-tulpa-actors/`](../_source/manifest-tulpa-actors/).
- Spell prose: [`manifest-tulpa.txt`](../manifest-tulpa.txt).

Background (v0.1.13 silent regression): a `scripts/scrub-source.mjs` generator
historically read `fvtt-Item-manifest-tulpa-*.json` as input, applied a
handful of canonicalizations, and wrote `_source/`. Every field the script
did *not* explicitly overwrite passed through verbatim from the pre-dev
export. v0.1.13 re-ran the script (to bake a new icon path) and silently
shipped eight regressions because of this. v0.1.15 deleted the generator,
moved these exports out of the repo root, and locked the previously-silent
fields with regression tests.
