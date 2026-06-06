export const MODULE_ID = "manifest-tulpa";
export const NS = `flags.${MODULE_ID}`;

export const ANCHOR_AE_NAME = "Manifest Tulpa (active)";
export const ANCHOR_DURATION_SECONDS = 3600;

// DAE specialDuration keys on the caster-side anchor AE. Only `zeroHP` is a real
// DAE 13.0.26 key (verified live via `DAE.daeSpecialDurations()`): when the caster
// drops to 0 HP, DAE deletes the anchor, which re-enters the single-funnel dismissal.
// v0.1.16 also listed `"isDeath"` here — DAE has no such key, so it was a silent no-op
// (v0.1.17 smoke Bug #4). The `dead`-status-without-HP-change edge case (GM toggle /
// save-or-die at HP > 0) is rare and hand-workable; we deliberately do NOT add a
// status-watcher listener for it. zeroHP covers every realistic death (HP <= 0).
export const ANCHOR_SPECIAL_DURATIONS = ["zeroHP"];

export const PACK_SPELLS  = `Compendium.${MODULE_ID}.${MODULE_ID}-spells`;
export const PACK_ACTORS  = `Compendium.${MODULE_ID}.${MODULE_ID}-actors`;

export const DAMAGE_TYPES = ["force", "radiant", "psychic"];

export const SIZE_TOKEN_SCALE = {
  tiny:       { width: 0.5, height: 0.5 },
  sm:         { width: 1,   height: 1   },
  med:        { width: 1,   height: 1   },
  lg:         { width: 2,   height: 2   },
  huge:       { width: 3,   height: 3   },
  grg:        { width: 4,   height: 4   },
};
