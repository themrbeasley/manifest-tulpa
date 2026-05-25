import { MODULE_ID } from "./constants.js";
import { postDismiss } from "./chat-cards.js";
import { playDismiss, endAuraEffect } from "./animations.js";
import { unarmRelentlessWatcher } from "./relentless-watcher.js";

/**
 * deleteActiveEffect hook — fires when the caster-side anchor AE is removed for any reason.
 * This is the single funnel for all five dismissal triggers (see Section 5).
 */
export async function onDeleteActiveEffect(effect /*, options, userId */) {
  const tulpaUuid = effect.getFlag?.(MODULE_ID, "tulpaUuid");
  if (!tulpaUuid) return; // only anchors carry this flag
  const castConfig = effect.getFlag(MODULE_ID, "castConfig") ?? {};
  const caster = effect.parent;
  const tulpa = await fromUuid(tulpaUuid);

  const reason = inferReason(effect);

  // Tear down in-memory watchers first.
  unarmRelentlessWatcher(tulpaUuid);
  endAuraEffect(tulpaUuid);

  // If the token is still on the canvas, play the dismissal animation then delete it.
  const token = tulpa?.getActiveTokens()[0];
  if (token) {
    if (castConfig.damageType) await playDismiss(token, castConfig.damageType);
    try { await token.document.delete(); }
    catch (err) { console.warn(`${MODULE_ID} | token delete failed:`, err); }
  }

  await postDismiss({ caster, tulpa, reason });
}

/**
 * preDeleteToken hook — trigger #5: when a GM manually deletes the Tulpa token,
 * find the summoner's matching anchor AE and delete it (which re-enters the funnel above).
 */
export async function onPreDeleteToken(tokenDoc) {
  const summonOrigin = tokenDoc.actor?.getFlag?.("dnd5e", "summon")?.origin;
  if (!summonOrigin) return;
  const caster = await fromUuid(summonOrigin);
  if (!caster) return;
  const anchor = caster.effects.find(e => e.getFlag(MODULE_ID, "tulpaUuid") === tokenDoc.actor.uuid);
  if (!anchor) return;
  // Tag the anchor so the deleteActiveEffect handler reports the right reason.
  await anchor.setFlag(MODULE_ID, "dismissReason", "manual");
  await anchor.delete();
}

function inferReason(effect) {
  const tagged = effect.getFlag?.(MODULE_ID, "dismissReason");
  if (tagged) return tagged;
  // DAE specialDuration triggers stamp flags.dae.disabled or similar at delete time;
  // without a reliable signal we fall back to 'duration'.
  return "duration";
}
