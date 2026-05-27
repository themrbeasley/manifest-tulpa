import { test } from "node:test";
import assert from "node:assert/strict";
import { pickSummonedFromResults, scanPlaceablesForSummon } from "../modules/locate-helpers.js";

test("pickSummonedFromResults returns the first TokenDocument when results.summoned is populated", () => {
  const fakeDoc = { id: "tok-1", delete: () => {} };
  const results = { summoned: [fakeDoc] };
  assert.equal(pickSummonedFromResults(results), fakeDoc);
});

test("pickSummonedFromResults returns null when results is undefined / empty / missing summoned", () => {
  assert.equal(pickSummonedFromResults(undefined), null);
  assert.equal(pickSummonedFromResults(null), null);
  assert.equal(pickSummonedFromResults({}), null);
  assert.equal(pickSummonedFromResults({ summoned: [] }), null);
  assert.equal(pickSummonedFromResults({ createdTokens: [{ id: "x" }] }), null); // stale key — must not match
});

test("scanPlaceablesForSummon returns null when casterUuid is missing", () => {
  assert.equal(scanPlaceablesForSummon([], undefined), null);
  assert.equal(scanPlaceablesForSummon([], ""), null);
});

test("scanPlaceablesForSummon returns null when placeables is empty / missing", () => {
  assert.equal(scanPlaceablesForSummon(undefined, "Actor.caster1"), null);
  assert.equal(scanPlaceablesForSummon([], "Actor.caster1"), null);
});

test("scanPlaceablesForSummon matches tokens whose dnd5e summon origin starts with `${casterUuid}.`", () => {
  const placeable = makePlaceable({
    summonOrigin: "Actor.caster1.Item.spell.Activity.act",
    createdTime: 100
  });
  const result = scanPlaceablesForSummon([placeable], "Actor.caster1");
  assert.equal(result, placeable);
});

test("scanPlaceablesForSummon ignores tokens whose summon origin is for a different caster", () => {
  const other = makePlaceable({ summonOrigin: "Actor.OTHER.Item.spell.Activity.act", createdTime: 100 });
  assert.equal(scanPlaceablesForSummon([other], "Actor.caster1"), null);
});

test("scanPlaceablesForSummon ignores tokens with no actor or no summon flag", () => {
  const noActor = { actor: null };
  const noFlag = makePlaceable({ summonOrigin: null, createdTime: 50 });
  assert.equal(scanPlaceablesForSummon([noActor, noFlag], "Actor.caster1"), null);
});

test("scanPlaceablesForSummon returns the most recently created match when multiple match", () => {
  const older = makePlaceable({ summonOrigin: "Actor.caster1.Item.s.Activity.a", createdTime: 100, id: "old" });
  const newer = makePlaceable({ summonOrigin: "Actor.caster1.Item.s.Activity.a", createdTime: 999, id: "new" });
  const result = scanPlaceablesForSummon([older, newer], "Actor.caster1");
  assert.equal(result.id, "new");
});

test("scanPlaceablesForSummon tolerates missing _stats.createdTime (no throw, deterministic-ish)", () => {
  const a = makePlaceable({ summonOrigin: "Actor.caster1.Item.s.Activity.a", createdTime: undefined, id: "a" });
  const b = makePlaceable({ summonOrigin: "Actor.caster1.Item.s.Activity.a", createdTime: undefined, id: "b" });
  const result = scanPlaceablesForSummon([a, b], "Actor.caster1");
  assert.ok(result === a || result === b);
});

// --- helpers --------------------------------------------------------------

function makePlaceable({ summonOrigin, createdTime, id = "tok" }) {
  return {
    id,
    actor: {
      getFlag: (ns, key) => (ns === "dnd5e" && key === "summon" && summonOrigin) ? { origin: summonOrigin } : undefined
    },
    document: { _stats: createdTime === undefined ? {} : { createdTime } }
  };
}
