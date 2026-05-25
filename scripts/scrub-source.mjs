#!/usr/bin/env node
// Reads fvtt-* exports at repo root, strips world-only flags and modification
// content, fills in the spell description, and writes scrubbed JSON into _source/.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ACTOR_SRC = resolve(ROOT, "fvtt-Actor-tulpa-rfi8EPvTDFduYlW5.json");
const SPELL_SRC = resolve(ROOT, "fvtt-Item-manifest-tulpa-YwUNZpFtX3dwNQPx.json");
const SPELL_TXT = resolve(ROOT, "manifest-tulpa.txt");
const ACTOR_OUT = resolve(ROOT, "_source/manifest-tulpa-actors/Actor.tulpa.json");
const SPELL_OUT = resolve(ROOT, "_source/manifest-tulpa-spells/Item.manifest-tulpa.json");

const WORLD_FLAGS = ["activity-macro", "LocknKey", "scene-packer", "exportSource"];
const STATS_DROP = ["lastModifiedBy", "createdTime", "modifiedTime", "compendiumSource", "duplicateSource", "exportSource"];

// Names of items that survive the scrub (everything else is a modification artifact).
const KEEP_ITEM_NAMES = new Set([
  "Manifestation Strike",
  "Manifestation Strike (Melee)",
  "Manifestation Strike (Ranged)",
  "Tether",
]);

// Stable packed actor _id — used by the spell's summon profile UUID after scrub.
const PACKED_ACTOR_ID = "manifesttulpa0001";

function stripFlags(doc) {
  for (const k of WORLD_FLAGS) delete doc.flags?.[k];
  for (const k of STATS_DROP) delete doc._stats?.[k];
}

function clean(doc) {
  stripFlags(doc);
  // Recursive: clean nested effects/items so their _stats and world flags also vanish.
  for (const e of doc.effects ?? []) stripFlags(e);
  for (const i of doc.items   ?? []) {
    stripFlags(i);
    for (const e of i.effects ?? []) stripFlags(e);
    for (const a of Object.values(i.system?.activities ?? {})) stripFlags(a);
  }
}

function scrubActor() {
  const a = JSON.parse(readFileSync(ACTOR_SRC, "utf8"));
  // Lock the actor _id so the spell can reference it deterministically.
  a._id = PACKED_ACTOR_ID;

  // Drop ALL effects (every effect on the export is a modification).
  a.effects = [];

  // Keep only base-statblock items.
  a.items = (a.items ?? []).filter(i => KEEP_ITEM_NAMES.has(i.name));

  // Reset Manifestation Strike damage to a placeholder for in-module rewrite.
  for (const it of a.items) {
    if (!/^Manifestation Strike/.test(it.name)) continue;
    for (const act of Object.values(it.system?.activities ?? {})) {
      for (const part of act.damage?.parts ?? []) part.types = ["bludgeoning"]; // placeholder
    }
    delete it.flags?.ActiveAuras;
  }

  // Drop Harrowing-Presence-related world flags if present anywhere on the doc.
  delete a.flags?.ActiveAuras;

  clean(a);
  mkdirSync(dirname(ACTOR_OUT), { recursive: true });
  writeFileSync(ACTOR_OUT, JSON.stringify(a, null, 2) + "\n", "utf8");
  console.log(`wrote ${ACTOR_OUT}`);
}

function scrubSpell() {
  const s = JSON.parse(readFileSync(SPELL_SRC, "utf8"));
  s._id = "manifesttulpaspell";

  // Pull RAW spell text in.
  const raw = readFileSync(SPELL_TXT, "utf8");
  s.system ??= {};
  s.system.description ??= {};
  s.system.description.value = `<div class="manifest-tulpa-spell">${raw
    .split("\n")
    .map(line => line.trim() ? `<p>${escapeHtml(line)}</p>` : "")
    .join("")}</div>`;

  // Point the summon activity's profile UUID at the packed actor.
  for (const act of Object.values(s.system.activities ?? {})) {
    if (act.type !== "summon") continue;
    for (const p of act.profiles ?? []) {
      p.uuid = `Compendium.manifest-tulpa.manifest-tulpa-actors.Actor.${PACKED_ACTOR_ID}`;
    }
    // Confirm consumption.scaling.allowed is false (the validator also checks).
    act.consumption ??= {};
    act.consumption.scaling ??= {};
    act.consumption.scaling.allowed = false;
  }

  // Set a stable identifier so the cast-flow handler can match the spell.
  s.system.identifier = "manifest-tulpa";
  s.system.source ??= {};
  s.system.source.rules ??= "2024";

  clean(s);
  mkdirSync(dirname(SPELL_OUT), { recursive: true });
  writeFileSync(SPELL_OUT, JSON.stringify(s, null, 2) + "\n", "utf8");
  console.log(`wrote ${SPELL_OUT}`);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
}

scrubActor();
scrubSpell();
