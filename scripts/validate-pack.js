#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ACTOR_PATH = resolve(ROOT, "_source/manifest-tulpa-actors/Actor.tulpa.json");
const SPELL_PATH = resolve(ROOT, "_source/manifest-tulpa-spells/Item.manifest-tulpa.json");

const WORLD_FLAGS = ["activity-macro", "LocknKey", "scene-packer", "exportSource"];
const KEEP_ITEM_NAMES = new Set([
  "Manifestation Strike",
  "Manifestation Strike (Melee)",
  "Manifestation Strike (Ranged)",
  "Tether",
]);

function readJSON(p) { return JSON.parse(readFileSync(p, "utf8")); }

export async function validateAll({ actorMutator, spellMutator } = {}) {
  const errors = [];
  const actor = readJSON(ACTOR_PATH);
  const spell = readJSON(SPELL_PATH);
  if (actorMutator) actorMutator(actor);
  if (spellMutator) spellMutator(spell);

  // Actor checks
  if ((actor.effects ?? []).length !== 0) errors.push(`actor.effects must be empty (has ${actor.effects.length})`);
  for (const i of actor.items ?? []) {
    if (!KEEP_ITEM_NAMES.has(i.name)) errors.push(`actor.items contains unexpected item: ${i.name}`);
  }
  if (actor.flags?.ActiveAuras) errors.push(`actor.flags.ActiveAuras must be absent`);
  for (const f of WORLD_FLAGS) {
    if (actor.flags?.[f]) errors.push(`actor.flags.${f} must be absent`);
  }
  for (const it of actor.items ?? []) {
    if (!/^Manifestation Strike/.test(it.name)) continue;
    for (const act of Object.values(it.system?.activities ?? {})) {
      for (const p of act.damage?.parts ?? []) {
        if ((p.types ?? []).some(t => ["force","radiant","psychic"].includes(t))) {
          errors.push(`Manifestation Strike damage type must be a placeholder, not a final type`);
        }
      }
    }
  }

  // Spell checks
  for (const f of WORLD_FLAGS) {
    if (spell.flags?.[f]) errors.push(`spell.flags.${f} must be absent`);
  }
  if (!spell.system?.description?.value) errors.push(`spell.system.description.value must be non-empty`);
  for (const act of Object.values(spell.system?.activities ?? {})) {
    if (act.type !== "summon") continue;
    for (const p of act.profiles ?? []) {
      if (!/^Compendium\.manifest-tulpa\.manifest-tulpa-actors\.Actor\./.test(p.uuid)) {
        errors.push(`summon profile uuid must point to packed actor, got: ${p.uuid}`);
      }
    }
    if (act.consumption?.scaling?.allowed !== false) {
      errors.push(`summon consumption.scaling.allowed must be false`);
    }
  }

  return { ok: errors.length === 0, errors };
}

// CLI entry: when run directly, non-zero exit on failure.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, errors } = await validateAll();
  if (!ok) {
    console.error("Validation failed:");
    for (const e of errors) console.error("  -", e);
    process.exit(1);
  }
  console.log("Validation passed.");
}
