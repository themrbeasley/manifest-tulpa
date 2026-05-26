import { PRESETS } from "./animation-presets.js";
import { MODULE_ID } from "./constants.js";

// Hard cap so a missing/unindexed Sequencer asset can't hang the cast or dismiss flows.
// Cast/dismiss must continue even if the visual effect never resolves.
const ANIM_TIMEOUT_MS = 5000;

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
// and avoid the full 5s timeout wait that v0.1.7's smoke report flagged as a UX papercut.
// Returns false only when the database is loaded *and* the entry is confirmed missing —
// any other state (DB not ready, function absent) returns true so we still attempt the
// play and fall back to the timeout safety net.
function assetAvailable(asset) {
  const db = globalThis.Sequencer?.Database;
  if (typeof db?.entryExists !== "function") return true;
  try { return db.entryExists(asset) !== false; }
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
