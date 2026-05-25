import { MODULE_ID } from "./constants.js";

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
    const caster = fromUuidSync(summon.origin);
    if (!caster?.id) continue;
    const cCombatant = combat.combatants.find(c => c.actorId === caster.id);
    if (!cCombatant) continue;
    if (cCombatant.initiative == null) continue;
    tCombatant.update({ initiative: cCombatant.initiative - 0.01 });
  }
  console.debug(`${MODULE_ID} | initiative re-aligned at combatStart`);
}
