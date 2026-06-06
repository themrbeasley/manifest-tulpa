import { test } from "node:test";
import assert from "node:assert/strict";
import { ANCHOR_SPECIAL_DURATIONS } from "../modules/constants.js";

// --- ANCHOR_SPECIAL_DURATIONS (v0.1.17 smoke Bug #4) -----------------------
//
// The caster-side anchor AE carries DAE specialDuration keys that delete it (and so
// re-enter the single-funnel dismissal) on the matching event. v0.1.16 listed
// ["zeroHP", "isDeath"], but DAE 13.0.26 has no "isDeath" key (verified live via
// `DAE.daeSpecialDurations()`) — it was a silent no-op. These tests lock the list so the
// dead-weight key can't creep back in and so `zeroHP` (the real death trigger) stays.

test("ANCHOR_SPECIAL_DURATIONS includes the real DAE zeroHP trigger", () => {
  assert.ok(ANCHOR_SPECIAL_DURATIONS.includes("zeroHP"));
});

test("ANCHOR_SPECIAL_DURATIONS does NOT include the no-op isDeath key (Bug #4)", () => {
  assert.ok(!ANCHOR_SPECIAL_DURATIONS.includes("isDeath"));
});

test("ANCHOR_SPECIAL_DURATIONS is exactly ['zeroHP']", () => {
  assert.deepEqual(ANCHOR_SPECIAL_DURATIONS, ["zeroHP"]);
});
