// Pure helpers for dismiss-side cleanup. No Foundry globals.
//
// When a Tulpa is summoned, dnd5e itself adds a "Summon: <spell-name>" ActiveEffect
// to the caster (see SummonActivity ~L266, `actorUpdates["flags.dnd5e.summon"]`).
// The module's single-funnel dismissal only removes its own anchor AE, so the
// system summon AE persists on the caster after dismissal (v0.1.11 smoke Bug 1).
// We locate it by matching the spell item's UUID against the AE's stored summon
// origin flag, with a name-regex fallback for defense-in-depth.

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
