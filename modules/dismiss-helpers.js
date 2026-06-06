// Pure helpers for dismiss-side cleanup. No Foundry globals.
//
// When a Tulpa is summoned, dnd5e itself adds a "Summon: <spell-name>" ActiveEffect
// to the caster (see SummonActivity ~L266, `actorUpdates["flags.dnd5e.summon"]`).
// The module's single-funnel dismissal only removes its own anchor AE, so the
// system summon AE persists on the caster after dismissal (v0.1.11 smoke Bug 1).
// We locate it by matching the spell item's UUID against the AE's stored summon
// origin flag, with a name-regex fallback for defense-in-depth.

/**
 * Locate the caster-side anchor AE ("Manifest Tulpa (active)") — the single source of
 * truth that a Tulpa is live (invariant #1). Returns the first effect carrying
 * `flags[moduleId].tulpaUuid`, or null.
 *
 * The recast fix (v0.1.17 Bug #1) uses this in `onPreUseActivity` to find and dismiss
 * the OLD Tulpa BEFORE dnd5e creates the new token. Kept here, pure and Node-testable,
 * mirroring `findSystemSummonAE`. Reads `.flags` directly (not `getFlag`) so it works on
 * both test fakes and live ActiveEffect documents — a real AE exposes the same flags bag.
 */
export function findPreviousAnchor(caster, moduleId = "manifest-tulpa") {
  const effects = caster?.effects;
  if (!effects?.find) return null;
  return effects.find(e => e?.flags?.[moduleId]?.tulpaUuid != null) ?? null;
}

/**
 * True when an anchor AE's duration has run out (`duration.remaining <= 0`).
 *
 * This is the discriminator between a duration-expiry dismissal and a genuine GM
 * manual token delete (v0.1.17 Bug #2/#3). On duration expiry, `times-up` expires
 * BOTH the dnd5e "Summon:" AE and the module anchor in one batch; deleting the Summon
 * AE cascade-deletes the Tulpa token, and the token's `preDeleteToken` hook
 * (`onPreDeleteToken`) would otherwise race ahead to delete the anchor itself — stamping
 * the wrong "manual" reason (Bug #3) AND leaving times-up's own later anchor delete to hit
 * an already-removed id (`ActiveEffect "…" does not exist!` — the red banner, Bug #2).
 * `onPreDeleteToken` calls this to DEFER to times-up when the anchor has already expired;
 * `inferReason` reuses it so "expired" is defined in exactly one place.
 *
 * Pure (no Foundry globals): reads `anchor.duration.remaining`, which a live ActiveEffect
 * exposes as a getter and a test fake supplies as a plain value. A missing/absent duration
 * (null/undefined remaining) is treated as NOT expired — that is the manual-delete path.
 */
export function isAnchorDurationExpired(anchor) {
  const remaining = anchor?.duration?.remaining;
  return remaining != null && remaining <= 0;
}

/**
 * Collect every combatant across all combats whose `tokenId` matches the dismissed
 * Tulpa's token (v0.1.17 smoke Bug #6).
 *
 * Foundry does NOT auto-remove a combatant when its token is deleted (live-confirmed:
 * the combatant survives with `.token` resolving to null while `tokenId` still points at
 * the deleted token). `performDismissCleanup` deletes the Tulpa token but had no
 * combatant-removal step, so every dismissal left a ghost in the tracker. This helper
 * finds the matches by the anchor-stored `tulpaTokenId` — token ids are per-cast and
 * reliable, avoiding the actorId cross-match risk of an import-cached synthetic actor.
 *
 * Pure (no Foundry globals): `combats` and each `combat.combatants` are iterated with
 * `for…of` — a live `game.combats` WorldCollection and `combat.combatants`
 * EmbeddedCollection are both iterable, and a test fake supplies plain arrays. Returns
 * an empty array for a missing tokenId or no combats so the caller can `for…of` safely.
 */
export function collectTulpaCombatants(combats, tokenId) {
  if (!tokenId || !combats) return [];
  const matches = [];
  for (const combat of combats) {
    const combatants = combat?.combatants;
    if (!combatants) continue;
    for (const c of combatants) {
      if (c?.tokenId === tokenId) matches.push(c);
    }
  }
  return matches;
}

export function findSystemSummonAE(caster, spellIdentifier = "manifest-tulpa") {
  if (!caster) return null;
  const spellItem = caster.items?.find?.(i => i.system?.identifier === spellIdentifier);
  const spellItemUuid = spellItem?.uuid;
  const effects = caster.effects;
  if (!effects?.find) return null;
  const slug = spellIdentifier.replace(/-/g, "\\s*");
  const nameRe = new RegExp(`\\b${slug}\\b`, "i");
  return effects.find(e => {
    const origin = e?.flags?.dnd5e?.summon?.origin;
    if (typeof origin === "string" && spellItemUuid) {
      if (origin === spellItemUuid || origin.startsWith(`${spellItemUuid}.`)) return true;
    }
    return nameRe.test(e?.name ?? "");
  }) ?? null;
}
