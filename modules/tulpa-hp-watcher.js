import { MODULE_ID } from "./constants.js";
import { postRelentless } from "./chat-cards.js";
import { playRelentless } from "./animations.js";

// One watcher per Tulpa. v0.1.6 only armed the watcher when Relentless was selected,
// which left Tulpa zero-HP dismissal (trigger #2) silently broken — the anchor AE
// has `dae.specialDuration: ["zeroHP"]`, but DAE's zeroHP fires when the *actor that
// owns the AE* hits 0 (i.e. the caster), not when a referenced actor hits 0. So we
// always arm a watcher on the Tulpa and either clamp (Relentless) or delete the
// caster's anchor with dismissReason="zeroHP" to cascade dismissal.
const watchers = new Map(); // tulpaUuid -> hook id

export function armTulpaHpWatcher(tulpaUuid, castConfig, damageType) {
  if (watchers.has(tulpaUuid)) return;
  // Foundry V13's hook dispatcher calls preUpdate handlers and discards any returned
  // Promise — async work inside them is fire-and-forget. v0.1.8 used `await actor.setFlag`
  // here to mark `relentlessUsed`, and a page reload between the clamp and the next hit
  // dropped the flag (smoke-report bug B). v0.1.9: piggyback the flag onto the same
  // `changes` object via synchronous `setProperty`, and pass `dismissReason` to the
  // anchor delete via `options` rather than a separate `setFlag` write.
  const id = Hooks.on("preUpdateActor", (actor, changes) => {
    if (actor.uuid !== tulpaUuid) return;
    const newHp = foundry.utils.getProperty(changes, "system.attributes.hp.value");
    if (newHp == null || newHp > 0) return;

    const hasRelentless = castConfig?.modifications?.includes?.("relentless");
    if (hasRelentless && !actor.getFlag(MODULE_ID, "relentlessUsed")) {
      foundry.utils.setProperty(changes, "system.attributes.hp.value", 1);
      foundry.utils.setProperty(changes, `flags.${MODULE_ID}.relentlessUsed`, true);
      // postRelentless + playRelentless are side-effecting (chat card + animation) and
      // don't gate any other hook's state, so fire-and-forget is fine here.
      postRelentless({ tulpa: actor }).catch(err => console.warn(`${MODULE_ID} | postRelentless:`, err));
      const token = actor.getActiveTokens()[0];
      if (token) playRelentless(token, damageType).catch(err => console.warn(`${MODULE_ID} | playRelentless:`, err));
      return;
    }

    // No Relentless (or already used): cascade-dismiss via the caster's anchor AE.
    // Pass `dismissReason` through the delete options — `onDeleteActiveEffect` reads it
    // out of the hook's 2nd arg, so we don't need a separate awaited `setFlag` write
    // that could race with a page reload.
    const anchor = findAnchorForTulpa(tulpaUuid);
    if (anchor) {
      anchor.delete({ [MODULE_ID]: { dismissReason: "zeroHP" } })
        .catch(err => console.warn(`${MODULE_ID} | tulpa-hp-watcher anchor delete failed:`, err));
    }
    unarmTulpaHpWatcher(tulpaUuid);
  });
  watchers.set(tulpaUuid, id);
  console.debug(`${MODULE_ID} | tulpa-hp-watcher armed for ${tulpaUuid}`);
}

export function unarmTulpaHpWatcher(tulpaUuid) {
  const id = watchers.get(tulpaUuid);
  if (id == null) return;
  Hooks.off("preUpdateActor", id);
  watchers.delete(tulpaUuid);
}

function findAnchorForTulpa(tulpaUuid) {
  for (const caster of game.actors) {
    const anchor = caster.effects.find(e => e.getFlag(MODULE_ID, "tulpaUuid") === tulpaUuid);
    if (anchor) return anchor;
  }
  return null;
}

/** Restore watchers at world load for every active anchor (Relentless or not). */
export async function restoreTulpaHpWatchers() {
  for (const caster of game.actors) {
    const anchor = caster.effects.find(e => e.getFlag(MODULE_ID, "tulpaUuid"));
    if (!anchor) continue;
    const cfg = anchor.getFlag(MODULE_ID, "castConfig");
    const tulpa = await fromUuid(anchor.getFlag(MODULE_ID, "tulpaUuid"));
    if (!tulpa) continue;
    armTulpaHpWatcher(tulpa.uuid, cfg, cfg?.damageType);
  }
}
