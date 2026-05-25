import { MODULE_ID } from "./constants.js";

/**
 * Extracts the caster actor UUID from a dnd5e summon origin string.
 * `flags.dnd5e.summon.origin` is an item/activity UUID like
 * `Actor.<id>.Item.<id>` or `Actor.<id>.Item.<id>.Activity.<id>`; we want the
 * `Actor.<id>` prefix so we can resolve the *caster*, not the spell item.
 */
function casterUuidFromOrigin(origin) {
  if (typeof origin !== "string") return null;
  const m = origin.match(/^(Actor\.[^.]+)/);
  return m?.[1] ?? null;
}

/**
 * Aligns a single Tulpa combatant to its summoner's initiative - 0.01.
 * Idempotent — re-aligns if combat re-starts mid-cast.
 */
export async function alignTulpaInitiative(combat, caster, tulpa) {
  const casterCombatant = combat.combatants.find(c => c.actorId === caster.id);
  const tulpaCombatant  = combat.combatants.find(c => c.actorId === tulpa.id);
  if (!casterCombatant || !tulpaCombatant) return;
  if (casterCombatant.initiative == null) return;
  const target = casterCombatant.initiative - 0.01;
  if (tulpaCombatant.initiative === target) return;
  await tulpaCombatant.update({ initiative: target });
}

/**
 * combatStart hook — re-align every summoned Tulpa whose summoner is in this combat.
 * Handles the "combat starts after the cast" path.
 */
export function onCombatStart(combat) {
  for (const tCombatant of combat.combatants) {
    const tulpa = tCombatant.actor;
    if (!tulpa) continue;
    const summon = tulpa.getFlag?.("dnd5e", "summon");
    if (!summon?.origin) continue;
    const casterUuid = casterUuidFromOrigin(summon.origin);
    if (!casterUuid) continue;
    const caster = fromUuidSync(casterUuid);
    if (!caster?.id) continue;
    const cCombatant = combat.combatants.find(c => c.actorId === caster.id);
    if (!cCombatant) continue;
    if (cCombatant.initiative == null) continue;
    tCombatant.update({ initiative: cCombatant.initiative - 0.01 });
  }
  console.debug(`${MODULE_ID} | initiative re-aligned at combatStart`);
}
