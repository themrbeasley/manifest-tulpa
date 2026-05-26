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

test("psychic impact uses pinkpurple not plain pink (v0.1.10 scar — Sequencer errored on the bare pink variant)", () => {
  // v0.1.9 shipped `jb2a.impact.010.pink` which jb2a_patreon doesn't carry; the dismiss
  // animation timed out and the token never cleaned up. Mirror the strike asset
  // convention: both psychic strike and impact use pinkpurple.
  assert.equal(PRESETS.psychic.impact.asset, "jb2a.impact.010.pinkpurple");
});

test("every preset has an impact asset and matches its strike colour variant", () => {
  // Damage-type strike + impact assets should share the same colour suffix so the
  // animation chain reads as a single coherent effect. This guards against future
  // partial palette updates re-introducing a Sequencer-missing-asset error.
  for (const [dt, p] of Object.entries(PRESETS)) {
    assert.ok(p.strike?.asset, `${dt}.strike.asset missing`);
    assert.ok(p.impact?.asset, `${dt}.impact.asset missing`);
    const strikeColour = p.strike.asset.split(".").pop();
    const impactColour = p.impact.asset.split(".").pop();
    assert.equal(impactColour, strikeColour,
      `${dt}: strike "${strikeColour}" and impact "${impactColour}" colours diverge`);
  }
});

test("manifest/dismiss assets reference the spec'd jb2a paths", () => {
  assert.equal(PRESETS.force.manifest.asset,   "jb2a.magic_signs.circle.02.conjuration.intro.purple");
  assert.equal(PRESETS.force.dismiss.asset,    "jb2a.magic_signs.circle.02.conjuration.outro.purple");
  assert.equal(PRESETS.radiant.manifest.asset, "jb2a.magic_signs.circle.02.conjuration.intro.yellow");
  assert.equal(PRESETS.radiant.dismiss.asset,  "jb2a.magic_signs.circle.02.conjuration.outro.yellow");
  assert.equal(PRESETS.psychic.manifest.asset, "jb2a.magic_signs.circle.02.conjuration.intro.pink");
  assert.equal(PRESETS.psychic.dismiss.asset,  "jb2a.magic_signs.circle.02.conjuration.outro.pink");
});
