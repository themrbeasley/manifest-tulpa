#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ACTOR_PATH = resolve(ROOT, "_source/manifest-tulpa-actors/Actor.tulpa.json");
const SPELL_PATH = resolve(ROOT, "_source/manifest-tulpa-spells/Item.manifest-tulpa.json");

const WORLD_FLAGS = ["activity-macro", "LocknKey", "scene-packer", "exportSource"];
const KEEP_ITEM_NAMES = new Set([
  "Manifestation Strike",
  "Manifestation Strike (Melee)",
  "Manifestation Strike (Ranged)",
]);

function readJSON(p) { return JSON.parse(readFileSync(p, "utf8")); }

// Foundry document IDs are exactly 16 alphanumeric characters; anything else is
// rejected by DocumentIdField / fromUuid on load. v0.1.2 shipped 17- and 18-char
// ids that loaded into the pack but failed validation when the summon activity's
// profile UUID was parsed.
const FOUNDRY_ID_RE = /^[a-zA-Z0-9]{16}$/;

function checkId(errors, label, id) {
  if (!FOUNDRY_ID_RE.test(id ?? "")) {
    errors.push(`${label}._id must be exactly 16 alphanumeric chars (got "${id}")`);
  }
}

export async function validateAll({ actorMutator, spellMutator } = {}) {
  const errors = [];
  const actor = readJSON(ACTOR_PATH);
  const spell = readJSON(SPELL_PATH);
  if (actorMutator) actorMutator(actor);
  if (spellMutator) spellMutator(spell);

  // _id format checks (Foundry rejects anything that doesn't match /^[a-zA-Z0-9]{16}$/).
  checkId(errors, "actor", actor._id);
  for (const e of actor.effects ?? []) checkId(errors, `actor.effects[${e.name}]`, e._id);
  for (const i of actor.items ?? []) {
    checkId(errors, `actor.items[${i.name}]`, i._id);
    for (const e of i.effects ?? []) checkId(errors, `actor.items[${i.name}].effects[${e.name}]`, e._id);
  }
  checkId(errors, "spell", spell._id);
  for (const e of spell.effects ?? []) checkId(errors, `spell.effects[${e.name}]`, e._id);

  // _key checks — foundryvtt-cli silently skips docs without _key, producing empty packs.
  const expectedActorKey = `!actors!${actor._id}`;
  if (actor._key !== expectedActorKey) errors.push(`actor._key must be "${expectedActorKey}" (got "${actor._key}")`);
  for (const e of actor.effects ?? []) {
    const want = `!actors.effects!${actor._id}.${e._id}`;
    if (e._key !== want) errors.push(`actor.effects[${e._id}]._key must be "${want}" (got "${e._key}")`);
  }
  for (const i of actor.items ?? []) {
    const want = `!actors.items!${actor._id}.${i._id}`;
    if (i._key !== want) errors.push(`actor.items[${i.name}]._key must be "${want}" (got "${i._key}")`);
    for (const e of i.effects ?? []) {
      const wantE = `!actors.items.effects!${actor._id}.${i._id}.${e._id}`;
      if (e._key !== wantE) errors.push(`actor.items[${i.name}].effects[${e._id}]._key must be "${wantE}" (got "${e._key}")`);
    }
  }
  const expectedSpellKey = `!items!${spell._id}`;
  if (spell._key !== expectedSpellKey) errors.push(`spell._key must be "${expectedSpellKey}" (got "${spell._key}")`);
  for (const e of spell.effects ?? []) {
    const want = `!items.effects!${spell._id}.${e._id}`;
    if (e._key !== want) errors.push(`spell.effects[${e._id}]._key must be "${want}" (got "${e._key}")`);
  }

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
    // v0.1.6 shipped a stale LevelDB pack where the Manifestation Strike weapon
    // had no activities. The _source JSON was correct; the pack was missed by
    // build:packs. Assert presence here so the regression cannot recur.
    const acts = Object.values(it.system?.activities ?? {});
    const attackActs = acts.filter(a => a.type === "attack");
    if (attackActs.length < 1) {
      errors.push(`actor.items[${it.name}] must have at least one Attack activity (found ${attackActs.length})`);
    }
    for (const act of attackActs) {
      if (!(act.damage?.parts?.length > 0)) {
        errors.push(`actor.items[${it.name}].activities[${act._id ?? act.name ?? "?"}] must have damage.parts`);
      }
    }
    for (const act of acts) {
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
// pathToFileURL normalizes separators correctly on Windows (backslash paths).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { ok, errors } = await validateAll();
  if (!ok) {
    console.error("Validation failed:");
    for (const e of errors) console.error("  -", e);
    process.exit(1);
  }
  console.log("Validation passed.");
}
