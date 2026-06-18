// Foundry-free. Translates the expended spell-slot LEVEL into the modification budget the
// cast dialog shows. Extracted here (like buildStrikeParts / dismiss-helpers) so the logic
// is pure and node-testable — cast-flow.js itself can't be imported in tests (its import
// chain evaluates `foundry.applications.api` at module load).
//
// WHY THIS EXISTS (v0.1.18, mod-slot-budget bug): the budget was computed at
// `dnd5e.preUseActivity`, which fires BEFORE the slot-selection dialog writes the chosen
// slot into usageConfig and BEFORE `_prepareUsageScaling` sets usageConfig.scaling. So the
// captured level was ALWAYS the pre-dialog base (5) → budget ALWAYS 2, no matter the slot
// expended (and the chat card read "Slot: 5" for every cast). The fix stashes the LIVE
// usageConfig at preUseActivity and resolves the level LATE at postSummon, after dnd5e has
// mutated it in place. See modules/cast-flow.js + the mod-slot-budget scratchpad.

/**
 * Resolve the expended spell-slot LEVEL from a dnd5e usageConfig. MUST be read AFTER the
 * slot dialog + `_prepareUsageScaling` have mutated usageConfig in place (i.e. at
 * postSummon, NOT at preUseActivity).
 *
 * Order — most-authoritative first:
 *   1. usageConfig.spell.slot — the slot KEY the dialog wrote, e.g. "spell9" → 9. This is
 *      the SOURCE the player chose; `_prepareUsageScaling` derives `scaling` FROM it
 *      (mixin.mjs:504-506). A non-`spellN` key (e.g. "pact") has no digit → fall through.
 *   2. usageConfig.scaling — the upcast delta above the spell's base level (5). Checked with
 *      `typeof === "number"` (NOT truthy) so a base cast's `scaling === 0` resolves to 5
 *      rather than falling through. 9th-level cast → scaling 4 → 9.
 *   3. Default 5 — the spell's base level (no-capture / deferred chat-button path).
 */
export function resolveSlotLevel(usageConfig) {
  const raw = usageConfig?.spell?.slot;
  if (typeof raw === "string") {
    const m = /spell(\d+)/.exec(raw);
    if (m) return Number(m[1]);
  }
  if (typeof usageConfig?.scaling === "number") return 5 + usageConfig.scaling;
  return 5;
}

/**
 * Modification budget for a given expended slot LEVEL.
 *   5→2, 6→3, 7→4, 8→5, 9→6 (and >9 stays 6; <5 floors at 2).
 * Base 5th-level cast grants 2 modifications; each level above 5 grants +1, capped at 6.
 */
export function modBudget(level) {
  return Math.min(6, 2 + Math.max(0, level - 5));
}
