# Manifest Tulpa — Manual Smoke Test

**Setup:**
1. dnd5e world V13.351 / dnd5e 5.2.5.
2. Required modules enabled: midi-qol, dae, times-up, sequencer, portal-lib, lib-wrapper, socketlib, ActiveAuras ≥0.12.7, jb2a_patreon, autoanimations.
3. Recommended: (none — all dependencies are required as of v0.1.11.)
4. Install the module from a local build (Foundry → Setup → Install Module → Manifest URL → file path or local-network URL).
5. Create or pick a PC at character level 9+ (so 5th-level slots exist).
6. Drag the spell from the **Manifest Tulpa - Spells** compendium onto the PC.

## Module-load test (verifies Tasks 1, 2)

- Open the browser console. Expected: two log lines `manifest-tulpa | init` and `manifest-tulpa | ready`.

## Regression checks (v0.1.4 → v0.1.12)

Run these before the full smoke test. Each verifies a specific fix from the per-version patch sets. See [CHANGELOG.md](../../../CHANGELOG.md) and the corresponding test reports for full context.

### v0.1.4 fixes — [test report](manifest-tulpa-test-report-2026-05-25.md)

| # | Check | Why |
|---|---|---|
| R1 | Open the spell card on the PC sheet. Material component reads "a crystal shard imbued with your psychic resonance, worth at least 100 GP" with **one** set of parentheses (added by dnd5e's display formatter) and is **not** marked consumed. Range shows "30 ft." | Materials text + range matched to `manifest-tulpa.txt` RAW (outer parens stripped in v0.1.7 UX 3). |
| R2 | Open the Tulpa actor sheet (drag from the Actors compendium). Features tab shows **Manifestation Strike** only — **no "Tether" feat**. | Vestigial Tether feat removed. |
| R3 | Cast Manifest Tulpa. After the dnd5e slot dialog, the placement crosshair / template appears bounded to within 30 feet of the caster (placing outside the radius is rejected by dnd5e's summon UI). | Summon-activity range now `30 ft` with `override: true`. |
| R4 | Cast dialog opens after placement **without** a console error. Console must NOT contain `Missing helper: "in"`, `Failed to render Application "manifest-tulpa-cast-dialog"`, or `Template part "body" must render a single HTML element`. | `{{in}}` helper bug fixed (v0.1.4); template single-root wrap added (v0.1.5). |
| R5 | In the console, run `Hooks.events["dnd5e.postUseActivity"]?.length`. Expected: 1, regardless of how many times the world was reloaded. | `globalThis.__manifestTulpaHooksRegistered` guard prevents listener accumulation. |

### v0.1.5 fix — [test report](manifest-tulpa-test-report-v0.1.4.md)

The sole v0.1.5 fix (cast-dialog single-root template wrap) is already covered by **R4** above — the assertion now includes the `Template part "body" must render a single HTML element` message that this fix resolves.

### v0.1.6 fixes — [test report](manifest-tulpa-test-report-v0.1.5.md)

| # | Check | Why |
|---|---|---|
| R6 | Cast Manifest Tulpa, place the token, confirm the cast dialog. Console must NOT contain `Summon produced no token — check the spell's summon activity` and the caster sheet must show the **Manifest Tulpa (active)** anchor AE within a second. | `locateSummonedTulpa` now matches `flags.dnd5e.summon.origin` by `startsWith` prefix instead of strict equality (Bug 1). |
| R7 | After confirming the dialog with **Empowered Strikes** + a damage type, open the Tulpa's Manifestation Strike. Both **melee** and **ranged** activities show a `1d8` damage entry of the chosen type alongside the original `2d8`. Console must NOT contain `TypeError: Cannot read properties of undefined (reading 'push')`. | `empoweredStrikes.patch` now iterates `system.activities.<id>.damage.parts` and returns a per-activity diff (Bug 3). |
| R8 | After confirming the dialog with any damage type, open the Tulpa's Manifestation Strike. The first damage entry in each activity shows the **chosen damage type** (not "Bludgeoning"). | `setStrikeDamageType` writes to `system.activities.<id>.damage.parts[0].types` (Bug 2). |
| R9 | Dismiss the Tulpa (any trigger: re-cast, manual token delete, `game.time.advance(3600)`). The token disappears within **≤ 5 seconds** even if jb2a assets are missing or autoanimations is disabled. Console may show a single `dismiss animation timed out after 5000ms` warning — that's expected when assets aren't indexed. | 5-second `Promise.race` wrapper on all Sequencer calls (Bug 4). |
| R10 | After confirming the dialog, the Tulpa sheet shows: **AC = 13 + caster spellcasting mod**, **HP = 40 + 5 × caster level** (both max and current), **Spellcasting Ability** set to the caster's, **Spell DC** matching the caster's, **CR** matching the caster's proficiency bonus (prof 2→CR 1, 3→5, 4→9, 5→13, 6→17). | New `applyCasterStats` step bakes caster-derived stats onto the spawned actor. |
| R11 | Cast with **Harrowing Presence** + place a hostile NPC in range, then start combat. On the NPC's turn-start, a Wis save posts to chat. Console must NOT contain a `TypeError` from `harrowing-presence-hook.js`. | `rollSavingThrow` return-shape (Array<D20Roll> \| single roll \| null) is normalized and wrapped in try/catch. |

### v0.1.7 fixes — [test report](manifest-tulpa-test-report-v0.1.6.md)

| # | Check | Why |
|---|---|---|
| R12 | Cast Manifest Tulpa, place the token, confirm the dialog. Open the spawned Tulpa's Manifestation Strike. **Both melee and ranged Attack activities exist** with `2d8 + @mod` damage. The selected damage type is set on each. Combat use rolls to-hit + damage successfully. | Bug 5: validator (`scripts/validate-pack.js`) now asserts every actor weapon item carries ≥1 Attack activity with non-empty `damage.parts`; release build can no longer ship a stale LevelDB pack lacking activities. |
| R13 | Cast with **Harrowing Presence** + a hostile NPC inside the 10-ft ring. Inspect the NPC's active effects (Active Effects tab). A marker AE propagated by Aura Effects carries `flags.manifest-tulpa.inHarrowingAura = true` and `flags.manifest-tulpa.auraDC = <caster spell DC>`. Start combat; on the NPC's turn-start the Wis save posts and `frightened` applies on fail. | Bug 6: aura AE's `changes` array now holds the two flag changes Aura Effects 1.5.2 propagates; the hook reads them via `actor.getFlag` post-application. |
| R14 | Roll a combat. Cast Manifest Tulpa mid-combat. The Tulpa is **added to the combat tracker** automatically and lands at `caster initiative − 0.01` (immediately after the caster). Re-roll the caster's initiative; the Tulpa re-aligns within one tick. | Bug 7: `alignTulpaInitiative` now inserts the combatant if missing, and a new `updateCombatant` hook re-aligns Tulpa rows whenever the caster's row updates. |
| R15 | Cast, then immediately re-cast. The old Tulpa's dismissal chat card reads "**Tulpa Dismissed: recast**" (NOT "duration ended"). The new Tulpa spawns with fresh stats. | Bug 8: cast-flow tags the previous anchor with `dismissReason: "recast"` before deleting it, so `inferReason` no longer falls through to "duration". |
| R16 | Cast **without** Relentless. Deal damage that drops the Tulpa to 0 HP. The Tulpa is dismissed within one tick: token removed, anchor AE on caster gone, "Tulpa Dismissed: zeroHP" chat card posts. | Bug 9: `tulpa-hp-watcher.js` now arms on every cast (not just Relentless casts) and tags + deletes the anchor when the Tulpa's HP reaches 0 after Relentless is unavailable or already consumed. |
| R17 | Cast Relentless again. Deal lethal damage twice. First hit → HP clamps to 1, Relentless chat + flag set. Second lethal hit → Tulpa dismissed (zeroHP path), token removed within one tick. | Bug 9: same watcher handles the post-Relentless drop in a single funnel. |
| R18 | Cast, then mark the caster as dead (HP→0 or toggle the Dead status). DAE's `specialDuration` removes the anchor AE; the Tulpa token is removed within one tick and an "isDeath" dismissal chat card posts even though the synthetic actor UUID has gone stale. | Bug 10: anchor AE now stores `tulpaTokenId` + `tulpaSceneId` so `onDeleteActiveEffect` can fall back to `scene.tokens.get(id)` when `fromUuid(tulpaUuid)` returns null. |
| R19 | Open the cast dialog. Every modification checkbox shows a **human-readable label** (e.g. "Reinforced Form", "Skill Affinity: Stealth", "Size Shift: Large") — no raw camelCase or snake_case slugs like `reinforcedForm` or `skill_ste`. | UX 1: `_prepareContext` precomputes `displayName` from the AE/item name with a `prettifySlug` fallback. |

### v0.1.8 fixes — [test report](2026-05-25-v0.1.7-smoke-report.md)

| # | Check | Why |
|---|---|---|
| R20 | Cast Manifest Tulpa with a damage type other than bludgeoning (e.g. **radiant**) and pick **Empowered Strikes**. Open the spawned Tulpa's Manifestation Strike. The first damage entry on each activity reads `2d8 radiant` (not bludgeoning), and a **second** entry `1d8 radiant` is present on both melee and ranged. | Bug A (v0.1.8): `setStrikeDamageType` + `empoweredStrikes.patch` now iterate `ActivityCollection` via the Map protocol (shared `iterActivities` helper); `Object.entries()` returned `[]` on Maps in v0.1.7 and both paths silently no-op'd. Bug A continuation (v0.1.9): the two writes were also racing — Empowered Strikes' `deepClone(act.damage.parts)` captured the pre-update parts and clobbered Part 0's type back to bludgeoning. v0.1.9 merges both into a single `applyStrikeChanges` writer. |
| R21 | Cast with **Harrowing Presence** + place a hostile NPC inside the 10-ft ring. Within one Aura Effects pulse (move the NPC 1 square if needed), inspect the NPC's Active Effects tab: a marker effect propagated by Aura Effects carries `flags.manifest-tulpa.inHarrowingAura = true` and `flags.manifest-tulpa.auraDC = <caster spell DC>`. Start combat; the Wis save fires on the NPC's turn-start. | Bug B: aura template now ships the full Aura Effects 1.5.2 `system` schema — most critically `collisionTypes: ["move"]`, without which Aura Effects 1.5.2 never registers the proximity check that drives propagation. R13 covered code-level field presence; R21 verifies *runtime* propagation. |
| R22 | Open the cast dialog. Every Skill Affinity entry shows a **full English skill name** ("Stealth", "Perception", "Sleight of Hand", "Animal Handling") — **no** 3-letter all-caps codes (STE, PRC, SLT, ANI). | Bug C: dynamic skill loop now maps 3-letter `CONFIG.DND5E.skills` codes to full names via lookup table with `code.toUpperCase()` fallback. |
| R23 | Cast and wait out the 1-hour duration via `game.time.advance(3601)`. Token and anchor AE both disappear within one tick. **Console must NOT contain** `EmbeddedCollection.get: undefined id [...] does not exist`. | Bug D: dismiss-flow now checks the token is still present in `tokenDoc.parent.tokens` before calling delete — eliminates the times-up race noise. |
| R24 | Disable jb2a_patreon (or temporarily rename a manifest asset in Sequencer's database) and cast Manifest Tulpa. The cast chat card posts **within one tick** (not after the 5-second timeout). Dismiss the Tulpa; same fast path. Console may show a single Sequencer warning but no `manifest animation timed out` errors. | Bug E: `assetAvailable()` pre-flight in animations.js uses `Sequencer.Database.entryExists` to skip the Sequence entirely when the asset is confirmed missing, avoiding the full 5-second timeout wait. |

### v0.1.9 fixes — [test report](2026-05-26-v0.1.8-smoke-report.md)

| # | Check | Why |
|---|---|---|
| R25 | Cast Manifest Tulpa with a non-bludgeoning damage type (e.g. **radiant**) and **WITHOUT** Empowered Strikes. Open the Tulpa's Manifestation Strike. Both melee and ranged activities show **exactly one** damage entry, `2d8 radiant`. No second part is present. Then re-test with both damage type + Empowered Strikes selected — both Part 0 and Part 1 must read the chosen type (R20). | Bug A (v0.1.9): write race between `setStrikeDamageType` and `empoweredStrikes.patch` is eliminated by `applyStrikeChanges` doing one combined `strike.update()`. R25 covers the no-Empowered-Strikes path (which v0.1.8 happened to get right by accident); R20 covers the both-selected path that was broken. |
| R26 | Cast with **Relentless**. Deal lethal damage. Tulpa clamps to 1 HP, Relentless chat card posts. **Immediately reload the world tab** (F5). Inflict lethal damage again on the Tulpa. Expected: Tulpa is dismissed (zeroHP path); Relentless does **not** re-trigger. Inspect the Tulpa actor before the second hit: `flags["manifest-tulpa"].relentlessUsed = true` is present. | Bug B (v0.1.9): the `relentlessUsed` flag write is now embedded in the same `preUpdateActor` `changes` mutation that clamps HP, rather than fired-and-forgotten via `await actor.setFlag()` from an async hook handler (Foundry V13 doesn't await async hook handlers, so the flag could be lost on reload before persisting). |
| R27 | Cast Manifest Tulpa. Open the caster's Active Effects tab and **right-click → Delete** the "Manifest Tulpa (active)" anchor AE directly (do not delete the token, do not use any other trigger). The dismissal chat card reads "**Tulpa Dismissed: manual**" (NOT "duration"). Repeat with the caster at 0 HP via DAE specialDuration: the card reads "isDeath". | Bug C (v0.1.9): `inferReason` now uses a fallback ladder — `options.dismissReason` → flag → caster HP ≤ 0 → duration remaining ≤ 0 → manual. v0.1.8 fell through to "duration" for any untagged delete, mislabeling GM-driven removals. |

### v0.1.10 fixes — [test report](2026-05-26-v0.1.9-smoke-report.md)

| # | Check | Why |
|---|---|---|
| R28 | Cast Manifest Tulpa with a non-bludgeoning damage type (e.g. **radiant**), no Empowered Strikes. Open the spawned Tulpa's Manifestation Strike sheet, then run in the console: `tulpa.items.getName("Manifestation Strike").system.activities.contents.map(a => [...(a.damage.parts[0]?.types ?? [])])`. Every activity's Part 0 `types` must equal `["radiant"]`. Repeat with **psychic** and **force**. | Bug 1 (v0.1.10): v0.1.9's `applyStrikeChanges` `deepClone`d each part and degraded the `Set`-typed `types` into a plain object, which `DamageData` silently rejected — the strike kept its bludgeoning baseline regardless of dialog selection. v0.1.10 routes through pure `buildStrikeParts` (Set/array/object/null coerced via `toTypesArray`, no `deepClone`). The R20 + R25 happy-path checks rely on this fix; R28 is the runtime-data-shape assertion that locks it. |
| R29 | Cast Manifest Tulpa with **psychic** damage and **without** Relentless. Deal lethal damage. The Tulpa token must disappear from the canvas within one tick (do not wait 5s) **even if** the dismiss animation fails. Manually verify by running, before damage: `const t = canvas.tokens.placeables.find(p => p.actor.name === "Tulpa"); t.document.id` — and after damage: `canvas.scene.tokens.has("<that id>")` should return `false`. Console may show a `manifest-tulpa | dismiss animation failed` warning; that is the expected guard, not a failure. | Bug 2 (v0.1.10): v0.1.9's `playDismiss` was outside any error handler, so a Sequencer throw on a missing asset unwound out of `onDeleteActiveEffect` before `tokenDoc.delete()` ran. v0.1.10 wraps `playDismiss` in `try/catch` so the delete always runs, and uses `tokens.has(id)` instead of an identity check (Foundry can re-instantiate the document mid-flow, false-negativing the identity guard). |
| R30 | Cast Manifest Tulpa without Relentless. Deal lethal damage to the **Tulpa**. The dismissal chat card reads "**Tulpa Dismissed:** the Tulpa was reduced to 0 hit points." (NOT "the caster fell to 0 HP"). Then in a separate cast, deal lethal damage to the **caster** (DAE `specialDuration: ["zeroHP"]` fires the cascade). That card reads "the caster fell to 0 HP." | Bug 3 (v0.1.10): v0.1.9 used a single `zeroHP` dismiss reason for both the Tulpa-HP-watcher cascade and the caster-zero-HP DAE trigger, and `lang/en.json` mapped that single key to caster-focused text. v0.1.10 splits into `tulpaZeroHP` (set by the watcher) and `casterZeroHP` (returned by `inferReason` when `caster.system.attributes.hp.value <= 0`), with distinct chat strings in `lang/en.json`. |
| R31 | Cast Manifest Tulpa with **psychic** damage. Dismiss the Tulpa (any trigger). The psychic dismiss/impact animation must play without a `jb2a.impact.010.pink` Sequencer error in the console. Verify in the console: `Sequencer.Database.entryExists("jb2a.impact.010.pinkpurple")` returns `true` and `Sequencer.Database.entryExists("jb2a.impact.010.pink")` returns `false`. | Bug 5 (v0.1.10): v0.1.9's psychic preset listed `impact: { asset: "jb2a.impact.010.pink" }`, but jb2a_patreon 0.6.91 only carries the `pinkpurple` variant for `impact.010` — the bare `pink` asset doesn't exist. The psychic *strike* already used `pinkpurple`, so the two were visually mismatched even when the dismiss worked. v0.1.10 changes `impact` to `pinkpurple` so the strike→impact chain reads as a coherent effect; a parity test in [tests/animation-presets.test.mjs](../../../tests/animation-presets.test.mjs) locks every preset's strike + impact colour suffix to match so a future partial palette update can't re-introduce the split. |
| R32 | Open a second Foundry window or popout that overlaps the Manifest Tulpa cast dialog (the goal is to force a render where `this.element` is null mid-positioning — BBMM's window manager reliably triggers this; otherwise rapid-click cancel during render). The console must NOT contain `TypeError: Cannot read properties of null (reading 'offsetWidth')` originating from `ManifestTulpaCastDialog._updatePosition`. The spell slot must NOT be consumed without a corresponding cast or cancel chat card (no "ghost cast"). | Bug 6 (v0.1.10): ApplicationV2's default `_updatePosition` reads `this.element.offsetWidth`; when another module closed the dialog mid-positioning, `this.element` was null and the TypeError aborted the render *after* `postUseActivity` had already spent the slot. v0.1.10 overrides `_updatePosition` in [modules/cast-dialog.js](../../../modules/cast-dialog.js) to bail out and return the position unchanged when `this.element` is null, otherwise delegate to `super._updatePosition`. |

### v0.1.11 fixes — [test report](2026-05-26-v0.1.10-smoke-report.md)

| # | Check | Why |
|---|---|---|
| R33 | Open the cast dialog. Resize the browser to a 768×800 viewport (or smaller). The dialog body **must scroll vertically** when modifications overflow, the **slot counter + Cancel + Manifest buttons stay pinned at the bottom** of the dialog (always visible, never scrolled off), and the dialog itself must not exceed roughly 70% of the viewport height. Verify by scrolling within the dialog — the footer's top border remains stationary while the modification categories scroll past it. | Bug 5 (v0.1.11): v0.1.10's cast dialog used `position: { height: "auto" }` with no `max-height` on `.mt-cast-body`, so on standard viewports the 8 Morphic + 4 Combat + 10 Resistance + 4 Movement + 18 Skill + 1 Special entries pushed the submit button off-screen with no scroll indicator. v0.1.11 makes `.mt-cast-body` a flex column with `max-height: 70vh`; the inner `<section>` is `flex: 1 1 auto; overflow-y: auto` (scrolling region) and the inner `.form-footer` is `flex: 0 0 auto` (pinned bottom). User-flagged top-priority cosmetic. |
| R34 | Cast Manifest Tulpa. Open the caster's Active Effects tab and **right-click → Delete** the "Manifest Tulpa (active)" anchor AE directly (do not delete the token, do not use any other dismissal trigger). The dismissal chat card now reads "**Tulpa Dismissed: the anchor effect was removed**" (NOT "the token was removed manually"). Then in a separate cast, right-click → delete the **Tulpa token** instead. That card reads "the Tulpa's token was deleted." | Bug 1 (v0.1.11): v0.1.10's `inferReason()` fallback returned `"manual"` for any unflagged anchor deletion, and `lang/en.json` mapped `manual` to "the token was removed manually" — backwards when the *anchor*, not the *token*, was the entity deleted. v0.1.11 splits the two: `inferReason()` returns `"anchorRemoved"` ("the anchor effect was removed") for the unflagged anchor-deletion fallback, and the `onPreDeleteToken` hook (trigger #5) passes `dismissReason: "manual"` explicitly through `options[MODULE_ID]` with new text "the Tulpa's token was deleted." See [modules/dismiss-flow.js](../../../modules/dismiss-flow.js) and [lang/en.json](../../../lang/en.json). |
| R35 | Cast Manifest Tulpa with **Harrowing Presence** selected. Place a hostile NPC token within 5 ft of the Tulpa (well within the 10 ft aura radius — the Tulpa's aura visual should be visible as the Active Auras ring). Inspect the NPC's effects panel within one tick of placement. A marker effect propagated by **Active Auras** carries `flags["manifest-tulpa"].inHarrowingAura = true` and `flags["manifest-tulpa"].auraDC = <caster spell DC>` (verify via `npc.getFlag("manifest-tulpa", "inHarrowingAura")` and `npc.getFlag("manifest-tulpa", "auraDC")` in the console — both must resolve, the DC must be a literal number not "@attributes.spelldc"). Start combat; on the NPC's turn-start the Wis save posts to chat and `frightened` applies on fail. Move the NPC outside the 10 ft ring; AA removes the marker within one pulse. | Bug 3 (v0.1.11): the Harrowing Presence marker has been broken across every version since v0.1.6 — v0.1.10 had structurally correct `auraeffects.aura` data but Aura Effects 1.5.2's V13 registration path for AE-typed sources on synthetic/unlinked actors never landed the marker. v0.1.11 swaps the propagation engine to Active Auras 0.12.7 (kandashi) by rewriting `harrowingPresence.build` in [modules/modification-registry.js](../../../modules/modification-registry.js) to return a plain `ActiveEffect` tagged with `flags.ActiveAuras = { isAura: true, aura: "Enemy", radius: "10", hostile: true, ignoreSelf: true, collisionTypes: ["move"], wallsBlock: "system", time: "None", ... }` plus the literal numeric DC under `flags["manifest-tulpa"].auraDC`. AA propagates via `foundry.utils.duplicate`, carrying both the `changes` array (flag-key writes) and our foreign-namespace `flags` bag onto each hostile marker. The `combatTurnStart` hook in [modules/harrowing-presence-hook.js](../../../modules/harrowing-presence-hook.js) is unchanged because `actor.getFlag(MODULE_ID, ...)` resolves identically against either propagation engine's marker. `module.json` swaps `auraeffects` for `ActiveAuras` (≥0.12.7), `socketlib`, and `lib-wrapper`. **R13 and R21 are superseded by R35** — both originally targeted Aura Effects propagation. |
| R36 | Open the spell card on the PC sheet (right-click → Show to Players, or just hover-expand the chat-card item). The card displays the spell front-matter (Level 5 Conjuration, Casting Time, Range, Components, Duration) **exactly once**, rendered by dnd5e from the structured `system.*` fields. The description body must start with "**You crystallize a fragment of your mental essence into a psychic construct called a Tulpa…**" — there must be **no duplicate** "Manifest Tulpa / Level 5 Conjuration / Casting Time: Action / Range: 30 feet / Components: V, S, M (...) / Duration: 1 Hour" header repeated inside the description body. | Bug 4 (v0.1.11): the description value in [_source/manifest-tulpa-spells/Item.manifest-tulpa.json](../../../_source/manifest-tulpa-spells/Item.manifest-tulpa.json) baked the spell front-matter directly into the description prose during the original world-export scrub, and dnd5e *also* renders that front-matter from the structured fields — producing a double-printed header on every spell-card preview. v0.1.11 strips the leading header from `description.value`; the description now starts directly with the prose. **`npm run build:packs` was run as part of this release** to apply the change to the LevelDB pack — the first `_source/` change since v0.1.7. |

### v0.1.12 fixes — [test report](2026-05-27-v0.1.11-smoke-report.md)

| # | Check | Why |
|---|---|---|
| R37 | Cast Manifest Tulpa. The placement crosshair appears — confirm placement. The cast dialog opens. **Click Cancel** (do not pick any modifications). Expected: the Tulpa token that was placed on the canvas is removed within one tick, the slot stays refundable per the existing cancel-cleanup contract, and **no orphan Tulpa token remains** on the canvas. Verify by running `canvas.tokens.placeables.filter(t => t.actor?.name === "Tulpa").length` immediately after cancel — must be `0`. Repeat 3× in a row; the count must return to `0` each time. | Bug 2 (v0.1.12): v0.1.11's `locateSummonedTulpa` read `results.createdTokens` first, but dnd5e 5.2.5's `SummonActivity` writes the freshly placed `TokenDocument[]` to `results.summoned` (see `module/documents/activity/summon.mjs` L113 in the dnd5e source). The cast-flow locate returned `null`, so the cancel branch's `abortAndCleanup(token)` had no handle to delete, and the placed token leaked on every cancel. v0.1.11 smoke session accumulated 5 orphans across the run. v0.1.12 routes through pure `pickSummonedFromResults` (reads `results.summoned` first) with a `scanPlaceablesForSummon` fallback that filters `canvas.tokens.placeables` by `flags.dnd5e.summon.origin.startsWith(casterUuid + ".")`. The locate now runs **before** `openCastDialog` so the cancel branch always has a handle. See [modules/locate-helpers.js](../../../modules/locate-helpers.js) (pure, Node-tested) and [modules/cast-flow.js](../../../modules/cast-flow.js). |
| R38 | Cast Manifest Tulpa. Confirm the dialog (any mods). Open the caster's Active Effects tab — note the **two** AEs present: "Manifest Tulpa (active)" (the module's anchor) and **"Summon: Manifest Tulpa"** (the dnd5e system-side summon AE, carrying `flags.dnd5e.summon.origin` pointing at the spell item). Dismiss the Tulpa via any trigger (duration, zeroHP, isDeath, recast, manual). After dismissal completes, the caster's Active Effects tab must show **zero** AEs related to Manifest Tulpa — both the module anchor *and* the system "Summon: Manifest Tulpa" AE are gone. Verify in the console: `game.actors.getName("<caster>").effects.filter(e => /manifest.?tulpa/i.test(e.name)).length` must be `0`. Repeat across all five dismissal triggers — none may leave the system AE behind. | Bug 1 (v0.1.12, carried since v0.1.9): the single-funnel dismissal cleanup removed the module's caster-side anchor AE but never touched dnd5e's system-side "Summon: Manifest Tulpa" AE (created by the system summon flow with `flags.dnd5e.summon.origin` set to the spell item UUID). The orphan AE accumulated across casts and broke the v0.1.6 leak-watch invariant (CLAUDE.md §"Architectural invariants" item 1: "exactly one anchor while a Tulpa is live, zero otherwise") — the by-flag count returned to 0 but the by-name regex count drifted upward. v0.1.12 adds `findSystemSummonAE(caster, spellIdentifier)` in [modules/dismiss-helpers.js](../../../modules/dismiss-helpers.js) (pure, Node-tested) — matches by spell-item UUID prefix on `flags.dnd5e.summon.origin` (primary) with a name-regex fallback. [modules/dismiss-flow.js](../../../modules/dismiss-flow.js) calls it after token teardown and before the `postDismiss` chat-card post, so every dismissal trigger sweeps both AEs. |
| R39 | Cast Manifest Tulpa with **Harrowing Presence**. Place a hostile NPC inside the 10-ft ring; confirm the marker AE landed (R35). Start combat. Advance turns until the NPC's turn begins. Expected: a Wis save against the caster's spell DC posts to chat **automatically** on the NPC's turn-start (no manual macro, no `combat.nextTurn()` poke required). Verify in the console: `Hooks.events["dnd5e.combatRecovery"]?.length` returns ≥1, and `Hooks.events["dnd5e.combatTurnStart"]` returns `undefined` (the v0.1.11 phantom hook is gone). Repeat across 3 NPC turns; the save must fire every time the NPC starts a turn while standing in the aura, and must **not** fire on other combatants' turns. | Observation 2 (v0.1.11 smoke → v0.1.12 fix): v0.1.11's harrowing-presence-hook registered `dnd5e.combatTurnStart`, a string dnd5e never emits — verified by full grep across `dnd5e/module/`. The canonical signal is `dnd5e.combatRecovery(combatant, periods, results)` fired from `Combatant5e.recoverCombatUses(periods)` inside `Combat5e._onStartTurn(combatant)` (see [.understand-anything/dnd5e-research/dnd5e/module/documents/combatant.mjs:124](../../../.understand-anything/dnd5e-research/dnd5e/module/documents/combatant.mjs)). `_onStartTurn` passes `{ turn: true, turnStart: combatant }`, so all non-defeated combatants get the `turn` period each turn but only the **active** combatant gets `turnStart` — v0.1.12 gates the hook on `periods.includes("turnStart")`. See [modules/harrowing-presence-hook.js](../../../modules/harrowing-presence-hook.js) and [modules/init.js](../../../modules/init.js). |
| R40 | With `ActiveAuras.combatOnly` set to `true` in Game Settings → Module Settings → Active Auras, reload the world. Open the browser console and search for `manifest-tulpa | note:`. Expected: exactly one line reading `manifest-tulpa | note: ActiveAuras.combatOnly is enabled — Harrowing Presence will only propagate while a combat is active.` posts at `ready` (after the `manifest-tulpa | ready` line). Toggle the setting **off** and reload; the note must **not** appear. With AA disabled entirely, no error posts and no note appears (the `try`/`catch` around the settings read silently swallows the missing-setting case). | Observation 1 (v0.1.11 smoke → v0.1.12 fix): the v0.1.11 smoke session reported that A8 (aura ring rendering) was sensitive to AA's `combatOnly` world setting but the module gave no indication of which mode it was running in. v0.1.12 reads `game.settings.get("ActiveAuras", "combatOnly")` at `ready` (wrapped in try/catch to survive AA being absent or not yet registered) and logs a single `console.info` line when the setting is on. The README's new **Setup notes** section documents the same gotcha for users who don't watch the console. |
| R41 | Open [modules/modification-registry.js](../../../modules/modification-registry.js) and locate `harrowingPresence.build`. Verify the AA `flags.ActiveAuras.radius` is set to `"10"` (a stringified ten, matching `manifest-tulpa.txt` RAW: *"10-foot aura"*). In-world, cast with Harrowing Presence; the Active Auras visual ring (A8) renders at the 10-ft radius — measure with Foundry's ruler from the Tulpa token's center to the outer edge of the visible ring. Expected: 10 ft (2 squares on a standard 5-ft grid). | v0.1.10 Bug 4 carryover (v0.1.12 verified, no-op): the v0.1.9 smoke report flagged that Harrowing Presence might have shipped with the wrong aura radius. v0.1.12 inspection confirmed the registry's `radius: "10"` matches the RAW spell text, so no code change was required — only this regression row to lock the value against future drift. If a future refactor changes the radius (e.g. someone normalizes the stringified `"10"` to an integer `10` and AA stops parsing it), this row will catch the regression. |

If R4, R6, R12, R33, or R35 fails, **stop** and re-open the most recent test report — the cast flow + dialog + aura are the gates to every downstream test.

The **A1–A9 animation checks** (see [Animation coverage](#animation-coverage-a1--a9--graded-every-smoke) at the bottom) are graded equally with R1–R41: every smoke gives each A-row a `PASS` / `FAIL` / `BLOCKED` status, never "Not exercised this session." When a functional R-bug and a cosmetic A-bug collide on the same code path or version-slot, the R-bug still wins the fix-order slot — but the A-bug doesn't lose its grade.

## Cast flow happy path (verifies Tasks 10, 11)

1. Cast Manifest Tulpa at slot 5.
2. Slot dialog appears → submit. Slot is consumed.
3. **Tulpa appears on canvas with the actor template's flat baseline** (AC 13, HP 40, no spellcasting ability). Placement is bounded to within 30 ft of the caster (see R3). The caster-derived stats are applied in step 6 after the cast dialog confirms.
4. Cast dialog opens. Radio shows force/radiant/psychic; checkboxes are grouped by category and each label is human-readable (see R19).
5. Pick **psychic**, **Reinforced Form**, **Vital Surge**. Slot counter shows 2/2. Confirm.
6. Tulpa sheet now shows:
   - **AC** = `13 + caster spellcasting mod + 2` (Reinforced Form adds +2 on top of the `applyCasterStats` baseline).
   - **HP max** = `40 + 5 × caster level + 30` (Vital Surge adds +30 on top of the baseline).
   - **Spellcasting Ability**, **Spell DC**, and **CR** match the caster (see R10).
   - **Manifestation Strike** damage type is psychic on both melee and ranged activities (see R8).
7. Cast confirmation chat card posts.
8. Manifestation animation plays (the chosen damage type's ring effect at the Tulpa's token). jb2a_patreon + autoanimations are required dependencies as of v0.1.9, so a missing animation here means an asset-version mismatch or a Sequencer database issue, not an absent module — investigate rather than ignore.

## Modification correctness (verifies Tasks 6–9)

For each pair below, cast → confirm → inspect the Tulpa:

| Mod | Expected |
|---|---|
| Unsettling Form | Tulpa has flags `flags.midi-qol.grants.disadvantage.save.wis = 1` and `.cha = 1` |
| Size Shift: Large | Tulpa sheet says Large; token is 2×2 squares |
| Empowered Strikes | Manifestation Strike has an added 1d8 of the chosen damage type |
| Multiattack | A "Multiattack" feat item is on the Tulpa with the descriptive text |
| Resistance: Fire | Tulpa traits show Damage Resistance: Fire |
| Fly Speed | Tulpa movement: Fly = walking speed |
| Skill Affinity: Stealth | Tulpa is proficient in Stealth |
| Telepathic Link | Chat card "Telepathic Link established"; caster has `flags["manifest-tulpa"].telepathicLink = true` |

## Harrowing Presence (verifies Tasks 8, 14)

1. Cast with **Harrowing Presence** + **psychic**.
2. Place a hostile NPC within 10ft of the Tulpa. Confirm the Active Auras ring is visible around the Tulpa.
3. The NPC should immediately gain a marker AE propagated by Active Auras (kandashi 0.12.7) carrying both `flags["manifest-tulpa"].inHarrowingAura = true` and `flags["manifest-tulpa"].auraDC = <caster spell DC>` (a literal number — not the formula `@attributes.spelldc`). **Inspect the AE on the NPC and verify both flags are present** (Active Effects tab); also verify in the console via `npc.getFlag("manifest-tulpa", "inHarrowingAura")` / `npc.getFlag("manifest-tulpa", "auraDC")`. These flags live on the source effect's `changes` array (flag-key writes) and its `flags["manifest-tulpa"]` bag on the Tulpa side — AA clones the entire effect onto the in-range hostile via `foundry.utils.duplicate`, carrying both intact. See [modules/modification-registry.js](../../../modules/modification-registry.js) `harrowingPresence.build`.
4. Start a combat. On the NPC's turn-start, a Wis save roll posts to chat against your spell save DC (the hook reads `auraDC` via `actor.getFlag`).
5. On failure: NPC gets `frightened` status; auto-clears at the start of its NEXT turn (times-up).
6. Move the NPC out of range; marker AE disappears within the next Active Auras pulse.

## Shared initiative (verifies Task 12)

1. Cast during active combat. Confirm the Tulpa is auto-added to the combat tracker (see R14) and lands at caster's initiative - 0.01 (directly after).
2. End combat. Cast again. Start combat. Roll the caster's initiative. Confirm Tulpa initiative re-aligns within one tick via the `updateCombatant` hook.

## Relentless (verifies Task 13)

1. Cast with **Relentless**.
2. Deal damage equal to or exceeding the Tulpa's HP via Midi (auto-apply).
3. Expected: HP clamps to 1 (not 0). Chat card "Relentless triggers" posts. Tulpa's `flags["manifest-tulpa"].relentlessUsed = true`.
4. Repeat damage. Tulpa drops to 0 normally (Relentless does not re-trigger).

## Dismissal triggers (verifies Task 15)

For each, perform the action then verify the anchor AE, the Tulpa token, and a "Tulpa Dismissed" chat card all go away. **After every dismissal**, run the two console snippets below against the caster and record both counts — they must both be `0`. Any non-zero count indicates an anchor leak (see "Anchor AE leak watch" below).

```js
// Counts AEs whose displayed name matches the anchor name.
game.actors.getName("<caster name>").effects.filter(e => e.name === "Manifest Tulpa (active)").length

// Counts AEs that actually carry the tulpaUuid flag (the load-bearing identity).
game.actors.getName("<caster name>").effects.filter(e => e.getFlag("manifest-tulpa", "tulpaUuid")).length
```

If those two counts diverge (e.g. 1 anchor by name but 0 by flag, or vice versa), capture both numbers in the per-version smoke report — the divergence localizes the bug between "AE leaked with name only" vs "anchor leaked still flagged".

| # | Action | Reason in chat | Anchor-by-name count after | Anchor-by-flag count after |
|---|---|---|---|---|
| 1 | Wait 1 hour of game-world time (use `game.time.advance(3600)`) | duration | 0 | 0 |
| 2 | Deal damage equal to the **Tulpa's** HP (with Relentless absent or already consumed — see R16/R17) | tulpaZeroHP | 0 | 0 |
| 3 | Toggle caster dead status (see R18 for stale-UUID fallback) | isDeath | 0 | 0 |
| 4 | Re-cast Manifest Tulpa (see R15) | recast | 1 (the new live Tulpa's anchor) | 1 |
| 5 | Right-click → delete the Tulpa token | manual | 0 | 0 |

## Anchor AE leak watch (under investigation)

Tester reports from v0.1.8 noted that after a session of repeated cast/dismiss cycles the caster sometimes accumulated multiple AEs sharing the "Manifest Tulpa (active)" name. The architectural invariant (CLAUDE.md §"Architectural invariants" item 1) is **exactly one anchor while a Tulpa is live, zero otherwise** — so any accumulation is a bug. Run this stress test to try to reproduce:

1. Pick one caster. Run the two console snippets from the previous section against them now — both must read `0` before starting.
2. Cycle through this sequence five times in a row, alternating dismissal triggers:
   - Cycle 1: cast → wait 1 hour via `game.time.advance(3601)` (duration dismissal)
   - Cycle 2: cast → kill the Tulpa (zeroHP dismissal; no Relentless selected)
   - Cycle 3: cast → toggle caster dead status, then toggle it back off (isDeath dismissal)
   - Cycle 4: cast → cast Manifest Tulpa again without dismissing first (recast dismissal, then immediate fresh cast)
   - Cycle 5: cast → right-click → delete the Tulpa token (manual dismissal)
3. **After each cycle's dismissal completes** (chat card posted), re-run both console snippets and record both counts in the per-version smoke report under a new "Anchor AE leak watch" section. Expected: both counts return to `0` after every dismissal trigger except cycle 4's recast step, which transiently goes `1 → 1` (old deleted, new created).
4. If at any point either count exceeds `1` (or doesn't return to `0` post-dismissal), **stop the cycle test** and capture:
   - The full output of `game.actors.getName("<caster>").effects.map(e => ({ name: e.name, id: e.id, flags: e.flags["manifest-tulpa"], duration: e.duration?.remaining }))`
   - The most recent ~50 lines of console output (filter to `manifest-tulpa |` and any errors/warnings)
   - Which cycle number and dismissal trigger produced the leak

This data turns a "happens sometimes" report into an actionable bug for the next patch.

## Session reload (verifies the startup scan in Task 13 / 15)

1. Cast with **Relentless**.
2. Reload the world (refresh the tab).
3. Inflict killing damage on the Tulpa. Expected: HP clamps to 1, Relentless chat posts. (Confirms the watcher was re-armed at `ready`.)

## Animation coverage (A1 – A9) — graded every smoke

**Policy (added 2026-05-27, after the v0.1.11 smoke):** A1–A9 are first-class PASS/FAIL checks alongside R1–R38. Every per-version smoke report grades each A-row with one of `PASS`, `FAIL`, or `BLOCKED` (with a reason) — never "Not exercised this session" or "Do if time permits."

The reasoning behind this elevation:

1. Players see animations every cast; logic bugs typically once per character. A Tulpa that materializes silently feels broken even when the math is right, and cumulative cosmetic flaws read as "buggy module" at the table.
2. Functional firefighting is winding down. v0.1.7 → v0.1.11 closed the heavy bugs (Object.entries-on-Map, deepClone/Set, page-reload Relentless, Harrowing Presence propagation). Animation is now where the perceived-quality gap lives.
3. Cosmetic findings have a track record of sitting version-over-version when graded as optional. The v0.1.9 `jb2a.impact.010.pink` invalid-asset bug was visible in two consecutive smoke sessions before it was fixed in v0.1.10 (R31). The v0.1.11 report marked A4/A5/A6 as "Not exercised this session" — exactly the deferral pattern this policy retires.

**Ordering caveat (unchanged):** when a functional bug (R-series) and a cosmetic bug (A-series) collide on the same code path or version-slot, the functional bug still takes the fix-order slot. The change is "A1–A9 get graded every smoke," not "swap places with R1–R38."

**Setup:** confirm both `jb2a_patreon` and `autoanimations` show **YES** in the per-version smoke-report environment table before running this section. `ActiveAuras` must also be active for A8 (see the A8 row note).

| # | Action | Expected animation | Notes |
|---|---|---|---|
| A1 | Cast Manifest Tulpa with **force** | Manifestation ring effect (blue/white tint) appears at the Tulpa token, fades in then out | Sequencer-driven via `playManifest` in [modules/animations.js](../../../modules/animations.js#L36); jb2a asset comes from `PRESETS.force.manifest.asset` in [modules/animation-presets.js](../../../modules/animation-presets.js) |
| A2 | Repeat A1 with **radiant** | Manifestation ring effect with a radiant (yellow/gold) tint | Verifies per-damage-type asset variation, not just the force path |
| A3 | Repeat A1 with **psychic** | Manifestation ring effect with a psychic (purple/pink) tint | Same as A2 for the third damage type |
| A4 | Have the Tulpa attack a target with **Manifestation Strike** (melee) | Strike attack animation auto-plays via autoanimations (weapon-derived visual) | Autoanimations auto-detects weapon items and plays its configured animation; if nothing plays, check autoanimations' Item Settings on the Manifestation Strike weapon |
| A5 | Have the Tulpa make a **ranged** Manifestation Strike | Strike animation plays for the ranged variant (projectile-style) | Same as A4 but verifies both activities have working autoanimations triggers |
| A6 | Cast with **Relentless**, deal lethal damage | Impact/flash effect appears at the Tulpa as HP clamps to 1 | Sequencer-driven via `playRelentless` in [modules/animations.js](../../../modules/animations.js#L77); fires synchronously with the chat card |
| A7 | Dismiss the Tulpa (any trigger) | Dismiss effect plays at the token before deletion | Sequencer-driven via `playDismiss` in [modules/animations.js](../../../modules/animations.js#L56); the dismiss flow `waitUntilFinished(-200)`s so the animation visibly finishes before the token disappears |
| A8 | Cast with **Harrowing Presence** + force | Aura ring is rendered around the Tulpa (subtle blue tint at 0.25 opacity) | Active Auras-driven (kandashi 0.12.7), not Sequencer — propagation engine swapped from Aura Effects in v0.1.11. The tint color comes from `PRESETS[damageType].auraTint`. If A8 FAILs, also check `game.settings.get("ActiveAuras", "combatOnly")` — when `true`, the AA scan only runs during active combat, gating the visual behind combat start (see v0.1.11 smoke report Observation 1) |
| A9 | After A1–A8 complete, scan the browser console | **No** `manifest animation timed out after 5000ms`, `dismiss animation timed out`, or `relentless animation timed out` lines | Timeout fires only when the Sequencer asset is missing/unindexed; with both deps required and present, the 5s safety net should never engage |

**Recording in the per-version smoke report:**

- Give each row a single-word status (`PASS` / `FAIL` / `PASS (caveat)` / `BLOCKED`) in a status column — same format as R1–R41 rows.
- Include A1–A9 in the Scorecard line (e.g. `PASS: 41 R-checks + 9 A-checks = 50 total`).
- `BLOCKED` is a graded outcome — it means a real reason prevented the check this session (e.g. "no Relentless cast happened so A6 had no trigger event") and the cell still gets attention next version. It is **not** equivalent to "skipped." If A4–A6 weren't exercisable, write `BLOCKED — no Manifestation Strike attack in this session` rather than omitting them.
- If any A-row FAILs, capture the console output around the trigger and a `Sequencer.Database.entryExists("<asset path from PRESETS>")` check.

**Gate behavior:** A-row failures do not gate downstream R-series testing — the existing gate sentence at the end of the Regression Checks section (R4 / R6 / R12 / R33 / R35) still applies as written. But every A-row is reported even when the smoke session is abbreviated.

## Failure modes documented in the spec

As of v0.1.9, `jb2a_patreon` and `autoanimations` are required dependencies, so Foundry's module-install flow blocks the world from loading if either is missing. The previous "absent dep → mechanics still work, no visuals" failure modes are no longer reachable. The asset-availability check in [modules/animations.js](../../../modules/animations.js) remains in place as defense-in-depth for individual asset version drift (a JB2A patreon-vs-free asset rename, a Sequencer DB indexing failure, etc.), but the dependency modules themselves are now hard prerequisites.

## Sign-off

Tester: ___________  Date: ___________  Foundry build: ___________  dnd5e version: ___________
