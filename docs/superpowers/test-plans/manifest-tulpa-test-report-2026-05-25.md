# Manifest Tulpa v0.1.3 -- Smoke Test Report

**Date:** 2026-05-25
**Tester:** Claude (automated, supervised by Mr. Beasley)
**Environment:** FoundryVTT V13.351, dnd5e 5.2.5
**Module Version:** 0.1.3
**Test Character:** "Player Character" (Wizard 10, Half-Orc Mythalkeeper, INT 16, Proficiency +4, Spell DC 15, Spell Attack +7)
**Test Plan:** `docs/superpowers/test-plans/2026-05-24-manifest-tulpa-smoke.md`

---

## Executive Summary

**Overall Result: FAIL -- critical blocker in the cast dialog prevents all downstream functionality.**

The module loads correctly and registers all hooks as designed. However, the custom modification-selection dialog (`cast-dialog.hbs`) crashes on render due to a missing Handlebars helper (`"in"`), which prevents the entire cast flow from completing. Because the cast flow is the single entry point for stat adjustments, modification application, anchor AE creation, and all combat behaviors, every feature downstream of the dialog is untestable and non-functional.

The Tulpa actor IS successfully summoned via dnd5e's native Summon activity, but it arrives with raw compendium template stats (AC 13, HP 40, Proficiency +2) instead of the caster-derived values the spell requires (AC 16, HP 90, Proficiency +4 for this test character).

---

## Test Results Summary

| # | Test Area | Result | Blocker? |
|---|-----------|--------|----------|
| 1 | Module Load | PASS | -- |
| 2 | Cast Flow Happy Path | FAIL | YES |
| 3 | Modification Correctness | BLOCKED | -- |
| 4 | Harrowing Presence | BLOCKED | -- |
| 5 | Relentless | BLOCKED | -- |
| 6 | Shared Initiative | BLOCKED | -- |
| 7 | Dismissal Triggers | BLOCKED | -- |
| 8 | Session Reload | BLOCKED | -- |

---

## 1. Module Load Test

**Result: PASS**

### What happened
- Console shows `manifest-tulpa | init` at page load -- the `init` hook fires correctly.
- Console shows `Foundry VTT | Loaded localization file modules/manifest-tulpa/lang/en.json` -- localization loads.
- Console shows `manifest-tulpa | ready` -- the `ready` hook fires correctly, and all five event hooks are registered at this point (`dnd5e.postUseActivity`, `dnd5e.combatTurnStart`, `combatStart`, `deleteActiveEffect`, `preDeleteToken`).
- Console shows `Foundry VTT | Constructed index of manifest-tulpa.manifest-tulpa-spells Compendium containing 1 entries` -- the spells compendium indexes correctly.
- No errors or warnings from the manifest-tulpa module during load.

### Observation: Actors compendium not indexed at startup
The `manifest-tulpa-actors` compendium is NOT indexed during page load (only `manifest-tulpa-spells` appears in the startup index logs). However, it IS accessible when needed -- the summon activity successfully imports from it at cast time (`"Importing Actor Tulpa from manifest-tulpa.manifest-tulpa-actors"`). This appears to be normal Foundry behavior for actor packs (lazy-indexed on first access), not a bug.

### Other module errors (NOT from manifest-tulpa)
These errors appear in console from other modules. Listed for completeness:
- `lib-df-buttons(13.1.1)`: TypeError on `ControlManager.render` -- cannot read `.request` of undefined
- `levels`: V1 Application framework deprecation warning
- `token-quips`: Global `KeyboardManager` deprecation warning
- `bbmm`: Global `FilePicker` deprecation warning (3 instances)
- `theripper-premium-hub`: Global `renderTemplate` deprecation warning

None of these impact manifest-tulpa.

---

## 2. Cast Flow Happy Path

**Result: FAIL -- Critical Bug**

### Test procedure
1. Opened Player Character's sheet, navigated to Spells tab.
2. Clicked Manifest Tulpa (5th Level spell).
3. dnd5e system slot dialog appeared: "Cast at Level: 5th Level (2 Slots)", "Consume Spell Slot?" checked, "Place Summons" checked.
4. Clicked "Cast Spell".

### What should happen (per smoke test plan)
After the dnd5e slot dialog, the module's custom cast dialog should open, showing:
- Radio buttons for force/radiant/psychic damage type
- Checkboxes grouped by category (Morphic, Combat, Resistance, Movement, Skill, Special)
- A slot counter (e.g. "2/2 slots used")
- Confirm/Cancel buttons

After confirmation, the Tulpa's stats should be adjusted to match the caster's values, and the selected modifications should be applied.

### What actually happened
The dnd5e slot dialog works correctly. After clicking "Cast Spell":
1. The spell slot is consumed (correct).
2. dnd5e's native Summon activity fires and places a Tulpa token on the canvas (correct).
3. The `dnd5e.postUseActivity` hook fires (confirmed via debug hook).
4. The module's `onPostUseActivity` handler runs and attempts to open the cast dialog.
5. **The cast dialog crashes during render.**

### Root cause: Missing Handlebars helper "in"

**Console error:**
```
Error: Failed to render Application "manifest-tulpa-cast-dialog":
Failed to render template part "body":
Missing helper: "in"
```

**File:** `templates/cast-dialog.hbs`, line 19
**Code:** `{{#if (in this.slug ../../selected)}}checked{{/if}}`

The template uses an `{{in}}` Handlebars helper to check whether a modification slug exists in the `selected` Set. This helper does not exist in Foundry V13's Handlebars environment. Foundry provides `eq`, `ne`, `lt`, `gt`, `lte`, `gte`, `not`, `and`, `or`, `lookup`, `localize`, `concat`, `capitalize`, and a few others, but NOT `in`.

### What happens after the crash
The `openCastDialog()` function wraps the dialog in a Promise. When the dialog render fails, Foundry's ApplicationV2 error handling triggers the dialog's `close()` method, which calls `resolve(null)`. Back in `onPostUseActivity` (cast-flow.js line 35), the `if (!selection)` branch fires `abortAndCleanup()`. However, `locateSummonedTulpa()` may not find the token (depending on timing relative to dnd5e's async summon), so cleanup may be incomplete. In testing, the Tulpa token and actor remained on the canvas after the crash.

### Downstream impact
Because the cast dialog never completes, NONE of the following ever execute:
- Stat adjustments (AC, HP, proficiency, attack bonus, save DCs)
- Damage type selection on Manifestation Strike
- Modification application (all categories)
- Anchor AE creation on the caster
- Relentless watcher arming
- Initiative alignment
- Manifest animation
- Cast confirmation chat card

### Tulpa stats as summoned (raw compendium template, no adjustments)

| Stat | Actual (Template) | Expected (Spell Formula) | Correct? |
|------|-------------------|--------------------------|----------|
| AC | 13 | 13 + 3 (INT mod) = 16 | NO |
| HP | 40/40 | 40 + 5 x 10 (level) = 90 | NO |
| Proficiency | +2 | +4 (caster's) | NO |
| Manifestation Strike to-hit | +2 | +7 (caster's spell attack) | NO |
| Manifestation Strike damage | 2d8 | 2d8 (correct base, but no damage type selected) | PARTIAL |
| STR save | +5 (proficient) | Should mirror caster's proficiencies | NOT SYNCED |
| CON save | +5 (proficient) | Should mirror caster's proficiencies | NOT SYNCED |
| Speed | 30 | 30 | YES |
| Size | Medium | Medium | YES |
| Type | Construct | Construct | YES |

### Chat card posted
The dnd5e system posted its default spell usage chat card containing the full spell description text. This is NOT the module's custom cast confirmation card -- it's the system's automatic card. The card includes "Summon", "Consume Resource", and "Refund Resource" buttons (dnd5e system standard).

No "Tulpa Dismissed" or "cast confirmation" custom chat cards were observed.

### Suggested fix
Replace the `{{in}}` helper call with logic that works in Foundry's Handlebars. Two options:

**Option A (recommended):** Pass `selected` as a plain object/set from `_prepareContext()` and use `{{#if}}` with a pre-computed boolean on each modification entry:
```javascript
// In _prepareContext(), add isSelected to each mod entry:
(grouped[m.category] ??= []).push({
  slug, ...m,
  isSelected: this.selected.has(slug)
});
```
Then in the template: `{{#if this.isSelected}}checked{{/if}}`

**Option B:** Register a custom Handlebars helper in `init.js`:
```javascript
Handlebars.registerHelper("in", (value, set) => set?.has?.(value) ?? false);
```

Option A is cleaner because it keeps template logic minimal and doesn't pollute the global Handlebars namespace.

---

## 3. Modification Correctness

**Result: BLOCKED by cast dialog crash (Section 2)**

Cannot test any modification because the cast dialog never renders. The modification-registry.js code was not exercised. Static review of the code shows the registry structure and application logic appear well-designed, but no runtime verification was possible.

For reference, the smoke test plan requires testing:
- Unsettling Form (midi-qol disadvantage flags)
- Size Shift: Large (token resize)
- Empowered Strikes (extra 1d8)
- Multiattack (feat item insertion)
- Resistance: Fire (damage resistance trait)
- Fly Speed (movement entry)
- Skill Affinity: Stealth (skill proficiency)
- Telepathic Link (flag + chat card)

None of these could be tested.

---

## 4. Harrowing Presence

**Result: BLOCKED by cast dialog crash (Section 2)**

The Harrowing Presence modification is never applied, so the Aura Effects aura is never created on the Tulpa, and the `dnd5e.combatTurnStart` hook handler (`harrowing-presence-hook.js`) has nothing to read.

Static review of the two-stage design (aura applies marker AE to hostiles, combat-turn hook reads marker and rolls save) appears architecturally sound, but requires runtime testing to verify:
- Aura Effects 1.5.2's `system.appliedEffect` slot carries the marker flags correctly
- The marker AE actually propagates `inHarrowingAura` and `auraDC` to in-range NPCs
- The combat-turn hook's save roll and frightened condition application work

---

## 5. Relentless

**Result: BLOCKED by cast dialog crash (Section 2)**

The Relentless watcher (`armRelentlessWatcher()`) is never called because the cast flow aborts. `restoreRelentlessWatchers()` runs at `ready` (confirmed by the hook registration), but there are no watchers to restore since none were ever armed.

---

## 6. Shared Initiative

**Result: BLOCKED by cast dialog crash (Section 2)**

`alignTulpaInitiative()` is never called. The initiative alignment code (setting Tulpa initiative to caster's initiative minus 0.01) was not exercised.

---

## 7. Dismissal Triggers

**Result: BLOCKED by cast dialog crash (Section 2)**

The anchor AE ("Manifest Tulpa (active)") is never created on the caster, which means:
- Duration-based dismissal via `times-up` cannot trigger (no AE with `duration.seconds`)
- Zero-HP and death dismissal via DAE `specialDuration` cannot trigger (no AE with those flags)
- Re-cast dismissal (checking for existing anchor at cast-flow.js line 28) has nothing to find
- Manual token deletion dismissal (the `preDeleteToken` hook) has no anchor to cascade-delete

The `deleteActiveEffect` and `preDeleteToken` hooks ARE registered (confirmed), but have no anchor AE to work with.

---

## 8. Session Reload

**Result: BLOCKED by cast dialog crash (Section 2)**

The session reload test requires an active Relentless watcher to verify re-arming at `ready`. Since no watcher is ever armed, this test is not meaningful.

---

## Additional Findings

### Finding A: module.json download URL mismatch
The `download` field in `module.json` points to `v0.1.0`:
```
"download": "https://github.com/themrbeasley/manifest-tulpa/releases/download/v0.1.0/manifest-tulpa.zip"
```
But the module version is `0.1.3`. This means users installing via the manifest URL get the latest `module.json` but download the `v0.1.0` zip. The download URL should be updated to use a `latest` redirect or the current version tag.

**Suggested fix:** Either use the `latest` pattern:
```
"download": "https://github.com/themrbeasley/manifest-tulpa/releases/latest/download/manifest-tulpa.zip"
```
Or ensure the release workflow updates this field on each tag.

### Finding B: Hook registered multiple times
The `dnd5e.postUseActivity` hook was registered 3 times (confirmed via `Hooks.events`). This happens because the page was reloaded multiple times during testing, and each reload runs `init.js` again. Since the hooks use `Hooks.on()` (not `Hooks.once()`), each reload adds another listener. In normal single-load usage this is fine (only 1 registration), but if the world is reloaded without a full browser refresh, hooks accumulate.

This is a minor concern. In practice, the hook handler's early-return guards (`activity?.type !== "summon"`, identifier check) mean duplicate registrations only waste a few CPU cycles. But if a player reloads the world tab multiple times, the cast dialog could theoretically open multiple times per cast.

**Suggested fix:** Track registration state with a module-level flag:
```javascript
let hooksRegistered = false;
Hooks.once("ready", async () => {
  if (hooksRegistered) return;
  hooksRegistered = true;
  // ... register hooks
});
```

### Finding C: Spell components mismatch
The spell item in the compendium lists components as "V, S, M" in the chat card. The spell source text (`manifest-tulpa.txt`) specifies "V, S, M (a lock of your own hair, a drop of your blood, and a gemstone worth at least 100 gp, which the spell consumes)." The chat card's material component description shows "a crystal shard imbued with your psychic resonance, worth at least 100 GP" which differs from the source text. One of these needs to be reconciled with the spell author's intent.

### Finding D: Spell range discrepancy
The spell item on the character sheet shows Range "Self" and Target "Self." The chat card shows "Range: 30 feet." The compendium spell's summon activity has `range.units: "self"` with `override: false`. The spell source text says "Range: 30 feet." This means the summon placement range may not be enforced correctly -- the summon activity inherits the "Self" range from the spell item rather than enforcing 30 feet.

**Impact:** Players can potentially place the Tulpa at any distance rather than within 30 feet. This should be verified and corrected by setting the summon activity's range to 30 feet with `override: true`.

---

## Priority Fix Order

1. **CRITICAL -- Fix the cast dialog template** (Section 2). Replace `{{#if (in this.slug ../../selected)}}` with a pre-computed boolean. This single fix unblocks ALL other functionality.

2. **HIGH -- Retest everything** after the dialog fix. The entire module's runtime behavior is untested because of the blocker. The code LOOKS correct on static review, but many integration points (Aura Effects marker propagation, DAE specialDuration, times-up expiry, initiative alignment) need live verification.

3. **MEDIUM -- Fix the download URL** in module.json (Finding A).

4. **LOW -- Reconcile spell components and range** (Findings C, D).

5. **LOW -- Guard against duplicate hook registration** (Finding B).

---

## Appendix: Files Reviewed

| File | Purpose | Notes |
|------|---------|-------|
| `modules/init.js` | Hook registration | Correct, all 5 hooks registered at `ready` |
| `modules/cast-flow.js` | Main cast orchestration | Logic appears sound; never fully executes |
| `modules/cast-dialog.js` | ApplicationV2 dialog class | Class structure correct; `_prepareContext` provides the data |
| `templates/cast-dialog.hbs` | Dialog template | **BUG: line 19 uses nonexistent `in` helper** |
| `modules/constants.js` | Module constants | Correct |
| `module.json` | Module manifest | Download URL stale (Finding A) |
| `manifest-tulpa.txt` | Spell source text | Authoritative for mechanics |

---

## Sign-off

Tester: Claude (automated)
Date: 2026-05-25
Foundry build: V13.351
dnd5e version: 5.2.5
Module version: 0.1.3
