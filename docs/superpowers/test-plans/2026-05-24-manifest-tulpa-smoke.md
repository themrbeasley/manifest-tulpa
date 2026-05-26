# Manifest Tulpa — Manual Smoke Test

**Setup:**
1. dnd5e world V13.351 / dnd5e 5.2.5.
2. Required modules enabled: midi-qol, dae, times-up, sequencer, portal-lib, auraeffects ≥1.5.2.
3. Recommended: jb2a_patreon, autoanimations.
4. Install the module from a local build (Foundry → Setup → Install Module → Manifest URL → file path or local-network URL).
5. Create or pick a PC at character level 9+ (so 5th-level slots exist).
6. Drag the spell from the **Manifest Tulpa - Spells** compendium onto the PC.

## Module-load test (verifies Tasks 1, 2)

- Open the browser console. Expected: two log lines `manifest-tulpa | init` and `manifest-tulpa | ready`.

## Regression checks (v0.1.4 → v0.1.8)

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
| R20 | Cast Manifest Tulpa with a damage type other than bludgeoning (e.g. **radiant**) and pick **Empowered Strikes**. Open the spawned Tulpa's Manifestation Strike. The first damage entry on each activity reads `2d8 radiant` (not bludgeoning), and a **second** entry `1d8 radiant` is present on both melee and ranged. | Bug A: `setStrikeDamageType` + `empoweredStrikes.patch` now iterate `ActivityCollection` via the Map protocol (shared `iterActivities` helper); `Object.entries()` returned `[]` on Maps in v0.1.7 and both paths silently no-op'd. |
| R21 | Cast with **Harrowing Presence** + place a hostile NPC inside the 10-ft ring. Within one Aura Effects pulse (move the NPC 1 square if needed), inspect the NPC's Active Effects tab: a marker effect propagated by Aura Effects carries `flags.manifest-tulpa.inHarrowingAura = true` and `flags.manifest-tulpa.auraDC = <caster spell DC>`. Start combat; the Wis save fires on the NPC's turn-start. | Bug B: aura template now ships the full Aura Effects 1.5.2 `system` schema — most critically `collisionTypes: ["move"]`, without which Aura Effects 1.5.2 never registers the proximity check that drives propagation. R13 covered code-level field presence; R21 verifies *runtime* propagation. |
| R22 | Open the cast dialog. Every Skill Affinity entry shows a **full English skill name** ("Stealth", "Perception", "Sleight of Hand", "Animal Handling") — **no** 3-letter all-caps codes (STE, PRC, SLT, ANI). | Bug C: dynamic skill loop now maps 3-letter `CONFIG.DND5E.skills` codes to full names via lookup table with `code.toUpperCase()` fallback. |
| R23 | Cast and wait out the 1-hour duration via `game.time.advance(3601)`. Token and anchor AE both disappear within one tick. **Console must NOT contain** `EmbeddedCollection.get: undefined id [...] does not exist`. | Bug D: dismiss-flow now checks the token is still present in `tokenDoc.parent.tokens` before calling delete — eliminates the times-up race noise. |
| R24 | Disable jb2a_patreon (or temporarily rename a manifest asset in Sequencer's database) and cast Manifest Tulpa. The cast chat card posts **within one tick** (not after the 5-second timeout). Dismiss the Tulpa; same fast path. Console may show a single Sequencer warning but no `manifest animation timed out` errors. | Bug E: `assetAvailable()` pre-flight in animations.js uses `Sequencer.Database.entryExists` to skip the Sequence entirely when the asset is confirmed missing, avoiding the full 5-second timeout wait. |

If R4, R6, R12, R13, or R21 fails, **stop** and re-open the most recent test report — the cast flow + weapon + aura are the gates to every downstream test.

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
8. Manifestation animation plays (purple→pink ring) if jb2a_patreon present.

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
2. Place a hostile NPC within 10ft of the Tulpa. Confirm the Aura Effects ring is visible (subtle magenta tint at 0.25 opacity).
3. The NPC should immediately gain a marker AE propagated by Aura Effects 1.5.2 carrying both `flags.manifest-tulpa.inHarrowingAura = true` and `flags.manifest-tulpa.auraDC = <caster spell DC>`. **Inspect the AE on the NPC and verify both flags are present** (Active Effects tab). These flags live in the aura AE's `changes` array on the Tulpa side — see [modules/modification-registry.js](../../../modules/modification-registry.js) `harrowingPresence.build`.
4. Start a combat. On the NPC's turn-start, a Wis save roll posts to chat against your spell save DC (the hook reads `auraDC` via `actor.getFlag`).
5. On failure: NPC gets `frightened` status; auto-clears at the start of its NEXT turn (times-up).
6. Move the NPC out of range; marker AE disappears within the next auraeffects pulse.

## Shared initiative (verifies Task 12)

1. Cast during active combat. Confirm the Tulpa is auto-added to the combat tracker (see R14) and lands at caster's initiative - 0.01 (directly after).
2. End combat. Cast again. Start combat. Roll the caster's initiative. Confirm Tulpa initiative re-aligns within one tick via the `updateCombatant` hook.

## Relentless (verifies Task 13)

1. Cast with **Relentless**.
2. Deal damage equal to or exceeding the Tulpa's HP via Midi (auto-apply).
3. Expected: HP clamps to 1 (not 0). Chat card "Relentless triggers" posts. Tulpa's `flags["manifest-tulpa"].relentlessUsed = true`.
4. Repeat damage. Tulpa drops to 0 normally (Relentless does not re-trigger).

## Dismissal triggers (verifies Task 15)

For each, perform the action then verify the anchor AE, the Tulpa token, and a "Tulpa Dismissed" chat card all go away:

| # | Action | Reason in chat |
|---|---|---|
| 1 | Wait 1 hour of game-world time (use `game.time.advance(3600)`) | duration |
| 2 | Deal damage equal to the **Tulpa's** HP (with Relentless absent or already consumed — see R16/R17) | zeroHP |
| 3 | Toggle caster dead status (see R18 for stale-UUID fallback) | isDeath |
| 4 | Re-cast Manifest Tulpa (see R15) | recast |
| 5 | Right-click → delete the Tulpa token | manual |

## Session reload (verifies the startup scan in Task 13 / 15)

1. Cast with **Relentless**.
2. Reload the world (refresh the tab).
3. Inflict killing damage on the Tulpa. Expected: HP clamps to 1, Relentless chat posts. (Confirms the watcher was re-armed at `ready`.)

## Failure modes documented in the spec

- `jb2a_patreon` absent → mechanics still work, no manifest/dismiss/Relentless visuals, one console warning per attempt.
- `autoanimations` absent → strikes resolve mechanically, no strike animation.

## Sign-off

Tester: ___________  Date: ___________  Foundry build: ___________  dnd5e version: ___________
