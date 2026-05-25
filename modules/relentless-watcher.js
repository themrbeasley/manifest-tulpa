import { MODULE_ID } from "./constants.js";
import { postRelentless } from "./chat-cards.js";
import { playRelentless } from "./animations.js";

const watchers = new Map(); // tulpaUuid -> hook id

export function armRelentlessWatcher(tulpaUuid, damageType) {
  if (watchers.has(tulpaUuid)) return;
  const id = Hooks.on("preUpdateActor", async (actor, changes) => {
    if (actor.uuid !== tulpaUuid) return;
    const newHp = foundry.utils.getProperty(changes, "system.attributes.hp.value");
    if (newHp == null || newHp > 0) return;
    if (actor.getFlag(MODULE_ID, "relentlessUsed")) return;

    foundry.utils.setProperty(changes, "system.attributes.hp.value", 1);
    await actor.setFlag(MODULE_ID, "relentlessUsed", true);
    unarmRelentlessWatcher(tulpaUuid);

    await postRelentless({ tulpa: actor });
    const token = actor.getActiveTokens()[0];
    if (token) await playRelentless(token, damageType);
  });
  watchers.set(tulpaUuid, id);
  console.debug(`${MODULE_ID} | relentless armed for ${tulpaUuid}`);
}

export function unarmRelentlessWatcher(tulpaUuid) {
  const id = watchers.get(tulpaUuid);
  if (id == null) return;
  Hooks.off("preUpdateActor", id);
  watchers.delete(tulpaUuid);
}

/** Restore watchers at world load for any active anchor that includes 'relentless'. */
export async function restoreRelentlessWatchers() {
  for (const caster of game.actors) {
    const anchor = caster.effects.find(e => e.getFlag(MODULE_ID, "tulpaUuid"));
    if (!anchor) continue;
    const cfg = anchor.getFlag(MODULE_ID, "castConfig");
    if (!cfg?.modifications?.includes("relentless")) continue;
    const tulpa = await fromUuid(anchor.getFlag(MODULE_ID, "tulpaUuid"));
    if (!tulpa) continue;
    if (tulpa.getFlag?.(MODULE_ID, "relentlessUsed")) continue;
    armRelentlessWatcher(tulpa.uuid, cfg.damageType);
  }
}
