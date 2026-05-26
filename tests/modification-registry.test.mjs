import { test } from "node:test";
import assert from "node:assert/strict";
import { MODIFICATIONS, KINDS, iterActivities } from "../modules/modification-registry.js";

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

test("empoweredStrikes patches every strike activity to add 1d8 of the chosen damage type", () => {
  const m = MODIFICATIONS.empoweredStrikes;
  assert.equal(m.kind, "item-patch");
  // dnd5e 5.2.5 stores damage entries inside each activity's `damage.parts`.
  const strike = {
    system: {
      activities: {
        melee01: { damage: { parts: [{ number: 2, denomination: 8, bonus: "@mod", types: ["bludgeoning"] }] } },
        ranged1: { damage: { parts: [{ number: 2, denomination: 8, bonus: "@mod", types: ["bludgeoning"] }] } },
      },
    },
  };
  const update = m.patch(strike, "psychic");
  for (const actId of ["melee01", "ranged1"]) {
    const newParts = update[`system.activities.${actId}.damage.parts`];
    assert.ok(Array.isArray(newParts) && newParts.length >= 2,
      `expected ${actId} to gain a 1d8 damage entry`);
    const added = newParts.find(p => p.number === 1 && p.denomination === 8 && (p.types ?? []).includes("psychic"));
    assert.ok(added, `${actId} missing the new 1d8 psychic part`);
    // Existing bludgeoning entry must be preserved.
    const original = newParts.find(p => (p.types ?? []).includes("bludgeoning"));
    assert.ok(original, `${actId} lost its original bludgeoning entry`);
  }
});

test("multiattack inserts a feat item the player triggers manually", () => {
  const m = MODIFICATIONS.multiattack;
  assert.equal(m.kind, "item-insert");
  assert.equal(m.item.type, "feat");
  assert.equal(m.item.name, "Multiattack");
  assert.match(m.item.system.description.value, /two Manifestation Strike/);
});

test("harrowingPresence.build returns an aura whose changes propagate marker flags", () => {
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
  // Aura Effects 1.5.2 propagates `changes` to in-range targets; the marker flags must
  // live there (not in a separate marker AE that v0.1.6 expected but never propagated).
  const changeKeys = built.aura.changes.map(c => c.key).sort();
  assert.deepEqual(changeKeys, [
    "flags.manifest-tulpa.auraDC",
    "flags.manifest-tulpa.inHarrowingAura",
  ]);
  const dcChange = built.aura.changes.find(c => c.key === "flags.manifest-tulpa.auraDC");
  assert.equal(dcChange.value, "17");
  assert.equal(dcChange.mode, 5);
  const flagChange = built.aura.changes.find(c => c.key === "flags.manifest-tulpa.inHarrowingAura");
  assert.equal(flagChange.value, "true");
  assert.equal(flagChange.mode, 5);
});

test("harrowingPresence.build ships the full Aura Effects 1.5.2 schema (v0.1.7 bug B regression)", () => {
  const built = MODIFICATIONS.harrowingPresence.build(
    { system: { attributes: { spell: { dc: 15 } } } },
    "psychic",
  );
  // collisionTypes: ["move"] is the smoking-gun field — without it Aura Effects never
  // runs the proximity check on token movement and the marker never lands.
  assert.deepEqual(built.aura.system.collisionTypes, ["move"]);
  assert.equal(built.aura.system.canStack, false);
  assert.equal(built.aura.system.combatOnly, false);
  assert.equal(built.aura.system.disableOnHidden, true);
  assert.equal(built.aura.system.evaluatePreApply, false);
  assert.equal(built.aura.system.overrideName, "");
  assert.equal(built.aura.system.bestFormula, "");
  assert.deepEqual(built.aura.system.stashedChanges, []);
  assert.deepEqual(built.aura.system.stashedStatuses, []);
});

test("empoweredStrikes.patch iterates ActivityCollection (Map) — v0.1.7 bug A regression", () => {
  // dnd5e 5.2.5 ships `ActivityCollection extends Map`; v0.1.7 used `Object.entries()`
  // which returns [] on Maps and silently no-op'd the +1d8.
  const activities = new Map();
  activities.set("melee01", { damage: { parts: [{ number: 2, denomination: 8, types: ["bludgeoning"] }] } });
  activities.set("ranged1", { damage: { parts: [{ number: 2, denomination: 8, types: ["bludgeoning"] }] } });
  const strike = { system: { activities } };
  const update = MODIFICATIONS.empoweredStrikes.patch(strike, "fire");
  for (const actId of ["melee01", "ranged1"]) {
    const parts = update[`system.activities.${actId}.damage.parts`];
    assert.ok(Array.isArray(parts), `${actId} missing in update`);
    const added = parts.find(p => p.number === 1 && p.denomination === 8 && (p.types ?? []).includes("fire"));
    assert.ok(added, `${actId} did not gain the +1d8 fire entry`);
  }
});

test("iterActivities handles Map, plain object, null, and undefined", () => {
  // Plain object (test fixture shape)
  const obj = { a: { x: 1 }, b: { x: 2 } };
  const fromObj = iterActivities(obj);
  assert.equal(fromObj.length, 2);
  assert.equal(fromObj[0][0], "a");

  // Map (runtime ActivityCollection shape)
  const map = new Map([["k1", { x: 1 }], ["k2", { x: 2 }]]);
  const fromMap = iterActivities(map);
  assert.equal(fromMap.length, 2);
  assert.equal(fromMap[0][0], "k1");

  // Falsy values
  assert.deepEqual(iterActivities(null), []);
  assert.deepEqual(iterActivities(undefined), []);
});

test("skill modifications use full English names (v0.1.7 bug C regression — no raw STE/PRC codes)", () => {
  // Spot-check the previously-cryptic abbreviations; if these read as full words the
  // dialog picker is no longer showing 3-letter codes.
  assert.equal(MODIFICATIONS.skill_ste.template.name, "Skill Affinity: Stealth");
  assert.equal(MODIFICATIONS.skill_prc.template.name, "Skill Affinity: Perception");
  assert.equal(MODIFICATIONS.skill_slt.template.name, "Skill Affinity: Sleight of Hand");
  assert.equal(MODIFICATIONS.skill_ani.template.name, "Skill Affinity: Animal Handling");
  assert.equal(MODIFICATIONS.skill_itm.template.name, "Skill Affinity: Intimidation");
  // No skill entry should contain a 3-letter all-caps code (the v0.1.7 symptom).
  const allCapsCode = /\b[A-Z]{3}\b/;
  for (const slug of Object.keys(MODIFICATIONS)) {
    if (!slug.startsWith("skill_")) continue;
    assert.ok(
      !allCapsCode.test(MODIFICATIONS[slug].template.name),
      `${slug} still shows a raw 3-letter code: "${MODIFICATIONS[slug].template.name}"`,
    );
  }
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
