import { MODIFICATIONS, iterActivities, buildStrikeParts } from "./modification-registry.js";
import { MODULE_ID, NS, ANCHOR_AE_NAME, ANCHOR_DURATION_SECONDS, ANCHOR_SPECIAL_DURATIONS } from "./constants.js";
import { openCastDialog } from "./cast-dialog.js";
import { postCast, postWarning } from "./chat-cards.js";
import { playManifest } from "./animations.js";
import { armTulpaHpWatcher } from "./tulpa-hp-watcher.js";
import { alignTulpaInitiative } from "./initiative.js";
import { findPreviousAnchor, findSystemSummonAE } from "./dismiss-helpers.js";
import { resolveSlotLevel, modBudget } from "./slot-budget.js";

const SPELL_IDENTIFIER = "manifest-tulpa";

// v0.1.13 (smoke REG-1): we stash the cast's usageConfig at preUseActivity so postSummon
// can recover the expended slot level (dnd5e doesn't pass usageConfig to postSummon).
// Keyed by activity.uuid — entries are deleted as soon as postSummon consumes them, so the
// map never accumulates across casts. A chat-button "Summon" press on a deferred cast
// won't have a capture; in that case we fall back to slot 5, the spell's base level.
//
// v0.1.18 (mod-slot-budget bug): we now stash the LIVE usageConfig OBJECT, not an eager
// `parseSlotLevel(usageConfig)` result. preUseActivity (mixin.mjs:221) fires BEFORE the
// slot-selection dialog (L224-230) writes the chosen slot into usageConfig.spell.slot and
// BEFORE `_prepareUsageScaling` (L233) sets usageConfig.scaling — so parsing at capture
// time always read the pre-dialog base (5) and the budget was forever 2. dnd5e mutates the
// SAME usageConfig object in place (it's a `const` from mixin.mjs:191, never reassigned),
// so by postSummon this stashed reference carries the real chosen slot. resolveSlotLevel()
// reads it then. See modules/slot-budget.js + the mod-slot-budget scratchpad.
const SLOT_CAPTURE = new Map();

// v0.1.17 (Bug #1 recast fix): when casting over a live Tulpa, we tear the OLD one down
// in `onPreUseActivity` — BEFORE dnd5e creates the new token — and stash the in-flight
// teardown promise here, keyed by activity.uuid. `onPostSummon` awaits it (then deletes
// the entry) so the new cast pipeline never races a half-torn-down old Tulpa. Doing the
// dismissal in preUseActivity (after slot selection, before the placement crosshair) is
// what guarantees the old token + anchor + "Summon:" AE are gone before the new token
// exists — so midi-qol gives the new token a FRESH "Summon:" AE that nothing else is
// pinned to, instead of reusing-by-name the old one and dragging the new token down.
// See the recast-fix scratchpad and smoke report Bug #1 for the full cascade.
const RECAST_DISMISS = new Map();

// Options for the recast pre-dismissal. NO skipFunnel — we WANT the funnel to run the
// cleanup; routing through `anchor.delete()` removes the anchor from the collection
// before the deleteActiveEffect hook fires, so the old token's delete →
// onPreDeleteToken → findPreviousAnchor returns null → the funnel does NOT re-enter
// (that re-entrancy was the v0.1.12/v0.1.13 double-delete crash). skipAnimation keeps the
// teardown fast (no up-to-15s dismiss animation) so it finishes before the new token.
const RECAST_DISMISS_OPTIONS = { [MODULE_ID]: { dismissReason: "recast", skipAnimation: true } };

/**
 * dnd5e.preUseActivity hook handler — captures the selected slot for our spell so the
 * later postSummon handler can compute the modification-slot budget. v0.1.12 lived on
 * postUseActivity, which `Hooks.call` short-circuits when any prior handler returns
 * false (AutoAnimations, midi-qol, and world macros routinely do). The smoke for
 * v0.1.12 (REG-1) proved this: a MT-WRAP wrapper confirmed the slot was consumed and
 * the chat card posted, but our handler never ran. We've moved the entry point to
 * `dnd5e.postSummon` (which uses `Hooks.callAll` — immune to short-circuit) and split
 * slot capture into this preUseActivity helper.
 */
export function onPreUseActivity(activity, usageConfig /*, dialogConfig, messageConfig */) {
  if (activity?.type !== "summon") return;
  if (activity.item?.system?.identifier !== SPELL_IDENTIFIER) return;
  // Stash the LIVE usageConfig object (NOT a parse). dnd5e mutates it in place during slot
  // selection + scaling; postSummon resolves the real level from it. See SLOT_CAPTURE note.
  SLOT_CAPTURE.set(activity.uuid, usageConfig);

  // Trigger #4 (recast) — if a Tulpa is already live, tear the OLD one down NOW, before
  // dnd5e consumes the slot and creates the new token. preUseActivity fires AFTER slot
  // selection but BEFORE the placement crosshair, so the old token + anchor + "Summon:" AE
  // are fully gone before the new token exists. We dismiss through the normal funnel
  // (`anchor.delete(...)`, NOT performDismissCleanup directly): `.delete()` removes the
  // anchor from the collection before the deleteActiveEffect hook runs cleanup, so the old
  // token's delete → onPreDeleteToken → findPreviousAnchor returns null → no funnel
  // re-entrancy. Fire-and-forget (preUseActivity is a sync `Hooks.call` handler and must
  // not return false — invariant #2); we stash the promise for onPostSummon to await.
  // v0.1.16 ran this teardown in onPostSummon AFTER the new token existed, which let
  // midi-qol pin the new token to the old "Summon:" AE and then deleted that AE — killing
  // BOTH tulpas and crashing the cast (smoke Bug #1 / REG-2 recurrence).
  const caster = activity.item?.actor;
  const previous = findPreviousAnchor(caster);
  if (previous) {
    const teardown = previous.delete(RECAST_DISMISS_OPTIONS)
      .catch(err => console.warn(`${MODULE_ID} | recast pre-dismiss of previous Tulpa failed:`, err));
    RECAST_DISMISS.set(activity.uuid, teardown);
  }
}

/**
 * dnd5e.postSummon hook handler — Phase 1 (dialog) + Phase 3 (post-cast wiring).
 * Phase 2 (token placement) has already run by the time we get here. Signature:
 * `(activity, profile, createdTokens, options)`. Fires from BOTH paths in dnd5e 5.2.5:
 *   • inline placement during `use()`: `_finalizeUsage` → `placeSummons` → `Hooks.callAll("dnd5e.postSummon", ...)`
 *   • chat-card "Summon" button: `SummonActivity.#placeSummons` → same `placeSummons` → same hook call
 * `createdTokens` is the TokenDocument[] dnd5e just created on the canvas.
 */
export async function onPostSummon(activity, _profile, createdTokens /*, options */) {
  if (activity?.type !== "summon") return;
  // _source/manifest-tulpa-spells/Item.manifest-tulpa.json carries this identifier; locale-safe.
  if (activity.item?.system?.identifier !== SPELL_IDENTIFIER) return;

  const caster = activity.item.actor;
  if (!caster) return;

  // ---- Phase 1: pre-cast dialog ----
  // Resolve the expended slot level from the LIVE usageConfig stashed at preUseActivity.
  // It's read HERE (postSummon), after dnd5e mutated it via the slot dialog +
  // _prepareUsageScaling — reading it eagerly at capture time always saw the base 5 and
  // pinned the budget at 2 (v0.1.18 bug). No capture (deferred chat-button path) → 5.
  const captured = SLOT_CAPTURE.get(activity.uuid);
  SLOT_CAPTURE.delete(activity.uuid);
  const slotLevel = resolveSlotLevel(captured);
  const availableSlots = modBudget(slotLevel);

  // Trigger #4 (recast) — the OLD Tulpa's teardown was kicked off in onPreUseActivity
  // (before this new token existed). Await it here so the new cast pipeline never races a
  // half-torn-down old Tulpa (the v0.1.12 REG-2 crash mode). The stored promise already
  // has a .catch, so it never rejects; if no recast was in flight there's nothing to wait
  // on. The old "Summon:" AE is already gone by now, so the new token midi created for
  // this cast is pinned to its own fresh AE — deleting the old one can't touch it.
  const recastTeardown = RECAST_DISMISS.get(activity.uuid);
  if (recastTeardown) {
    RECAST_DISMISS.delete(activity.uuid);
    await recastTeardown;
  }

  // postSummon hands us the TokenDocument[] directly (see `summon.mjs` ~L222). No
  // need to scan canvas placeables or read `results.summoned` — both v0.1.11 fallback
  // paths are gone with v0.1.13.
  const token = Array.isArray(createdTokens) ? createdTokens[0] ?? null : null;

  const selection = await openCastDialog({ availableSlots });
  if (!selection) {
    await abortAndCleanup(token, caster, game.i18n.localize("MANIFEST_TULPA.Chat.CancelWarning"));
    return;
  }

  const castConfig = { ...selection, slotLevel };

  // Defensive slot-budget check (matches Section 4 step "Defensive: refuse if over").
  const used = selection.modifications.reduce((n, s) => n + (MODIFICATIONS[s]?.slots ?? 0), 0);
  if (used > availableSlots) {
    await abortAndCleanup(token, caster, `castConfig over budget (${used}/${availableSlots}) — aborting.`);
    return;
  }

  if (!token) {
    await postWarning({ message: "Summon produced no token — check the spell's summon activity." });
    return;
  }
  const tulpa = token.actor;

  // Step 1b: apply caster-derived base stats. The base actor template ships with flat
  // AC 13 / HP 40 / CR 1 and an empty spellcasting ability; dnd5e's summon `bonuses` and
  // `match` fields are not reliably honored by the npc statblock in 5.2.5, so we
  // imperatively bake the spell's AC/HP/spellcasting/prof formulas onto the spawned actor.
  await applyCasterStats(tulpa, caster, slotLevel);

  // Step 2 (was a separate `setStrikeDamageType` write) is now folded into
  // `applyStrikeChanges` inside `applyModifications` — Part 0's damage type and every
  // item-patch transformer share a single `strike.update()` so writes can't race.
  // v0.1.9 scar: v0.1.8 split this into two awaited writes and the second one's
  // `deepClone` captured stale state, clobbering the base damage type.

  // Step 3: apply modifications in spec order.
  await applyModifications(tulpa, caster, castConfig);

  // Step 4: caster-side anchor AE.
  await createAnchorAE(caster, tulpa, castConfig);

  // Step 5: Tulpa HP watcher — always armed. Handles both Relentless clamp (when the
  // mod is selected and unused) and zero-HP dismissal cascade (otherwise).
  armTulpaHpWatcher(tulpa.uuid, castConfig, castConfig.damageType);

  // Step 6: shared initiative.
  if (game.combat) {
    await alignTulpaInitiative(game.combat, caster, tulpa);
  }

  // Step 7: animation.
  await playManifest(token, castConfig.damageType);

  // Step 8: cast confirmation card.
  await postCast({ caster, tulpa, castConfig });
}

// Single-writer for the Manifestation Strike weapon. The heavy lifting (Set→array
// coercion on `DamageData.types`, Part 0 damage-type override, item-patch composition)
// lives in `buildStrikeParts` so it's pure and unit-testable. v0.1.9 used
// `foundry.utils.deepClone` here, which degrades the Set-typed `types` field into a
// plain `{0: "..."}` object — dnd5e's DamageData silently rejected the resulting
// update, leaving the strike on its compendium-baked "force" base type. v0.1.10 scar.
async function applyStrikeChanges(tulpa, castConfig, chosen) {
  const strike = tulpa.items.find(i => i.name === "Manifestation Strike");
  if (!strike) return;
  const itemPatches = chosen.filter(x => x.kind === "item-patch" && typeof x.patchActivity === "function");
  const update = {};
  for (const [actId, act] of iterActivities(strike.system?.activities)) {
    update[`system.activities.${actId}.damage.parts`] =
      buildStrikeParts(act.damage?.parts, castConfig.damageType, itemPatches);
  }
  if (Object.keys(update).length) await strike.update(update);
}

function profToCR(prof) {
  // dnd5e CR-to-prof mapping (5e 2024): CR 0-4 -> +2, 5-8 -> +3, 9-12 -> +4, 13-16 -> +5, 17+ -> +6.
  // Inverse: pick a CR that yields the caster's proficiency bonus.
  if (prof >= 6) return 17;
  if (prof >= 5) return 13;
  if (prof >= 4) return 9;
  if (prof >= 3) return 5;
  return 1;
}

async function applyCasterStats(tulpa, caster, slotLevel) {
  const casterAbility = caster.system?.attributes?.spellcasting || "int";
  const abilityValue  = caster.system?.abilities?.[casterAbility]?.value ?? 10;
  const spellMod      = caster.system?.abilities?.[casterAbility]?.mod
                       ?? Math.floor((abilityValue - 10) / 2);
  const casterLevel   = caster.system?.details?.level ?? 1;
  const casterProf    = caster.system?.attributes?.prof ?? 2;
  const casterSpellDC = caster.system?.attributes?.spelldc
                       ?? (8 + casterProf + spellMod);

  const hpTotal = 40 + 5 * casterLevel;

  const updates = {
    "system.attributes.ac.calc": "flat",
    "system.attributes.ac.flat": 13 + spellMod,
    "system.attributes.hp.max":     hpTotal,
    "system.attributes.hp.value":   hpTotal,
    "system.attributes.spellcasting": casterAbility,
    "system.attributes.spelldc": casterSpellDC,
    "system.details.cr": profToCR(casterProf),
    [`system.abilities.${casterAbility}.value`]: abilityValue,
    // STR & CON save proficiencies mirror the caster (spell text).
    "system.abilities.str.proficient": caster.system?.abilities?.str?.proficient ? 1 : 0,
    "system.abilities.con.proficient": caster.system?.abilities?.con?.proficient ? 1 : 0,
  };

  await tulpa.update(updates);
}

async function applyModifications(tulpa, caster, castConfig) {
  const chosen = castConfig.modifications.map(s => ({ slug: s, ...MODIFICATIONS[s] })).filter(m => m.kind);

  // 1: Manifestation Strike final shape — Part 0 damage type + every item-patch
  // transformer composed into a single `strike.update()` so later writes can't read
  // stale in-memory parts arrays.
  await applyStrikeChanges(tulpa, castConfig, chosen);

  // 2: item inserts.
  const insertedItems = chosen.filter(x => x.kind === "item-insert").map(x => x.item);
  if (insertedItems.length) await tulpa.createEmbeddedDocuments("Item", insertedItems);

  // 3: AE-only mods (single batched insert).
  const aes = chosen.filter(x => x.kind === "ae").map(x => x.template);
  if (aes.length) await tulpa.createEmbeddedDocuments("ActiveEffect", aes);

  // 3b: token resize for size shifts (V13 doesn't auto-resize from a size-trait AE).
  for (const m of chosen.filter(x => x.tokenSize)) {
    const tokenDoc = tulpa.token ?? tulpa.getActiveTokens()[0]?.document;
    if (tokenDoc) await tokenDoc.update(m.tokenSize);
  }

  // 4: aura+marker (Harrowing Presence).
  // Active Auras (kandashi 0.12.7) propagates the cloned effect onto in-range hostile
  // tokens. The registry returns a plain ActiveEffect tagged with `flags.ActiveAuras.*`;
  // AA picks it up at creation time, then clones it to enemy tokens within 10 ft. The
  // cloned effect carries our flag-key `changes` and `flags["manifest-tulpa"].auraDC`,
  // so the `combatTurnStart` hook reads them via `actor.getFlag(...)` unchanged.
  // v0.1.10 used Aura Effects 1.5.2 — its synthetic-actor registration path never
  // landed the marker on hostiles. v0.1.11 swaps engines without rewriting the hook.
  const auraMods = chosen.filter(x => x.kind === "aura+marker");
  for (const m of auraMods) {
    const { aura } = m.build(caster, castConfig.damageType);
    await tulpa.createEmbeddedDocuments("ActiveEffect", [aura]);
  }

  // 5: postApply hooks.
  for (const m of chosen) {
    if (typeof m.postApply === "function") {
      await m.postApply({ caster, tulpa, castConfig });
    }
  }
}

async function abortAndCleanup(token, caster, message) {
  if (token) {
    // `token` is the TokenDocument from postSummon's `createdTokens[0]`.
    try { await token.delete(); }
    catch (err) { console.warn(`${MODULE_ID} | abort token cleanup failed:`, err); }
  }
  // v0.1.17 (smoke Bug #7): a cancelled/over-budget cast never creates the caster-side
  // anchor, so the single-funnel dismissal never runs — and midi-qol's "Summon: Manifest
  // Tulpa" AE (created on the caster ~2-4s after placement) would orphan on the caster for
  // an hour. The normal dismiss path sweeps this AE via the funnel; on the abort path there
  // IS no funnel, so sweep it here directly. A synchronous sweep suffices: the dialog is
  // open far longer than midi's async create, and there's no later cast whose AE we'd risk
  // catching (live-validated midi does not re-create it after this delete).
  if (caster) {
    const summonAE = findSystemSummonAE(caster);
    if (summonAE) {
      try { await summonAE.delete(); }
      catch (err) { console.warn(`${MODULE_ID} | abort summon AE cleanup failed:`, err); }
    }
  }
  await postWarning({ message });
}

async function createAnchorAE(caster, tulpa, castConfig) {
  // Store tulpaTokenId + tulpaSceneId alongside tulpaUuid so the dismiss flow can fall
  // back to a scene+token lookup when `fromUuid(tulpaUuid)` returns null. Synthetic
  // (token-tied) actor UUIDs can resolve to null at dismiss time if the token was already
  // deleted or the scene wasn't current — v0.1.6's dismiss handler silently no-op'd
  // when fromUuid failed, leaving orphaned tokens after duration/zeroHP/isDeath.
  const tulpaTokenDoc = tulpa.token ?? tulpa.getActiveTokens()[0]?.document ?? null;
  await caster.createEmbeddedDocuments("ActiveEffect", [{
    name: ANCHOR_AE_NAME,
    img: caster.items.find(i => i.system?.identifier === SPELL_IDENTIFIER)?.img
         ?? "icons/svg/crystal.svg",
    duration: { seconds: ANCHOR_DURATION_SECONDS },
    changes: [],
    transfer: false,
    description: game.i18n.localize("MANIFEST_TULPA.Effect.AnchorDescription"),
    flags: {
      [MODULE_ID]: {
        tulpaUuid: tulpa.uuid,
        tulpaTokenId: tulpaTokenDoc?.id ?? null,
        tulpaSceneId: tulpaTokenDoc?.parent?.id ?? null,
        castConfig,
      },
      dae: { specialDuration: ANCHOR_SPECIAL_DURATIONS, showIcon: false },
    },
  }]);
}
