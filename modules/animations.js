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

export async function playManifest(token, damageType) {
  if (!globalThis.Sequencer) return;
  const p = PRESETS[damageType];
  if (!p) return;
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
