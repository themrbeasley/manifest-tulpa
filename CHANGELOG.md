# Changelog

All notable changes to **Manifest Tulpa** are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.7] — 2026-05-25

> Addresses every actionable finding from the v0.1.6 smoke-test report ([docs/superpowers/test-plans/manifest-tulpa-test-report-v0.1.6.md](docs/superpowers/test-plans/manifest-tulpa-test-report-v0.1.6.md)). v0.1.6 was the first release where the cast flow completed end-to-end; the bugs exposed by that newly-reachable code path — broken weapon activities, dead aura propagation, non-functional initiative alignment, and a leaky dismissal funnel — are all fixed here. Smoke-test plan updated with rows R12–R19 to cover each fix.

### Fixed

- **Manifestation Strike shipped without Attack activities (Bug 5, critical).** The _source actor JSON has carried melee + ranged Attack activities since v0.1.0, but the v0.1.6 release zip was built from a stale LevelDB pack — so the spawned Tulpa's only weapon had `system.activities = {}`, with no roll button, no to-hit, no damage. `setStrikeDamageType` and `empoweredStrikes.patch` both iterated nothing and silently no-op'd. Root cause is pack-build hygiene: `npm run build:packs` was not re-run before tagging v0.1.6. Defense-in-depth fix lives in `scripts/validate-pack.js` — it now asserts every actor weapon item carries at least one `type: "attack"` activity with non-empty `damage.parts`. Two regression tests in `tests/validate-pack.test.mjs` cover both the missing-activities and empty-`damage.parts` failure modes, so a stale pack can't ship a fourth time.
- **Harrowing Presence aura propagated nothing to in-range hostiles (Bug 6, high).** The v0.1.6 implementation stored `inHarrowingAura` and `auraDC` on a separate `markerOnApply` AE that was never wired into Aura Effects 1.5.2's propagation contract. Aura Effects propagates the **aura AE's `changes` array** onto in-range targets — anything that lives elsewhere on the aura document is invisible to it. Rewrote `harrowingPresence.build` in `modules/modification-registry.js` to populate `aura.changes` with two OVERRIDE-mode changes (`flags.manifest-tulpa.inHarrowingAura = "true"` and `flags.manifest-tulpa.auraDC = String(dc)`), and dropped the `markerOnApply` field entirely. The `aura+marker` branch of `applyModifications` in `modules/cast-flow.js` simplified to a single AE creation. `modules/harrowing-presence-hook.js` now reads via `actor.getFlag("manifest-tulpa", "inHarrowingAura")` and coerces the DC with `Number(actor.getFlag(...))` since `getFlag` resolves against prepared post-AE data. Unit test rewritten to assert the sorted `changes` keys and their values.
- **Shared initiative never aligned the Tulpa (Bug 7, medium).** Two compounding causes: (a) when a player cast Manifest Tulpa mid-combat, the spawned Tulpa was not auto-added to the combat tracker, so `alignTulpaInitiative` had no combatant row to update; (b) `combatStart` fires *before* initiative is rolled, so even when the Tulpa was already in the tracker the alignment ran against `null` initiative values. Fix in `modules/initiative.js`: `alignTulpaInitiative` now calls `combat.createEmbeddedDocuments("Combatant", [{...}])` when the Tulpa isn't yet a combatant. New `onUpdateCombatant` export iterates `combat.combatants` to find Tulpas whose `summon.origin` matches the just-updated caster's actor UUID and re-aligns them to `caster initiative − 0.01`. Registered as `Hooks.on("updateCombatant", onUpdateCombatant)` in `modules/init.js`. This handles both the mid-combat-cast case and the re-roll-initiative case in a single funnel.
- **Re-cast dismissal chat card said "duration ended" (Bug 8, low).** `inferReason` in `modules/dismiss-flow.js` falls through to `"duration"` whenever the anchor AE deletion isn't otherwise tagged — and `times-up` is what cascades a re-cast's anchor deletion, so the times-up signal looked indistinguishable from a real duration expiry. Fixed by tagging the previous anchor with `flags["manifest-tulpa"].dismissReason = "recast"` in `cast-flow.js` immediately before deleting it. The cosmetic chat-card text now correctly identifies the reason.
- **Tulpa drop to 0 HP did not dismiss (Bug 9, high).** The v0.1.6 design relied on DAE `specialDuration: ["zeroHP", "isDeath"]` for HP-based dismissal — but those triggers operate on the *AE owner's* HP/status, not the referenced Tulpa actor. The Relentless watcher only existed for casts that included the Relentless mod, so any drop to 0 on a non-Relentless cast (or after Relentless was consumed) simply left the token sitting at 0 HP indefinitely. Replaced `modules/relentless-watcher.js` with `modules/tulpa-hp-watcher.js`, which arms on **every** cast in `cast-flow.js` via `armTulpaHpWatcher(tulpa.uuid, castConfig, damageType)`. The watcher's `preUpdateActor` interceptor: (a) if Relentless is present and unused → clamp HP to 1 + post the Relentless card + play the animation + set the `relentlessUsed` flag, (b) otherwise → tag the anchor with `dismissReason: "zeroHP"` and delete the anchor, cascading through the single-funnel dismissal. Re-armed on world load for any live anchor via `restoreTulpaHpWatchers()`.
- **Caster death cascade lost the Tulpa token (Bug 10, high).** When DAE's `specialDuration: isDeath` removed the anchor AE, `onDeleteActiveEffect` tried to resolve the Tulpa via `fromUuid(tulpaUuid)` — but the synthetic actor UUID (`Scene.X.Token.Y.Actor.Z`) can already resolve to null by then (the token document may be mid-teardown, or the prepared synthetic actor cache may be invalidated). Fix: the anchor AE now stores `tulpaTokenId` and `tulpaSceneId` flags alongside `tulpaUuid` and `castConfig` (created in `createAnchorAE`). `onDeleteActiveEffect` falls back to `game.scenes?.get(sceneId)?.tokens?.get(tokenId)` when the UUID resolution returns null, uses `tokenDoc.object` as the placeable for `playDismiss`, and `tokenDoc.delete()` for cleanup. Console.debug instrumentation added to trace the resolution path.

### Changed

- **Cast dialog labels are now human-readable (UX 1).** v0.1.6 surfaced raw registry slugs (`reinforcedForm`, `skill_ste`, `sizeShift_large`) in the modification picker. Added a module-scope `prettifySlug` helper in `modules/cast-dialog.js` that splits camelCase and snake_case into Title Case, and `_prepareContext` now attaches `displayName: m.template?.name ?? m.item?.name ?? prettifySlug(slug)` to each grouped entry. `templates/cast-dialog.hbs` renders `{{this.displayName}}` instead of `{{this.slug}}`.
- **Spell material text no longer double-wraps in parentheses (UX 3).** v0.1.6's material value was `"(a crystal shard imbued with your psychic resonance, worth at least 100 GP)"` — dnd5e's spell-card formatter then wrapped that in another set, displaying "((a crystal shard ...))". Stripped the outer parens from `_source/manifest-tulpa-spells/Item.manifest-tulpa.json` so the rendered card now reads with a single set, matching `manifest-tulpa.txt` RAW.

## [0.1.6] — 2026-05-25

> Addresses every actionable finding from the v0.1.5 smoke-test report ([docs/superpowers/test-plans/manifest-tulpa-test-report-v0.1.5.md](docs/superpowers/test-plans/manifest-tulpa-test-report-v0.1.5.md)). v0.1.5 was the first release where the cast dialog rendered in live Foundry; v0.1.6 fixes the run-time data-model and UUID-resolution bugs that were hidden behind the prior template crash. The cast flow now completes end-to-end in static analysis; downstream sections (3–8) remain unblocked but still need live Foundry verification.

### Fixed

- **`locateSummonedTulpa` could never find the freshly placed Tulpa token (cast-flow Bug 1).** The fallback path compared each canvas token's `flags.dnd5e.summon.origin` against `caster.uuid` with strict equality. `summon.origin` is an *item/activity* UUID (`Actor.<id>.Item.<id>[.Activity.<id>]`), so the comparison was always false and `abortAndCleanup` immediately ran against a `null` token — taking down every post-dialog step (stat adjustments, modifications, anchor AE, animations, chat card). Switched the comparison to a `startsWith` prefix match on `${caster.uuid}.`. Same actor-vs-item UUID confusion was also fixed in `initiative.js#onCombatStart` (new `casterUuidFromOrigin` regex helper that extracts the `Actor.<id>` prefix before `fromUuidSync`) and `dismiss-flow.js#onPreDeleteToken` (inline regex match on the origin string).
- **`setStrikeDamageType` wrote to the wrong damage path (cast-flow Bug 2).** The function targeted `system.damage.parts[0].types`, but in dnd5e 5.2.5 the Manifestation Strike's damage lives inside each *activity*'s `damage.parts` (`system.activities.<id>.damage.parts`). The old top-level path doesn't exist, so the `deepClone` returned an empty array, the length check bailed, and the damage type was never set — meaning the strike would have dealt untyped damage even if the rest of the flow had completed. Rewrote to iterate every activity on the strike and update the first damage entry of each, so both melee and ranged profiles carry the chosen damage type.
- **`empoweredStrikes.patch` crashed with `TypeError: Cannot read properties of undefined (reading 'push')` (modification-registry Bug 3).** Same root cause as Bug 2 in a different file — the patch cloned `strike.system.damage.parts` (undefined in 5.2.5) and then tried to `.push()` onto the result. Rewrote the patch to walk `system.activities.<id>.damage.parts` for every activity and append a `+1d8` of the chosen damage type, returning a multi-key update diff. Updated the corresponding unit test to assert the per-activity diff shape and to verify both the original and the added damage entries survive on every strike activity.
- **`playDismiss` (and `playManifest` / `playRelentless`) could hang indefinitely on missing Sequencer assets (animations Bug 4).** `.waitUntilFinished(-200)` resolves only when the visual finishes — if the asset is missing or stalled, the promise never resolves. The existing try/catch only caught thrown errors. Wrapped every Sequence `.play()` in a 5-second `Promise.race` timeout with a `.finally()`-cleared timer; the timeout rejection is then caught by the existing handler and downgraded to a single console warning, so the cast/dismiss/Relentless flow always continues even when the asset library isn't indexed.
- **`harrowing-presence-hook` could throw on the dnd5e 5.2.5 save API (test report §4 risk).** `actor.rollSavingThrow(...)` in dnd5e 5.2.5 may return `Array<D20Roll>`, a single roll, or `null`. The hook indexed `.total` directly on the return value, which would have NaN'd or thrown on the array path. Wrapped the call in a try/catch (warns and exits on failure) and normalized the return to the first roll's `total` before the DC comparison.

### Added

- **`applyCasterStats` step in the cast flow.** The compendium Tulpa actor ships with flat AC 13 / HP 40 / CR 1 / no spellcasting ability — dnd5e's summon `bonuses` and `match` fields aren't reliably honored by NPC statblocks in 5.2.5, so the v0.1.5 report observed the spawned Tulpa keeping all of those raw template values. Added an `applyCasterStats(tulpa, caster, slotLevel)` helper that runs immediately after `locateSummonedTulpa` returns and imperatively writes the spell formulas onto the spawned actor: AC `13 + spellMod`, HP `40 + 5 × casterLevel` (max + current), the caster's spellcasting ability + spell DC, a CR chosen to yield the caster's proficiency bonus (`profToCR` inverse mapping: prof 2→CR 1, 3→5, 4→9, 5→13, 6→17), and mirrored STR/CON save proficiencies. This keeps the source pack untouched (no `_key` regression risk, no compendium rebuild needed) and avoids tying the formulas to a specific summon-system field path.

## [0.1.5] — 2026-05-25

> Addresses the sole critical finding from the v0.1.4 smoke-test report ([docs/superpowers/test-plans/manifest-tulpa-test-report-v0.1.4.md](docs/superpowers/test-plans/manifest-tulpa-test-report-v0.1.4.md)). All downstream sections (3–8) that were BLOCKED in that report (modifications, Harrowing Presence, shared initiative, Relentless, dismissal, session reload) are now unblocked but still require live Foundry verification.

### Fixed

- **Cast dialog crashed on render with `Template part "body" must render a single HTML element`.** `templates/cast-dialog.hbs` rendered two top-level elements (`<section>` and `<footer>`), violating Foundry V13 `HandlebarsApplicationMixin`'s one-root-per-PART rule. Foundry parses the rendered HTML and rejects any part-template producing more than one top-level child, so the cast dialog never reached the DOM — taking the entire cast flow down with it (stat adjustments, modification application, anchor AE, Relentless arming, initiative alignment, manifest animation, chat card). The two-root-element problem was latent in v0.1.3 too, but the `{{in}}` helper crash there fired earlier in the pipeline and masked it; fixing the helper in v0.1.4 simply exposed the next layer. Fixed by wrapping the template's `<section>` and `<footer>` in a single `<div class="mt-cast-body">` root. No JavaScript changes — `_attachPartListeners` already scopes selectors to the part's root element.

## [0.1.4] — 2026-05-25

> Addresses every actionable finding from the v0.1.3 smoke-test report ([docs/superpowers/test-plans/manifest-tulpa-test-report-2026-05-25.md](docs/superpowers/test-plans/manifest-tulpa-test-report-2026-05-25.md)). The runtime tests that were BLOCKED in that report (Sections 3–8) are now unblocked but still require live Foundry verification.

### Fixed

- **Cast dialog crashed on render with `Missing helper: "in"`.** `templates/cast-dialog.hbs` used a Handlebars `{{in}}` helper that doesn't exist in Foundry V13's Handlebars environment, so the entire modification-selection dialog failed before paint — taking the whole cast flow (stat adjustments, modification application, anchor AE, Relentless arming, initiative alignment, manifest animation, chat card) down with it. Fixed by pre-computing `isSelected` per modification in `_prepareContext` and checking `{{#if this.isSelected}}` in the template. Also patched a latent secondary bug: `selected` was never exposed in the context, so the `../../selected` lookup would have been undefined even if the helper existed.
- **`module.json` `download` URL pinned to v0.1.0.** The in-repo manifest hard-coded `releases/download/v0.1.0/manifest-tulpa.zip`, so any user installing from the in-repo manifest (or any release where the CI rewrite step silently failed) would get the v0.1.0 zip regardless of advertised version. Switched the in-repo default to `releases/latest/download/manifest-tulpa.zip`. The release workflow's per-tag rewrite still produces version-specific URLs in published assets.
- **Duplicate hook registration possible across module re-imports.** Added a `globalThis.__manifestTulpaHooksRegistered` guard in `modules/init.js` that survives module re-import while the Hooks event bus is still alive — prevents `dnd5e.postUseActivity`, `dnd5e.combatTurnStart`, `combatStart`, `deleteActiveEffect`, and `preDeleteToken` from accumulating listeners in dev/reload workflows.

### Changed

- **Spell range and target now match the RAW.** `manifest-tulpa.txt` specifies "Range: 30 feet" but the packed spell had `range.units: "self"` at both the spell level and the summon-activity level, meaning the Tulpa could be placed anywhere on the canvas. Set both to `value: 30, units: "ft"` with `override: true` on the summon activity so placement is actually constrained. Target type is now `space` (was `self`).
- **Material component text matches the RAW.** `system.materials.value` now reads "(a crystal shard imbued with your psychic resonance, worth at least 100 GP)" to match `manifest-tulpa.txt`. Set `consumed: false` — the source text says "worth at least 100 GP" with no mention of consumption.

### Removed

- **Vestigial "Tether" feature on the Tulpa statblock.** A `Tether` feat ("If the Tulpa ends its turn more than 100 feet from its caster, it dissipates and the spell ends.") was present on the packed actor but is not in the spell text. Removed from `_source/manifest-tulpa-actors/Actor.tulpa.json` and from the `KEEP_ITEM_NAMES` allow-lists in both `scripts/scrub-source.mjs` and `scripts/validate-pack.js` so a re-scrub from the world export won't reintroduce it.

## [0.1.3] — 2026-05-25

> **Known issue (fixed in 0.1.4):** the modification-selection dialog crashed on render due to a missing Handlebars helper, taking the entire cast flow down with it. See the v0.1.4 entry for the full fix list.

### Fixed

- **Spell crashed dnd5e/midi-qol validation when dragged onto a character sheet.** v0.1.2 used document `_id`s `manifesttulpa0001` (17 chars) and `manifesttulpaspell` (18 chars). Foundry's pack loader was lenient enough to accept them, but `DocumentIdField` and `fromUuid` both require exactly 16 alphanumeric characters — so the moment the spell's summon-activity profile UUID was parsed, validation threw `Invalid document ID "manifesttulpa0001"`. Fixed by renaming the actor's id to `manifesttulpaA01` and the spell's id to `manifesttulpaS01` (both 16 chars). Validator now asserts every `_id` (top-level and embedded) matches `/^[a-zA-Z0-9]{16}$/`, with regression tests for actor / spell / embedded item.

## [0.1.2] — 2026-05-25

> **Known issue (fixed in 0.1.3):** the actor's `_id` was 17 characters and the spell's was 18 — Foundry's UUID validator rejects anything other than exactly 16 alphanumeric characters, so dragging the spell onto a character sheet threw `Invalid document ID`.

### Fixed

- **Compendium packs were empty.** v0.1.0 and v0.1.1 both shipped with empty LevelDB packs — the spell and statblock did not appear in Foundry. `scripts/scrub-source.mjs` set each doc's `_id` but not its `_key`, and `@foundryvtt/foundryvtt-cli`'s `compileClassicLevel` silently skips any document missing `_key`. Fixed by writing the full `_key` chain (`!actors!<id>`, `!actors.items!<actorId>.<itemId>`, etc.) into the scrubbed source, and added validator assertions + regression tests so this can't ship a third time.

## [0.1.1] — 2026-05-25

> **Known issue (fixed in 0.1.2):** packs shipped empty because the scrub script omitted the `_key` field required by foundryvtt-cli.

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

[0.1.7]: https://github.com/themrbeasley/manifest-tulpa/releases/tag/v0.1.7
[0.1.6]: https://github.com/themrbeasley/manifest-tulpa/releases/tag/v0.1.6
[0.1.5]: https://github.com/themrbeasley/manifest-tulpa/releases/tag/v0.1.5
[0.1.4]: https://github.com/themrbeasley/manifest-tulpa/releases/tag/v0.1.4
[0.1.3]: https://github.com/themrbeasley/manifest-tulpa/releases/tag/v0.1.3
[0.1.2]: https://github.com/themrbeasley/manifest-tulpa/releases/tag/v0.1.2
[0.1.1]: https://github.com/themrbeasley/manifest-tulpa/releases/tag/v0.1.1
[0.1.0]: https://github.com/themrbeasley/manifest-tulpa/releases/tag/v0.1.0
