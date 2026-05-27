import { test } from "node:test";
import assert from "node:assert/strict";
import { findSystemSummonAE } from "../modules/dismiss-helpers.js";

test("findSystemSummonAE returns null on missing caster", () => {
  assert.equal(findSystemSummonAE(undefined), null);
  assert.equal(findSystemSummonAE(null), null);
});

test("findSystemSummonAE returns null when caster has no effects", () => {
  const caster = { items: [], effects: undefined };
  assert.equal(findSystemSummonAE(caster), null);
});

test("findSystemSummonAE matches by spell item UUID prefix on flags.dnd5e.summon.origin", () => {
  const spellItem = { uuid: "Actor.caster.Item.abc123def4567890", system: { identifier: "manifest-tulpa" } };
  const target = {
    name: "Summon: Custom Name",
    flags: { dnd5e: { summon: { origin: "Actor.caster.Item.abc123def4567890.Activity.act999" } } }
  };
  const caster = makeCaster([spellItem], [target]);
  assert.equal(findSystemSummonAE(caster), target);
});

test("findSystemSummonAE matches when origin equals the spell item UUID exactly (no activity suffix)", () => {
  const spellItem = { uuid: "Actor.caster.Item.abc123def4567890", system: { identifier: "manifest-tulpa" } };
  const target = {
    name: "Anything",
    flags: { dnd5e: { summon: { origin: "Actor.caster.Item.abc123def4567890" } } }
  };
  const caster = makeCaster([spellItem], [target]);
  assert.equal(findSystemSummonAE(caster), target);
});

test("findSystemSummonAE falls back to name regex when spell item is missing (defense in depth)", () => {
  const target = { name: "Summon: Manifest Tulpa", flags: {} };
  const caster = makeCaster([], [target]); // no spell item resolvable
  assert.equal(findSystemSummonAE(caster), target);
});

test("findSystemSummonAE name regex tolerates hyphen / whitespace variations on the identifier", () => {
  const target1 = { name: "Summon: manifest tulpa", flags: {} };
  const target2 = { name: "Summon: Manifest  Tulpa", flags: {} }; // double space
  assert.equal(findSystemSummonAE(makeCaster([], [target1])), target1);
  assert.equal(findSystemSummonAE(makeCaster([], [target2])), target2);
});

test("findSystemSummonAE returns null for an unrelated summon AE (different spell)", () => {
  const spellItem = { uuid: "Actor.caster.Item.abc123def4567890", system: { identifier: "manifest-tulpa" } };
  const unrelated = {
    name: "Summon: Spiritual Weapon",
    flags: { dnd5e: { summon: { origin: "Actor.caster.Item.xyz999.Activity.foo" } } }
  };
  const caster = makeCaster([spellItem], [unrelated]);
  assert.equal(findSystemSummonAE(caster), null);
});

test("findSystemSummonAE returns null when no AE matches", () => {
  const spellItem = { uuid: "Actor.caster.Item.abc", system: { identifier: "manifest-tulpa" } };
  const caster = makeCaster([spellItem], [{ name: "Bless", flags: {} }]);
  assert.equal(findSystemSummonAE(caster), null);
});

test("findSystemSummonAE accepts a custom spellIdentifier", () => {
  const spellItem = { uuid: "Actor.c.Item.xx", system: { identifier: "summon-fiend" } };
  const target = { name: "Summon: Fiend", flags: { dnd5e: { summon: { origin: "Actor.c.Item.xx" } } } };
  const caster = makeCaster([spellItem], [target]);
  assert.equal(findSystemSummonAE(caster, "summon-fiend"), target);
});

// --- helpers --------------------------------------------------------------

function makeCaster(items, effects) {
  return {
    items: { find: (fn) => items.find(fn) },
    effects: { find: (fn) => effects.find(fn) ?? null }
  };
}
