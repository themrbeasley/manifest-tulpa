import { MODULE_ID } from "./constants.js";
import { onPostUseActivity } from "./cast-flow.js";
import { onCombatStart, onUpdateCombatant } from "./initiative.js";
import { restoreTulpaHpWatchers } from "./tulpa-hp-watcher.js";
import { onCombatRecovery } from "./harrowing-presence-hook.js";
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
  Hooks.on("dnd5e.combatRecovery",   onCombatRecovery);
  Hooks.on("combatStart",            onCombatStart);
  Hooks.on("updateCombatant",        onUpdateCombatant);
  Hooks.on("deleteActiveEffect",     onDeleteActiveEffect);
  Hooks.on("preDeleteToken",         onPreDeleteToken);
  await restoreTulpaHpWatchers();

  // v0.1.12: surface the ActiveAuras `combatOnly` mode at ready so users know whether
  // Harrowing Presence will propagate outside combat. AA's setting is registered under
  // its own module id; if it's missing or throws (e.g. AA not yet ready), stay silent.
  try {
    const combatOnly = game.settings.get("ActiveAuras", "combatOnly");
    if (combatOnly) {
      console.info(`${MODULE_ID} | note: ActiveAuras.combatOnly is enabled — Harrowing Presence will only propagate while a combat is active.`);
    }
  } catch (_) { /* AA setting unavailable; ignore */ }
});
