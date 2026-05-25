import { MODULE_ID } from "./constants.js";
import { onPostUseActivity } from "./cast-flow.js";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | init`);
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | ready`);
  Hooks.on("dnd5e.postUseActivity", onPostUseActivity);
});
