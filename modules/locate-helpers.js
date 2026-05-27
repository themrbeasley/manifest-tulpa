// Pure helpers for locating a freshly-summoned Tulpa. No Foundry globals here so
// they're directly Node-testable.
//
// In dnd5e 5.2.5 `SummonActivity._finalizeUsage` writes the created TokenDocument[]
// onto `results.summoned` (see module/documents/activity/summon.mjs ~L113). v0.1.11
// shipped a stale read of `results.createdTokens`, which is always undefined and
// forced the cancel-cleanup path to fall through to a canvas scan that itself ran
// before the dialog opened — net result: the orphan token slipped past cleanup
// (v0.1.11 smoke Bug 2). Always check `results.summoned` first.

export function pickSummonedFromResults(results) {
  const doc = results?.summoned?.[0];
  return doc ?? null;
}

// Fallback: scan canvas placeables for a token whose dnd5e summon-origin flag points
// back at the caster. Used only when `results.summoned` is empty (defensive — shouldn't
// happen in 5.2.5 but cheap insurance). Returns the most recently created match.
export function scanPlaceablesForSummon(placeables, casterUuid) {
  if (!casterUuid) return null;
  const prefix = `${casterUuid}.`;
  const matches = (placeables ?? []).filter(t => {
    const origin = t?.actor?.getFlag?.("dnd5e", "summon")?.origin;
    return typeof origin === "string" && origin.startsWith(prefix);
  });
  matches.sort((a, b) => (b?.document?._stats?.createdTime ?? 0) - (a?.document?._stats?.createdTime ?? 0));
  return matches[0] ?? null;
}
