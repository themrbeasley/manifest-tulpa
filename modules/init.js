import { MODULE_ID } from "./constants.js";
import { onPostUseActivity } from "./cast-flow.js";
import { onCombatStart } from "./initiative.js";
import { restoreRelentlessWatchers } from "./relentless-watcher.js";
import { onCombatTurnStart } from "./harrowing-presence-hook.js";
import { onDeleteActiveEffect, onPreDeleteToken } from "./dismiss-flow.js";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | init`);
});

// Guard against double-registration if the module is re-imported within a single
// JS session (some dev/reload workflows re-fire `ready`). Use globalThis so the
// guard survives module re-import while the Hooks event bus is still alive.
Hooks.once("ready", async () => {
  console.log(`${MODULE_ID} | ready`);
  if (globalThis.__manifestTulpaHooksRegistered) return;
  globalThis.__manifestTulpaHooksRegistered = true;
  Hooks.on("dnd5e.postUseActivity",  onPostUseActivity);
  Hooks.on("dnd5e.combatTurnStart",  onCombatTurnStart);
  Hooks.on("combatStart",            onCombatStart);
  Hooks.on("deleteActiveEffect",     onDeleteActiveEffect);
  Hooks.on("preDeleteToken",         onPreDeleteToken);
  await restoreRelentlessWatchers();
});
