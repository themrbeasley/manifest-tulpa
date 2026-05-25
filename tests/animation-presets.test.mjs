import { test } from "node:test";
import assert from "node:assert/strict";
import { PRESETS } from "../modules/animation-presets.js";

test("has all three damage-type presets", () => {
  assert.deepEqual(Object.keys(PRESETS).sort(), ["force", "psychic", "radiant"]);
});

test("each preset has manifest, dismiss, auraTint", () => {
  for (const [dt, p] of Object.entries(PRESETS)) {
    assert.ok(p.manifest?.asset, `${dt}.manifest.asset missing`);
    assert.ok(p.dismiss?.asset,  `${dt}.dismiss.asset missing`);
    assert.match(p.auraTint, /^#[0-9a-fA-F]{6}$/, `${dt}.auraTint must be #rrggbb`);
  }
});

test("psychic strike uses pinkpurple not plain pink (jb2a has no plain pink unarmed_strike)", () => {
  assert.match(PRESETS.psychic.strike.asset, /pinkpurple/);
});

test("manifest/dismiss assets reference the spec'd jb2a paths", () => {
  assert.equal(PRESETS.force.manifest.asset,   "jb2a.magic_signs.circle.02.conjuration.intro.purple");
  assert.equal(PRESETS.force.dismiss.asset,    "jb2a.magic_signs.circle.02.conjuration.outro.purple");
  assert.equal(PRESETS.radiant.manifest.asset, "jb2a.magic_signs.circle.02.conjuration.intro.yellow");
  assert.equal(PRESETS.radiant.dismiss.asset,  "jb2a.magic_signs.circle.02.conjuration.outro.yellow");
  assert.equal(PRESETS.psychic.manifest.asset, "jb2a.magic_signs.circle.02.conjuration.intro.pink");
  assert.equal(PRESETS.psychic.dismiss.asset,  "jb2a.magic_signs.circle.02.conjuration.outro.pink");
});
