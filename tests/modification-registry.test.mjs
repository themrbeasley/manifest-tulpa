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
