import { MODIFICATIONS, iterActivities, buildStrikeParts } from "./modification-registry.js";
import { MODULE_ID, NS, ANCHOR_AE_NAME, ANCHOR_DURATION_SECONDS } from "./constants.js";
import { openCastDialog } from "./cast-dialog.js";
import { postCast, postWarning } from "./chat-cards.js";
import { playManifest } from "./animations.js";
import { armTulpaHpWatcher } from "./tulpa-hp-watcher.js";
import { alignTulpaInitiative } from "./initiative.js";
import { performDismissCleanup } from "./dismiss-flow.js";

const SPELL_IDENTIFIER = "manifest-tulpa";

// v0.1.13 (smoke REG-1): slot level captured at preUseActivity so postSummon can read
// it without depending on `usageConfig` (which dnd5e doesn't pass to postSummon). Keyed
// by activity.uuid — entries are deleted as soon as postSummon consumes them, so the
// map never accumulates across casts. A chat-button "Summon" press on a deferred cast
// won't have a capture (preUseActivity already fired and we cleared it on the inline
// path); in that case we fall back to slot 5, which is the spell's base level.
const SLOT_CAPTURE = new Map();

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
  SLOT_CAPTURE.set(activity.uuid, parseSlotLevel(usageConfig));
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
  const slotLevel = SLOT_CAPTURE.get(activity.uuid) ?? 5;
  SLOT_CAPTURE.delete(activity.uuid);
  const availableSlots = Math.min(6, 2 + Math.max(0, slotLevel - 5));

  // Trigger #4 — if a previous anchor exists, tear it down INLINE before continuing.
  // v0.1.12 awaited only `previous.delete(...)`, which returned before the
  // `deleteActiveEffect` hook handler finished its token/system-AE cascade. The cast
  // pipeline then raced with the in-flight cleanup and crashed at the dismiss chat
  // card with `Error: undefined id [GRhO38Y2RLiYL8lj]` (smoke REG-2 in v0.1.12).
  // v0.1.13: call `performDismissCleanup` directly (awaits the full teardown), then
  // delete the anchor with `skipFunnel: true` so the hook handler no-ops.
  const previous = caster.effects.find(e => e.getFlag(MODULE_ID, "tulpaUuid"));
  if (previous) {
    const dismissOpts = { [MODULE_ID]: { dismissReason: "recast" } };
    await performDismissCleanup(previous, dismissOpts);
    await previous.delete({ [MODULE_ID]: { dismissReason: "recast", skipFunnel: true } });
  }

  // postSummon hands us the TokenDocument[] directly (see `summon.mjs` ~L222). No
  // need to scan canvas placeables or read `results.summoned` — both v0.1.11 fallback
  // paths are gone with v0.1.13.
  const token = Array.isArray(createdTokens) ? createdTokens[0] ?? null : null;

  const selection = await openCastDialog({ availableSlots });
  if (!selection) {
    await abortAndCleanup(token, game.i18n.localize("MANIFEST_TULPA.Chat.CancelWarning"));
    return;
  }

  const castConfig = { ...selection, slotLevel };

  // Defensive slot-budget check (matches Section 4 step "Defensive: refuse if over").
  const used = selection.modifications.reduce((n, s) => n + (MODIFICATIONS[s]?.slots ?? 0), 0);
  if (used > availableSlots) {
    await abortAndCleanup(token, `castConfig over budget (${used}/${availableSlots}) — aborting.`);
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

function parseSlotLevel(usageConfig) {
  const raw = usageConfig?.spell?.slot;
  if (typeof raw === "string") {
    const m = /spell(\d+)/.exec(raw);
    if (m) return Number(m[1]);
  }
  if (typeof usageConfig?.scaling === "number") return 5 + usageConfig.scaling;
  return 5;
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

async function abortAndCleanup(token, message) {
  if (token) {
    // `token` is the TokenDocument from postSummon's `createdTokens[0]`.
    try { await token.delete(); }
    catch (err) { console.warn(`${MODULE_ID} | abort token cleanup failed:`, err); }
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
      dae: { specialDuration: ["zeroHP", "isDeath"], showIcon: false },
    },
  }]);
}
