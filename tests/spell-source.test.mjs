// Locks every shipped-spell field that has silently regressed in the past,
// and a few that haven't (yet). _source/manifest-tulpa-spells/Item.manifest-tulpa.json
// is hand-edited canonical JSON; no generator overwrites it. These tests catch
// future drift — accidental edits, bad merges, IDE auto-fixes, restored-from-export
// blunders — at `npm test` before tag.
//
// History: v0.1.13 silently shipped eight regressions because the old
// scrub-source.mjs generator passed un-canonicalized fields through from a
// pre-development fvtt-* export. The generator was deleted in v0.1.15; these
// assertions exist so the same class of regression cannot recur even if
// someone restores the script from git history.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SPELL_PATH = resolve(ROOT, "_source/manifest-tulpa-spells/Item.manifest-tulpa.json");
const ACTOR_PATH = resolve(ROOT, "_source/manifest-tulpa-actors/Actor.tulpa.json");

const spell = JSON.parse(readFileSync(SPELL_PATH, "utf8"));
const actor = JSON.parse(readFileSync(ACTOR_PATH, "utf8"));

// --- IDs / identifier / rules era ---

test("spell _id is the canonical 16-char id the summon profile expects", () => {
  assert.equal(spell._id, "manifesttulpaS01");
});

test("actor _id is the canonical 16-char id the summon profile points at", () => {
  assert.equal(actor._id, "manifesttulpaA01");
});

test("spell carries the stable identifier the cast-flow handler matches on", () => {
  // modules/cast-flow.js gates on system.identifier === "manifest-tulpa";
  // drift here breaks the cast pipeline at the first preUseActivity tick.
  assert.equal(spell.system?.identifier, "manifest-tulpa");
});

test("spell declares the 2024 rules era", () => {
  assert.equal(spell.system?.source?.rules, "2024");
});

// --- v0.1.13 canonicalization ---

test("spell img points at the bundled icon (v0.1.13)", () => {
  assert.equal(spell.img, "modules/manifest-tulpa/assets/manifest_tulpa_icon.webp");
});

// --- v0.1.13 silent-regression locks (range / target / materials) ---
// Each of these silently flipped to a pre-dev-export value when the deleted
// scrub-source.mjs re-read fvtt-Item-manifest-tulpa-*.json in v0.1.13. If a
// future change reintroduces those values, this file fails before tag.

test("spell-level range is 30 ft (NOT self — pre-dev export had units:'self')", () => {
  assert.equal(spell.system?.range?.value, 30);
  assert.equal(spell.system?.range?.units, "ft");
});

test("spell-level target.affects.type is 'space' (NOT 'self')", () => {
  assert.equal(spell.system?.target?.affects?.type, "space");
});

test("spell materials.value is the crystal-shard component (NOT the pre-dev hair/blood/gem text)", () => {
  const v = spell.system?.materials?.value ?? "";
  assert.match(v, /crystal shard/i, "materials.value must mention the crystal shard");
  assert.match(v, /100 GP/, "materials.value must declare the 100 GP cost");
  assert.ok(!/lock of (your )?(own )?hair/i.test(v), "materials.value must not contain the pre-dev 'lock of hair' text");
  assert.ok(!/drop of (your )?blood/i.test(v), "materials.value must not contain the pre-dev 'drop of blood' text");
});

test("spell materials.consumed is false (NOT true — the spell does not consume the shard)", () => {
  assert.equal(spell.system?.materials?.consumed, false);
});

test("spell materials.cost matches the 100 GP described in materials.value", () => {
  assert.equal(spell.system?.materials?.cost, 100);
});

// --- Activity-level override locks ---
// The summon activity carries its own range/target with `override:true` so it
// inherits the spell-level shape rather than dnd5e's defaults. v0.1.13 flipped
// both overrides to false and stripped target.affects.type entirely.

test("summon activity range overrides to 30 ft (override:true)", () => {
  const acts = Object.values(spell.system?.activities ?? {});
  const summons = acts.filter(a => a.type === "summon");
  assert.ok(summons.length > 0, "spell must have at least one summon activity");
  for (const act of summons) {
    assert.equal(act.range?.value, 30, "summon.range.value must be 30");
    assert.equal(act.range?.units, "ft", "summon.range.units must be 'ft'");
    assert.equal(act.range?.override, true, "summon.range.override must be true");
  }
});

test("summon activity target.affects.type is 'space' with override:true", () => {
  const acts = Object.values(spell.system?.activities ?? {});
  for (const act of acts.filter(a => a.type === "summon")) {
    assert.equal(act.target?.affects?.type, "space", "summon.target.affects.type must be 'space'");
    assert.equal(act.target?.override, true, "summon.target.override must be true");
  }
});

test("summon activity profile uuid points at the packed actor", () => {
  const acts = Object.values(spell.system?.activities ?? {});
  const summons = acts.filter(a => a.type === "summon");
  assert.ok(summons.length > 0, "spell must have at least one summon activity");
  for (const act of summons) {
    for (const p of act.profiles ?? []) {
      assert.equal(p.uuid, "Compendium.manifest-tulpa.manifest-tulpa-actors.Actor.manifesttulpaA01");
    }
    assert.equal(act.consumption?.scaling?.allowed, false);
  }
});

// --- v0.1.11/v0.1.15 description header (R36) lock ---
// The shipped description must start with the prose, not with the front-matter
// header (Manifest Tulpa / Level 5 Conjuration / Casting Time / Range /
// Components / Duration) that dnd5e renders separately from the spell fields.

const HEADER_NEEDLES = [
  "Level 5 Conjuration",
  "Casting Time:",
  "Range: 30 feet",
  "Components:",
  "Duration: 1 Hour",
];

test("spell description.value does not duplicate the front-matter header (R36)", () => {
  const v = spell.system?.description?.value ?? "";
  for (const needle of HEADER_NEEDLES) {
    assert.ok(!v.includes(needle), `description.value must not contain header line ${JSON.stringify(needle)}`);
  }
  assert.match(v, /<p>You crystallize a fragment/, "description.value must open with the prose");
});

// --- Generator-absence lock ---
// scripts/scrub-source.mjs was deleted in v0.1.15 because its re-reading of
// pre-development fvtt-* exports silently shipped eight regressions in v0.1.13.
// If anyone restores it from git history (or re-creates it) without first
// reading docs/superpowers/specs/2026-05-24-manifest-tulpa-design.md and
// CLAUDE.md, this test reminds them why.

test("scripts/scrub-source.mjs does not exist (deleted v0.1.15 — see CLAUDE.md generator/output discipline)", () => {
  assert.ok(
    !existsSync(resolve(ROOT, "scripts/scrub-source.mjs")),
    "scripts/scrub-source.mjs was deleted in v0.1.15 because it re-read fvtt-* pre-dev exports as authoritative input and silently regressed _source/. Do not restore it. _source/ is hand-edited canonical JSON; if you need a one-off transform, write it as a one-shot script under scripts/ and DELETE IT IMMEDIATELY after use."
  );
});

// --- v0.1.16 description-structure locks ---
// description.value was restructured from a flat <p>-wall into:
//   * a 6-row stat-block table with [[lookup ...]] enrichers on AC and HP
//   * <h4> section headers for the six modification categories
//   * <ul><li><strong>NAME</strong>...</li> bullet lists for the named options
// description.chat was populated with a two-paragraph cast-card summary.
// Each assertion below locks one structural element. If a future edit (or a
// future agent's "let me just regenerate this" rationalization) flattens the
// HTML or wipes the chat field, npm test fails before .github/workflows/release.yml
// can build packs. v0.1.13 silent-regression class extension.

test("spell description.value contains the stat-block table (v0.1.16 structure lock)", () => {
  const v = spell.system?.description?.value ?? "";
  assert.match(v, /<table>/, "description.value must contain the stat-block <table>");
  assert.match(v, /<th>AC<\/th>/, "stat-block table must have an AC row");
  assert.match(v, /<th>HP maximum<\/th>/, "stat-block table must have an HP maximum row");
});

test("spell description.value contains the two scoped lookup enrichers (v0.1.16 enricher lock)", () => {
  const v = spell.system?.description?.value ?? "";
  assert.match(v, /\[\[lookup @attributes\.spellmod\]\]\{your spellcasting ability modifier\}/,
    "AC line must use the @attributes.spellmod lookup with prose fallback");
  assert.match(v, /\[\[13 \+ @attributes\.spellmod\]\]\{total\}/,
    "AC line must compute the total with the {total} fallback");
  assert.match(v, /\[\[40 \+ 5 \* @details\.level\]\]\{40 \+ 5 × your character level\}/,
    "HP line must compute 40 + 5 × @details.level with prose fallback");
});

test("spell description.value contains all six modification-section <h4> headers (v0.1.16 structure lock)", () => {
  const v = spell.system?.description?.value ?? "";
  for (const section of ["Morphic", "Combat", "Resistance", "Movement", "Skill Affinity", "Special"]) {
    assert.match(v, new RegExp(`<h4>${section}<\\/h4>`), `description.value must contain <h4>${section}</h4>`);
  }
});

test("spell description.value bolds a representative sample of modification names (v0.1.16 structure lock)", () => {
  // A spot-check of one mod per section — if these go missing the list-flatten regression has happened.
  const v = spell.system?.description?.value ?? "";
  for (const mod of ["Reinforced Form", "Empowered Strikes", "Fly Speed", "Telepathic Link"]) {
    assert.match(v, new RegExp(`<strong>${mod}<\\/strong>`), `description.value must bold "${mod}"`);
  }
});

test("spell description.chat is populated, brief, and on-topic (v0.1.16 chat-card lock)", () => {
  const c = spell.system?.description?.chat ?? "";
  assert.ok(c.length > 0, "description.chat must not be empty (overrides description.value in cast card)");
  assert.ok(c.length < 1500, `description.chat must stay brief; current length ${c.length} exceeds 1500-char budget`);
  assert.match(c, /Tulpa/, "description.chat must mention the Tulpa");
  assert.match(c, /dismiss/i, "description.chat must cover dismissal triggers (rationale for picking Option B during brainstorming)");
});

test("spell description.chat also avoids the R36 front-matter header strings", () => {
  // R36 originally checked only description.value. v0.1.16 introduces description.chat as a second
  // surface that could regress in the same way; extend the same lock to it.
  const c = spell.system?.description?.chat ?? "";
  for (const needle of HEADER_NEEDLES) {
    assert.ok(!c.includes(needle), `description.chat must not contain header line ${JSON.stringify(needle)}`);
  }
});
