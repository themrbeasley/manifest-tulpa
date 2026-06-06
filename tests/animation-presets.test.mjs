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

// --- Bug #8 regression locks (v0.1.17) ---------------------------------------
// The v0.1.16 smoke report found 5 of the 12 preset asset keys did not exist in
// jb2a_patreon 0.8.7 (confirmed live via Sequencer.Database, 2026-06-06):
//   force/radiant/psychic strike  → jb2a.unarmed_strike.magical.<colour>  (no `.<colour>` variant ships)
//   radiant/psychic impact        → jb2a.impact.010.<colour>              (010 ships only blue/green/orange/purple/red)
// The missing impacts crashed playRelentless with a detached `baseTexture` unhandled
// rejection (try/catch + withTimeout can't see it). Root cause: the erroneous `.010`
// numbered-impact segment and the non-existent coloured-strike variants. These locks
// pin the corrected base-family keys and forbid the broken patterns from returning.

test("impacts use the base jb2a.impact.<colour> family with the intended colours", () => {
  assert.equal(PRESETS.force.impact.asset,   "jb2a.impact.purple");
  assert.equal(PRESETS.radiant.impact.asset, "jb2a.impact.yellow");
  assert.equal(PRESETS.psychic.impact.asset, "jb2a.impact.pinkpurple");
});

test("NO preset asset uses the broken numbered-impact `jb2a.impact.010.` family (kills the Bug #8 class)", () => {
  // jb2a.impact.010.<colour> only ships [blue, green, orange, purple, red]; the spell wants
  // yellow & pinkpurple, which never existed there. Ban the whole `.impact.010.` substring
  // across EVERY asset string so no future edit can quietly reintroduce a missing key.
  for (const [dt, p] of Object.entries(PRESETS)) {
    for (const [slot, cfg] of Object.entries(p)) {
      const asset = cfg?.asset;
      if (typeof asset !== "string") continue;
      assert.ok(!asset.includes(".impact.010."),
        `${dt}.${slot} uses the broken numbered-impact family: "${asset}"`);
    }
  }
});

test("every impact key is a base-family `jb2a.impact.<colour>` with no numbered segment", () => {
  // Structural guard for any future preset: base family, one lowercase colour word, nothing
  // after it — rejects `jb2a.impact.010.purple` (digits + extra dot) and any numbered variant.
  for (const [dt, p] of Object.entries(PRESETS)) {
    assert.ok(p.impact?.asset, `${dt}.impact.asset missing`);
    assert.match(p.impact.asset, /^jb2a\.impact\.[a-z]+$/,
      `${dt}.impact "${p.impact.asset}" is not a base jb2a.impact.<colour> key`);
  }
});

test("all three strikes use the colourless jb2a.unarmed_strike.magical (the `.<colour>` variants don't exist)", () => {
  // jb2a ships `jb2a.unarmed_strike.magical` (intrinsically blue) but NOT
  // `.magical.purple/.yellow/.pinkpurple`. p.strike.asset is currently vestigial — no module
  // code reads it — but the keys are corrected so the data is truthful and a future
  // AutoAnimations wiring can't pick up a phantom asset.
  for (const [dt, p] of Object.entries(PRESETS)) {
    assert.equal(p.strike?.asset, "jb2a.unarmed_strike.magical",
      `${dt}.strike must be the colourless magical unarmed strike`);
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
