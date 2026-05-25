import { test } from "node:test";
import assert from "node:assert/strict";
import { MODIFICATIONS, KINDS } from "../modules/modification-registry.js";

test("KINDS enumerates the four kinds documented in the spec", () => {
  assert.deepEqual(KINDS.sort(), ["ae", "aura+marker", "item-insert", "item-patch"]);
});

test("every entry has category, slots (positive int), kind, and a payload matching its kind", () => {
  for (const [slug, m] of Object.entries(MODIFICATIONS)) {
    assert.ok(m.category, `${slug} missing category`);
    assert.ok(Number.isInteger(m.slots) && m.slots > 0, `${slug} has invalid slots`);
    assert.ok(KINDS.includes(m.kind), `${slug} has unknown kind ${m.kind}`);
    if (m.kind === "ae")          assert.ok(m.template, `${slug} kind=ae missing template`);
    if (m.kind === "item-patch")  assert.equal(typeof m.patch, "function", `${slug} kind=item-patch missing patch fn`);
    if (m.kind === "item-insert") assert.ok(m.item, `${slug} kind=item-insert missing item`);
    if (m.kind === "aura+marker") assert.equal(typeof m.build, "function", `${slug} kind=aura+marker missing build fn`);
  }
});

test("reinforcedForm adds +2 to system.attributes.ac.flat with ADD mode (2)", () => {
  const m = MODIFICATIONS.reinforcedForm;
  assert.equal(m.kind, "ae");
  assert.equal(m.slots, 1);
  const change = m.template.changes[0];
  assert.equal(change.key, "system.attributes.ac.flat");
  assert.equal(change.mode, 2);
  assert.equal(change.value, "2");
});

test("vitalSurge bumps both hp.max and hp.value by 30 (heals on apply)", () => {
  const m = MODIFICATIONS.vitalSurge;
  const keys = m.template.changes.map(c => c.key).sort();
  assert.deepEqual(keys, ["system.attributes.hp.max", "system.attributes.hp.value"]);
  for (const c of m.template.changes) {
    assert.equal(c.mode, 2);
    assert.equal(c.value, "30");
  }
});

test("unsettlingForm grants disadvantage on Wis and Cha saves via midi-qol flag changes", () => {
  const m = MODIFICATIONS.unsettlingForm;
  const keys = m.template.changes.map(c => c.key).sort();
  assert.deepEqual(keys, [
    "flags.midi-qol.grants.disadvantage.save.cha",
    "flags.midi-qol.grants.disadvantage.save.wis",
  ]);
  for (const c of m.template.changes) assert.equal(c.value, "1");
});

test("size shifts share the mutually-exclusive group 'sizeShift'", () => {
  const sizes = ["sizeShift_tiny","sizeShift_small","sizeShift_large","sizeShift_huge","sizeShift_gargantuan"];
  for (const slug of sizes) {
    assert.equal(MODIFICATIONS[slug].mutuallyExclusive, "sizeShift", `${slug} missing mutuallyExclusive`);
  }
});

test("size shift slot costs match the spell text", () => {
  assert.equal(MODIFICATIONS.sizeShift_small.slots,      1);
  assert.equal(MODIFICATIONS.sizeShift_large.slots,      1);
  assert.equal(MODIFICATIONS.sizeShift_tiny.slots,       2);
  assert.equal(MODIFICATIONS.sizeShift_huge.slots,       2);
  assert.equal(MODIFICATIONS.sizeShift_gargantuan.slots, 3);
});

test("size shifts carry a tokenSize for the imperative resize at apply time", () => {
  assert.deepEqual(MODIFICATIONS.sizeShift_tiny.tokenSize,       { width: 0.5, height: 0.5 });
  assert.deepEqual(MODIFICATIONS.sizeShift_small.tokenSize,      { width: 1,   height: 1   });
  assert.deepEqual(MODIFICATIONS.sizeShift_large.tokenSize,      { width: 2,   height: 2   });
  assert.deepEqual(MODIFICATIONS.sizeShift_huge.tokenSize,       { width: 3,   height: 3   });
  assert.deepEqual(MODIFICATIONS.sizeShift_gargantuan.tokenSize, { width: 4,   height: 4   });
});

test("each size shift OVERRIDEs system.traits.size with the correct dnd5e size code", () => {
  const cases = [
    ["sizeShift_tiny",       "tiny"],
    ["sizeShift_small",      "sm"],
    ["sizeShift_large",      "lg"],
    ["sizeShift_huge",       "huge"],
    ["sizeShift_gargantuan", "grg"],
  ];
  for (const [slug, sizeCode] of cases) {
    const c = MODIFICATIONS[slug].template.changes.find(x => x.key === "system.traits.size");
    assert.ok(c, `${slug} missing size change`);
    assert.equal(c.mode, 5);
    assert.equal(c.value, sizeCode);
  }
});

test("empoweredStrikes patches a strike item to add 1d8 of the chosen damage type", () => {
  const m = MODIFICATIONS.empoweredStrikes;
  assert.equal(m.kind, "item-patch");
  const update = m.patch({
    system: { damage: { parts: [{ number: 1, denomination: 8, types: ["force"] }] } },
  }, "psychic");
  // The patch must return a diff that adds a new damage part with 1d8 psychic.
  const newParts = update["system.damage.parts"] ?? update.system?.damage?.parts;
  assert.ok(Array.isArray(newParts) && newParts.length >= 2, "expected an added 1d8 part");
  const added = newParts.find(p => p.number === 1 && p.denomination === 8 && (p.types ?? []).includes("psychic"));
  assert.ok(added, "1d8 psychic part missing");
});

test("multiattack inserts a feat item the player triggers manually", () => {
  const m = MODIFICATIONS.multiattack;
  assert.equal(m.kind, "item-insert");
  assert.equal(m.item.type, "feat");
  assert.equal(m.item.name, "Multiattack");
  assert.match(m.item.system.description.value, /two Manifestation Strike/);
});

test("harrowingPresence.build returns aura + markerOnApply with caster spell save DC baked in", () => {
  const m = MODIFICATIONS.harrowingPresence;
  assert.equal(m.kind, "aura+marker");
  const fakeCaster = { system: { attributes: { spell: { dc: 17 } } }, name: "Vex" };
  const built = m.build(fakeCaster, "psychic");
  assert.equal(built.aura.type, "auraeffects.aura");
  assert.equal(built.aura.system.distanceFormula, "10");
  assert.equal(built.aura.system.disposition, -1);
  assert.equal(built.aura.system.applyToSelf, false);
  assert.equal(built.aura.system.showRadius, true);
  assert.equal(built.aura.system.script, "true");
  // The marker payload that Aura Effects will stamp onto in-range hostiles:
  assert.equal(built.markerOnApply.flags["manifest-tulpa"].inHarrowingAura, true);
  assert.equal(built.markerOnApply.flags["manifest-tulpa"].auraDC, 17);
});

test("relentless is a marker-only AE (no system changes) with the slug-visible name", () => {
  const m = MODIFICATIONS.relentless;
  assert.equal(m.kind, "ae");
  assert.deepEqual(m.template.changes, []);
  assert.equal(m.template.name, "Relentless");
});

test("ten resistance entries — one per spell-text damage type", () => {
  const expected = ["acid","bludgeoning","cold","fire","lightning","necrotic","piercing","radiant","slashing","thunder"];
  for (const dt of expected) {
    const slug = `resistance_${dt}`;
    assert.ok(MODIFICATIONS[slug], `${slug} missing`);
    const c = MODIFICATIONS[slug].template.changes[0];
    assert.equal(c.key, "system.traits.dr.value");
    assert.equal(c.mode, 2);
    assert.equal(c.value, dt);
  }
});

test("movement entries UPGRADE the appropriate movement key", () => {
  assert.equal(MODIFICATIONS.flySpeed.template.changes[0].key,  "system.attributes.movement.fly");
  assert.equal(MODIFICATIONS.flySpeed.template.changes[0].mode, 4);
  assert.equal(MODIFICATIONS.flySpeed.template.changes[0].value, "@attributes.movement.walk");
  assert.equal(MODIFICATIONS.swimSpeed.template.changes[0].key, "system.attributes.movement.swim");
  assert.equal(MODIFICATIONS.tremorsense.template.changes[0].key,   "system.attributes.senses.tremorsense");
  assert.equal(MODIFICATIONS.tremorsense.template.changes[0].mode,  4);
  assert.equal(MODIFICATIONS.tremorsense.template.changes[0].value, "30");
  assert.ok(MODIFICATIONS.spiderClimb, "spiderClimb entry exists");
});

test("eighteen skill entries — one per dnd5e skill key", () => {
  const SKILLS = ["acr","ani","arc","ath","dec","his","ins","itm","inv","med","nat","prc","prf","per","rel","slt","ste","sur"];
  for (const skill of SKILLS) {
    const slug = `skill_${skill}`;
    assert.ok(MODIFICATIONS[slug], `${slug} missing`);
    const c = MODIFICATIONS[slug].template.changes[0];
    assert.equal(c.key, `system.skills.${skill}.value`);
    assert.equal(c.mode, 4);
    assert.equal(c.value, "1");
  }
});

test("telepathicLink is an AE with a postApply hook", () => {
  const m = MODIFICATIONS.telepathicLink;
  assert.equal(m.kind, "ae");
  assert.equal(typeof m.postApply, "function");
});
