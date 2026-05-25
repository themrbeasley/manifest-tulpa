import { MODULE_ID } from "./constants.js";
import { postDismiss } from "./chat-cards.js";
import { playDismiss, endAuraEffect } from "./animations.js";
import { unarmTulpaHpWatcher } from "./tulpa-hp-watcher.js";

/**
 * deleteActiveEffect hook — fires when the caster-side anchor AE is removed for any reason.
 * This is the single funnel for all five dismissal triggers (see Section 5).
 */
export async function onDeleteActiveEffect(effect /*, options, userId */) {
  const tulpaUuid = effect.getFlag?.(MODULE_ID, "tulpaUuid");
  if (!tulpaUuid) return; // only anchors carry this flag
  const castConfig = effect.getFlag(MODULE_ID, "castConfig") ?? {};
  const caster = effect.parent;
  const tokenId = effect.getFlag?.(MODULE_ID, "tulpaTokenId");
  const sceneId = effect.getFlag?.(MODULE_ID, "tulpaSceneId");

  const tulpa = await fromUuid(tulpaUuid);
  // Synthetic-actor UUIDs (Scene.X.Token.Y.Actor.Z) can resolve to null at dismiss
  // time when the token or its scene isn't loaded. Fall back to the anchor-stored
  // scene+token ids so duration/zeroHP/isDeath dismissals never orphan the token.
  const fallbackToken = (!tulpa && sceneId && tokenId)
    ? game.scenes?.get(sceneId)?.tokens?.get(tokenId) ?? null
    : null;
  if (!tulpa && !fallbackToken) {
    console.debug(`${MODULE_ID} | dismiss: could not resolve tulpa (uuid=${tulpaUuid}, scene=${sceneId}, token=${tokenId})`);
  }

  const reason = inferReason(effect);
  const skipTokenTeardown = effect.getFlag?.(MODULE_ID, "skipTokenTeardown") === true;

  // Tear down in-memory watchers first.
  unarmTulpaHpWatcher(tulpaUuid);
  endAuraEffect(tulpaUuid);

  // If trigger #5 fired, Foundry is already deleting the token — skip the second teardown
  // (double-delete throws and the animation would render against a tearing-down token).
  if (!skipTokenTeardown) {
    const tokenDoc = tulpa?.getActiveTokens()[0]?.document ?? fallbackToken;
    if (tokenDoc) {
      const placeable = tokenDoc.object;
      if (placeable && castConfig.damageType) await playDismiss(placeable, castConfig.damageType);
      try { await tokenDoc.delete(); }
      catch (err) { console.warn(`${MODULE_ID} | token delete failed:`, err); }
    }
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
  // `summon.origin` is an item/activity UUID (`Actor.X.Item.Y[.Activity.Z]`).
  // We need the Actor.X prefix to resolve the *caster*, not the spell item.
  const casterUuidMatch = summonOrigin.match(/^(Actor\.[^.]+)/);
  if (!casterUuidMatch) return;
  const caster = await fromUuid(casterUuidMatch[1]);
  if (!caster) return;
  const anchor = caster.effects.find(e => e.getFlag(MODULE_ID, "tulpaUuid") === tokenDoc.actor.uuid);
  if (!anchor) return;
  // Tag the anchor: report the right reason AND tell the funnel not to re-delete the token
  // (Foundry is already mid-tearing-down the token we were called about).
  await anchor.update({
    [`flags.${MODULE_ID}.dismissReason`]: "manual",
    [`flags.${MODULE_ID}.skipTokenTeardown`]: true,
  });
  await anchor.delete();
}

function inferReason(effect) {
  const tagged = effect.getFlag?.(MODULE_ID, "dismissReason");
  if (tagged) return tagged;
  // DAE specialDuration triggers stamp flags.dae.disabled or similar at delete time;
  // without a reliable signal we fall back to 'duration'.
  return "duration";
}
