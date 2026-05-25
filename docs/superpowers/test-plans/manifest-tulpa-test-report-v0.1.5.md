# Manifest Tulpa v0.1.5 -- Smoke Test Report

**Date:** 2026-05-25
**Tester:** Claude (automated, supervised by Mr. Beasley)
**Environment:** FoundryVTT V13.351, dnd5e 5.2.5
**Module Version:** 0.1.5
**Test Character:** "Player Character" (Wizard 10, Half-Orc Mythalkeeper, INT 16, Proficiency +4, Spell DC 15, Spell Attack +7)
**Test Plan:** `docs/superpowers/test-plans/2026-05-24-manifest-tulpa-smoke.md`
**Source of Truth:** `manifest-tulpa.txt`
**Previous Reports:** v0.1.3 (`manifest-tulpa-test-report-2026-05-25.md`), v0.1.4 (`manifest-tulpa-test-report-v0.1.4.md`)

> **Status update (2026-05-25, v0.1.6):** Every actionable finding in this report has been fixed in v0.1.6. See the **v0.1.6 Resolution Addendum** at the bottom of this document for the file-by-file mapping. The report itself is preserved unchanged for historical accuracy.

### Dependency Versions (recorded from live Foundry instance)

| Dependency | Version |
|------------|---------|
| midi-qol | 11.6.39 |
| dae | 11.5.3 |
| times-up | 13.0.1 |
| sequencer | 3.3.6 |
| portal-lib | 13.0.2 |
| auraeffects | 1.5.2 |
| jb2a_patreon | 0.6.7 |
| autoanimations | **Installed but NOT ACTIVE** |

---

## Executive Summary

**Overall Result: FAIL -- the v0.1.4 cast dialog blocker is resolved, but three new critical bugs prevent the cast flow from completing end-to-end.**

v0.1.5 successfully fixes the single-root-element template crash from v0.1.4. The cast dialog now renders correctly with damage type radios, grouped modification checkboxes, a slot counter, and Confirm/Cancel buttons. All five regression checks pass. This is the first version where the dialog has ever rendered in a live Foundry environment.

However, the post-dialog cast flow fails at its first step. After the user confirms the dialog and the Tulpa token is placed on the canvas, `locateSummonedTulpa()` cannot find the token due to a UUID comparison mismatch. This means none of the stat adjustments, modification applications, or downstream features (anchor AE, Relentless, initiative alignment, animations, chat card) ever execute. The module still produces only a raw-template Tulpa with no caster-derived stats.

Three critical bugs were identified, two of which are data-format issues that will also crash when reached:

1. **`locateSummonedTulpa` UUID mismatch** -- compares actor UUID against item UUID (always false)
2. **`setStrikeDamageType` uses `damage.parts`** -- dnd5e 5.2.5 uses `damage.base`, not `damage.parts`
3. **`empoweredStrikes.patch` uses `damage.parts`** -- same format mismatch, crashes with TypeError

Additionally, the dismiss animation (`playDismiss`) hangs for 45+ seconds before the token is cleaned up, and the base Tulpa actor's AC formula does not incorporate the caster's spellcasting modifier.

**Progress vs. v0.1.4:** The cast dialog is no longer the blocker. For the first time, the dialog renders and returns user selections. But the code that acts on those selections has never run successfully in any version.

---

## Test Results Summary

| # | Test Area | Result | Blocker? | Change from v0.1.4 |
|---|-----------|--------|----------|---------------------|
| R1 | Spell card material + range | PASS | -- | Same |
| R2 | Tulpa actor features (no Tether) | PASS | -- | Same |
| R3 | Summon placement bounded to 30ft | PASS | -- | Upgraded from PARTIAL |
| R4 | Cast dialog renders without error | PASS | -- | **FIXED** (was FAIL) |
| R5 | Hook accumulation guard | PASS | -- | Same |
| 3 | Cast Flow Happy Path | FAIL | YES | New bugs exposed |
| 4 | Modification Correctness | BLOCKED | -- | Same |
| 5 | Harrowing Presence | BLOCKED | -- | Same |
| 6 | Shared Initiative | BLOCKED | -- | Same |
| 7 | Relentless | BLOCKED | -- | Same |
| 8 | Dismissal Triggers | PARTIAL | -- | **NEW** (was BLOCKED) |
| 9 | Session Reload | BLOCKED | -- | Same |

---

## Phase 1: Regression Checks

### R1: Spell Card Material + Range

**Result: PASS**

Opened the Player Character's spell sheet and clicked Manifest Tulpa to view the spell card. Verified:

- **Range:** "30 Feet" -- matches `manifest-tulpa.txt`.
- **Components:** "V, S, M" with material text "(a crystal shard imbued with your psychic resonance, worth at least 100 GP)."
- **Consumed:** "No" -- correct per spell text.
- **Duration:** "1 Hour" -- correct.
- **Casting Time:** "1 Action" -- correct.

No change from v0.1.4.

### R2: Tulpa Actor Features (No Tether)

**Result: PASS**

Opened the Tulpa actor from the `manifest-tulpa-actors` compendium. The actor has one feature item: **Manifestation Strike**. No vestigial Tether feature. Correct.

No change from v0.1.4.

### R3: Summon Placement Bounded to 30ft

**Result: PASS (upgraded from PARTIAL)**

In v0.1.4, this was marked PARTIAL because the cast dialog crash prevented confirming Portal enforcement. In v0.1.5, the full cast flow was exercised far enough to observe token placement. dnd5e's summon activity fired, the token followed the cursor, and it was placed within the 30ft range. The spell's summon activity range fields (`value: 30, units: "ft"`, `override: true`) are honored by Portal.

### R4: Cast Dialog Renders Without Console Error

**Result: PASS -- v0.1.4 blocker resolved**

The cast dialog now renders correctly. The template wraps its `<section>` and `<footer>` in a single `<div class="mt-cast-body">` root element, satisfying Foundry V13's `HandlebarsApplicationMixin` one-root-per-PART rule.

Verified in the rendered dialog:

- **Damage type radios:** Three radio buttons for Force, Radiant, Psychic. All selectable, mutual exclusion works.
- **Modification checkboxes:** Grouped by category (Morphic, Combat, Resistance, Movement, Skill, Special). Checkboxes render with correct labels.
- **Slot counter:** Displays correctly (e.g., "0/2 slots" at base, updates when checkboxes are toggled).
- **Buttons:** Confirm and Cancel buttons render in the footer. Cancel resolves the dialog to null (triggering abort cleanup). Confirm returns the selected configuration.

**Minor UX note:** When checkboxes are toggled programmatically (via DOM `.checked = true`), the slot counter does not update until a `change` event is manually dispatched. This is expected behavior for ApplicationV2's reactive data binding and only affects automated testing, not normal user interaction.

**Console note:** When multiple cast attempts triggered rapid dialog open/close cycles, three `TypeError: Cannot read properties of undefined (reading '_updatePosition')` errors appeared. These are Foundry framework errors from ApplicationV2's internal positioning logic when multiple dialog instances compete for the same application ID. They do not affect functionality but indicate the dialog teardown path could be more defensive.

### R5: Hook Accumulation Guard

**Result: PASS**

The `globalThis.__manifestTulpaHooksRegistered` guard in `init.js` prevents duplicate hook registration. Only one listener for `dnd5e.postUseActivity` belongs to manifest-tulpa, confirmed across multiple page interactions during testing.

No change from v0.1.4.

---

## Section 2: Cast Flow Happy Path

**Result: FAIL -- three critical bugs block post-dialog flow**

### Test Procedure

1. Opened Player Character's sheet, navigated to Spells tab.
2. Clicked "Manifest Tulpa" (5th Level spell name text).
3. dnd5e system slot dialog appeared: "Cast at Level: 5th Level", "Consume Spell Slot?" checked, "Place Summons" checked.
4. Clicked "Cast Spell."
5. Tulpa token appeared attached to cursor (dnd5e's native summon flow).
6. Clicked an empty canvas space to place the token.
7. `dnd5e.postUseActivity` hook fired.
8. Module's `onPostUseActivity` handler ran.
9. **Cast dialog rendered successfully** (first time in any version).
10. Selected "Force" damage type, checked a modification, clicked Confirm.
11. Dialog resolved with the selection object.
12. `locateSummonedTulpa()` returned `null` -- the Tulpa token was not found.
13. `abortAndCleanup()` fired, posting a warning and attempting to delete the token it couldn't find.

### Bug 1 (Critical): `locateSummonedTulpa` UUID mismatch

**File:** `cast-flow.js`, lines 91-99

The function tries two paths to find the summoned Tulpa token:

**Path A:** `results?.createdTokens?.[0]` -- In dnd5e 5.2.5, the `results` object passed to `postUseActivity` does not populate `createdTokens`. This path returns `undefined`.

**Path B (fallback):** Searches `canvas.tokens.placeables` for tokens whose `flags.dnd5e.summon.origin` equals `caster.uuid`. This comparison always fails because:

- `caster.uuid` is the **actor** UUID: `Actor.abcdef123456`
- `flags.dnd5e.summon.origin` is the **item** UUID: `Actor.abcdef123456.Item.xyz789`

The strict `===` comparison between an actor UUID and an item UUID is always false. The Tulpa token is right there on the canvas, but the lookup cannot find it.

**Impact:** Total blocker. Every step after the dialog (stat adjustments, modifications, anchor AE, animations, chat card) requires the `token` variable, which is null.

**Suggested fix:** Change the comparison to use `startsWith`:

```javascript
// Current (broken):
.filter(t => t.actor?.getFlag?.("dnd5e", "summon")?.origin === caster.uuid)

// Fixed:
.filter(t => t.actor?.getFlag?.("dnd5e", "summon")?.origin?.startsWith(caster.uuid))
```

Alternatively, compare against `activity.item.uuid` directly, since that IS the origin value dnd5e stores. This would require passing the activity or item UUID into the function.

### Bug 2 (Critical): `setStrikeDamageType` uses wrong damage schema

**File:** `cast-flow.js`, lines 101-108

```javascript
async function setStrikeDamageType(tulpa, damageType) {
  const strike = tulpa.items.find(i => i.name === "Manifestation Strike");
  if (!strike) return;
  const parts = foundry.utils.deepClone(strike.system.damage?.parts ?? []);
  if (!parts.length) return;
  parts[0].types = [damageType];
  await strike.update({ "system.damage.parts": parts });
}
```

In dnd5e 5.2.5, weapon/attack damage is stored at `system.damage.base` (with `.types` as an array of damage type strings), not `system.damage.parts`. The `parts` property does not exist. The `deepClone` returns an empty array (from the `?? []` fallback), the length check bails out, and the damage type is never set.

This means the Manifestation Strike would always deal untyped damage even if the cast flow completed.

**Suggested fix:**

```javascript
async function setStrikeDamageType(tulpa, damageType) {
  const strike = tulpa.items.find(i => i.name === "Manifestation Strike");
  if (!strike) return;
  await strike.update({ "system.damage.base.types": [damageType] });
}
```

### Bug 3 (Critical): `empoweredStrikes.patch` crashes on `damage.parts`

**File:** `modification-registry.js`, lines 108-114

```javascript
patch: (strike, damageType) => {
  const parts = globalThis.foundry?.utils?.deepClone
    ? globalThis.foundry.utils.deepClone(strike.system.damage.parts)  // undefined!
    : structuredClone(strike.system.damage.parts);
  parts.push({ number: 1, denomination: 8, ... });
  return { "system.damage.parts": parts };
},
```

`strike.system.damage.parts` is `undefined` in dnd5e 5.2.5. `deepClone(undefined)` returns `undefined`. Calling `.push()` on `undefined` throws `TypeError: Cannot read properties of undefined (reading 'push')`.

This was confirmed by directly calling `MODIFICATIONS.empoweredStrikes.patch(strike, "force")` in the browser console against the live Manifestation Strike item. The error is:

```
TypeError: Cannot read properties of undefined (reading 'push')
```

**Suggested fix:** Rewrite the patch to work with the dnd5e 5.2.5 damage schema. The Empowered Strikes modification should add a damage formula entry to `system.damage.parts` (the V13 additional-damage-parts array, distinct from the old `parts` format). The exact structure depends on whether dnd5e 5.2.5 uses `system.damage.parts` as an array for supplementary damage entries alongside `system.damage.base`. Research the current dnd5e 5.2.5 item data model for the correct field path.

### Tulpa Stats as Summoned (raw template, no adjustments applied)

| Stat | Actual (Template) | Expected (Spell Formula) | Correct? |
|------|-------------------|--------------------------|----------|
| AC | 13 (flat) | 13 + 3 (INT mod) = 16 | NO |
| HP | 40/40 | 40 + 5 x 10 (level) = 90 | NO |
| Proficiency | +2 | +4 (caster's) | NO |
| Spell Attack | +2 | +7 (caster's spell attack) | NO |
| Manifestation Strike to-hit | +2 | +7 | NO |
| Manifestation Strike damage | 2d8 (untyped) | 2d8 force/radiant/psychic | NO |
| Spellcasting Ability | (empty) | int | NO |
| Speed | 30 | 30 | YES |
| Size | Medium | Medium | YES |
| Type | Construct | Construct | YES |

**Note on AC:** The base Tulpa actor has `ac.calc: "flat"` and `ac.flat: 13`. The spell formula says AC = 13 + the spell's level. In dnd5e 5.2.5, summoned actors receive the caster's spellcasting modifier via `flags.dnd5e.summon.mod`. If the AC formula on the compendium actor were `13 + @mod`, the system would resolve `@mod` to the caster's spellcasting modifier (3 for INT 16), yielding 16. Currently the actor template uses a flat value of 13 with no formula, so the spellcasting modifier is ignored.

**Note on HP:** Same pattern. The spell says HP = 40 + 5 per spell level above 4th (for 5th level: 40 + 5 = 45; the test plan says 40 + 5 x level, which at level 10 = 90). The compendium actor has flat HP 40 with no scaling formula. dnd5e's summon system supports `@item.level` for slot-level scaling, but it's not wired up.

**Note on Proficiency and Spell Attack:** dnd5e's summon system provides `@summon.level.prof` for caster proficiency, but the Tulpa actor doesn't reference it. These stay at the template defaults (+2).

### Orphan Cleanup

After each failed cast attempt, a Tulpa token and its synthetic actor persist on the canvas. The `abortAndCleanup()` function fires but cannot find the token (because `locateSummonedTulpa` returns null). Four orphan Tulpa tokens accumulated during testing and were cleaned up manually via `canvas.scene.deleteEmbeddedDocuments("Token", [...])`.

### Chat Card

Only dnd5e's default spell usage chat card appeared. No module-specific cast confirmation card was posted (expected, since the flow aborted before `postCast()`).

---

## Section 3: Modification Correctness

**Result: BLOCKED by `locateSummonedTulpa` failure (Section 2, Bug 1)**

The cast dialog now renders and returns user selections correctly. The selection object includes the chosen damage type and modification slugs. But `applyModifications()` is never called because the token reference is null.

**Static analysis of the modification registry reveals one confirmed crash:**

- **empoweredStrikes** (`item-patch` kind): Will crash with TypeError on `damage.parts` (Bug 3 above). This is confirmed via direct console invocation.

The following modifications are pure AE-insertion and should work once the token lookup is fixed (the AE `changes` arrays use standard dnd5e 5.2.5 data paths):

- **reinforcedForm, vitalSurge, unsettlingForm:** AE changes target well-known keys (`system.attributes.ac.flat`, `system.attributes.hp.max`, `flags.midi-qol.*`).
- **sizeShift variants:** AE sets `system.traits.size` + explicit `tokenDoc.update()` for token dimensions. Should work.
- **multiattack:** Item insertion (feat type). No damage path dependency. Should work.
- **Resistance variants:** AE sets `system.traits.dr.value`. Standard path. Should work.
- **flySpeed, swimSpeed:** AE sets movement keys. Should work.
- **spiderClimb, tremorsense:** AE with standard sensor/movement keys. Should work.
- **Skill affinities:** AE sets `system.skills.*.value`. Should work.
- **telepathicLink:** AE + `postApply` hook that sets flags and posts a chat card. Should work structurally, but the `postApply` function calls `caster.setFlag` and `tulpa.setFlag` which require valid actor references.
- **harrowingPresence** (`aura+marker` kind): Builds an Aura Effects aura AE with `system.appliedEffect` carrying the marker payload. Whether Aura Effects 1.5.2 reads this slot correctly is unverified (noted as a known limitation since v0.1.0).
- **relentless:** Pure AE with empty changes array. The actual behavior comes from the `armRelentlessWatcher()` call in `cast-flow.js`, not the AE itself.

**Bottom line:** Once Bug 1 is fixed, most modifications should work. Bug 3 will crash empoweredStrikes specifically. The damage type setting (Bug 2) will silently fail for all casts.

---

## Section 4: Harrowing Presence

**Result: BLOCKED by Section 2 Bug 1**

The Harrowing Presence modification is never applied, so the Aura Effects aura is never created. The `dnd5e.combatTurnStart` hook handler (`harrowing-presence-hook.js`) has nothing to read.

**Static review of the hook handler (lines 8-29):**

The handler checks for an `inHarrowingAura` marker flag on the turn-starting actor, reads the `auraDC`, and calls `actor.rollSavingThrow({ ability: "wis", target: dc })`. On failure, it creates a "Frightened (Harrowing Presence)" AE with `statuses: ["frightened"]` and `dae.specialDuration: ["turnStart"]`.

**Risk:** `actor.rollSavingThrow()` is the dnd5e 5.2.5 API. The parameter shape `{ ability: "wis", target: dc }` needs live verification -- dnd5e has changed its save-rolling API across versions.

**Still unverified since v0.1.0:** Whether Aura Effects 1.5.2's `system.appliedEffect` slot correctly propagates the marker flags (`inHarrowingAura`, `auraDC`) to in-range hostile tokens.

---

## Section 5: Shared Initiative

**Result: BLOCKED by Section 2 Bug 1**

`alignTulpaInitiative()` was never called. The code (setting Tulpa initiative to caster's initiative minus 0.01) was not exercised.

**Static review note:** The `onCombatStart` handler (lines 21-35 of `initiative.js`) uses `fromUuidSync(summon.origin)` where `summon.origin` is the item UUID. `fromUuidSync` with an item UUID returns the Item document, not the Actor. The handler then tries `caster.id` on the Item, which IS a valid property (Items have `.id`), but then searches `combat.combatants.find(c => c.actorId === caster.id)`. Since `caster.id` is an Item ID and `combatant.actorId` is an Actor ID, this will never match.

This is the same UUID-vs-item-UUID pattern as Bug 1 but in the initiative module.

---

## Section 6: Relentless

**Result: BLOCKED by Section 2 Bug 1**

The Relentless watcher was never armed. `restoreRelentlessWatchers()` ran at `ready` but found no anchors to restore.

**Static review of `relentless-watcher.js`:** The `preUpdateActor` hook intercepts HP changes, clamps to 1, sets `relentlessUsed` flag, disarms the watcher, posts a chat card, and plays an animation. The logic is clean and should work once armed. The `playRelentless` animation uses the same Sequencer pattern as `playManifest` and `playDismiss`, so the same asset-availability caveat applies.

---

## Section 7: Dismissal Triggers

**Result: PARTIAL (upgraded from BLOCKED)**

The anchor AE was never created via the normal cast flow (Bug 1 blocks that). However, the dismiss flow was tested by manually invoking the `deleteActiveEffect` handler against a test AE that was created programmatically with the correct module flags.

### What was tested

A synthetic anchor AE was created on the caster with `flags["manifest-tulpa"].tulpaUuid` pointing to an existing Tulpa token's actor UUID. The AE was then deleted, triggering the `onDeleteActiveEffect` handler.

**Observed behavior:**

1. The handler correctly identified the AE as an anchor (via `tulpaUuid` flag check). PASS.
2. `fromUuid(tulpaUuid)` resolved to the Tulpa actor. PASS.
3. `tulpa.getActiveTokens()[0]` found the token on canvas. PASS.
4. `unarmRelentlessWatcher(tulpaUuid)` ran without error (no watcher was armed, so it was a no-op). PASS.
5. `endAuraEffect(tulpaUuid)` ran without error. PASS.
6. `playDismiss(token, castConfig.damageType)` was called. **The Sequencer animation hung for 45+ seconds.** The `await` never resolved within the test timeout. FAIL.
7. After the animation timeout, the token WAS deleted (`token.document.delete()` ran). PASS.
8. `postDismiss()` posted a chat card. PASS.

### Bug 4 (High): `playDismiss` animation hangs

**File:** `animations.js`, lines 24-38

The dismiss animation uses Sequencer with `.waitUntilFinished(-200)`, which tells Sequencer to wait until the effect finishes playing minus 200ms. If the animation asset (`jb2a.magic_signs.circle.02.conjuration.outro.purple` for force type) is not found or fails to load, the Sequencer promise never resolves.

The animation IS wrapped in a try/catch, but the catch only fires on a thrown error, not on an indefinitely pending promise. The `await` hangs forever.

**Impact:** When a Tulpa is dismissed, there is a 45+ second delay before the token is removed from the canvas. The dismiss DOES eventually complete (the token is deleted and the chat card is posted), but the user experiences a very long hang.

**Suggested fix:** Add a timeout wrapper around the Sequencer play call:

```javascript
export async function playDismiss(token, damageType) {
  if (!globalThis.Sequencer) return;
  const p = PRESETS[damageType];
  if (!p) return;
  try {
    await Promise.race([
      new Sequence()
        .effect()
          .file(p.dismiss.asset)
          .atLocation(token)
          .scaleToObject(p.dismiss.scale)
          .fadeIn(p.dismiss.fadeIn)
          .fadeOut(p.dismiss.fadeOut)
          .waitUntilFinished(-200)
        .play(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("animation timeout")), 5000)),
    ]);
  } catch (err) { warn(err, "dismiss"); }
}
```

This caps the animation wait at 5 seconds. If assets are missing or the effect stalls, the dismiss flow continues without further delay.

**Investigation note:** The hang may be caused by the animation asset not being indexed by Sequencer, or by `autoanimations` being installed but not active. Verify that the jb2a asset paths in `animation-presets.js` are valid Sequencer database keys for jb2a_patreon 0.6.7.

### Dismissal triggers not tested

The five specific dismissal triggers were not individually tested because the anchor AE was created manually (not through the cast flow). The trigger routing logic in `inferReason()` and the `preDeleteToken` reverse-lookup were not exercised end-to-end.

---

## Section 8: Session Reload

**Result: BLOCKED by Section 2 Bug 1**

No Relentless watcher was ever armed, so `restoreRelentlessWatchers()` at `ready` has nothing to restore. Cannot verify re-arming behavior.

---

## Console Errors and Warnings Log

### Module-specific errors

| # | Error | Source | Count | Impact |
|---|-------|--------|-------|--------|
| 1 | `TypeError: Cannot read properties of undefined (reading 'push')` | `empoweredStrikes.patch` in `modification-registry.js` | 1 (console invocation) | CRITICAL -- crashes empoweredStrikes modification |
| 2 | `TypeError: Cannot read properties of undefined (reading '_updatePosition')` | Foundry ApplicationV2 framework | 3 | LOW -- cosmetic, from rapid dialog open/close |

### Module startup log (correct behavior)

```
manifest-tulpa | init
Foundry VTT | Loaded localization file modules/manifest-tulpa/lang/en.json
Foundry VTT | Constructed index of manifest-tulpa.manifest-tulpa-spells Compendium containing 1 entries
manifest-tulpa | ready
```

### Other module errors (NOT from manifest-tulpa)

- `lib-df-buttons(13.1.1)`: TypeError on `ControlManager.render`
- `levels`: V1 Application framework deprecation warning
- `token-quips`: Global `KeyboardManager` deprecation warning
- `bbmm`: Global `FilePicker` deprecation warning (3 instances)
- `theripper-premium-hub`: Global `renderTemplate` deprecation warning

None impact manifest-tulpa.

---

## Comparison: v0.1.3 vs v0.1.4 vs v0.1.5

| Finding | v0.1.3 | v0.1.4 | v0.1.5 |
|---------|--------|--------|--------|
| `{{in}}` Handlebars helper crash | BROKEN | FIXED | FIXED |
| Template two-root-element crash | LATENT | BROKEN | **FIXED** |
| `module.json` download URL stale | BROKEN | FIXED | FIXED |
| Hook accumulation on reload | BROKEN | FIXED | FIXED |
| Spell range shows "Self" | BROKEN | FIXED | FIXED |
| Material component text mismatch | BROKEN | FIXED | FIXED |
| Vestigial Tether feature | PRESENT | REMOVED | REMOVED |
| Cast dialog renders | NO | NO | **YES** |
| `locateSummonedTulpa` UUID mismatch | LATENT | LATENT | **EXPOSED** |
| `damage.parts` format wrong | LATENT | LATENT | **EXPOSED** |
| `empoweredStrikes.patch` crash | LATENT | LATENT | **CONFIRMED** |
| `playDismiss` animation hangs | LATENT | LATENT | **OBSERVED** |
| AC formula missing `@mod` | LATENT | LATENT | **OBSERVED** |
| HP formula missing level scaling | LATENT | LATENT | **OBSERVED** |
| Cast flow completes end-to-end | NO | NO | NO |
| Any downstream feature works | NO | NO | NO |

**Pattern:** Each release peels back one layer of the onion. v0.1.3 hit the helper error. v0.1.4 hit the template structure error. v0.1.5 hits the runtime data-model mismatches. The bugs in the "EXPOSED" row were always present in the code but could never run because earlier crashes blocked them.

---

## Priority Fix Order

### 1. CRITICAL -- Fix `locateSummonedTulpa` UUID comparison (Bug 1)

**File:** `cast-flow.js`, lines 91-99

This is the single gate that blocks ALL post-dialog functionality. The fix is a one-line change: replace `=== caster.uuid` with a comparison that accounts for the item UUID format dnd5e uses for summon origins.

Options:
- `origin?.startsWith(caster.uuid)` -- matches `Actor.xxx.Item.yyy` against `Actor.xxx`
- Pass `activity.item.uuid` into the function and compare directly

Also check `initiative.js` line 28 (`fromUuidSync(summon.origin)`) for the same pattern -- it will return an Item, not an Actor.

Also check `dismiss-flow.js` line 47 (`onPreDeleteToken`) -- same origin comparison pattern.

### 2. CRITICAL -- Fix damage schema (`damage.parts` to `damage.base`)  (Bugs 2 and 3)

**Files:** `cast-flow.js` lines 101-108, `modification-registry.js` lines 108-114

dnd5e 5.2.5 stores primary weapon damage at `system.damage.base` with `.types` as an array. The old `system.damage.parts` format does not exist.

- `setStrikeDamageType`: Change `damage.parts[0].types` to `damage.base.types`
- `empoweredStrikes.patch`: Rewrite to use the current damage parts schema. In dnd5e 5.2.5, additional damage entries may use `system.damage.parts` as a supplementary array (distinct from the old meaning). Research the exact structure by inspecting a weapon item's `system.damage` in the browser console.

### 3. HIGH -- Fix Tulpa actor compendium formulas

**File:** The Tulpa actor in the `manifest-tulpa-actors` compendium pack

The raw actor template uses flat values for AC (13), HP (40), and proficiency (+2) with no formulas referencing `@mod`, `@item.level`, or `@summon.level.prof`. dnd5e's summon system injects these roll data variables automatically, but they are only useful if the actor's formulas reference them.

- **AC:** Change from flat 13 to a formula like `13 + @mod`
- **HP:** Change from flat 40 to a formula incorporating spell level scaling
- **Proficiency:** Wire up `@summon.level.prof` if supported, or apply it via the cast flow

This may require modifying the compendium source and rebuilding packs.

### 4. HIGH -- Add timeout to animation calls (Bug 4)

**File:** `animations.js`

Wrap all three animation functions (`playManifest`, `playDismiss`, `playRelentless`) in `Promise.race` with a reasonable timeout (3-5 seconds). This prevents missing assets from hanging the entire flow.

Also verify that the jb2a asset paths in `animation-presets.js` are valid for jb2a_patreon 0.6.7. The Sequencer database key format may differ from what's hardcoded.

### 5. MEDIUM -- Fix `onCombatStart` UUID resolution

**File:** `initiative.js`, lines 21-35

`fromUuidSync(summon.origin)` returns an Item document (because `origin` is an item UUID), but the code treats it as an Actor and compares `.id` against `combatant.actorId`. The fix should extract the actor UUID from the origin string or use the Item's parent actor.

### 6. MEDIUM -- Verify Harrowing Presence Aura Effects integration

Once bugs 1-3 are fixed, test that:
- Aura Effects 1.5.2 reads `system.appliedEffect` from the aura AE
- The marker AE propagates `inHarrowingAura` and `auraDC` flags to in-range hostiles
- `actor.rollSavingThrow({ ability: "wis", target: dc })` works in dnd5e 5.2.5

### 7. LOW -- Verify `rollSavingThrow` API shape

**File:** `harrowing-presence-hook.js`, line 16

The call `actor.rollSavingThrow({ ability: "wis", target: dc })` needs verification against dnd5e 5.2.5's actual API. dnd5e has changed its rolling API across major versions.

### 8. LOW -- Investigate orphan token cleanup

After a dialog cancel or cast flow abort, the `abortAndCleanup()` function tries to delete the Tulpa token, but if `locateSummonedTulpa` returns null (Bug 1), the orphan persists. Once Bug 1 is fixed, the abort path should also work. But consider adding a fallback cleanup that searches by actor name or compendium source.

---

## Appendix A: Files Reviewed

| File | Purpose | Review Notes |
|------|---------|--------------|
| `modules/init.js` | Hook registration | Correct. Guard works. |
| `modules/cast-flow.js` | Cast orchestration | **BUG 1:** UUID mismatch in `locateSummonedTulpa`. **BUG 2:** `damage.parts` schema wrong in `setStrikeDamageType`. |
| `modules/cast-dialog.js` | ApplicationV2 dialog | Template fix landed. Dialog renders. |
| `templates/cast-dialog.hbs` | Dialog template | Single-root fix (`<div class="mt-cast-body">`) works. |
| `modules/modification-registry.js` | Modification definitions | **BUG 3:** `empoweredStrikes.patch` crashes on `damage.parts`. Other mods look structurally sound. |
| `modules/dismiss-flow.js` | Dismissal funnel | Logic works but animation hangs (BUG 4). |
| `modules/relentless-watcher.js` | HP clamp watcher | Not exercised. Static review: clean. |
| `modules/initiative.js` | Shared initiative | **ISSUE:** `fromUuidSync(origin)` returns Item, not Actor. |
| `modules/harrowing-presence-hook.js` | Combat turn save | Not exercised. Static review: `rollSavingThrow` API unverified. |
| `modules/animations.js` | Sequencer wrappers | **BUG 4:** No timeout. `playDismiss` hangs. |
| `modules/animation-presets.js` | jb2a asset paths | Asset key validity unverified against jb2a_patreon 0.6.7. |
| `modules/constants.js` | Module constants | Correct. |
| `modules/chat-cards.js` | Chat card posting | Not exercised (flow never reaches it). |
| `module.json` | Module manifest | Version 0.1.5, download URL correct. |

## Appendix B: What Changed from v0.1.4

The v0.1.5 release contains exactly one change: `templates/cast-dialog.hbs` wraps its `<section>` and `<footer>` in `<div class="mt-cast-body">`. No JavaScript files changed. This fix was identified as "Option A" in the v0.1.4 test report.

## Appendix C: Test Environment Details

- **Foundry URL:** `http://192.168.1.188:8678/`
- **World:** "Patreon Map Building"
- **Test Actor:** "Player Character" -- Wizard 10, Half-Orc Mythalkeeper
  - INT 16 (+3), Proficiency +4, Spell DC 15, Spell Attack +7
  - Spellcasting ability: Intelligence
  - 5th-level slots: 2
- **autoanimations note:** The module is installed (present in `modules/`) but NOT active in the world settings. This may contribute to the animation hang if manifest-tulpa's Sequencer calls expect autoanimations to be mediating asset resolution. However, the animation code calls Sequencer directly with jb2a database keys and does not reference autoanimations at any point.

---

## Sign-off

Tester: Claude (automated)
Supervisor: Mr. Beasley
Date: 2026-05-25
Foundry build: V13.351
dnd5e version: 5.2.5
Module version: 0.1.5

---

## v0.1.6 Resolution Addendum

**Date:** 2026-05-25
**Module Version:** 0.1.6
**Released as:** `v0.1.6` tag

The findings above are addressed in v0.1.6. The report body is preserved unchanged for historical accuracy; this addendum maps each finding to the fix.

### Resolved findings

| # | Finding | Status | Fix location |
|---|---------|--------|--------------|
| Bug 1 | `locateSummonedTulpa` UUID mismatch (actor vs. item UUID) | **FIXED** | [modules/cast-flow.js:97-111](../../../modules/cast-flow.js#L97-L111) — fallback now matches `flags.dnd5e.summon.origin` by `startsWith` against `${caster.uuid}.` |
| Bug 1 (parallel) | `initiative.js#onCombatStart` treated `summon.origin` Item UUID as Actor UUID | **FIXED** | [modules/initiative.js:9-13,33-49](../../../modules/initiative.js#L9-L49) — new `casterUuidFromOrigin` regex helper extracts `Actor.<id>` prefix before `fromUuidSync` |
| Bug 1 (parallel) | `dismiss-flow.js#onPreDeleteToken` same actor-vs-item UUID issue | **FIXED** | [modules/dismiss-flow.js:42-60](../../../modules/dismiss-flow.js#L42-L60) — inline regex extracts the `Actor.<id>` prefix before resolving the caster |
| Bug 2 | `setStrikeDamageType` wrote to non-existent `system.damage.parts` | **FIXED** | [modules/cast-flow.js:113-126](../../../modules/cast-flow.js#L113-L126) — now iterates `system.activities.<id>.damage.parts` for each activity on the strike |
| Bug 3 | `empoweredStrikes.patch` TypeError on `damage.parts.push` | **FIXED** | [modules/modification-registry.js:106-129](../../../modules/modification-registry.js#L106-L129) — patch walks every activity and returns a per-activity diff; unit test updated to assert the per-activity shape |
| Bug 4 | `playDismiss` (and `playManifest`/`playRelentless`) hang indefinitely on missing Sequencer assets | **FIXED** | [modules/animations.js:6-86](../../../modules/animations.js#L6-L86) — `withTimeout` wraps every `.play()` in a 5-second `Promise.race`; existing catch handler downgrades the timeout to a console warning |
| AC formula observation | Tulpa AC stayed at flat 13 (no spellcasting modifier) | **FIXED** | [modules/cast-flow.js:138-165](../../../modules/cast-flow.js#L138-L165) — new `applyCasterStats` step writes `13 + spellMod` imperatively (avoids editing the compendium source) |
| HP formula observation | Tulpa HP stayed at flat 40 (no level scaling) | **FIXED** | Same `applyCasterStats` step — writes `40 + 5 × casterLevel` to both `hp.max` and `hp.value` |
| Proficiency observation | Tulpa proficiency stayed at +2 (template default) | **FIXED** | Same step — `system.details.cr` is set to a CR that yields the caster's prof bonus via `profToCR` inverse mapping (prof 2→CR 1, 3→5, 4→9, 5→13, 6→17) |
| Spell-attack / spellcasting observation | Tulpa spellcasting ability empty, save DC at template default | **FIXED** | Same step — sets `system.attributes.spellcasting`, `system.attributes.spelldc`, and mirrors STR/CON save proficiencies from the caster |
| §4 risk | `actor.rollSavingThrow` return-shape (Array<D20Roll> vs. single roll) in dnd5e 5.2.5 | **FIXED** | [modules/harrowing-presence-hook.js:8-40](../../../modules/harrowing-presence-hook.js#L8-L40) — call wrapped in try/catch, return value normalized via `Array.isArray(result) ? result[0] : result` |

### Still requiring live Foundry verification

These items in the report were BLOCKED by Bug 1 and could not be exercised end-to-end. The static analysis paths through them are now unblocked, but they still need a real-world smoke test before they can be marked PASS:

- §3 Modification correctness for every non-`empoweredStrikes` modification (especially the `aura+marker` Harrowing Presence path, where Aura Effects 1.5.2's `system.appliedEffect` slot remains unverified — known limitation since v0.1.0).
- §4 Harrowing Presence end-to-end propagation + save resolution.
- §5 Shared initiative with the corrected UUID resolution.
- §6 Relentless watcher firing + animation.
- §7 All five dismissal triggers individually (only the synthetic-anchor delete path was exercised in v0.1.5).
- §8 Session reload watcher restoration.

The next smoke test should run the v0.1.6-released module against the same wizard 10 / INT 16 test character and confirm the items above. A new v0.1.6 report should be added under [docs/superpowers/test-plans/](../) when that test is run.

### Out of scope for v0.1.6

- The compendium-side `_source/manifest-tulpa-actors/Actor.tulpa.json` was deliberately *not* edited. The v0.1.5 report suggested rewriting AC to `13 + @mod`, but `ac.calc: "flat"` ignores formulas — the imperative `applyCasterStats` step in `cast-flow.js` is the correct fix and keeps the pack untouched (no `_key` regression risk, no rebuild needed).
- The minor ApplicationV2 `_updatePosition` warnings noted in R4's "Console note" are Foundry framework-internal and not addressed here.
- jb2a asset-key validation against jb2a_patreon 0.6.7 (§4 investigation note) is unchanged — the new animation timeout makes a missing asset non-fatal, but the asset paths in `animation-presets.js` are still unverified.

### Test + validate evidence

Before tagging v0.1.6:
- `npm test` — all 30 unit tests pass (including the updated `empoweredStrikes` test that asserts the per-activity diff shape).
- `node scripts/validate-pack.js` — all pre-release pack assertions pass.

No `_source/` JSON changed, so packs do not need a manual rebuild; the `.github/workflows/release.yml` tag-driven pipeline still rebuilds them from source on push of `v0.1.6`.
