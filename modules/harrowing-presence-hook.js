import { MODULE_ID } from "./constants.js";

/**
 * dnd5e.combatTurnStart — if the actor whose turn is starting carries an inHarrowingAura
 * marker AE, roll a Wis save vs the carried DC; on failure, apply 'frightened' with
 * specialDuration: ["turnStart"] so DAE/times-up auto-clears it next turn.
 */
export async function onCombatTurnStart(actor /*, combat, combatant */) {
  if (!actor) return;
  // The Harrowing Presence aura applies its `changes` onto in-range targets via Aura
  // Effects, writing `flags.manifest-tulpa.inHarrowingAura` and `auraDC` onto the actor.
  // Read via `actor.getFlag` so we hit the prepared (post-AE-application) data, not a
  // raw marker AE that v0.1.6 expected but never created.
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
