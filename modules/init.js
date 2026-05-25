import { MODULE_ID } from "./constants.js";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | init`);
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | ready`);
  // Hook wiring is filled in by Tasks 11–15.
});
