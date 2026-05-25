import { MODULE_ID } from "./constants.js";
import { onPostUseActivity } from "./cast-flow.js";
import { onCombatStart } from "./initiative.js";
import { restoreRelentlessWatchers } from "./relentless-watcher.js";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | init`);
});

Hooks.once("ready", async () => {
  console.log(`${MODULE_ID} | ready`);
  Hooks.on("dnd5e.postUseActivity", onPostUseActivity);
  Hooks.on("combatStart", onCombatStart);
  await restoreRelentlessWatchers();
});
