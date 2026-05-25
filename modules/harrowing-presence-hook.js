import { MODULE_ID } from "./constants.js";

/**
 * dnd5e.combatTurnStart — if the actor whose turn is starting carries an inHarrowingAura
 * marker AE, roll a Wis save vs the carried DC; on failure, apply 'frightened' with
 * specialDuration: ["turnStart"] so DAE/times-up auto-clears it next turn.
 */
export async function onCombatTurnStart(actor /*, combat, combatant */) {
  if (!actor) return;
  const marker = actor.effects.find(e => e.getFlag?.(MODULE_ID, "inHarrowingAura"));
  if (!marker) return;
  const dc = marker.getFlag(MODULE_ID, "auraDC");
  if (!Number.isFinite(dc)) return;

  const roll = await actor.rollSavingThrow({ ability: "wis", target: dc });
  if (!roll || roll.total >= dc) return;

  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: "Frightened (Harrowing Presence)",
    img: "icons/svg/terror.svg",
    statuses: ["frightened"],
    changes: [],
    transfer: false,
    duration: { rounds: 1 },
    flags: {
      dae: { specialDuration: ["turnStart"] },
      [MODULE_ID]: { fromHarrowingPresence: true },
    },
  }]);
}
