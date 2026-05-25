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
