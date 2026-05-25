# Manifest Tulpa — FoundryVTT Module Design

**Date:** 2026-05-24
**Status:** Approved design — gap-closure pass complete (revision 2)
**Target stack:** FoundryVTT V13.351, dnd5e 5.2.5
**Distribution:** Personal use, GitHub Releases
**Source of truth for the spell:** `manifest-tulpa.txt` at repo root

---

## Overview

Manifest Tulpa is a custom 5th-level Conjuration spell. It summons a "Tulpa" — a psychic construct combatant that fights alongside the caster for one hour and is configured at cast time via a modification system (2 slots at 5th level, +1 per higher slot level, max 6).

This document specifies a FoundryVTT module that fully automates the spell: the cast dialog (damage type + modification picker), the summon mechanics (via dnd5e's native `summon` activity + Portal placement), the in-combat behaviors (shared initiative, modification effects, Aura Effects-driven Harrowing Presence, Relentless intervention), the lifecycle (1-hour duration plus four other dismissal triggers), the visuals (Sequencer + Automated Animations with jb2a_patreon assets, fixed presets per damage type), and the GitHub-Actions-driven build/release pipeline.

The module is for personal use and ships as a single GitHub repository with two compendium packs (one Item, one Actor) declared in its `module.json`.

---

## Revision history

| Revision | Date | What changed |
|---|---|---|
| 1 | 2026-05-24 | Initial approved design from brainstorming session. |
| 2 | 2026-05-24 | Gap-closure pass. Highlights: cast flow moved from `preUseActivity` to `postUseActivity` (slot must be known); Multiattack switched from item-patch to item-insert (matches Foundry NPC convention); Harrowing Presence redesigned as Aura Effects marker + `dnd5e.combatTurnStart` hook (Aura Effects script is a sync predicate, not imperative); Unsettling Form narrowed to Wis/Cha grants flags (engine has no "saves vs frightened" tag); `times-up` declared required dep (drives duration-expiry dismissal); manual disposition step dropped (dnd5e auto-syncs); `portal` corrected to `portal-lib`; jb2a asset keys locked; psychic strike uses `pinkpurple` not `pink`; spell-asset scrub added. |

---

## Architectural decisions locked during brainstorming

1. **Distribution model:** Bundled compendium pack(s) included with the module. End users install the module from a GitHub manifest URL and the spell + Tulpa actor appear in their world's compendium browser.
2. **Implementation language:** All module behavior in plain ES2022 JavaScript modules. No macros in the compendium; no scripts hidden in actor flags. No TypeScript, no bundler.
3. **State architecture (source of truth):** A caster-side Active Effect ("Manifest Tulpa (active)") is the single lifecycle handle. Its existence means a Tulpa is on the field; deleting it always triggers full dismissal.
4. **Concentration:** *Not* a concentration spell — confirmed with the spell author. Dismissal is driven by the five explicit triggers listed in Section 5.
5. **Modification application model:** *Insertion*, not pre-bake-and-hide. The Tulpa actor template ships with only the base statblock. Chosen modifications are constructed and inserted at summon time from an in-module registry. No sheet filter required.
6. **Animations:** Module ships fixed Sequencer/AA presets per damage type (force / radiant / psychic). No user-configurable visual picker.

---

## Section 1 — Dependencies & Distribution

### Required modules

| Module | Min. version | Why |
|---|---|---|
| `dnd5e` (system) | 5.2.5 | Native `summon` activity, Active Effects, item/activity model |
| `midi-qol` | current | Attack/save workflow integration; `grants.disadvantage.save.*` flags for Unsettling Form |
| `dae` | current | AE `specialDuration` triggers (`zeroHP`, `isDeath`), DAE flags on AEs |
| `times-up` | current | Deletes actor-parented non-transfer AEs when `duration.seconds` expires (drives dismissal trigger #1) |
| `sequencer` | current | Programmatic animation chains for manifestation/dismissal |
| `portal-lib` | current | Token-placement targeting (the actual module id of "Portal" by theripper93; replaces deprecated Warpgate) |
| `aura-effects` | 1.5.2+ | Harrowing Presence aura (replaces deprecated ActiveAuras) |

### Recommended modules

| Module | Why |
|---|---|
| `automated-animations` | Auto-attaches strike animations to Manifestation Strike via Automatic Recognition |
| `jb2a_patreon` | Asset library all the above pull from |

### Compendium pack distribution

Foundry packs are typed (one document-type per pack), so the module ships **two packs**:

- `manifest-tulpa-spells` (type: Item) — the spell
- `manifest-tulpa-actors` (type: Actor) — the Tulpa actor (base statblock only)

The spell's summon activity references the actor by UUID: `Compendium.manifest-tulpa.manifest-tulpa-actors.Actor.<id>`. Both packs are declared in `module.json` and built from `_source/<pack-name>/` JSON at release time.

### Explicitly *not* dependencies

- **ActiveAuras** — deprecated, replaced by Aura Effects.
- **Warpgate** — deprecated, replaced by Portal (dnd5e's summon activity uses Portal directly).
- **Item Macro** — not used; behaviors live in module JS.
- **Magic Items** — not used.

---

## Section 2 — State Architecture

The caster-side Active Effect "Manifest Tulpa (active)" is the source of truth for whether a cast is live and what configuration it was cast with.

**Why this design:** A single deletion path makes the five dismissal triggers compose cleanly. Anything that needs to dismiss the Tulpa just deletes this AE; the `deleteActiveEffect` hook does the rest. There's no risk of "the Tulpa token is gone but the duration timer is still running" or "the caster died but the Tulpa is still wandering around" — those mismatches are structurally impossible.

### The anchor AE — schema

Created on the **caster** in Phase 3 step 4 of the cast flow.

| Field | Value |
|---|---|
| `name` | "Manifest Tulpa (active)" |
| `icon` | Spell icon (crystal/construct, matches the spell item) |
| `duration.seconds` | `3600` (the 1-hour duration) |
| `flags["manifest-tulpa"].tulpaUuid` | UUID of the summoned Tulpa actor |
| `flags["manifest-tulpa"].castConfig` | `{ damageType, modifications, slotLevel }` — full cast snapshot |
| `flags.dae.specialDuration` | `["zeroHP", "isDeath"]` — fires triggers #2 and #3 |
| `flags.dae.showIcon` | `false` — no clutter on the caster's token HUD |
| `changes` | `[]` (no system-effect changes; purely a lifecycle handle) |

The player sees this AE on their character sheet's Effects tab. Right-click → delete is the manual dismissal path.

### Where related state lives

| State | Location | Purpose |
|---|---|---|
| Has-a-Tulpa-out indicator | Existence of the anchor AE on caster | Authoritative |
| Cast configuration | `anchor.flags["manifest-tulpa"].castConfig` | What to restore on session reload |
| Link from anchor to Tulpa | `anchor.flags["manifest-tulpa"].tulpaUuid` | Used by dismissal handler |
| Link from Tulpa to caster | `tulpa.flags.dnd5e.summon.origin` (set by dnd5e summon activity) | Used by manual-token-delete trigger |
| Relentless one-shot consumed | `tulpa.flags["manifest-tulpa"].relentlessUsed` | Survives session reload |
| Telepathic link active | `caster.flags["manifest-tulpa"].telepathicLink` + same on Tulpa | Reserved for future enhancements |
| Harrowing Presence aura DC | `auraAE.flags["manifest-tulpa"].auraDC` | Read by the Aura Effects script at evaluation |

---

## Section 3 — Cast Flow

### Phase 1 — Post-use: open the modification picker

Triggered by `dnd5e.postUseActivity(activity, usageConfig, results)` on the spell activity.

**Why postUseActivity, not preUseActivity:** `preUseActivity` fires *before* dnd5e's slot-selection dialog runs, so the chosen slot level isn't known yet. By the time `postUseActivity` fires, the player has picked their slot and `usageConfig.spell.slot` is populated (e.g. `"spell5"`, `"spell6"`). The tradeoff: the slot is *consumed* by the time our dialog opens. If the player cancels mod selection, the slot is gone. This is acceptable — the player can manually restore a slot via the sheet, and this design avoids fighting dnd5e's slot-selection flow (which historically causes weeks of debugging).

1. **Read the chosen slot level** from `usageConfig.spell.slot` (string like `"spell5"`) — parse to an integer. If absent, fall back to `usageConfig.scaling` (numeric delta above base) + 5.
2. **Compute available slots:** `2 + max(0, slotLevel - 5)`, capped at 6.
3. **Check whether the caster already has an active anchor AE.** If yes, delete it first (this triggers full dismissal of the previous Tulpa per Section 5, trigger #4).
4. **Open `ManifestTulpaCastDialog`** with:
   - Damage-type radio (force / radiant / psychic)
   - Modification picker grouped by category, enforcing slot cost and size-shift mutual exclusivity
   - Live "slots used / N" indicator
   - Cancel button that posts a chat warning reminding the player they may want to refund the spent slot
5. **On submit**, stash selections on the activity:
   `activity.flags["manifest-tulpa"].castConfig = { damageType, modifications, slotLevel }`.
   This flag is read by Phase 3 (which runs immediately after, in the same `postUseActivity` handler). dnd5e has already fired the summon as part of standard activity execution — the Tulpa token exists by this point — so we do not need to invoke it ourselves.
6. **On cancel**, post `postWarning({ message: "Cast aborted after slot was spent — restore manually if intended." })` and abort by not summoning. The anchor AE is never created, so no Tulpa appears.

### Phase 2 — Summon: let dnd5e place the actor (happens *before* Phase 1's dialog)

The spell uses dnd5e 5.x's native `summon` activity pointing at the Tulpa actor in the compendium. dnd5e handles this as part of standard activity execution — it runs *between* the slot dialog and the `postUseActivity` hook, so by the time Phase 1's modification dialog opens, the Tulpa token already exists on the canvas with base statblock and friendly disposition.

dnd5e handles:

- Token placement (via Portal)
- Summoner linkage (`flags.dnd5e.summon.origin = caster.uuid`)
- Disposition sync to caster (dnd5e auto-aligns at placement — see [dnd5e.mjs:27986-27988](file://C:/Users/jorda/AppData/Local/FoundryVTT/Data/systems/dnd5e/dnd5e.mjs#L27986-L27988))
- Any built-in summon-stat scaling defined on the activity

The module does not override this phase. The actor template just has to be configured correctly upstream.

**Visual UX note:** the player will see the Tulpa appear with bare base stats, then the mod dialog opens, then mods apply as a visible AE/item update. This brief "bare → dressed" flicker is acceptable and gives the player a chance to see the unmodified baseline.

### Phase 3 — Apply modifications to the (already-summoned) Tulpa

Runs immediately after Phase 1's dialog submit (inside the `postUseActivity` handler that opened the dialog).

1. **Locate the Tulpa token** that was just summoned in Phase 2. Use `results.createdTokens` from the `postUseActivity` payload, or fall back to the most recently created token whose `flags.dnd5e.summon.origin === caster.uuid`.
2. **Set damage type** on the Manifestation Strike weapon item: rewrite its damage entry from the placeholder to the chosen type.
3. **Construct modifications** — for each slug in `castConfig.modifications`, look it up in `modules/modification-registry.js` and apply its payload (four kinds — see Section 4). Apply order:
   1. Item patches first (so the strike is in its final shape when AEs reference it).
   2. Item inserts second (any feat items the mod adds, e.g. Multiattack).
   3. AE-only mods third (single batched `tulpa.createEmbeddedDocuments("ActiveEffect", [...])`).
   4. Aura Effects mod last.
   5. After all primary payloads are applied, run each chosen mod's optional `postApply({ caster, tulpa, castConfig })` hook (used by `telepathicLink`, available for future cross-cutting mods).
4. **Apply the caster-side anchor AE** (the schema in Section 2). Its `deleteActiveEffect` hook fires the dismissal flow.
5. **Register the Relentless watcher** if `relentless` was selected (Section 7, item 2).
6. **Shared initiative**: if combat is active, `combat.setInitiative(tulpaCombatant.id, casterInitiative - 0.01)`.
7. **Animation**: trigger `playManifest(token, damageType)` (Section 6).
8. **Cast confirmation card**: `postCast({ caster, tulpa, castConfig })`.

### Compendium asset scrub (one-time, before pack build)

Both shipped compendium documents are derived from the existing world exports and need cleanup before going into the LevelDB packs.

**Actor scrub** — `fvtt-Actor-tulpa-rfi8EPvTDFduYlW5.json` → `_source/manifest-tulpa-actors/Actor.tulpa.json`:

- Delete all ~30 modification AEs from `effects[]`.
- Delete all modification items from `items[]` (keep only Manifestation Strike + base-statblock items).
- Remove `flags.ActiveAuras` from the soon-to-be-deleted Harrowing Presence item (moot once that item is gone, but for completeness).
- Reset Manifestation Strike's damage type to the placeholder.
- Strip world-export flags: `flags["activity-macro"]`, `flags["LocknKey"]`, `flags["scene-packer"]`, `flags.exportSource`.
- Strip `_stats.lastModifiedBy`, `_stats.createdTime`, `_stats.modifiedTime`, `_stats.compendiumSource`, `_stats.duplicateSource`.

**Spell scrub** — `fvtt-Item-manifest-tulpa-YwUNZpFtX3dwNQPx.json` → `_source/manifest-tulpa-spells/Item.manifest-tulpa.json`:

- Strip the same world-export flags as above (`activity-macro`, `LocknKey`, `scene-packer`, `exportSource`).
- Strip `_stats` provenance fields as above.
- Fill `system.description.value` with the spell text from `manifest-tulpa.txt` (currently empty).
- Confirm the summon activity's profile UUID points at the *packed* actor UUID, not the world-local UUID. The summon activity must reference `Compendium.manifest-tulpa.manifest-tulpa-actors.Actor.<id>`.
- Verify `consumption.scaling.allowed: false` (confirmed — we read slot from `usageConfig.spell.slot` directly).

The existing AE configs (changes arrays, modes, durations) are not lost — they get translated into JS object literals inside `modules/modification-registry.js`. One mechanical port, then maintained in one place.

---

## Section 4 — Modification Registry

Single source of truth for what each modification does. Lives at `modules/modification-registry.js`. Exports one map keyed by mod slug.

### Registry shape

```js
export const MODIFICATIONS = {
  reinforcedForm:   { category: "morphic", slots: 1, kind: "ae",         template: {...} },
  vitalSurge:       { category: "morphic", slots: 1, kind: "ae",         template: {...} },
  unsettlingForm:   { category: "morphic", slots: 1, kind: "ae",         template: {...} },
  sizeShift_small:  { category: "morphic", slots: 1, kind: "ae",         template: {...},
                      mutuallyExclusive: "sizeShift" },
  sizeShift_large:  { category: "morphic", slots: 1, kind: "ae",         template: {...},
                      mutuallyExclusive: "sizeShift" },
  sizeShift_tiny:   { category: "morphic", slots: 2, kind: "ae",         template: {...},
                      mutuallyExclusive: "sizeShift" },
  sizeShift_huge:   { category: "morphic", slots: 2, kind: "ae",         template: {...},
                      mutuallyExclusive: "sizeShift" },
  sizeShift_gargantuan: { category: "morphic", slots: 3, kind: "ae",     template: {...},
                          mutuallyExclusive: "sizeShift" },
  empoweredStrikes: { category: "combat",  slots: 1, kind: "item-patch", patch: (strike) => ({...}) },
  multiattack:      { category: "combat",  slots: 1, kind: "item-insert", item: {...} },
  harrowingPresence:{ category: "combat",  slots: 1, kind: "aura+marker", build: (caster) => ({ aura: {...}, markerOnApply: {...} }) },
  relentless:       { category: "combat",  slots: 1, kind: "ae",         template: {...} },
  // resistance_* (10 entries — one per damage type)
  // flySpeed, swimSpeed, spiderClimb, tremorsense
  // skill_* (18 entries — one per skill)
  telepathicLink:   { category: "special", slots: 1, kind: "ae",         template: {...} },
};
```

Each entry has:

- `category` — for the dialog grouping.
- `slots` — cost in modification slots.
- `kind` — `"ae"` | `"item-patch"` | `"item-insert"` | `"aura+marker"`.
- Payload matching the kind:
  - `template` (AE config object) — for `kind: "ae"`
  - `patch` (function returning an item-update object applied to an existing item, e.g., the strike) — for `kind: "item-patch"`
  - `item` (full item document object, inserted as a new item on the Tulpa) — for `kind: "item-insert"`
  - `build` (function returning `{ aura, markerOnApply }`; takes `caster` so it can bake spell save DC) — for `kind: "aura+marker"`. The aura AE applies the marker to in-range hostiles; the marker carries the DC flag forward to be read by the combat-turn hook.
- Optional `mutuallyExclusive` group key — used only by size shifts.
- Optional `postApply({ caster, tulpa, castConfig })` — side-effects hook fired after the primary payload is applied. Used by mods whose behavior reaches beyond the Tulpa (e.g. `telepathicLink` sets a caster-side flag and posts a chat card).

### Per-modification reference

| Slug | Kind | Effect |
|---|---|---|
| `reinforcedForm` | ae | AE change: `system.attributes.ac.flat`, mode 2 ADD, value `2` |
| `vitalSurge` | ae | AE changes: `system.attributes.hp.max` +30 AND `system.attributes.hp.value` +30 (mode 2 ADD), so applying mid-fight heals as well as expands |
| `unsettlingForm` | ae | Two midi-qol grants flags on the Tulpa: `flags.midi-qol.grants.disadvantage.save.wis: 1` and `flags.midi-qol.grants.disadvantage.save.cha: 1`. **Note:** narrower than RAW. The spell text says creatures have Disadvantage on saves *against the Frightened condition*, but there's no clean engine hook for "saves whose purpose is to resist frightened." The Wis/Cha narrowing covers the common case (Fear, Frightening Strikes, Cause Fear, Harrowing Presence itself) since fear saves are almost always Wis-based, occasionally Cha. Documented as a known-but-accepted scope reduction. |
| `sizeShift_*` | ae | AE change: `system.traits.size`, mode 5 OVERRIDE. Mutually exclusive group: `sizeShift`. Plus token resize via `token.document.update({width, height})` at apply time (V13 token size doesn't auto-sync from size-trait AE alone) |
| `empoweredStrikes` | item-patch | Add `1d8` of the cast's damage type to the strike's damage parts |
| `multiattack` | item-insert | Inserts a "Multiattack" feat item on the Tulpa with description text: "The Tulpa makes two Manifestation Strike attacks when it takes the Attack action." No mechanical enforcement — player clicks Manifestation Strike twice. Foundry doesn't count or restrict attacks per turn, so this matches standard 5e NPC multiattack convention. |
| `harrowingPresence` | aura+marker | **Two-stage mechanism.** Stage 1: an Aura Effects AE on the Tulpa (`type: "auraeffects.aura"`, `system.distanceFormula: "10"`, `system.disposition: -1`, `system.applyToSelf: false`, `system.showRadius: true`, `system.color: PRESETS[damageType].auraTint`, `system.opacity: 0.25`, `system.script: "true"`). The aura applies a marker AE to each hostile creature in range. Stage 2: the marker AE carries `flags["manifest-tulpa"].inHarrowingAura: true` and `flags["manifest-tulpa"].auraDC: <caster's spell save DC>` with no mechanical changes. A global `dnd5e.combatTurnStart` hook (registered in `init.js`) checks if the starting combatant has the marker flag; if yes, rolls a Wis save vs. the carried DC and applies the standard `frightened` status with `flags.dae.specialDuration: ["turnStart"]` on failure. Aura Effects removes the marker automatically when the creature leaves range. **Why this design:** Aura Effects 1.5.2's `system.script` is compiled as a synchronous boolean predicate (`new Function("actor","token","sourceToken","rollData","return Boolean(${script});")` — see `auraeffects/scripts/helpers.mjs:88`); it cannot `await`, roll, or apply effects. The marker pattern moves the imperative work to a hook that runs in the right context. |
| `relentless` | ae | Sheet-visible marker AE on the Tulpa (no system changes). The `preUpdateActor` watcher (Section 7) is what enforces the mechanic; the AE just makes it visible to players that Relentless is armed. The Tulpa's `flags["manifest-tulpa"].relentlessUsed` flag (set when the watcher fires) is the one-shot guard, not anything on this AE. |
| `resistance_*` (10) | ae | AE change: `system.traits.dr.value`, mode 2 ADD, value `[damageType]` |
| `flySpeed` / `swimSpeed` | ae | AE change: `system.attributes.movement.fly` (or `.swim`), mode 4 UPGRADE, value `@attributes.movement.walk` (formula resolves at evaluation; stays in sync if walk later changes) |
| `spiderClimb` | ae | Descriptive AE recording the climb capability; no mechanical engine support needed (movement notes field or a descriptive marker AE) |
| `tremorsense` | ae | AE change: `system.attributes.senses.tremorsense`, mode 4 UPGRADE, value `30` |
| `skill_*` (18) | ae | AE change: `system.skills.<skill>.value`, mode 4 UPGRADE, value `1` (proficient) |
| `telepathicLink` | ae + postApply | Marker AE on the Tulpa with no system changes. `postApply` sets `flags["manifest-tulpa"].telepathicLink = true` on both caster and Tulpa and calls `postLinkOpen()` |

### Slot-budget validation

Enforced in two places:
- **UI**: the cast dialog prevents over-selection and size-shift double-pick at the form level.
- **Defensive**: Phase 3 step 3 (modification construction) refuses to apply if `sum(slots) > availableSlots` — guards against malformed `castConfig` from any source.

---

## Section 5 — Dismiss Flow

All five triggers funnel through a single path: **delete the caster-side anchor AE**. That deletion fires `deleteActiveEffect`, which runs the dismissal handler. One code path, naturally idempotent.

### The five triggers

| # | Trigger | Mechanism |
|---|---|---|
| 1 | 1-hour duration expires | Anchor AE has `duration.seconds = 3600`. The `times-up` module deletes actor-parented non-transfer AEs when their `duration.seconds` runs out — the anchor AE qualifies (it's parented to the caster actor, and is created at runtime so it's not a transfer effect from an item). The delete fires the standard `deleteActiveEffect` flow. `times-up` is declared as a required dependency for this reason. |
| 2 | Caster drops to 0 HP | Anchor AE has `flags.dae.specialDuration: ["zeroHP", "isDeath"]`. DAE handles natively. |
| 3 | Caster dies | Same as above (`"isDeath"`). |
| 4 | Caster re-casts Manifest Tulpa | Phase 1 step 2 of cast flow detects an existing anchor and deletes it before opening the dialog. |
| 5 | GM manually deletes the Tulpa token | A `preDeleteToken` hook checks if the deleted token's actor is a summoned Tulpa (`flags.dnd5e.summon.origin`). If yes, finds the summoner's matching anchor AE and deletes it. |

**Note on trigger #2:** This covers the standard 5e path (damage → 0 HP → unconscious). A caster going unconscious from a non-damage source (Sleep, Hold Person) does *not* dismiss the Tulpa under this design. Documented as a known gap; can be extended later by adding an `applyActiveEffect` hook for the `unconscious` status if it comes up in play.

### The dismissal handler

Registered as a `deleteActiveEffect` hook in `modules/init.js` at `ready`:

1. **Filter**: only AEs that carry `flags["manifest-tulpa"].tulpaUuid` (i.e., anchors — that flag is the marker).
2. **Resolve** the Tulpa actor/token from `tulpaUuid`. May be `null` if trigger #5 already removed the token — handle gracefully.
3. **If the Tulpa token still exists**:
   1. End any named Sequencer effects (e.g., the Harrowing Presence aura ring).
   2. Play the dismissal animation: `await playDismiss(token, castConfig.damageType)` (Section 6).
   3. Delete the token: `await token.document.delete()`.
4. **Unregister** any in-memory watcher hooks scoped to this Tulpa's UUID (currently just the Relentless watcher).
5. **Post chat card**: `postDismiss({ caster, tulpa, reason })`.

### Session reload handling

Foundry has two kinds of "memory":

- **Saved-to-database stuff** (actors, effects, items, flags) survives a server shutdown.
- **In-memory stuff** (JavaScript event listeners) dies with the process.

What survives reload automatically:
- The anchor AE on the caster (persistent doc).
- The 1-hour duration (Foundry tracks game-world time; `times-up` re-evaluates expiry on world load).
- `zeroHP` / `isDeath` triggers (DAE reads from the AE on every update).
- The three global hooks (`deleteActiveEffect`, `preDeleteToken`, `dnd5e.combatTurnStart` for Harrowing Presence) — re-registered at `ready`.
- Harrowing Presence marker AEs on in-range hostiles — Aura Effects re-applies them on token initialization.

What silently breaks without intervention:
- The Relentless watcher — an in-memory `preUpdateActor` hook tied to a specific Tulpa's UUID, created just-in-time at cast.

**The fix:** at `ready`, the module scans `game.actors` for any caster with an active anchor whose `castConfig.modifications` includes `relentless` AND whose Tulpa actor doesn't already have `flags["manifest-tulpa"].relentlessUsed === true`, and re-registers the watcher. One-shot scan at world load; cheap, and critical for any cast that spans a session boundary.

### Race conditions considered

- **Two triggers firing simultaneously** (e.g., 1-hour expires the same tick the caster hits 0 HP): the anchor only exists once and only one deletion succeeds; the second is a no-op. Single funnel = naturally idempotent.
- **Re-cast (#4)**: the delete of the old anchor fires the dismissal handler synchronously; the new anchor creation in Phase 3 has a clean slate.
- **Token already gone (#5 path)**: null-check on `token` in step 3 of the handler. The handler still posts the chat card and unregisters watchers but skips the visual dismissal.

---

## Section 6 — Animations

Three animation moments per cast. Per the locked architectural decision, the module ships **fixed presets per damage type** — no user-configurable picker.

### Three animation moments

| Moment | Trigger | Driven by |
|---|---|---|
| Manifestation | End of Phase 3, after token placed and mods applied | Module code → Sequencer |
| Manifestation Strike | Tulpa attacks in combat | Automated Animations, Automatic Recognition mode |
| Dismissal | Step 3 of dismissal handler, before token deletion | Module code → Sequencer; handler awaits completion |

### Preset structure

Lives in `modules/animation-presets.js`:

```js
export const PRESETS = {
  force:   { manifest: {...}, dismiss: {...}, auraTint: "#9b4ae0" },
  radiant: { manifest: {...}, dismiss: {...}, auraTint: "#f0d56a" },
  psychic: { manifest: {...}, dismiss: {...}, auraTint: "#d650a8" },
};
```

Each `manifest` / `dismiss` entry holds: jb2a asset key, scale, fade-in/out, optional sound. Asset keys are confirmed against the installed jb2a_patreon library at implementation (paths can shift between versions — grep the actual namespace and lock once).

Color families locked here:

- **Force** → purple/violet (jb2a `purple` variants — circles, impacts, strikes)
- **Radiant** → gold/yellow (jb2a `yellow` variants — circles, impacts, strikes)
- **Psychic** → magenta/pink (jb2a `pink` for circles/impacts; **`pinkpurple` for unarmed strikes** — jb2a's strike library doesn't have a plain `pink` variant)

Locked dotted DB keys (from research against installed jb2a_patreon):

| Damage type | Manifest/dismiss circle | Strike (Automated Animations target) | Impact flash |
|---|---|---|---|
| Force | `jb2a.magic_signs.circle.02.conjuration.intro.purple` / `.outro.purple` | `jb2a.unarmed_strike.magical.purple` | `jb2a.impact.010.purple` |
| Radiant | `jb2a.magic_signs.circle.02.conjuration.intro.yellow` / `.outro.yellow` | `jb2a.unarmed_strike.magical.yellow` | `jb2a.impact.010.yellow` |
| Psychic | `jb2a.magic_signs.circle.02.conjuration.intro.pink` / `.outro.pink` | `jb2a.unarmed_strike.magical.pinkpurple` | `jb2a.impact.010.pink` |

### Driver module

`modules/animations.js`:

```js
export async function playManifest(token, damageType) { /* Sequencer chain */ }
export async function playDismiss(token, damageType)  { /* Sequencer chain, awaited */ }
```

The dismissal handler awaits `playDismiss` before deleting the token.

### Manifestation Strike (AA)

Uses Automated Animations' **Automatic Recognition** mode. AA reads the strike's damage type at roll time and picks a matching jb2a melee animation in the right color family. No per-strike configuration in the actor template; AA does the right thing because Phase 3 step 2 has already set the correct damage type on the item.

If playtest reveals AA's auto-pick is off for a damage type, override by writing AA's `flags.autoanimations` directly onto the strike item — same Phase 3 step 2 that sets the damage type. Single-line addition, no architectural change.

### Harrowing Presence aura ring

The registry's Harrowing Presence factory enables the Aura Effects visual ring:

- `system.showRadius: true`
- `system.color: PRESETS[damageType].auraTint`
- `system.opacity: 0.25`

The 10-foot aura renders as a subtle ring around the Tulpa for the full hour, tinted to the chosen damage type. Free visual reinforcement of the "dread zone" mechanic.

The ring is registered as a named Sequencer effect — `manifest-tulpa-aura-<tulpaUuid>` — so the dismissal handler can explicitly call `Sequencer.EffectManager.endEffects({ name: ... })` before token deletion. Guards against orphaned visuals.

### Relentless flash

When the Relentless watcher triggers (Section 7), play a brief ward-style effect at the Tulpa's position in the damage-type tint, alongside the existing chat card.

### Module-not-present handling

| Module | If missing | Behavior |
|---|---|---|
| `jb2a_patreon` | optional dep | Skip manifest/dismiss/Relentless visuals. Console warning. Mechanics still work. |
| `sequencer` | required dep | `module.json` won't load without it; user sees Foundry's standard missing-dep prompt. |
| `automated-animations` | optional dep | Strikes resolve mechanically, no strike animation. |
| `portal-lib` | required dep | Same as Sequencer — declared required. |
| `aura-effects` | required dep | Same — Harrowing Presence depends on it. |
| `times-up` | required dep | Same — duration-based dismissal trigger #1 depends on it. |

All animation calls are wrapped in try/catch so a missing asset key or runtime hiccup never blocks the underlying mechanical step.

---

## Section 7 — Smaller Behaviors

### 1. Shared initiative

- **If combat is active at cast time** (Phase 3 step 6): dnd5e's summon activity adds the Tulpa to the combat tracker; module sets the Tulpa combatant's `initiative` to `casterCombatant.initiative - 0.01`.
- **If combat starts *after* the cast**: a `combatStart` hook walks the combatants, finds any summoned Tulpas whose summoner is also in this combat, and sets each Tulpa combatant's `initiative` to its summoner combatant's `initiative - 0.01` after dnd5e's initial roll.
- **Idempotent**: the hook always re-aligns. If combat ends and re-starts mid-cast, it just runs again.

**Known gap (documented):** if the caster delays/readies, the Tulpa's initiative stays put. RAW the Tulpa would also shift (they share the count) but encoding that adds complexity for a rare case. GM can manually re-order.

### 2. Relentless watcher

When `relentless` is in `castConfig.modifications`, Phase 3 step 5 registers a `preUpdateActor` hook scoped to the Tulpa's UUID.

1. Filters: only fires when `actor.uuid === tulpaUuid`.
2. If the update would set HP ≤ 0 AND `tulpa.flags["manifest-tulpa"].relentlessUsed !== true`:
   - Rewrite the HP in the changes object to `1` (prevents the 0-HP update from ever hitting the database).
   - Set `flags["manifest-tulpa"].relentlessUsed = true` on the Tulpa.
   - Unregister the hook (one-shot per casting).
   - Post the "Relentless!" chat card.
   - Play the Relentless flash animation.
3. Otherwise: pass-through.

**Improvement over the existing macro:** the macro identifies the Tulpa via `canvas.tokens.placeables.find(t => t.actor?.name === "Tulpa")` — brittle (breaks with multiple Tulpas or renamed tokens). The module version uses the UUID stored in `castConfig`.

Session reload: re-registered by the startup scan described in Section 5.

### 3. Telepathic Link

When `telepathicLink` is in `castConfig.modifications`:

- Phase 3 step 3 creates a marker AE on the Tulpa with no system changes.
- Sets `flags["manifest-tulpa"].telepathicLink = true` on both caster and Tulpa.
- Posts a one-time chat card.

That's the full v1 implementation. Actual telepathic communication is roleplay. A `/tulpa <message>` whisper command is a future enhancement, not in scope. The flag is set so future enhancements have a clean place to read state from.

### 4. Prototype-token adjustments

- **Disposition**: dnd5e auto-syncs the summoned token's disposition to the caster at placement ([dnd5e.mjs:27986-27988](file://C:/Users/jorda/AppData/Local/FoundryVTT/Data/systems/dnd5e/dnd5e.mjs#L27986-L27988)). No module action needed. (Earlier revisions of this design called for a manual `token.document.update({ disposition: 1 })` step; that's redundant and has been dropped.)
- **Size** (Phase 3 step 3, only if a size-shift mod is chosen): the registry's size-shift entries do *both* an AE on `system.traits.size` AND a `token.document.update({ width, height })` call. V13 doesn't reliably auto-resize tokens from a size-trait AE alone.

  | Size | width × height |
  |---|---|
  | Tiny | 0.5 × 0.5 |
  | Small / Medium | 1 × 1 |
  | Large | 2 × 2 |
  | Huge | 3 × 3 |
  | Gargantuan | 4 × 4 |

Token vision (darkvision 60) is configured in the actor template's prototype token — static, no runtime work.

### 5. Caster-side anchor AE — display details

- `flags.dae.showIcon = false` — no clutter on the caster's token HUD.
- Description (rendered on hover/click): "Your Manifest Tulpa is active. Right-click and delete this effect to dismiss the Tulpa."
- Icon: distinctive crystal/construct icon matching the spell.
- Sole user-facing handle for manual dismissal.

### 6. Chat cards

Centralized in `modules/chat-cards.js`. Five named helpers:

- `postCast({ caster, tulpa, castConfig })` — confirmation on successful summon, compact summary of damage type + chosen mods.
- `postLinkOpen({ caster, tulpa })` — telepathic link notice.
- `postRelentless({ tulpa })` — the "Relentless!" message.
- `postDismiss({ caster, tulpa, reason })` — dismissal notice with the trigger.
- `postWarning({ message })` — internal warnings.

All cards use `ChatMessage.getSpeaker` keyed off the relevant actor so they appear in the right voice.

### 7. Harrowing Presence combat-turn hook

Registered globally in `init.js` (lives across all combats, all worlds; no per-Tulpa scoping needed):

```js
Hooks.on("dnd5e.combatTurnStart", async (actor, combat, combatant) => {
  const marker = actor.effects.find(e => e.flags["manifest-tulpa"]?.inHarrowingAura);
  if (!marker) return;
  const dc = marker.flags["manifest-tulpa"].auraDC;
  const roll = await actor.rollSavingThrow({ ability: "wis", target: dc });
  if (roll.total < dc) {
    await actor.toggleStatusEffect("frightened", { active: true });
    // Apply with specialDuration: ["turnStart"] so it expires automatically
    // at the start of the actor's *next* turn (per spell text)
  }
});
```

Notes:
- The marker AE is applied by Aura Effects when the creature enters the 10ft aura, removed when it leaves. Carries `flags["manifest-tulpa"].auraDC` (the caster's spell save DC, baked into the source aura at apply time).
- The check is broad — any actor whose effects include the marker — so it works across multiple Tulpas in the same combat, with different DCs per Tulpa.
- `frightened` expiry: applied with `flags.dae.specialDuration: ["turnStart"]` so DAE/times-up auto-removes it at the start of the affected creature's next turn (matching "until the start of its next turn").

### 8. Flag namespace map (canonical reference)

All flags under `flags["manifest-tulpa"]` unless noted:

| Document | Flag | Purpose |
|---|---|---|
| Caster's anchor AE | `tulpaUuid` | The Tulpa's UUID — link from anchor to Tulpa |
| Caster's anchor AE | `castConfig` | `{ damageType, modifications, slotLevel }` — full cast snapshot |
| Caster (actor) | `telepathicLink` | True while link mod is active |
| Tulpa (actor) | `relentlessUsed` | True after Relentless fires; prevents re-trigger |
| Tulpa (actor) | `telepathicLink` | Mirror of caster's flag |
| Tulpa's Harrowing Presence aura AE | `auraDC` | Caster's spell save DC, baked at apply time. Propagates to marker AEs Aura Effects creates on in-range hostiles. |
| Marker AE on aura-affected hostile | `inHarrowingAura` | True; used by `dnd5e.combatTurnStart` hook to detect affected creatures |
| Marker AE on aura-affected hostile | `auraDC` | Propagated from source aura — the DC the hook rolls against |
| Activity (transient, during cast) | `castConfig` | Passes selections from Phase 1 dialog to Phase 3 |

Outside our namespace, but the module reads/writes:

- `flags.dae.specialDuration: ["zeroHP", "isDeath"]` on the anchor AE.
- `flags.dae.specialDuration: ["turnStart"]` on the frightened AE applied by the Harrowing Presence hook.
- `flags.dae.showIcon: false` on the anchor AE.
- `flags.dnd5e.summon.origin` on the Tulpa (set by dnd5e's summon activity).
- `flags.midi-qol.grants.disadvantage.save.wis` / `.cha` on the Tulpa when `unsettlingForm` is selected.

### 9. Things this design does not need

- No sheet filter macro / no `renderNPCActorSheet` hook.
- No `modEnabled` flag convention.
- No build-time flag validation script (replaced by the much simpler "actor template has only base statblock" invariant).
- No `flags.ActiveAuras` anywhere — `aura-effects` replaces the deprecated module.
- No macros in the compendium — every behavior is module JS, hooks registered at `ready`.

The two existing exported macros (`fvtt-Macro-tulpa-sheet-filter-*.json`, `fvtt-Macro-tulpa-relentless-hook-*.json`) are exploratory artifacts from the pre-module phase — they are not bundled into the released module.

---

## Section 8 — Build, Distribution, Release

### Repository layout

```
manifest-tulpa/
├── module.json                       # Foundry module manifest
├── README.md
├── LICENSE                           # MIT recommended
├── .gitignore                        # packs/, node_modules/
├── package.json                      # for the CLI build tooling
├── modules/                          # all module JavaScript (ES modules)
│   ├── init.js                       # entry: registers hooks on ready
│   ├── cast-dialog.js                # ManifestTulpaCastDialog
│   ├── cast-flow.js                  # Phase 1 + Phase 3
│   ├── dismiss-flow.js               # dismissal handler + the 5 triggers
│   ├── modification-registry.js      # the per-mod templates
│   ├── animations.js                 # playManifest / playDismiss
│   ├── animation-presets.js          # PRESETS map
│   ├── chat-cards.js                 # 5 named card helpers
│   ├── relentless-watcher.js         # register/unregister/restore
│   ├── harrowing-presence-hook.js    # dnd5e.combatTurnStart handler — rolls Wis save + applies frightened
│   └── initiative.js                 # shared-initiative hook
├── styles/manifest-tulpa.css         # cast dialog styling
├── lang/en.json                      # i18n strings
├── _source/                          # source JSON for compendium packs (git-tracked)
│   ├── manifest-tulpa-spells/
│   │   └── Item.manifest-tulpa.json
│   └── manifest-tulpa-actors/
│       └── Actor.tulpa.json
├── packs/                            # built LevelDB packs (gitignored)
├── scripts/validate-pack.js          # pre-release sanity check
└── .github/workflows/release.yml     # release builder
```

**Two conventions:**

- `_source/` is git-tracked, `packs/` is gitignored. Source JSON is editable; LevelDB pack is a build artifact.
- All module behavior in `modules/*.js`. No macros in the pack; no scripts hidden in actor flags.

### `module.json` essentials

```jsonc
{
  "id": "manifest-tulpa",
  "title": "Manifest Tulpa",
  "description": "Adds the 5th-level Conjuration spell 'Manifest Tulpa' with full automation.",
  "version": "0.1.0",
  "compatibility": { "minimum": "13", "verified": "13.351" },
  "esmodules": ["modules/init.js"],
  "styles": ["styles/manifest-tulpa.css"],
  "languages": [{ "lang": "en", "name": "English", "path": "lang/en.json" }],
  "packs": [
    { "name": "manifest-tulpa-spells", "label": "Manifest Tulpa - Spells",
      "type": "Item",  "path": "packs/manifest-tulpa-spells",  "system": "dnd5e" },
    { "name": "manifest-tulpa-actors", "label": "Manifest Tulpa - Actors",
      "type": "Actor", "path": "packs/manifest-tulpa-actors", "system": "dnd5e" }
  ],
  "relationships": {
    "systems": [{ "id": "dnd5e", "type": "system",
                  "compatibility": { "minimum": "5.2.5" } }],
    "requires": [
      { "id": "midi-qol",     "type": "module" },
      { "id": "dae",          "type": "module" },
      { "id": "times-up",     "type": "module" },
      { "id": "sequencer",    "type": "module" },
      { "id": "portal-lib",   "type": "module" },
      { "id": "aura-effects", "type": "module",
        "compatibility": { "minimum": "1.5.2" } }
    ],
    "recommends": [
      { "id": "automated-animations", "type": "module" },
      { "id": "jb2a_patreon",         "type": "module" }
    ]
  },
  "url":      "https://github.com/themrbeasley/manifest-tulpa",
  "manifest": "https://github.com/themrbeasley/manifest-tulpa/releases/latest/download/module.json",
  "download": "https://github.com/themrbeasley/manifest-tulpa/releases/download/v0.1.0/manifest-tulpa.zip"
}
```

### Pack building

Foundry V13 uses LevelDB for packs. The official `@foundryvtt/foundryvtt-cli` converts source JSON to LevelDB:

```bash
npx @foundryvtt/foundryvtt-cli package pack manifest-tulpa-spells \
  --in _source/manifest-tulpa-spells \
  --out packs/manifest-tulpa-spells
```

One invocation per pack, wrapped in `npm run build:packs`.

### GitHub Actions release workflow

`.github/workflows/release.yml`, triggered on tag push matching `v*`:

1. Checkout the tagged commit.
2. Setup Node (LTS).
3. Install `@foundryvtt/foundryvtt-cli` as a dev dep.
4. Bump `module.json` version to match the tag.
5. Rewrite `module.json` download URL to the release asset URL.
6. Build packs (`npm run build:packs`).
7. Run validation script.
8. Zip the module directory (excluding `_source/`, `.github/`, `node_modules/`, etc.).
9. Create the GitHub Release, attaching the zip and the rewritten `module.json` as separate assets.

End users install by pasting the manifest URL into Foundry's "Install Module" dialog. Updates flow through the same URL on subsequent releases.

### Pre-release validation script

`scripts/validate-pack.js` loads both source JSON files and asserts:

**Actor (`_source/manifest-tulpa-actors/Actor.tulpa.json`):**
- `effects` is empty (no leftover modification AEs).
- `items` contains exactly the base-statblock items + Manifestation Strike — nothing else.
- `flags.ActiveAuras` is not present anywhere in the document tree.
- World-export flags absent: `flags["activity-macro"]`, `flags["LocknKey"]`, `flags["scene-packer"]`, `flags.exportSource`.
- Manifestation Strike's damage type is the placeholder, not `force` / `radiant` / `psychic`.

**Spell (`_source/manifest-tulpa-spells/Item.manifest-tulpa.json`):**
- World-export flags absent (same list as actor).
- `system.description.value` is non-empty.
- The summon activity's profile UUID matches the `Compendium.manifest-tulpa.manifest-tulpa-actors.Actor.*` pattern (not a world-local UUID).
- `consumption.scaling.allowed` is `false`.

Fails the release if any assertion fails. Cheap insurance against the "I forgot to scrub the asset files" foot-gun.

### Versioning policy

Semver. Patch for bug fixes, minor for new modifications or non-breaking behaviors, major for breaking changes (e.g., flag namespace renames).

Tags drive everything: `git tag v0.1.0 && git push origin v0.1.0` triggers the workflow.

If a major version lands while a player has an active Tulpa, the next world load runs the Section 5 startup scan. Breaking flag changes should include a migration step in `modules/init.js`.

### Install URL for users

```
https://github.com/themrbeasley/manifest-tulpa/releases/latest/download/module.json
```

Always points at the latest release. Paste into Foundry → install. No marketplace listing needed for personal-use distribution.

### File ownership summary

| File | What it owns |
|---|---|
| `module.json` | Manifest, deps, pack declarations |
| `modules/init.js` | Hook registration on `ready`; startup scan for active anchors |
| `modules/cast-flow.js` | Phase 1 (pre-cast) + Phase 3 (post-summon wiring) |
| `modules/cast-dialog.js` | The modification picker UI |
| `modules/dismiss-flow.js` | Dismissal handler + 5 trigger sources |
| `modules/modification-registry.js` | Single source of truth for what each mod does |
| `modules/animations.js` + `animation-presets.js` | All Sequencer + AA orchestration |
| `modules/chat-cards.js` | All chat output |
| `modules/relentless-watcher.js` | Hook scoping + reload-time re-arm |
| `modules/harrowing-presence-hook.js` | `dnd5e.combatTurnStart` handler — detects marker AE, rolls save, applies frightened |
| `modules/initiative.js` | Shared-initiative hook |
| `_source/.../Item.manifest-tulpa.json` | The spell |
| `_source/.../Actor.tulpa.json` | The base-statblock Tulpa |
| `.github/workflows/release.yml` | Build + publish on tag push |
| `scripts/validate-pack.js` | Pre-release sanity check |

---

## Known gaps & out-of-scope items

Documented here so they're not lost. None block v1; all are candidates for follow-up.

### Deferred (acknowledged, not implemented in v1)

1. **Caster delay/ready does not re-shift Tulpa initiative.** Tulpa stays at its original position. GM can manually re-order. (Section 7, item 1.)
2. **Non-damage unconscious does not dismiss the Tulpa.** Sleep, Hold Person, etc. on the caster don't fire trigger #2. Can be added by hooking `applyActiveEffect` for the `unconscious` status. (Section 5.)
3. **`/tulpa <message>` chat-whisper command.** Telepathic Link is a marker AE in v1; future enhancement to wire up a whisper command using the flag already set.
4. **No localization beyond `lang/en.json`.** Strings are externalized in v1 to make future localization mechanical, but only English is shipped (confirmed scope).

### Narrowed-from-RAW (engine limits)

5. **Unsettling Form is narrower than RAW.** Spell text says creatures have Disadvantage on saves *against the Frightened condition*; module grants Disadvantage on Wis and Cha saves on the Tulpa (`flags.midi-qol.grants.disadvantage.save.wis` and `.cha`). Fear saves are almost always Wis-based, occasionally Cha, so this covers the common case. A frightened-target-tag system would close the gap fully but doesn't exist in midi-qol today. (Section 4 table.)
6. **Multiattack is descriptive, not enforced.** The Multiattack modification inserts a feature item describing "two Manifestation Strike attacks when the Tulpa takes the Attack action," but Foundry doesn't count or restrict attacks per turn; the player clicks Manifestation Strike twice. This matches standard 5e NPC multiattack convention in Foundry. (Section 4 table.)

### Resolved during gap-closure pass (no follow-up needed)

- ~~D5: Unsettling Form midi-qol flag key~~ — confirmed `grants.disadvantage.save.wis`/`.cha` (see narrowed-from-RAW above)
- ~~D6: Aura Effects script API for Harrowing Presence~~ — script is a sync predicate; redesigned as marker AE + `dnd5e.combatTurnStart` hook (Section 4 + Section 7 item 7)
- ~~D7: jb2a_patreon asset keys~~ — locked dotted DB keys per damage type (Section 6 table)
- ~~D8: DAE delete-on-expire flag name~~ — handled by `times-up` module (declared required dependency); no shim needed

---

## Next steps

1. User reviews this revised spec (revision 2 — gap-closure pass complete).
2. Any further revisions folded in.
3. **Hold here pending explicit user instruction to proceed.** Per the user's directive at the end of the gap-closure pass: do *not* automatically transition to the `writing-plans` skill. The user will direct next steps when ready.
