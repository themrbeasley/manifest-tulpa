import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAll } from "../scripts/validate-pack.js";

test("validateAll passes on the scrubbed source", async () => {
  const { ok, errors } = await validateAll();
  assert.equal(ok, true, `expected pass, got errors: ${JSON.stringify(errors, null, 2)}`);
});

test("validateAll fails when actor has stray world-export flag (injected fixture)", async () => {
  const { ok, errors } = await validateAll({
    actorMutator: doc => { doc.flags = { ...doc.flags, "scene-packer": { hash: "x" } }; },
  });
  assert.equal(ok, false);
  assert.ok(errors.some(e => /scene-packer/.test(e)));
});

test("validateAll fails when spell description is empty", async () => {
  const { ok, errors } = await validateAll({
    spellMutator: doc => { doc.system.description.value = ""; },
  });
  assert.equal(ok, false);
  assert.ok(errors.some(e => /description/.test(e)));
});

test("validateAll fails when actor is missing _key (v0.1.1 regression)", async () => {
  const { ok, errors } = await validateAll({
    actorMutator: doc => { delete doc._key; },
  });
  assert.equal(ok, false);
  assert.ok(errors.some(e => /actor\._key/.test(e)));
});

test("validateAll fails when an embedded item is missing _key", async () => {
  const { ok, errors } = await validateAll({
    actorMutator: doc => { delete doc.items[0]._key; },
  });
  assert.equal(ok, false);
  assert.ok(errors.some(e => /actor\.items.*_key/.test(e)));
});

test("validateAll fails when spell is missing _key", async () => {
  const { ok, errors } = await validateAll({
    spellMutator: doc => { delete doc._key; },
  });
  assert.equal(ok, false);
  assert.ok(errors.some(e => /spell\._key/.test(e)));
});

test("validateAll fails when actor _id is not 16 alphanumeric chars (v0.1.2 regression)", async () => {
  const { ok, errors } = await validateAll({
    actorMutator: doc => { doc._id = "manifesttulpa0001"; }, // 17 chars
  });
  assert.equal(ok, false);
  assert.ok(errors.some(e => /actor\._id.*16 alphanumeric/.test(e)));
});

test("validateAll fails when spell _id is not 16 alphanumeric chars", async () => {
  const { ok, errors } = await validateAll({
    spellMutator: doc => { doc._id = "manifesttulpaspell"; }, // 18 chars
  });
  assert.equal(ok, false);
  assert.ok(errors.some(e => /spell\._id.*16 alphanumeric/.test(e)));
});

test("validateAll fails when an embedded item _id is non-alphanumeric", async () => {
  const { ok, errors } = await validateAll({
    actorMutator: doc => { doc.items[0]._id = "has-a-hyphen-bad"; }, // 16 chars but contains '-'
  });
  assert.equal(ok, false);
  assert.ok(errors.some(e => /actor\.items.*16 alphanumeric/.test(e)));
});
