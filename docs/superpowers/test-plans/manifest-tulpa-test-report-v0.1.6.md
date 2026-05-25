# Manifest Tulpa v0.1.6 -- Smoke Test Report

**Date:** 2026-05-25
**Tester:** Claude (automated, supervised by Mr. Beasley)
**Environment:** FoundryVTT V13.351, dnd5e 5.2.5
**Module Version:** 0.1.6
**Test Character:** "Player Character" (Wizard 10, Half-Orc Mythalkeeper, INT 16, Proficiency +4, Spell DC 15, Spell Attack +7)
**Test Plan:** `docs/superpowers/test-plans/2026-05-24-manifest-tulpa-smoke.md`
**Source of Truth:** `manifest-tulpa.txt`
**Previous Reports:** v0.1.3 (`manifest-tulpa-test-report-2026-05-25.md`), v0.1.4 (`manifest-tulpa-test-report-v0.1.4.md`), v0.1.5 (`manifest-tulpa-test-report-v0.1.5.md`)

### Dependency Versions (recorded from live Foundry instance)

| Dependency | v0.1.6 Version | v0.1.5 Version | Change |
|------------|---------------|---------------|--------|
| midi-qol | 13.0.58 | 11.6.39 | MAJOR UPGRADE (v11 to v13) |
| dae | 13.0.26 | 11.5.3 | MAJOR UPGRADE (v11 to v13) |
| times-up | 13.1.9 | 13.0.1 | Minor upgrade |
| sequencer | 3.6.11 | 3.3.6 | Minor upgrade |
| portal-lib | 3.0.4 | 13.0.2 | Version scheme changed |
| auraeffects | 1.5.2 | 1.5.2 | Same |
| jb2a_patreon | 0.8.7 | 0.6.7 | Minor upgrade |
| autoanimations | 6.8.3 (NOT ACTIVE) | 6.8.3 (NOT ACTIVE) | Same (inactive) |

**Note on dependency upgrades:** midi-qol and dae both jumped from v11 to v13 builds between the v0.1.5 and v0.1.6 test runs. This is a significant environment change. Any midi-qol or dae-dependent behavior that worked differently in this test may be attributable to the dependency upgrade rather than manifest-tulpa code changes.

---

## Executive Summary

**Overall Result: MAJOR PROGRESS -- first version where the cast flow completes end-to-end, but six bugs prevent full functionality.**

v0.1.6 is a landmark release. For the first time in any version, the Manifest Tulpa spell completes its full cast flow: the dnd5e slot dialog works, the token places via Portal, the custom cast dialog opens and returns selections, `locateSummonedTulpa` finds the token, `applyCasterStats` writes correct caster-derived stats, and modifications apply. The five critical bugs from v0.1.5 (UUID mismatch, damage schema, empoweredStrikes crash, animation timeout, missing stat formulas) are all resolved.

Nine of ten modifications work correctly. Caster-derived stats (AC, HP, proficiency, spellcasting ability, spell DC, CR) are all correct. Relentless HP clamping works and survives session reload. The dismiss animation no longer hangs.

However, the expanded test coverage that this working cast flow enables has revealed six bugs, most of which were previously untestable:

1. **Bug 5 (Critical):** Manifestation Strike has zero activities in the compendium template, making it non-functional as a weapon and blocking empoweredStrikes and damage type assignment.
2. **Bug 6 (High):** Harrowing Presence aura creates a visual ring but propagates no marker to hostile tokens because the aura AE's `changes` array is empty.
3. **Bug 7 (Medium):** Shared Initiative hook does not align the Tulpa to the caster's initiative.
4. **Bug 8 (Low):** Dismissal reason misclassification -- re-cast shows "duration ended" instead of "recast."
5. **Bug 9 (High):** Zero HP on the Tulpa does not trigger dismissal.
6. **Bug 10 (High):** Caster death removes the anchor AE but does not reliably cascade to Tulpa token deletion.

**Progress vs. v0.1.5:** v0.1.5 never got past the `locateSummonedTulpa` call. v0.1.6 runs the entire cast flow, applies stats and mods, and exercises every downstream feature for the first time. The bugs above are real runtime issues in code that has never been tested in a live environment before, not regressions from working behavior.

---

## Test Results Summary

| # | Test Area | Result | Blocker? | Change from v0.1.5 |
|---|-----------|--------|----------|---------------------|
| R1 | Spell card material + range | PASS | -- | Same |
| R2 | Tulpa actor features (no Tether) | PASS | -- | Same |
| R3 | Summon placement bounded to 30ft | PASS | -- | Same |
| R4 | Cast dialog renders without error | PASS | -- | Same |
| R5 | Hook accumulation guard | PASS | -- | Same |
| R6 | Token found + anchor AE created | PASS | -- | **FIXED** (was FAIL) |
| R7 | Manifestation Strike activities | FAIL | YES | **NEW** (was BLOCKED) |
| R8 | Damage type on strike activities | FAIL | -- | **NEW** (was BLOCKED) |
| R9 | Dismiss animation timeout | PASS | -- | **FIXED** (was FAIL) |
| R10 | Caster-derived stats | PASS | -- | **FIXED** (was FAIL) |
| R11 | Harrowing Presence hook no TypeError | PASS (silent) | -- | **NEW** (no crash, but never fires) |
| 3 | Cast Flow Happy Path | PARTIAL PASS | -- | **UPGRADED** (was FAIL) |
| 4 | Modification Correctness | 9/10 PASS | -- | **UPGRADED** (was BLOCKED) |
| 5 | Harrowing Presence | FAIL | -- | **NEW** (was BLOCKED) |
| 6 | Shared Initiative | FAIL | -- | **NEW** (was BLOCKED) |
| 7 | Relentless | PASS | -- | **UPGRADED** (was BLOCKED) |
| 8 | Dismissal Triggers | PARTIAL | -- | **UPGRADED** (was PARTIAL) |
| 9 | Session Reload | PASS | -- | **UPGRADED** (was BLOCKED) |

---

## Phase 1: Regression Checks (R1-R5)

### R1: Spell Card Material + Range

**Result: PASS**

Opened the Player Character spell sheet. Manifest Tulpa spell card shows: Range "30 Feet", Components "V, S, M" with material "(a crystal shard imbued with your psychic resonance, worth at least 100 GP)", Consumed "No", Duration "1 Hour", Casting Time "1 Action". All match `manifest-tulpa.txt`.

**Minor UX issue:** The material component displays with double parentheses: "((a crystal shard...))". The outer set comes from dnd5e's display formatting and the inner from the spell data. Cosmetic only.

No change from v0.1.5.

### R2: Tulpa Actor Features (No Tether)

**Result: PASS**

Tulpa actor from the `manifest-tulpa-actors` compendium has one feature item: Manifestation Strike. No vestigial Tether feat. Correct.

No change from v0.1.5.

### R3: Summon Placement Bounded to 30ft

**Result: PASS**

Cast Manifest Tulpa, token placement was bounded to 30ft by dnd5e's Summon Activity + Portal integration. Placement outside the radius is rejected.

No change from v0.1.5.

### R4: Cast Dialog Renders Without Console Error

**Result: PASS**

Cast dialog opens after token placement. No `Missing helper: "in"`, no `Template part "body" must render a single HTML element` errors. The dialog renders damage type radios, grouped modification checkboxes, slot counter, and Confirm/Cancel buttons.

No change from v0.1.5.

### R5: Hook Accumulation Guard

**Result: PASS**

`globalThis.__manifestTulpaHooksRegistered = true`. `Hooks.events["dnd5e.postUseActivity"]` has 3 total listeners (includes midi-qol and dae). The guard prevents manifest-tulpa from registering duplicates.

No change from v0.1.5.

---

## Phase 2: Regression Checks (R6-R11)

### R6: Token Found + Anchor AE Created

**Result: PASS -- v0.1.5 Bug 1 resolved**

After casting and confirming the dialog, `locateSummonedTulpa` successfully finds the Tulpa token on canvas. The function now matches `flags.dnd5e.summon.origin` by `startsWith` prefix instead of strict equality, correctly handling the item UUID format (`Actor.xxx.Item.yyy` matches against `Actor.xxx`).

The caster's sheet shows the "Manifest Tulpa (active)" anchor AE with:
- `tulpaUuid` pointing to the spawned token's actor
- `castConfig` storing the selected damage type and modifications
- DAE `specialDuration: [zeroHP, isDeath]` for lifecycle management

This was the single gate that blocked ALL post-dialog functionality in v0.1.5. Its fix unlocks the entire downstream feature set.

### R7: Manifestation Strike Activities

**Result: FAIL -- Bug 5 (Critical, pre-existing)**

The Manifestation Strike weapon item on the spawned Tulpa has `system.activities = {}` (empty object). In dnd5e 5.2.5, weapons need Attack activities (melee and/or ranged) defined under `system.activities` to be usable. Without activities, the weapon cannot be rolled for attacks.

This was verified both on the compendium template actor and on the spawned Tulpa after a cast. `activityCount = 0`, `activityKeys = []`. The weapon is non-functional.

This is a pre-existing issue that was always present in the compendium data but was masked by the cast dialog crashes in v0.1.3-v0.1.5. Now that the cast flow completes, the issue is exposed.

See **Bug 5** in the Findings section below.

### R8: Damage Type on Strike Activities

**Result: FAIL -- blocked by Bug 5**

`damage.base.types = []` (empty). The `setStrikeDamageType` function targets `system.activities.<id>.damage.parts[0].types`, but there are no activities to hold the damage type. Even the base damage type was never configured.

The v0.1.6 code for `setStrikeDamageType` is correctly written for the dnd5e 5.2.5 data model (iterating `system.activities`), but it has nothing to iterate because the compendium actor's Manifestation Strike has no activities.

### R9: Dismiss Animation Timeout

**Result: PASS -- v0.1.5 Bug 4 resolved**

Dismissed a Tulpa via re-cast. Token disappeared promptly (within the 5-second timeout). Console showed `dismiss animation timed out after 5000ms` warning (expected when autoanimations is inactive and jb2a asset keys are not indexed by Sequencer). The `Promise.race` wrapper prevents indefinite hangs.

Massive improvement over v0.1.5's 45+ second hang.

### R10: Caster-Derived Stats

**Result: PASS -- v0.1.5 stat formula observations resolved**

All caster-derived stats on the spawned Tulpa are correct:

| Stat | Expected | Actual | Correct? |
|------|----------|--------|----------|
| AC | 13 + 3 (INT mod) + 2 (Reinforced Form) = 18 | 18 | YES |
| HP max | 40 + 5 x 10 (level) + 30 (Vital Surge) = 120 | 120 | YES |
| HP current | 120 | 120 | YES |
| Proficiency | +4 (caster's) | +4 | YES |
| CR | 9 (maps to prof +4) | 9 | YES |
| Spellcasting Ability | INT (caster's) | INT | YES |

The new `applyCasterStats` step correctly writes `13 + spellMod` for AC, `40 + 5 x casterLevel` for HP, and sets CR via the `profToCR` inverse mapping. This is the first version where any of these stats have been correct.

**Comparison to v0.1.5:** In v0.1.5, the raw template showed AC=13, HP=40, Prof=+2, Spellcasting=(empty). All were wrong. Now all are correct.

### R11: Harrowing Presence Hook No TypeError

**Result: PASS (silent) -- v0.1.5 risk verified**

No `TypeError` from `harrowing-presence-hook.js` during combat testing. The `rollSavingThrow` call is wrapped in try/catch and the return value is normalized via `Array.isArray`.

However, the hook never actually fires because the Harrowing Presence aura marker is never propagated to hostile tokens (Bug 6). The hook technically passes its regression check (no crash) but the feature is non-functional.

---

## Phase 3: Cast Flow Happy Path

**Result: PARTIAL PASS -- first successful end-to-end cast flow in any version**

### Test Procedure

1. Cast Manifest Tulpa at slot level 5.
2. dnd5e slot dialog appeared. Submitted. Slot consumed.
3. Tulpa token appeared on cursor. Placed via Portal within 30ft.
4. Custom cast dialog opened. Selected psychic damage type, Reinforced Form, Vital Surge (2/2 slots).
5. Clicked "Manifest Tulpa" confirm button.
6. `locateSummonedTulpa` found the token. `applyCasterStats` ran. Modifications applied.

### What worked

- Slot consumed correctly (5th level)
- Token placed via Portal within 30ft range
- Cast dialog rendered with all options
- Custom chat card posted: "Player Character manifests a Tulpa. Damage: psychic Slot: 5 Modifications: reinforcedForm, vitalSurge"
- Anchor AE "Manifest Tulpa (active)" created on caster with correct `castConfig` and DAE `specialDuration`
- All caster-derived stats correct (see R10)
- Reinforced Form (+2 AC) and Vital Surge (+30 HP) applied correctly

### What did not work

- Manifestation Strike has no activities, making it non-functional for attacks (Bug 5)
- No manifest animation observed (jb2a_patreon present but autoanimations inactive; Sequencer likely timed out silently)

### Comparison to prior versions

| Milestone | v0.1.3 | v0.1.4 | v0.1.5 | v0.1.6 |
|-----------|--------|--------|--------|--------|
| dnd5e slot dialog | YES | YES | YES | YES |
| Token placement | YES | YES | YES | YES |
| Cast dialog renders | NO | NO | YES | YES |
| `locateSummonedTulpa` finds token | NO | NO | NO | **YES** |
| `applyCasterStats` runs | NO | NO | NO | **YES** |
| Stats correct | NO | NO | NO | **YES** |
| Modifications applied | NO | NO | NO | **YES** |
| Anchor AE created | NO | NO | NO | **YES** |
| Chat card posted | NO | NO | NO | **YES** |
| End-to-end cast success | NO | NO | NO | **YES** |

---

## Phase 4: Modification Correctness

**Result: 9/10 PASS, 1 FAIL**

Each modification was tested by casting with that mod selected, then inspecting the Tulpa.

| Modification | Expected | Actual | Result |
|---|---|---|---|
| Reinforced Form | AC +2 | AC = 18 (13 + 3 INT mod + 2 reinforced) | PASS |
| Vital Surge | HP +30 | HP = 120 (40 + 50 + 30) | PASS |
| Unsettling Form | midi-qol disadvantage on Wis/Cha saves | `flags.midi-qol.grants.disadvantage.save.wis=1`, `.cha=1` | PASS |
| Empowered Strikes | Extra 1d8 of chosen type | No activities on Manifestation Strike to receive the damage entry | FAIL (Bug 5) |
| Size Shift: Large | Size "lg", token 2x2 | `system.traits.size = "lg"`, token 2x2 on canvas | PASS |
| Multiattack | "Multiattack" feat item | Feat present with correct description | PASS |
| Resistance: Fire | DR includes fire | `system.traits.dr.value` includes "fire" | PASS |
| Fly Speed | Fly = walking speed | `movement.fly = 30` (equals walk 30) | PASS |
| Skill Affinity: Stealth | Proficient in Stealth | `system.skills.ste.value = 1` | PASS |
| Telepathic Link | Chat card + caster flag | Chat card "Telepathic Link established", caster `flags["manifest-tulpa"].telepathicLink = true` | PASS |

**Comparison to v0.1.5:** All ten modifications were BLOCKED in v0.1.5 because the cast flow never completed. This is the first time any modification has been tested in a live environment. The static analysis predictions from the v0.1.5 report were accurate: the nine AE-based modifications all work, and the one that depends on Manifestation Strike activities (empoweredStrikes) fails because of the missing activity data.

---

## Phase 5: Harrowing Presence

**Result: FAIL -- aura visual renders, but marker propagation is non-functional**

### What was tested

1. Cast with Harrowing Presence selected. Aura AE "Harrowing Presence (Aura)" created on Tulpa.
2. Aura AE properties: `type: "auraeffects.aura"`, `distanceFormula: "10"`, `disposition: -1`, `color: #d650a8`, `opacity: 0.25`, `auraDC: 15`.
3. Visual magenta ring rendered correctly on canvas at 10ft radius.
4. Placed a hostile NPC within 5ft of the Tulpa (well within the 10ft aura).
5. Moved the NPC to trigger `collisionType: "move"`.
6. Started combat. Advanced to NPC's turn.

### What worked

- Aura AE created with correct properties
- Visual ring renders with correct color, opacity, and radius
- `auraDC = 15` (matches caster's spell save DC) stored in module flags

### What did not work

- **Marker propagation:** The hostile NPC at 5ft received zero effects. No marker AE appeared on the NPC at any point.
- **Wis save on turn start:** No save rolled when the NPC's turn started. The `combatTurnStart` hook checks for the `inHarrowingAura` flag on the NPC, which was never set because no marker was propagated.
- **Frightened on fail:** Not testable (no save was rolled).
- **Clear on leave aura:** Not testable (no marker was ever applied).

### Root cause analysis (Bug 6)

The aura AE's `changes` array is empty (`changes: []`) and `statuses` array is empty. The `inHarrowingAura` flag and `auraDC` are stored as custom manifest-tulpa flags on the Tulpa's own AE, not as propagatable changes.

Aura Effects 1.5.2 needs actual entries in the `changes` array or `statuses` array of the aura AE to propagate anything to in-range tokens. It reads the aura AE's changes, creates a "marker" AE on each affected token, and copies those changes into the marker. If `changes` is empty, the marker has nothing to carry, and Aura Effects may not create a marker at all.

The v0.1.5 report flagged this as a known unverified risk: "Whether Aura Effects 1.5.2 reads `system.appliedEffect` from the aura AE" and "the marker propagation needs to be re-wired." This test confirms the concern was warranted: the current wiring does not work.

See **Bug 6** in the Findings section.

---

## Phase 6: Shared Initiative

**Result: FAIL**

Cast Manifest Tulpa during active combat. Rolled initiative for the caster (result: 7). The Tulpa rolled initiative independently (result: 5) instead of being set to `caster initiative - 0.01 = 6.99`.

The `combatStart` hook handler for initiative alignment does not appear to be functional. This is consistent with the v0.1.5 static analysis note that the initiative code had the same UUID resolution pattern as Bug 1, though the v0.1.6 addendum says this was fixed with a `casterUuidFromOrigin` regex helper. The fix may not be working as expected, or the hook may not be firing at the right time.

See **Bug 7** in the Findings section.

---

## Phase 7: Relentless

**Result: PASS**

### HP Clamp to 1

Cast with defaults (Relentless is always present). Set Tulpa HP to -10 via direct update. The watcher intercepted the HP change and clamped to 1. Chat card posted: "Tulpa stands at 1 HP -- Relentless triggers!" The `relentlessUsed` flag was set to `true`.

### No Re-trigger

Set Tulpa HP to 0 again. HP stayed at 0. Relentless did not re-trigger (one-time protection working correctly).

**Comparison to v0.1.5:** Relentless was BLOCKED in v0.1.5 because the watcher was never armed. This is the first live verification. Both the clamp and the one-time guard work as designed.

---

## Phase 8: Dismissal Triggers

**Result: PARTIAL -- 3/5 triggers work, 2 fail**

| # | Trigger | Expected | Actual | Result |
|---|---------|----------|--------|--------|
| 1 | Duration (`game.time.advance(3600)`) | Token removed, "duration ended" chat | Token removed, chat posted | PASS (reason was correct in this case) |
| 2 | Zero HP on Tulpa | Token removed, "zeroHP" chat | Tulpa at 0 HP, token remains on canvas. No dismissal. | FAIL (Bug 9) |
| 3 | Caster death | Token removed, "isDeath" chat | Anchor AE removed (DAE specialDuration works). Tulpa token NOT immediately removed. No explicit dismissal chat card. | PARTIAL (Bug 10) |
| 4 | Re-cast | Old Tulpa dismissed, new spawns | Old dismissed, new spawned with fresh stats. But reason shows "duration ended" instead of "recast". | PASS (with wrong reason, Bug 8) |
| 5 | Manual token delete | Token removed, "manual" chat | Token removed, "the token was removed manually" chat posted. | PASS |

### Bug 8: Reason misclassification

When re-casting, the old Tulpa's dismissal chat card says "the spell's duration ended" rather than "recast." The `inferReason()` function appears to classify times-up's AE deletion (which triggers the cascade) as a duration event rather than recognizing that a re-cast is in progress. This is cosmetic but could confuse players.

### Bug 9: Zero HP on Tulpa does not trigger dismissal

The Tulpa remained on canvas at 0 HP. No "Tulpa Dismissed" chat card appeared. The `zeroHP` trigger on the anchor AE's DAE `specialDuration` refers to the *caster* reaching 0 HP (which is Bug 10's territory), not the Tulpa itself. There is no separate watcher or hook that monitors the Tulpa's HP for dismissal purposes. The Relentless watcher catches the first instance (clamping to 1 HP) but after Relentless is consumed, nothing handles subsequent drops to 0.

### Bug 10: Caster death cascade incomplete

Setting the caster to 0 HP and applying the "dead" status correctly triggered DAE's `specialDuration` removal of the "Manifest Tulpa (active)" anchor AE. However, the `deleteActiveEffect` hook handler did not reliably cascade to deleting the Tulpa token. The token was eventually cleaned up (possibly on a subsequent operation or manual intervention), but there was no explicit "caster death" dismissal chat card.

**Comparison to v0.1.5:** The v0.1.5 report tested dismissal partially via a manually created AE. The dismiss flow itself (token deletion, chat card) worked, but only via manual trigger. In v0.1.6, the natural dismissal flow is testable for the first time, and the trigger routing is where the issues lie.

---

## Phase 9: Session Reload

**Result: PASS**

Cast with Relentless. Reloaded the world (full browser refresh). After reload, `manifest-tulpa | init` and `manifest-tulpa | ready` logged correctly. Inflicted killing damage on the Tulpa. HP clamped to 1, Relentless chat card posted. The watcher was re-armed at `ready` by `restoreRelentlessWatchers()`.

**Comparison to v0.1.5:** BLOCKED in v0.1.5. First live verification. Works as designed.

---

## Bug Summary

### Bug 5 (Critical, pre-existing): Manifestation Strike has zero activities

**Severity:** Critical -- the Tulpa's only weapon is non-functional
**Location:** Compendium actor template in `packs/manifest-tulpa-actors`
**First appearance:** Always present, masked by cast dialog crashes in v0.1.3-v0.1.5

The Manifestation Strike weapon item has `system.activities = {}` (empty). In dnd5e 5.2.5, weapons require Attack activities defined under `system.activities` to be rollable. Without them, the weapon has no attack button, no to-hit roll, and no damage roll.

**Impact chain:**
- Weapon cannot be used in combat (no roll button)
- `empoweredStrikes.patch` iterates `system.activities.<id>.damage.parts` and finds nothing
- `setStrikeDamageType` iterates activities and finds nothing
- `damage.base.types = []` (base damage type never configured)

**Suggested fix:** The Manifestation Strike weapon in the compendium pack source needs at least one Attack activity (ideally both melee and ranged, per the spell text). In dnd5e 5.2.5, this means populating `system.activities` with entries of type `AttackActivity` that include `damage.parts` arrays. The cleanest approach:

1. In a test world, create a weapon item manually via the Foundry UI with the desired melee + ranged attack activities and damage (2d8, type array).
2. Export the item's JSON.
3. Replace the Manifestation Strike entry in the compendium source with this JSON.
4. Rebuild the LevelDB pack with `fvtt package pack`.

Alternatively, create the activities programmatically in `applyCasterStats` after the Tulpa spawns, similar to how AC/HP are set imperatively.

### Bug 6 (High): Harrowing Presence aura marker does not propagate

**Severity:** High -- the entire Harrowing Presence feature is non-functional
**Location:** `applyModifications` in `cast-flow.js` (aura+marker construction)
**First appearance:** v0.1.6 (first time the code path was exercised)

The aura AE on the Tulpa has `changes: []` (empty). The `inHarrowingAura` flag and `auraDC` values are stored as custom manifest-tulpa flags on the aura AE itself, but these are not in the `changes` array that Aura Effects 1.5.2 reads and propagates.

Aura Effects 1.5.2 works by reading the aura AE's `changes` array (or `statuses` array), then creating a "marker" AE on each in-range token with those same changes. If `changes` is empty, there is nothing to propagate and no marker is created.

**Suggested fix:** The aura AE's `changes` array must contain the entries that should appear on the marker AE when propagated to in-range tokens. For Harrowing Presence, that means:

```javascript
changes: [
  { key: "flags.manifest-tulpa.inHarrowingAura", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: "true" },
  { key: "flags.manifest-tulpa.auraDC", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: String(spellDC) }
]
```

This way, Aura Effects creates a marker AE on each hostile token with those two flag changes. The `combatTurnStart` hook then reads `flags.manifest-tulpa.inHarrowingAura` from the token's actor (set by the marker AE) and triggers the Wis save.

Research the Aura Effects 1.5.2 documentation or source to confirm the exact schema it expects for `changes` on aura-type AEs. The module's GitHub repository or the Foundry community wiki may have examples of correctly wired aura AEs.

### Bug 7 (Medium): Shared Initiative not functional

**Severity:** Medium -- Tulpa rolls independently instead of following caster
**Location:** `initiative.js`, `onCombatStart` handler
**First appearance:** v0.1.6 (first time the code path was exercised)

The Tulpa rolled initiative independently (5) instead of being set to caster initiative (7) minus 0.01 = 6.99. The v0.1.6 addendum to the v0.1.5 report states this was fixed with a `casterUuidFromOrigin` regex helper, but the live test shows it is not working.

**Possible causes:**
1. The hook may fire before the Tulpa is added to the combat tracker, so there is no combatant to update.
2. The hook timing (`combatStart` vs. `combatRound` vs. `updateCombat`) may be wrong. dnd5e's initiative rolling happens asynchronously after `combat.startCombat()` is called.
3. The regex extraction of the caster UUID may not match the actual `summon.origin` format.

**Suggested fix:** Add `console.log` instrumentation to `onCombatStart` to verify: (a) the hook fires, (b) the caster combatant is found, (c) the Tulpa combatant is found, (d) the initiative update succeeds. Also consider using `Hooks.on("combatTurnChange")` or `Hooks.on("updateCombat")` as alternative hook points, since `combatStart` may fire before initiative values are assigned.

### Bug 8 (Low): Dismissal reason misclassification

**Severity:** Low -- cosmetic, wrong text in chat card
**Location:** `inferReason()` in `dismiss-flow.js`
**First appearance:** v0.1.6 (first time dismiss reasons were testable)

When the Tulpa is dismissed via re-cast, the chat card says "the spell's duration ended" instead of identifying the reason as "recast." The `inferReason()` function likely classifies the times-up AE deletion (which cascades from the re-cast) as a duration event.

**Suggested fix:** Check whether a new cast is in progress (e.g., via a module-scoped flag set at the start of the cast flow and cleared at the end) before falling through to the "duration" classification. If a cast is active, classify as "recast."

### Bug 9 (High): Zero HP on Tulpa does not trigger dismissal

**Severity:** High -- Tulpa persists as a 0-HP token
**Location:** Missing functionality (no watcher for Tulpa's own HP)
**First appearance:** v0.1.6 (first time the Tulpa survived long enough to test)

The `zeroHP` entry in the anchor AE's DAE `specialDuration` refers to the caster's HP, not the Tulpa's. There is no separate mechanism that monitors the Tulpa's HP and triggers dismissal when it drops to 0 (after Relentless is consumed).

**Suggested fix:** Add a `preUpdateActor` hook (or extend the existing Relentless watcher) that detects when the Tulpa's HP reaches 0 and `relentlessUsed` is true. When this condition is met, trigger the dismiss flow. Alternatively, add a second DAE `specialDuration: [zeroHP]` on an AE applied to the *Tulpa itself* (not the caster) that cascades to token deletion.

### Bug 10 (High): Caster death cascade incomplete

**Severity:** High -- Tulpa token may linger after caster dies
**Location:** `onDeleteActiveEffect` handler in `dismiss-flow.js`
**First appearance:** v0.1.6 (first time the anchor AE lifecycle was testable)

DAE's `specialDuration: [zeroHP, isDeath]` correctly removes the anchor AE from the caster when the caster drops to 0 HP or gains the "dead" status. However, the `deleteActiveEffect` hook handler does not reliably cascade to deleting the Tulpa token and posting a dismissal chat card. The token was eventually cleaned up but not immediately and not with the expected user-facing feedback.

**Possible causes:**
1. The `onDeleteActiveEffect` handler may not fire for programmatic AE deletions triggered by DAE.
2. The `fromUuid(tulpaUuid)` call inside the handler may fail if the token's synthetic actor is not immediately resolvable.
3. Race condition: the handler tries to delete the token while other cleanup (from DAE or midi-qol) is in progress.

**Suggested fix:** Add defensive logging and error handling to the `onDeleteActiveEffect` handler. Confirm the hook fires by adding `console.log` at the handler entry point. If the hook fires but the UUID resolution fails, consider storing the token document ID alongside the actor UUID in the anchor AE flags for a more direct lookup.

---

## UX Issues

### UX Issue 1: Cast dialog uses internal slug names

The dialog displays modification names as internal slugs: "reinforcedForm", "skill_ste", "sizeShift_large". These should be human-readable: "Reinforced Form", "Skill Affinity: Stealth", "Size Shift: Large". The localization file (`lang/en.json`) likely has or should have display name entries for each modification.

### UX Issue 2: Cast dialog taller than viewport

The dialog's `scrollHeight` (2557px) exceeds its `clientHeight` (876px). The user must scroll internally to reach the Confirm button. Consider collapsible modification categories, a multi-step wizard, or a more compact layout.

### UX Issue 3: Double parentheses in material component

The spell card shows "((a crystal shard imbued with your psychic resonance, worth at least 100 GP))" with double parentheses. The spell data likely includes the parentheses in the material string, and dnd5e wraps it in another set. Remove the outer parentheses from the spell item data.

---

## Console Errors Observed

### Module-specific errors

None. This is a major improvement over all prior versions. The cast flow runs without any manifest-tulpa console errors.

### Other module errors (NOT from manifest-tulpa)

| Source | Error | Count | Impact on manifest-tulpa |
|--------|-------|-------|--------------------------|
| Chrome extension | Async listener errors | 5 | None |
| token-quips | `KeyboardManager` deprecation warning | 1 | None |
| bbmm | `FilePicker` deprecation warning | 3 | None |
| theripper-premium-hub | `renderTemplate` deprecation warning | 1 | None |

---

## Comparison: v0.1.3 through v0.1.6

| Finding | v0.1.3 | v0.1.4 | v0.1.5 | v0.1.6 |
|---------|--------|--------|--------|--------|
| `{{in}}` Handlebars helper crash | BROKEN | FIXED | FIXED | FIXED |
| Template two-root-element crash | LATENT | BROKEN | FIXED | FIXED |
| `module.json` download URL stale | BROKEN | FIXED | FIXED | FIXED |
| Hook accumulation on reload | BROKEN | FIXED | FIXED | FIXED |
| Spell range shows "Self" | BROKEN | FIXED | FIXED | FIXED |
| Material component text mismatch | BROKEN | FIXED | FIXED | FIXED |
| Vestigial Tether feature | PRESENT | REMOVED | REMOVED | REMOVED |
| Cast dialog renders | NO | NO | YES | YES |
| `locateSummonedTulpa` UUID mismatch | LATENT | LATENT | EXPOSED | **FIXED** |
| `damage.parts` format wrong | LATENT | LATENT | EXPOSED | **FIXED** |
| `empoweredStrikes.patch` crash | LATENT | LATENT | CONFIRMED | **FIXED** (but blocked by Bug 5) |
| `playDismiss` animation hangs | LATENT | LATENT | OBSERVED | **FIXED** |
| AC formula missing `@mod` | LATENT | LATENT | OBSERVED | **FIXED** |
| HP formula missing level scaling | LATENT | LATENT | OBSERVED | **FIXED** |
| Manifestation Strike zero activities | LATENT | LATENT | LATENT | **EXPOSED** (Bug 5) |
| Harrowing Presence marker propagation | LATENT | LATENT | LATENT | **EXPOSED** (Bug 6) |
| Shared Initiative alignment | LATENT | LATENT | LATENT | **EXPOSED** (Bug 7) |
| Dismissal reason misclassification | LATENT | LATENT | LATENT | **EXPOSED** (Bug 8) |
| Zero HP Tulpa dismissal | LATENT | LATENT | LATENT | **EXPOSED** (Bug 9) |
| Caster death cascade | LATENT | LATENT | LATENT | **EXPOSED** (Bug 10) |
| Cast flow completes end-to-end | NO | NO | NO | **YES** |
| Caster-derived stats correct | NO | NO | NO | **YES** |
| Modifications apply (9/10) | NO | NO | NO | **YES** |
| Relentless works | NO | NO | NO | **YES** |
| Session reload re-arms watchers | NO | NO | NO | **YES** |

**Pattern:** v0.1.6 breaks through the cast-flow barrier that blocked v0.1.3-v0.1.5. The core cast-and-modify loop works. The bugs exposed are in the combat integration layer (Harrowing Presence, initiative, dismissal triggers) and compendium data (Manifestation Strike activities), areas that have never been exercised in a live environment before.

---

## Priority Fix Order

### 1. CRITICAL -- Populate Manifestation Strike activities (Bug 5)

This is the single highest-impact fix. Without weapon activities, the Tulpa cannot attack, empoweredStrikes cannot add damage, and damage type assignment has nothing to write to. Everything else in the combat loop depends on the weapon being functional.

### 2. HIGH -- Wire Harrowing Presence aura changes (Bug 6)

Move the `inHarrowingAura` and `auraDC` flag assignments into the aura AE's `changes` array so Aura Effects 1.5.2 can propagate them as a marker to in-range tokens. This unblocks the entire Harrowing Presence feature chain.

### 3. HIGH -- Add Tulpa zero-HP dismissal watcher (Bug 9)

Add a mechanism to dismiss the Tulpa when its HP drops to 0 after Relentless is consumed. Without this, 0-HP Tulpas persist indefinitely.

### 4. HIGH -- Fix caster death cascade (Bug 10)

Debug the `deleteActiveEffect` hook handler to ensure it reliably cascades from anchor AE deletion to Tulpa token removal. Add logging to trace the failure point.

### 5. MEDIUM -- Fix Shared Initiative (Bug 7)

Debug the `onCombatStart` handler. Verify it fires, resolves the caster and Tulpa combatants, and updates initiative. Consider alternative hook timing.

### 6. LOW -- Fix dismissal reason classification (Bug 8)

Add a "cast in progress" guard so re-cast dismissals are correctly labeled.

### 7. LOW -- UX improvements

Fix the dialog slug names, viewport overflow, and double-parentheses display issues.

---

## Appendix A: Screenshot Log

| ID | Description |
|----|-------------|
| ss_2674alzx1 | Character sheet showing Manifest Tulpa spell |
| ss_6676l673h | Canvas with Tulpa token and Player Character token after cast |
| ss_8224jiz23 | Harrowing Presence aura ring visible on canvas (magenta, 10ft radius) |
| ss_6879nes9q | Cast dialog with modification options |
| ss_36387vryi | Canvas after session reload, Tulpa still present |
| ss_4158mhu3t | Canvas showing Tulpa + PC after happy path cast (psychic/reinforcedForm/vitalSurge) |
| ss_6220c6i7q | Canvas showing Tulpa + PC (with Close Window tooltip) |

---

## Appendix B: Test Environment Details

- **Foundry URL:** `http://192.168.1.188:8678/`
- **World:** "Patreon Map Building"
- **Test Actor:** "Player Character" -- Wizard 10, Half-Orc Mythalkeeper
  - INT 16 (+3), Proficiency +4, Spell DC 15, Spell Attack +7
  - Spellcasting ability: Intelligence
  - 5th-level slots: 2
- **autoanimations note:** Installed (6.8.3) but NOT active. Sequencer calls time out gracefully (5-second `Promise.race`), posting console warnings but not blocking functionality.

---

## Sign-off

Tester: Claude (automated)
Supervisor: Mr. Beasley
Date: 2026-05-25
Foundry build: V13.351
dnd5e version: 5.2.5
Module version: 0.1.6
