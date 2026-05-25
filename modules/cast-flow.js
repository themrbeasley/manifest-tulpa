import { MODIFICATIONS } from "./modification-registry.js";
import { MODULE_ID, NS, ANCHOR_AE_NAME, ANCHOR_DURATION_SECONDS } from "./constants.js";
import { openCastDialog } from "./cast-dialog.js";
import { postCast, postWarning } from "./chat-cards.js";
import { playManifest } from "./animations.js";
import { armRelentlessWatcher } from "./relentless-watcher.js";
import { alignTulpaInitiative } from "./initiative.js";

const SPELL_IDENTIFIER = "manifest-tulpa";

/**
 * dnd5e.postUseActivity hook handler — Phase 1 + Phase 3 in one entry point.
 * Phase 2 (the actual summon) is dnd5e's native flow and has already run by now.
 */
export async function onPostUseActivity(activity, usageConfig, results) {
  if (activity?.type !== "summon") return;
  // The scrub script (scrub-source.mjs) sets system.identifier; localization-safe.
  if (activity.item?.system?.identifier !== SPELL_IDENTIFIER) return;

  const caster = activity.item.actor;
  if (!caster) return;

  // ---- Phase 1: pre-cast dialog ----
  const slotLevel = parseSlotLevel(usageConfig);
  const availableSlots = Math.min(6, 2 + Math.max(0, slotLevel - 5));

  // Trigger #4 — if a previous anchor exists, delete it first (dismisses the previous Tulpa).
  const previous = caster.effects.find(e => e.getFlag(MODULE_ID, "tulpaUuid"));
  if (previous) await previous.delete();

  const selection = await openCastDialog({ availableSlots });
  // From here on the Tulpa is on the canvas; any abort must clean it up to avoid orphans.
  const token = locateSummonedTulpa(results, caster);

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

  // Step 2: damage type on the Manifestation Strike.
  await setStrikeDamageType(tulpa, castConfig.damageType);

  // Step 3: apply modifications in spec order.
  await applyModifications(tulpa, caster, castConfig);

  // Step 4: caster-side anchor AE.
  await createAnchorAE(caster, tulpa, castConfig);

  // Step 5: Relentless watcher (registered by Task 13 module).
  if (castConfig.modifications.includes("relentless")) {
    armRelentlessWatcher(tulpa.uuid, castConfig.damageType);
  }

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

function locateSummonedTulpa(results, caster) {
  const created = results?.createdTokens?.[0];
  if (created) return created;
  // Fallback: most recently created token whose summon.origin is this caster.
  const candidates = canvas.tokens.placeables
    .filter(t => t.actor?.getFlag?.("dnd5e", "summon")?.origin === caster.uuid);
  candidates.sort((a, b) => (b.document._stats?.createdTime ?? 0) - (a.document._stats?.createdTime ?? 0));
  return candidates[0] ?? null;
}

async function setStrikeDamageType(tulpa, damageType) {
  const strike = tulpa.items.find(i => i.name === "Manifestation Strike");
  if (!strike) return;
  const parts = foundry.utils.deepClone(strike.system.damage?.parts ?? []);
  if (!parts.length) return;
  parts[0].types = [damageType];
  await strike.update({ "system.damage.parts": parts });
}

async function applyModifications(tulpa, caster, castConfig) {
  const chosen = castConfig.modifications.map(s => ({ slug: s, ...MODIFICATIONS[s] })).filter(m => m.kind);

  // 1: item patches (so AEs see the final strike shape).
  for (const m of chosen.filter(x => x.kind === "item-patch")) {
    const strike = tulpa.items.find(i => i.name === "Manifestation Strike");
    if (!strike) continue;
    const update = m.patch(strike, castConfig.damageType);
    await strike.update(update);
  }

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
  // The aura is what Aura Effects propagates to in-range hostiles; the marker payload
  // (inHarrowingAura flag + auraDC) is what the combat-turn hook reads. Merge marker flags
  // onto the aura so propagated copies carry them. The exact applied-effect slot in
  // Aura Effects 1.5.2 needs Foundry-side smoke verification — see smoke test step "Harrowing Presence".
  const auraMods = chosen.filter(x => x.kind === "aura+marker");
  for (const m of auraMods) {
    const { aura, markerOnApply } = m.build(caster, castConfig.damageType);
    aura.flags = foundry.utils.mergeObject(aura.flags ?? {}, markerOnApply.flags ?? {});
    if (aura.system) aura.system.appliedEffect = markerOnApply;
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
    try { await token.document.delete(); }
    catch (err) { console.warn(`${MODULE_ID} | abort token cleanup failed:`, err); }
  }
  await postWarning({ message });
}

async function createAnchorAE(caster, tulpa, castConfig) {
  await caster.createEmbeddedDocuments("ActiveEffect", [{
    name: ANCHOR_AE_NAME,
    img: caster.items.find(i => i.system?.identifier === SPELL_IDENTIFIER)?.img
         ?? "icons/svg/crystal.svg",
    duration: { seconds: ANCHOR_DURATION_SECONDS },
    changes: [],
    transfer: false,
    description: game.i18n.localize("MANIFEST_TULPA.Effect.AnchorDescription"),
    flags: {
      [MODULE_ID]: { tulpaUuid: tulpa.uuid, castConfig },
      dae: { specialDuration: ["zeroHP", "isDeath"], showIcon: false },
    },
  }]);
}
