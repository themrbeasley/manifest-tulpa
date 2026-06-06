import { PRESETS } from "./animation-presets.js";
import { MODULE_ID } from "./constants.js";

// Hard cap so a missing/unindexed Sequencer asset can't hang the cast or dismiss flows.
// Cast/dismiss must continue even if the visual effect never resolves.
// v0.1.13 (smoke A7): raised 5000→15000ms. The dismiss path uses `.waitUntilFinished(-200)`
// on JB2A assets whose intrinsic playback length can comfortably exceed 5s (the longer
// thunderwave-style preserves run 6–9s); the old cap was firing the safety timeout on
// healthy assets and printing a spurious "dismiss animation timed out" warning every
// dismissal. 15s is still well under any reasonable user attention budget for a
// stuck-animation safety net, while clearing all of our shipped dismiss presets.
const ANIM_TIMEOUT_MS = 15000;

function warn(err, label) {
  console.warn(`${MODULE_ID} | animation ${label} failed:`, err);
}

function withTimeout(promise, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} animation timed out after ${ANIM_TIMEOUT_MS}ms`)),
      ANIM_TIMEOUT_MS,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Sequencer.Database.entryExists is the cheap pre-flight: when the jb2a asset isn't
// indexed (no Patreon module, asset misnamed, etc.) we can skip the Sequence entirely
// and avoid the full ANIM_TIMEOUT_MS wait that v0.1.7's smoke report flagged as a UX papercut.
//
// v0.1.17 (smoke Bug #5): the guard read `entryExists(asset) !== false`, but Sequencer
// 3.6.11 `entryExists` returns the string DB key when an asset is present and `undefined`
// when it's missing — it NEVER returns boolean `false`. So `undefined !== false` was always
// true: the guard reported every missing asset as available, defeating its entire purpose
// and letting the missing impact keys reach `.play()`, which then crashed with a detached
// `baseTexture` unhandled rejection that try/catch + withTimeout cannot see. The correct
// test is `!= null` (catches both `undefined` and `null`).
//
// Contract: confirmed-missing → false (skip the play); present (string key) → true;
// DB not ready / function absent / throws → true, so we still attempt the play and rely on
// the timeout safety net. Exported so tests/animations.test.mjs can lock this against regression.
export function assetAvailable(asset) {
  const db = globalThis.Sequencer?.Database;
  if (typeof db?.entryExists !== "function") return true;
  try { return db.entryExists(asset) != null; }
  catch { return true; }
}

export async function playManifest(token, damageType) {
  if (!globalThis.Sequencer) return;
  const p = PRESETS[damageType];
  if (!p) return;
  if (!assetAvailable(p.manifest.asset)) return;
  try {
    await withTimeout(
      new Sequence()
        .effect()
          .file(p.manifest.asset)
          .atLocation(token)
          .scaleToObject(p.manifest.scale)
          .fadeIn(p.manifest.fadeIn)
          .fadeOut(p.manifest.fadeOut)
        .play(),
      "manifest",
    );
  } catch (err) { warn(err, "manifest"); }
}

export async function playDismiss(token, damageType) {
  if (!globalThis.Sequencer) return;
  const p = PRESETS[damageType];
  if (!p) return;
  if (!assetAvailable(p.dismiss.asset)) return;
  try {
    await withTimeout(
      new Sequence()
        .effect()
          .file(p.dismiss.asset)
          .atLocation(token)
          .scaleToObject(p.dismiss.scale)
          .fadeIn(p.dismiss.fadeIn)
          .fadeOut(p.dismiss.fadeOut)
          .waitUntilFinished(-200)
        .play(),
      "dismiss",
    );
  } catch (err) { warn(err, "dismiss"); }
}

export async function playRelentless(token, damageType) {
  if (!globalThis.Sequencer) return;
  const p = PRESETS[damageType];
  if (!p) return;
  if (!assetAvailable(p.impact.asset)) return;
  try {
    await withTimeout(
      new Sequence()
        .effect()
          .file(p.impact.asset)
          .atLocation(token)
          .scaleToObject(0.6)
          .fadeIn(150)
          .fadeOut(400)
        .play(),
      "relentless",
    );
  } catch (err) { warn(err, "relentless"); }
}

export function endAuraEffect(tulpaUuid) {
  if (!globalThis.Sequencer?.EffectManager) return;
  try {
    Sequencer.EffectManager.endEffects({ name: `${MODULE_ID}-aura-${tulpaUuid}` });
  } catch (err) { warn(err, "endAura"); }
}
