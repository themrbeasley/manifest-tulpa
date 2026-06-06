import { test } from "node:test";
import assert from "node:assert/strict";
import { assetAvailable } from "../modules/animations.js";

// --- Bug #5 regression locks (v0.1.17) ---------------------------------------
// assetAvailable() is the cheap pre-flight that skips a Sequence when a jb2a asset isn't
// indexed. Sequencer 3.6.11 `entryExists` returns the string DB key when an asset is
// PRESENT and `undefined` when it's MISSING — it never returns boolean `false`. The old
// guard read `entryExists(asset) !== false`, so `undefined !== false` was always true: every
// missing asset was reported "available", the guard never skipped, and the missing impact
// keys reached `.play()` and crashed with a detached `baseTexture` rejection. The fix is
// `!= null` (missing iff null/undefined). The undefined→false case below is the centrepiece:
// it fails if anyone reverts to the `!== false` form.

// Swap a fake Sequencer.Database into globalThis for the duration of fn, then restore.
function withEntryExists(entryExists, fn) {
  const had = "Sequencer" in globalThis;
  const prev = globalThis.Sequencer;
  globalThis.Sequencer = { Database: { entryExists } };
  try { return fn(); }
  finally {
    if (had) globalThis.Sequencer = prev;
    else delete globalThis.Sequencer;
  }
}

test("missing asset (entryExists → undefined) is reported UNavailable — THE Bug #5 lock", () => {
  // If this regresses to `!== false`, undefined !== false === true and this assert flips.
  withEntryExists(() => undefined, () => {
    assert.equal(assetAvailable("jb2a.impact.does-not-exist"), false);
  });
});

test("missing asset (entryExists → null) is reported UNavailable", () => {
  withEntryExists(() => null, () => {
    assert.equal(assetAvailable("jb2a.impact.also-missing"), false);
  });
});

test("present asset (entryExists → string DB key) is reported available", () => {
  withEntryExists((key) => key, () => {
    assert.equal(assetAvailable("jb2a.impact.purple"), true);
  });
});

test("Sequencer absent entirely → available (attempt the play, fall back to the timeout)", () => {
  const had = "Sequencer" in globalThis;
  const prev = globalThis.Sequencer;
  if (had) delete globalThis.Sequencer;
  try {
    assert.equal(assetAvailable("anything"), true);
  } finally {
    if (had) globalThis.Sequencer = prev;
  }
});

test("entryExists not a function (DB not ready) → available", () => {
  withEntryExists("not-a-function", () => {
    assert.equal(assetAvailable("anything"), true);
  });
});

test("entryExists throws → available (defensive fallback)", () => {
  withEntryExists(() => { throw new Error("DB exploded"); }, () => {
    assert.equal(assetAvailable("anything"), true);
  });
});
