// Locks the modification-slot budget against the v0.1.18 "always 2" bug.
//
// SYMPTOM (live-demo failure): the "Configure Cast" dialog only ever let the player pick
// 2 modifications, no matter which spell slot was expended — a 9th-level slot should allow
// 6. The chat card was wrong the same way ("Slot: 5" for a 9th-level cast).
//
// ROOT CAUSE (timing): cast-flow.js eager-parsed the slot level at `dnd5e.preUseActivity`,
// which fires BEFORE the slot-selection dialog writes the chosen slot into usageConfig and
// BEFORE `_prepareUsageScaling` sets usageConfig.scaling. So the captured level was ALWAYS
// the pre-dialog base (5) → budget ALWAYS modBudget(5) === 2.
//
// FIX: cast-flow.js stashes the LIVE usageConfig object at preUseActivity and resolves the
// level LATE at postSummon (after dnd5e mutated it in place) via these two pure helpers.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { resolveSlotLevel, modBudget } from "../modules/slot-budget.js";

// --- resolveSlotLevel -------------------------------------------------------
// resolveSlotLevel(usageConfig) reads the expended spell-slot LEVEL from a dnd5e
// usageConfig AFTER the slot dialog + _prepareUsageScaling have mutated it in place.
// Order: spell.slot KEY (the value the dialog writes) → scaling (the derived upcast delta,
// typeof-number-guarded so a base cast's scaling===0 is honored) → 5 (base level).

test("resolveSlotLevel reads the slot KEY: spell5 → 5 (base cast)", () => {
  assert.equal(resolveSlotLevel({ spell: { slot: "spell5" }, scaling: 0 }), 5);
});

test("resolveSlotLevel reads the slot KEY: spell9 → 9 (max upcast — the reported case)", () => {
  assert.equal(resolveSlotLevel({ spell: { slot: "spell9" }, scaling: 4 }), 9);
});

test("resolveSlotLevel reads every in-range slot key 5..9", () => {
  for (const [key, lvl] of [["spell5", 5], ["spell6", 6], ["spell7", 7], ["spell8", 8], ["spell9", 9]]) {
    assert.equal(resolveSlotLevel({ spell: { slot: key } }), lvl);
  }
});

test("resolveSlotLevel falls back to scaling when the slot key is non-numeric (pact)", () => {
  // A warlock pact slot has key "pact" (no digit) — the regex misses, scaling decides.
  assert.equal(resolveSlotLevel({ spell: { slot: "pact" }, scaling: 0 }), 5);
  assert.equal(resolveSlotLevel({ spell: { slot: "pact" }, scaling: 2 }), 7);
});

test("resolveSlotLevel uses scaling===0 (base cast) — typeof-number guard, NOT truthy", () => {
  // The bug-adjacent trap: `if (usageConfig.scaling)` would treat a base cast's 0 as falsy
  // and fall through. The contract is 5 + scaling, so scaling 0 → 5.
  assert.equal(resolveSlotLevel({ scaling: 0 }), 5);
});

test("resolveSlotLevel uses scaling when there is no slot key — scaling 4 → 9", () => {
  assert.equal(resolveSlotLevel({ scaling: 4 }), 9);
});

test("resolveSlotLevel returns 5 (base level) when usageConfig has neither slot nor scaling", () => {
  assert.equal(resolveSlotLevel({}), 5);
  assert.equal(resolveSlotLevel({ spell: {} }), 5);
});

test("resolveSlotLevel never throws on null/undefined (deferred-button no-capture path)", () => {
  assert.equal(resolveSlotLevel(undefined), 5);
  assert.equal(resolveSlotLevel(null), 5);
});

// --- modBudget --------------------------------------------------------------
// modBudget(level) = min(6, 2 + max(0, level-5)). Base 5th-level cast → 2 modifications;
// +1 per slot level above 5, capped at 6 (9th-level slot). THIS math was never wrong — the
// user saw it stuck at 2 because its INPUT (level) was always 5.

test("modBudget: 5→2, 6→3, 7→4, 8→5, 9→6 (the reported bug's table)", () => {
  assert.equal(modBudget(5), 2);
  assert.equal(modBudget(6), 3);
  assert.equal(modBudget(7), 4);
  assert.equal(modBudget(8), 5);
  assert.equal(modBudget(9), 6);
});

test("modBudget caps at 6 above 9th level and floors at 2 below 5th", () => {
  assert.equal(modBudget(10), 6);
  assert.equal(modBudget(20), 6);
  assert.equal(modBudget(4), 2);
  assert.equal(modBudget(1), 2);
});

// end-to-end — the exact path the dialog uses: resolve, then budget.
test("resolveSlotLevel→modBudget: a 9th-level slot yields 6 modifications (was 2 — the bug)", () => {
  assert.equal(modBudget(resolveSlotLevel({ spell: { slot: "spell9" }, scaling: 4 })), 6);
});

test("resolveSlotLevel→modBudget: a 5th-level slot yields 2 modifications", () => {
  assert.equal(modBudget(resolveSlotLevel({ spell: { slot: "spell5" }, scaling: 0 })), 2);
});

// --- cast-flow.js source-shape lock (timing-regression guard) ---------------
// The root cause was TIMING: cast-flow.js eagerly parsed the level at preUseActivity,
// before dnd5e wrote the chosen slot into usageConfig. The fix stashes the LIVE usageConfig
// object and resolves LATE at postSummon. These string assertions lock that shape so a
// future edit can't silently revert to eager-parse-at-capture (the v0.1.18 bug class).

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CAST_FLOW = readFileSync(resolve(ROOT, "modules/cast-flow.js"), "utf8");

test("cast-flow stashes the LIVE usageConfig at preUseActivity (not an eager parse)", () => {
  assert.match(CAST_FLOW, /SLOT_CAPTURE\.set\(activity\.uuid,\s*usageConfig\)/);
});

test("cast-flow does NOT eager-parse the slot level at capture time (the v0.1.18 bug)", () => {
  // The buggy line was `SLOT_CAPTURE.set(activity.uuid, parseSlotLevel(usageConfig))`.
  assert.doesNotMatch(CAST_FLOW, /SLOT_CAPTURE\.set\([^)]*parseSlotLevel/);
  // and the now-removed local helper must be gone (it relocated to slot-budget.js).
  assert.doesNotMatch(CAST_FLOW, /function\s+parseSlotLevel/);
});

test("cast-flow resolves the level from the stashed usageConfig via slot-budget.js", () => {
  assert.match(CAST_FLOW, /from\s+["']\.\/slot-budget\.js["']/);
  assert.match(CAST_FLOW, /resolveSlotLevel/);
  assert.match(CAST_FLOW, /modBudget/);
});

// --- Bug 2: dialog verbiage lock --------------------------------------------
// The counter must read "Modifications used: …", not "Slots used: …" — the user renamed
// Spell Slots vs Modification Slots to just "Modifications" to kill the confusion. The
// i18n KEY stays "SlotsUsed" (template + dialog reference it); only the VALUE changed.
const EN = JSON.parse(readFileSync(resolve(ROOT, "lang/en.json"), "utf8"));

test("the cast-dialog counter label says 'Modifications', not 'Slots'", () => {
  const label = EN.MANIFEST_TULPA?.Dialog?.SlotsUsed ?? "";
  assert.match(label, /Modifications used/);
  assert.doesNotMatch(label, /Slots used/);
  // i18n interpolation tokens must survive the reword.
  assert.match(label, /\{used\}/);
  assert.match(label, /\{max\}/);
});
