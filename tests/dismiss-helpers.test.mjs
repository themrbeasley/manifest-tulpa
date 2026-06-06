import { test } from "node:test";
import assert from "node:assert/strict";
import { findSystemSummonAE, findPreviousAnchor } from "../modules/dismiss-helpers.js";

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

// --- findPreviousAnchor (recast pre-dismissal selection, v0.1.17 Bug #1) -----
//
// findPreviousAnchor locates the caster-side anchor AE ("Manifest Tulpa (active)")
// — the single source of truth that a Tulpa is live (invariant #1). The recast fix
// uses it in onPreUseActivity to dismiss the OLD Tulpa before the new token exists.
// It reads `flags[moduleId].tulpaUuid` directly (pure) — a live ActiveEffect exposes
// the same `.flags` bag, so the helper works on both fakes and real documents.

test("findPreviousAnchor returns null on missing caster", () => {
  assert.equal(findPreviousAnchor(undefined), null);
  assert.equal(findPreviousAnchor(null), null);
});

test("findPreviousAnchor returns null when caster has no usable effects collection", () => {
  assert.equal(findPreviousAnchor({ effects: undefined }), null);
  assert.equal(findPreviousAnchor({ effects: {} }), null); // no .find
});

test("findPreviousAnchor returns null when no effect carries our tulpaUuid flag", () => {
  const effects = [
    { name: "Bless", flags: {} },
    { name: "Summon: Manifest Tulpa", flags: { dnd5e: { summon: { origin: "Actor.c.Item.x" } } } },
  ];
  assert.equal(findPreviousAnchor({ effects }), null);
});

test("findPreviousAnchor finds the anchor carrying flags[moduleId].tulpaUuid", () => {
  const anchor = {
    name: "Manifest Tulpa (active)",
    flags: { "manifest-tulpa": { tulpaUuid: "Scene.s.Token.t.Actor.a", castConfig: {} } },
  };
  const effects = [{ name: "Bless", flags: {} }, anchor];
  assert.equal(findPreviousAnchor({ effects }), anchor);
});

test("findPreviousAnchor ignores the system summon AE (no tulpaUuid in our namespace)", () => {
  // The dnd5e/midi summon AE lives under flags.dnd5e.summon, never flags['manifest-tulpa'].tulpaUuid.
  const summonAE = { name: "Summon: Manifest Tulpa", flags: { dnd5e: { summon: { origin: "Actor.c.Item.x" } } } };
  assert.equal(findPreviousAnchor({ effects: [summonAE] }), null);
});

test("findPreviousAnchor works on an EmbeddedCollection-shaped effects (.find present)", () => {
  // Live `caster.effects` is an EmbeddedCollection; only `.find` is relied upon.
  const anchor = { name: "Manifest Tulpa (active)", flags: { "manifest-tulpa": { tulpaUuid: "x" } } };
  const caster = makeCaster([], [anchor]);
  assert.equal(findPreviousAnchor(caster), anchor);
});

test("findPreviousAnchor accepts a custom moduleId", () => {
  const anchor = { name: "Other (active)", flags: { "other-module": { tulpaUuid: "y" } } };
  assert.equal(findPreviousAnchor({ effects: [anchor] }, "other-module"), anchor);
  // and does NOT match it under the default moduleId
  assert.equal(findPreviousAnchor({ effects: [anchor] }), null);
});

test("findPreviousAnchor treats a null/absent tulpaUuid as not-an-anchor", () => {
  const effects = [
    { name: "stale", flags: { "manifest-tulpa": { tulpaUuid: null } } },
    { name: "empty-ns", flags: { "manifest-tulpa": {} } },
  ];
  assert.equal(findPreviousAnchor({ effects }), null);
});

// --- helpers --------------------------------------------------------------

function makeCaster(items, effects) {
  return {
    items: { find: (fn) => items.find(fn) },
    effects: { find: (fn) => effects.find(fn) ?? null }
  };
}
