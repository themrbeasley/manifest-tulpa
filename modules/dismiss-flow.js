import { MODULE_ID } from "./constants.js";
import { postDismiss } from "./chat-cards.js";
import { playDismiss, endAuraEffect } from "./animations.js";
import { unarmTulpaHpWatcher } from "./tulpa-hp-watcher.js";

/**
 * deleteActiveEffect hook — fires when the caster-side anchor AE is removed for any reason.
 * This is the single funnel for all five dismissal triggers (see Section 5).
 *
 * Foundry's hook signature is `(effect, options, userId)`. We read the dismiss reason from
 * `options[MODULE_ID]` first (passed via `anchor.delete({...})` from recast/zeroHP/manual
 * paths) and only fall back to the legacy flag-on-the-anchor lookup for backward compat.
 */
export async function onDeleteActiveEffect(effect, options /*, userId */) {
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

  const reason = inferReason(effect, options, caster);
  const skipTokenTeardown = options?.[MODULE_ID]?.skipTokenTeardown === true
    || effect.getFlag?.(MODULE_ID, "skipTokenTeardown") === true;

  // Tear down in-memory watchers first.
  unarmTulpaHpWatcher(tulpaUuid);
  endAuraEffect(tulpaUuid);

  // If trigger #5 fired, Foundry is already deleting the token — skip the second teardown
  // (double-delete throws and the animation would render against a tearing-down token).
  if (!skipTokenTeardown) {
    const tokenDoc = tulpa?.getActiveTokens()[0]?.document ?? fallbackToken;
    if (tokenDoc) {
      const placeable = tokenDoc.object;
      // v0.1.10 scar (smoke-report Bug 2): an animation asset that fails to resolve at
      // playback time used to throw out of `playDismiss`, skipping the token delete and
      // leaving the Tulpa on the canvas. Wrap in try/finally so the delete *always*
      // runs even if Sequencer/JB2A barfs on a missing asset variant.
      try {
        if (placeable && castConfig.damageType) await playDismiss(placeable, castConfig.damageType);
      } catch (err) {
        console.warn(`${MODULE_ID} | dismiss animation failed:`, err);
      }
      // times-up race (v0.1.7 cosmetic bug D): when the duration trigger fires, times-up
      // and this funnel both race to delete the Tulpa token. The second delete throws
      // `EmbeddedCollection.get: undefined id does not exist`. Use the collection's
      // `.has(id)` membership check — the v0.1.9 identity check (`get(id) === tokenDoc`)
      // false-negatived after Foundry re-instantiated the document, skipping the delete.
      const stillPresent = tokenDoc.parent?.tokens?.has?.(tokenDoc.id) === true;
      if (stillPresent) {
        try { await tokenDoc.delete(); }
        catch (err) { console.warn(`${MODULE_ID} | token delete failed:`, err); }
      }
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
  // Pass reason + skipTokenTeardown via delete options (sync, no awaited setFlag race).
  // Foundry surfaces these to `onDeleteActiveEffect` as its 2nd hook arg. The
  // skipTokenTeardown flag tells the funnel not to re-delete the token — Foundry is
  // already mid-tearing-down the token we were called about.
  await anchor.delete({ [MODULE_ID]: { dismissReason: "manual", skipTokenTeardown: true } });
}

// Reason resolution ladder, most-trusted to least.
//   1. options[MODULE_ID].dismissReason — set by recast/Tulpa-zeroHP/manual paths via
//      `anchor.delete({...})`. Canonical signal in v0.1.9+.
//   2. anchor flag dismissReason — legacy path; v0.1.8 wrote this via awaited setFlag.
//      Kept for backward compat with anchors created before this fix.
//   3. caster has the `dead` status → "isDeath" (DAE specialDuration `isDeath` trigger).
//   4. caster HP ≤ 0 → "casterZeroHP" (DAE specialDuration `zeroHP` trigger).
//      v0.1.9 returned the literal "zeroHP" here, conflating it with the Tulpa-zeroHP
//      cascade dismissal (which is also tagged "zeroHP" in v0.1.9). v0.1.10 splits the
//      two so the chat card can speak truthfully about which actor fell.
//   5. anchor duration exhausted → "duration" (times-up deletes the AE on expiry).
//   6. Otherwise "manual" — caller is most likely the GM right-clicking the AE icon.
//      v0.1.8 fell back to "duration" here, which mislabeled GM-driven removals.
function inferReason(effect, options, caster) {
  const optReason = options?.[MODULE_ID]?.dismissReason;
  if (optReason) return optReason;
  const tagged = effect.getFlag?.(MODULE_ID, "dismissReason");
  if (tagged) return tagged;
  if (caster?.statuses?.has?.("dead")) return "isDeath";
  const casterHp = caster?.system?.attributes?.hp?.value;
  if (typeof casterHp === "number" && casterHp <= 0) return "casterZeroHP";
  const remaining = effect.duration?.remaining;
  if (remaining != null && remaining <= 0) return "duration";
  return "manual";
}
