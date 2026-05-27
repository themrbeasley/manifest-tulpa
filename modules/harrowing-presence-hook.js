import { MODULE_ID } from "./constants.js";

/**
 * dnd5e.combatTurnStart — if the actor whose turn is starting carries an inHarrowingAura
 * marker AE, roll a Wis save vs the carried DC; on failure, apply 'frightened' with
 * specialDuration: ["turnStart"] so DAE/times-up auto-clears it next turn.
 */
export async function onCombatTurnStart(actor /*, combat, combatant */) {
  if (!actor) return;
  // Active Auras clones the source effect onto in-range hostile tokens; the cloned
  // effect's `changes` write `flags.manifest-tulpa.inHarrowingAura` and `auraDC` onto
  // the target actor's prepared data, so `actor.getFlag(...)` resolves true while the
  // target stands inside the aura. v0.1.10 used Aura Effects as the propagation engine
  // but the marker never landed; v0.1.11 swaps to Active Auras without changing this
  // hook's contract — flag reads stay identical.
  if (!actor.getFlag?.(MODULE_ID, "inHarrowingAura")) return;
  const dc = Number(actor.getFlag(MODULE_ID, "auraDC"));
  if (!Number.isFinite(dc)) return;

  // dnd5e 5.2.5: `rollSavingThrow` returns an Array<D20Roll> (one per advantage/disadvantage
  // result), or a single roll, or null on cancel/error. Normalize to the first roll's total.
  let result;
  try {
    result = await actor.rollSavingThrow({ ability: "wis", target: dc });
  } catch (err) {
    console.warn(`${MODULE_ID} | harrowing-presence save roll failed:`, err);
    return;
  }
  const roll = Array.isArray(result) ? result[0] : result;
  const total = roll?.total;
  if (!Number.isFinite(total) || total >= dc) return;

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
