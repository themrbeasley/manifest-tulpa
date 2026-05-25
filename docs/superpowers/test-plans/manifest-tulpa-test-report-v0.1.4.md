# Manifest Tulpa v0.1.4 -- Smoke Test Report

**Date:** 2026-05-25
**Tester:** Claude (automated, supervised by Mr. Beasley)
**Environment:** FoundryVTT V13.351, dnd5e 5.2.5
**Module Version:** 0.1.4
**Test Character:** "Player Character" (Wizard 10, Half-Orc Mythalkeeper, INT 16, Proficiency +4, Spell DC 15, Spell Attack +7)
**Test Plan:** `docs/superpowers/test-plans/2026-05-24-manifest-tulpa-smoke.md`
**Source of Truth:** `manifest-tulpa.txt`
**Previous Report:** `docs/superpowers/test-plans/manifest-tulpa-test-report-2026-05-25.md` (v0.1.3)

---

## Resolution Addendum (v0.1.5 -- 2026-05-25)

**Status:** Critical blocker resolved in code. Live Foundry retest still required.

The cast dialog crash documented in this report (Section 2, R4) is fixed in **v0.1.5** by applying **Appendix B Option A**: `templates/cast-dialog.hbs` now wraps its `<section>` and `<footer>` in a single `<div class="mt-cast-body">` root, satisfying Foundry V13's `HandlebarsApplicationMixin` one-root-per-PART rule. No JavaScript changes were required — `_attachPartListeners` already scopes its selectors to the part's root element, which is now the wrapping `<div>`.

### What was verified at the v0.1.5 fix landing

- `templates/cast-dialog.hbs` parses to a single top-level element (visual inspection of the file).
- `npm test` -- 30/30 pass (modification registry, validate-pack regressions, animation presets).
- `npm run validate` -- pack validator passes on the scrubbed source.
- `npm run build:packs` -- LevelDB packs build cleanly for both compendia.

### What was NOT re-verified

Sections 3-8 of this report (Modification Correctness, Harrowing Presence, Shared Initiative, Relentless, Dismissal Triggers, Session Reload) and the downstream items in Section 2 (stat adjustments, anchor AE, animation, chat card, orphan cleanup) all remain **BLOCKED PENDING LIVE FOUNDRY RETEST**. The fix unblocks the cast flow at the dialog stage; what happens after that has never run end-to-end in any released version of the module and still needs live verification.

A fresh v0.1.5 smoke test report should be created once those sections have been exercised in-world.

---

## Executive Summary

**Overall Result: FAIL -- critical blocker in the cast dialog prevents all downstream functionality (different root cause than v0.1.3).**

The v0.1.4 release successfully fixes all five findings from the v0.1.3 smoke test report: the `{{in}}` Handlebars helper crash, the stale download URL, the hook accumulation issue, the spell range/material text mismatches, and the vestigial Tether feature. All five regression checks (R1-R5) confirm those fixes landed correctly.

However, v0.1.4 introduces a new critical bug: the cast dialog template (`cast-dialog.hbs`) renders two root HTML elements (`<section>` and `<footer>`), which violates Foundry V13's `HandlebarsApplicationMixin` requirement that each template part produce exactly one root element. The dialog crashes on render with `Template part "body" must render a single HTML element`, which is a different error than v0.1.3's `Missing helper: "in"` but has the identical downstream effect: the entire cast flow is dead, and every feature that depends on it is untestable.

In v0.1.3, the `{{in}}` helper error crashed the template compilation before Foundry ever evaluated the DOM structure, so this two-root-element problem was latent and invisible. Fixing the helper exposed it.

---

## Test Results Summary

| # | Test Area | Result | Blocker? |
|---|-----------|--------|----------|
| R1 | Spell card material + range | PASS | -- |
| R2 | Tulpa actor features (no Tether) | PASS | -- |
| R3 | Summon placement bounded to 30ft | PARTIAL | -- |
| R4 | Cast dialog renders without console error | FAIL | YES |
| R5 | Hook accumulation guard | PASS | -- |
| 2 | Cast Flow Happy Path | FAIL | YES |
| 3 | Modification Correctness | BLOCKED | -- |
| 4 | Harrowing Presence | BLOCKED | -- |
| 5 | Shared Initiative | BLOCKED | -- |
| 6 | Relentless | BLOCKED | -- |
| 7 | Dismissal Triggers | BLOCKED | -- |
| 8 | Session Reload | BLOCKED | -- |

---

## Phase 1: Regression Checks

### R1: Spell Card Material + Range

**Result: PASS**

Opened the Player Character's spell sheet and clicked Manifest Tulpa to view the spell card. Verified:

- **Range:** Shows "30 Feet" (was "Self" in v0.1.3). Matches `manifest-tulpa.txt` which specifies "Range: 30 feet." FIXED.
- **Components:** Shows "V, S, M" with the material text "(a crystal shard imbued with your psychic resonance, worth at least 100 GP)." This matches `manifest-tulpa.txt` exactly. FIXED (was a different description in v0.1.3).
- **Consumed:** "No" -- the spell text says "worth at least 100 GP" with no mention of consumption, so `consumed: false` is correct.
- **Duration:** "1 Hour" -- correct per spell text.
- **Casting Time:** "1 Action" -- correct per spell text.

All material and range fields now match the source of truth.

### R2: Tulpa Actor Features (No Tether)

**Result: PASS**

Opened the Tulpa actor from the `manifest-tulpa-actors` compendium and inspected its features. The actor has only one feature item: **Manifestation Strike**. The vestigial "Tether" feature ("If the Tulpa ends its turn more than 100 feet from its caster, it dissipates and the spell ends") that was present in v0.1.3 has been removed. This is correct -- no tether mechanic appears anywhere in `manifest-tulpa.txt`.

### R3: Summon Placement Bounded to 30ft

**Result: PARTIAL**

When casting the spell, dnd5e's native summon activity fires and the Tulpa token appears attached to the cursor for placement. The spell's summon activity now has `range: { value: 30, units: "ft" }` with `override: true` (confirmed from the CHANGELOG). However, verifying the actual placement constraint requires a fully working cast flow to test whether dnd5e's Portal integration enforces the 30ft boundary. The cast dialog crash (R4) prevents confirming enforcement in practice.

What was verified: the spell card displays "30 Feet" as the range, and the summon activity's range fields were updated per the CHANGELOG. What could not be verified: whether a player is physically prevented from placing the token beyond 30ft. This depends on Portal (`portal-lib`) honoring the summon activity's range override, which requires a successful cast to test.

### R4: Cast Dialog Renders Without Console Error

**Result: FAIL -- New Critical Bug**

This is the central finding of the report. The cast dialog crashes on render with a new error (different from v0.1.3).

**Console error (observed 3 times across 3 cast attempts):**
```
Error: Failed to render Application "manifest-tulpa-cast-dialog":
Failed to render template part "body":
Template part "body" must render a single HTML element.
```

**Root cause analysis follows in Section 2 below.**

### R5: Hook Accumulation Guard

**Result: PASS**

Checked `Hooks.events["dnd5e.postUseActivity"]` in the browser console. The manifest-tulpa module registered exactly 1 listener for this hook. The `globalThis.__manifestTulpaHooksRegistered` guard added in v0.1.4 is working as designed -- even across the multiple page interactions during testing, the module did not accumulate duplicate hook registrations.

For reference, the total listener count on that hook was 3 (the other two are from midi-qol and possibly another module), but only 1 belongs to manifest-tulpa. This is the expected behavior.

---

## Section 2: Cast Flow Happy Path

**Result: FAIL -- Critical Bug (new in v0.1.4)**

### Test procedure

1. Opened Player Character's sheet, navigated to Spells tab.
2. Clicked Manifest Tulpa (5th Level spell).
3. dnd5e system slot dialog appeared: "Cast at Level: 5th Level", "Consume Spell Slot?" checked, "Place Summons" checked.
4. Clicked "Cast Spell."
5. dnd5e's native Summon activity fired. Tulpa token appeared attached to cursor.
6. Clicked on the canvas to place the Tulpa token.
7. Token placed successfully. `dnd5e.postUseActivity` hook fired.
8. Module's `onPostUseActivity` handler attempted to open the cast dialog.
9. **Cast dialog crashed during render.**

### What should happen (per test plan)

After the dnd5e slot dialog and token placement, the module's custom cast dialog should open, showing radio buttons for damage type (force/radiant/psychic), grouped checkboxes for modifications, a slot counter, and Confirm/Cancel buttons. After confirmation, the Tulpa's stats should be adjusted and modifications applied.

### What actually happened -- and why

The dialog crashed with `Template part "body" must render a single HTML element`. Here is the chain of events:

**The template has two root elements.** `templates/cast-dialog.hbs` (the template for the `body` part) renders this structure:

```
<section>         <!-- ROOT ELEMENT 1 -->
  ...fieldsets...
</section>

<footer>          <!-- ROOT ELEMENT 2 -->
  ...buttons...
</footer>
```

**Foundry's `HandlebarsApplicationMixin` enforces a one-root-per-part rule.** In Foundry V13's ApplicationV2 framework, each entry in `static PARTS` maps to a template, and that template must produce exactly one top-level HTML element. The framework parses the rendered HTML, counts the root children, and throws if it finds more than one. This is documented in Foundry's wiki under ApplicationV2 -- "Each part must return a single HTML element -- that is, only one pair of top-level tags."

**In `modules/cast-dialog.js`, line 35-37:**
```javascript
static PARTS = {
  body: { template: `modules/${MODULE_ID}/templates/cast-dialog.hbs` },
};
```

There is only one part (`body`), but its template has two roots (`<section>` + `<footer>`). This violates the constraint.

**Why this bug was invisible in v0.1.3:** The v0.1.3 template crashed at an earlier stage. The `{{in}}` Handlebars helper error caused the template compilation step to fail before Foundry ever tried to parse the rendered HTML into DOM elements. The two-root-element problem was already present in v0.1.3's template, but the helper error masked it. When v0.1.4 fixed the `{{in}}` helper (replacing it with the pre-computed `isSelected` boolean), the template now compiles successfully, which lets Foundry proceed to the DOM-parsing step where the two-root problem surfaces.

### Downstream impact

Identical to v0.1.3: because the cast dialog never completes, none of the following execute:

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
| Speed | 30 | 30 | YES |
| Size | Medium | Medium | YES |
| Type | Construct | Construct | YES |

### Caster-side effects

After the crash, the caster (Player Character) has dnd5e's native "Summon: Manifest Tulpa" active effect, but this is the system's built-in summon tracking AE -- NOT the module's anchor AE ("Manifest Tulpa (active)") with `flags["manifest-tulpa"].tulpaUuid`. The module's anchor AE is never created because the cast flow aborts before that step. This means all five dismissal triggers (duration, 0 HP, death, re-cast, manual token delete) are non-functional.

### Chat card

The dnd5e system posted its default spell usage chat card with the full spell description. This is NOT the module's custom cast confirmation card. No module-specific chat cards were observed.

### Orphan cleanup

After the dialog crash, `abortAndCleanup()` fires (because `openCastDialog()` resolves to `null`). The Tulpa token and actor remain on the canvas -- cleanup may be incomplete depending on timing relative to dnd5e's async summon placement. In testing, the orphaned Tulpa persisted on the canvas after each failed cast attempt.

### Suggested fix (supported by Foundry wiki research)

There are two valid approaches, both documented in Foundry's official ApplicationV2 guide:

**Option A (recommended): Wrap in a single root element.**

Wrap the entire template in one root `<div>` or `<form>` element:

```handlebars
<div class="manifest-tulpa-cast-body">
  <section>
    ...fieldsets...
  </section>
  <footer class="form-footer">
    ...buttons...
  </footer>
</div>
```

This is the simplest fix. It preserves the existing single-PART structure and requires no changes to `cast-dialog.js`.

**Option B: Split into separate PARTS.**

Foundry's ApplicationV2 framework supports multiple parts, each with its own template. The footer can be a separate part:

```javascript
static PARTS = {
  body: { template: `modules/${MODULE_ID}/templates/cast-dialog.hbs` },
  footer: { template: "templates/generic/form-footer.hbs" },
};
```

With this approach, `cast-dialog.hbs` would contain only the `<section>` element, and the footer would use Foundry's built-in form footer template (or a custom one). Each template renders exactly one root element.

Option A requires fewer changes and is less likely to introduce new issues. Option B is more architecturally aligned with how Foundry's core applications are structured.

**Why Option A is recommended for this module:** The cast dialog is a simple, single-purpose form. It does not need the flexibility of multi-part rendering (where parts can be independently re-rendered). A wrapper element costs nothing and avoids the complexity of coordinating multiple parts and their listener attachment.

---

## Section 3: Modification Correctness

**Result: BLOCKED by cast dialog crash (Section 2)**

Cannot test any modification because the cast dialog never renders. The `modification-registry.js` code was not exercised at runtime. Static review of `_prepareContext()` in `cast-dialog.js` confirms that the `isSelected` pre-computation (the v0.1.3 fix) is correctly implemented:

```javascript
(grouped[m.category] ??= []).push({ slug, ...m, isSelected: this.selected.has(slug) });
```

And the template correctly uses it:
```handlebars
{{#if this.isSelected}}checked{{/if}}
```

This will work once the root-element crash is resolved. However, the actual modification application logic (stat patches, item insertions, AE creation) has never been exercised in a live Foundry environment across any version of the module.

The smoke test plan requires verifying: Unsettling Form, Size Shift: Large, Empowered Strikes, Multiattack, Resistance: Fire, Fly Speed, Skill Affinity: Stealth, and Telepathic Link. None could be tested.

---

## Section 4: Harrowing Presence

**Result: BLOCKED by cast dialog crash (Section 2)**

The Harrowing Presence modification is never applied, so the Aura Effects aura is never created on the Tulpa, and the `dnd5e.combatTurnStart` hook handler has nothing to read.

**Note from the CHANGELOG (v0.1.0 Known Limitations):** "The exact applied-effect schema slot used by Aura Effects 1.5.2 (`system.appliedEffect` vs. another key) could not be verified outside a real Foundry runtime. Marker propagation should be verified in-world." This is still unverified.

---

## Section 5: Shared Initiative

**Result: BLOCKED by cast dialog crash (Section 2)**

`alignTulpaInitiative()` is never called. The initiative alignment code (setting Tulpa initiative to caster's initiative minus 0.01) was not exercised.

---

## Section 6: Relentless

**Result: BLOCKED by cast dialog crash (Section 2)**

The Relentless watcher (`armRelentlessWatcher()`) is never called because the cast flow aborts. `restoreRelentlessWatchers()` runs at `ready` (confirmed by the hook registration in R5), but there are no watchers to restore since none were ever armed.

---

## Section 7: Dismissal Triggers

**Result: BLOCKED by cast dialog crash (Section 2)**

The anchor AE ("Manifest Tulpa (active)") is never created on the caster, which means all five dismissal paths are non-functional:

1. **Duration expiry** via `times-up` -- no AE with `duration.seconds` exists.
2. **Tulpa at 0 HP** via DAE `specialDuration: zeroHP` -- no AE with that flag exists.
3. **Caster death** via DAE `specialDuration: isDeath` -- no AE with that flag exists.
4. **Re-cast** (checking for existing anchor at cast start) -- no anchor to find.
5. **Manual token deletion** (the `preDeleteToken` hook) -- no anchor to cascade-delete.

The `deleteActiveEffect` and `preDeleteToken` hooks ARE registered (confirmed in R5), but have no anchor AE to operate on.

---

## Section 8: Session Reload

**Result: BLOCKED by cast dialog crash (Section 2)**

The session reload test requires an active Relentless watcher to verify re-arming at `ready`. Since no watcher is ever armed, this test is not meaningful.

---

## Console Errors and Warnings Log

### Module-specific errors

| # | Error | Source | Count | Impact |
|---|-------|--------|-------|--------|
| 1 | `Failed to render Application "manifest-tulpa-cast-dialog": Template part "body" must render a single HTML element` | `cast-dialog.hbs` via HandlebarsApplicationMixin | 3 (once per cast attempt) | CRITICAL -- kills the entire cast flow |

### Module startup log (correct behavior)

```
manifest-tulpa | init
Foundry VTT | Loaded localization file modules/manifest-tulpa/lang/en.json
Foundry VTT | Constructed index of manifest-tulpa.manifest-tulpa-spells Compendium containing 1 entries
manifest-tulpa | ready
```

All four lines appear in the correct order. The actors compendium (`manifest-tulpa-actors`) is lazy-indexed on first access (normal Foundry behavior for actor packs), not at startup.

### Other module errors (NOT from manifest-tulpa)

These errors appeared in the console from other modules. Listed for completeness -- none impact manifest-tulpa:

- `lib-df-buttons(13.1.1)`: TypeError on `ControlManager.render` -- cannot read `.request` of undefined
- `levels`: V1 Application framework deprecation warning
- `token-quips`: Global `KeyboardManager` deprecation warning
- `bbmm`: Global `FilePicker` deprecation warning (3 instances)
- `theripper-premium-hub`: Global `renderTemplate` deprecation warning

---

## Comparison: v0.1.3 vs v0.1.4

| Finding | v0.1.3 Status | v0.1.4 Status |
|---------|---------------|---------------|
| `{{in}}` Handlebars helper crash | BROKEN | FIXED |
| `module.json` download URL pinned to v0.1.0 | BROKEN | FIXED |
| Hook accumulation on world reload | BROKEN | FIXED |
| Spell range shows "Self" instead of "30 Feet" | BROKEN | FIXED |
| Material component text mismatch | BROKEN | FIXED |
| Vestigial Tether feature on Tulpa actor | PRESENT | REMOVED |
| Cast dialog crashes on render | YES (`Missing helper: "in"`) | YES (new: `must render a single HTML element`) |
| Cast flow completes | NO | NO |
| Any downstream feature testable | NO | NO |

**Bottom line:** v0.1.4 cleaned up real issues, but the cast dialog has never successfully rendered in any released version. The `{{in}}` error in v0.1.3 masked the template structure error that v0.1.4 now exposes. Once the single-root-element fix is applied, v0.1.4's other fixes (isSelected, range, materials, hook guard, Tether removal) should allow the first real end-to-end test of the cast flow.

---

## Priority Fix Order

1. **CRITICAL -- Fix the cast dialog template structure** (Section 2). Wrap the template content in a single root element, or split into separate PARTS. This single fix unblocks ALL downstream functionality. Recommended approach: wrap `<section>` + `<footer>` in a `<div class="manifest-tulpa-cast-body">`.

2. **HIGH -- Retest everything** after the template fix. The entire module's runtime behavior has never been tested in any release. The code looks correct on static review, but many integration points need live verification:
   - Stat adjustments (AC, HP, proficiency, attack bonus, save DCs)
   - Every modification in the registry
   - Aura Effects 1.5.2 marker propagation for Harrowing Presence
   - DAE specialDuration triggers for dismissal
   - times-up duration expiry
   - Initiative alignment
   - Relentless watcher arming and restoration
   - Orphan cleanup on cancel

3. **MEDIUM -- Verify summon range enforcement** (R3). Confirm that Portal actually constrains token placement to 30ft with the updated range override. If not, additional wiring may be needed.

4. **LOW -- Investigate orphan Tulpa cleanup.** After a dialog crash, the Tulpa token and actor persist on the canvas. The `abortAndCleanup()` path may have a timing issue with dnd5e's async summon. Worth reviewing whether the cleanup reliably finds and removes the orphan.

---

## Appendix A: Files Reviewed

| File | Purpose | Notes |
|------|---------|-------|
| `modules/init.js` | Hook registration | Correct. Guard works (R5 PASS). |
| `modules/cast-flow.js` | Main cast orchestration | Logic appears sound; never fully executes due to dialog crash. |
| `modules/cast-dialog.js` | ApplicationV2 dialog class | `_prepareContext` correctly computes `isSelected`. **BUG: `static PARTS` defines one part but its template has two root elements.** |
| `templates/cast-dialog.hbs` | Dialog template | **BUG: two root elements (`<section>` + `<footer>`).** The `isSelected` fix from v0.1.3 is correctly applied. |
| `modules/constants.js` | Module constants | Not reviewed this session (no changes in v0.1.4). |
| `modules/modification-registry.js` | Modification definitions | Not exercised at runtime. |
| `module.json` | Module manifest | Version 0.1.4, download URL fixed, dependency IDs correct. |
| `manifest-tulpa.txt` | Spell source text | Authoritative for mechanics. |
| `CHANGELOG.md` | Release notes | Documents all v0.1.4 fixes accurately. |

## Appendix B: What the Fix Looks Like

For the developer picking this up, the minimal fix is a single-file change to `templates/cast-dialog.hbs`. No JavaScript changes are needed for Option A.

**Current (broken):**
```handlebars
<section>
  ...content...
</section>

<footer class="form-footer">
  ...buttons...
</footer>
```

**Fixed (Option A -- single wrapper):**
```handlebars
<div class="manifest-tulpa-cast-body">
  <section>
    ...content...
  </section>

  <footer class="form-footer">
    ...buttons...
  </footer>
</div>
```

After this change, the template renders one root `<div>`, satisfying the `HandlebarsApplicationMixin` constraint. No changes to `cast-dialog.js` are required because `_attachPartListeners` already receives the part's root element and queries within it.

---

## Sign-off

Tester: Claude (automated)
Date: 2026-05-25
Foundry build: V13.351
dnd5e version: 5.2.5
Module version: 0.1.4
