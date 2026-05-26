// Section 4 of the spec — single source of truth for what each modification does.
// Pure data + pure helper functions. No Foundry globals referenced here.

import { PRESETS } from "./animation-presets.js";
import { MODULE_ID, ANCHOR_DURATION_SECONDS, SIZE_TOKEN_SCALE } from "./constants.js";

export const KINDS = ["ae", "item-patch", "item-insert", "aura+marker"];

// In dnd5e 5.2.5 `item.system.activities` is an `ActivityCollection` (extends Map).
// `Object.entries()` on a Map returns [] because Map entries are not own enumerable
// string-keyed properties — v0.1.7 shipped that pattern and the dialog's damage type
// + Empowered Strikes both silently no-op'd. Iterate via the Map protocol when present,
// fall back to Object.entries for plain-object test fixtures. v0.1.8 scar.
export function iterActivities(activities) {
  if (!activities) return [];
  if (typeof activities.entries === "function") return [...activities.entries()];
  return Object.entries(activities);
}

function aeTemplate({ name, icon, changes, flags = {}, statuses = [] }) {
  return {
    name,
    img: icon,
    changes,
    disabled: false,
    transfer: false,
    duration: { seconds: ANCHOR_DURATION_SECONDS },
    flags,
    statuses,
  };
}

export const MODIFICATIONS = {
  reinforcedForm: {
    category: "morphic",
    slots: 1,
    kind: "ae",
    template: aeTemplate({
      name: "Reinforced Form",
      icon: "icons/svg/shield.svg",
      changes: [
        { key: "system.attributes.ac.flat", mode: 2, value: "2", priority: 20 },
      ],
    }),
  },
  vitalSurge: {
    category: "morphic",
    slots: 1,
    kind: "ae",
    template: aeTemplate({
      name: "Vital Surge",
      icon: "icons/svg/heal.svg",
      changes: [
        { key: "system.attributes.hp.max",   mode: 2, value: "30", priority: 20 },
        { key: "system.attributes.hp.value", mode: 2, value: "30", priority: 20 },
      ],
    }),
  },
  unsettlingForm: {
    category: "morphic",
    slots: 1,
    kind: "ae",
    template: aeTemplate({
      name: "Unsettling Form",
      icon: "icons/svg/terror.svg",
      changes: [
        { key: "flags.midi-qol.grants.disadvantage.save.wis", mode: 5, value: "1", priority: 20 },
        { key: "flags.midi-qol.grants.disadvantage.save.cha", mode: 5, value: "1", priority: 20 },
      ],
    }),
  },
  sizeShift_tiny: {
    category: "morphic", slots: 2, kind: "ae", mutuallyExclusive: "sizeShift",
    tokenSize: SIZE_TOKEN_SCALE.tiny,
    template: aeTemplate({
      name: "Size Shift: Tiny",
      icon: "icons/svg/regen.svg",
      changes: [{ key: "system.traits.size", mode: 5, value: "tiny", priority: 30 }],
    }),
  },
  sizeShift_small: {
    category: "morphic", slots: 1, kind: "ae", mutuallyExclusive: "sizeShift",
    tokenSize: SIZE_TOKEN_SCALE.sm,
    template: aeTemplate({
      name: "Size Shift: Small",
      icon: "icons/svg/regen.svg",
      changes: [{ key: "system.traits.size", mode: 5, value: "sm", priority: 30 }],
    }),
  },
  sizeShift_large: {
    category: "morphic", slots: 1, kind: "ae", mutuallyExclusive: "sizeShift",
    tokenSize: SIZE_TOKEN_SCALE.lg,
    template: aeTemplate({
      name: "Size Shift: Large",
      icon: "icons/svg/regen.svg",
      changes: [{ key: "system.traits.size", mode: 5, value: "lg", priority: 30 }],
    }),
  },
  sizeShift_huge: {
    category: "morphic", slots: 2, kind: "ae", mutuallyExclusive: "sizeShift",
    tokenSize: SIZE_TOKEN_SCALE.huge,
    template: aeTemplate({
      name: "Size Shift: Huge",
      icon: "icons/svg/regen.svg",
      changes: [{ key: "system.traits.size", mode: 5, value: "huge", priority: 30 }],
    }),
  },
  sizeShift_gargantuan: {
    category: "morphic", slots: 3, kind: "ae", mutuallyExclusive: "sizeShift",
    tokenSize: SIZE_TOKEN_SCALE.grg,
    template: aeTemplate({
      name: "Size Shift: Gargantuan",
      icon: "icons/svg/regen.svg",
      changes: [{ key: "system.traits.size", mode: 5, value: "grg", priority: 30 }],
    }),
  },
  empoweredStrikes: {
    category: "combat", slots: 1, kind: "item-patch",
    // In dnd5e 5.2.5 the Manifestation Strike weapon stores damage entries inside each
    // activity's `damage.parts`, not at `system.damage.parts`. Append a +1d8 of the chosen
    // damage type. v0.1.8 shipped this as `patch(strike, damageType) => update` and ran
    // it as a *second* `strike.update()` after `setStrikeDamageType`; the second write's
    // `deepClone(act.damage?.parts)` captured the pre-update state and clobbered Part 0's
    // type back to "bludgeoning" (v0.1.8 BLOCKING bug A). The single-writer fix in
    // cast-flow.js `applyStrikeChanges` now reads each activity's parts once, applies the
    // base damage type, runs every `patchActivity` transformer, and writes one update —
    // so this modification just transforms the parts array in-place.
    patchActivity: ({ parts, damageType }) => {
      const next = [...parts];
      next.push({
        number: 1,
        denomination: 8,
        bonus: "",
        types: [damageType],
        custom: { enabled: false, formula: "" },
        scaling: { mode: "", number: null, formula: "" },
      });
      return next;
    },
  },
  multiattack: {
    category: "combat", slots: 1, kind: "item-insert",
    item: {
      name: "Multiattack",
      type: "feat",
      img: "icons/svg/sword.svg",
      system: {
        description: {
          value: "<p>The Tulpa makes two Manifestation Strike attacks when it takes the Attack action.</p>",
          chat: "",
        },
        type: { value: "monster", subtype: "" },
        activation: { type: "action" },
      },
      flags: { [MODULE_ID]: { source: "modification" } },
    },
  },
  harrowingPresence: {
    category: "combat", slots: 1, kind: "aura+marker",
    build: (caster, damageType) => {
      const dc = caster.system?.attributes?.spell?.dc ?? caster.system?.attributes?.spelldc ?? 10;
      // Aura Effects 1.5.2 propagates the aura's `changes` array onto in-range targets
      // as the marker effect. The `flags.manifest-tulpa.*` reads the combatTurnStart hook
      // performs (via `actor.getFlag`) resolve against applied AE changes, so the flags
      // must live in `changes` — not in a separate marker `flags` block, which Aura
      // Effects does not propagate. v0.1.6 shipped the flags-only layout and the hook
      // never saw them.
      // Aura Effects 1.5.2 `auraeffects.aura` data model: every system field below has a
      // schema-defined default, but in v0.1.7 we shipped a minimal subset and Aura Effects
      // never propagated the marker (visual rendered, but in-range tokens never received
      // the changes). Comparing against a manually-authored aura in the same world
      // (`fvtt-ActiveEffect-harrowing-presence.json` at repo root) revealed the missing
      // pieces — most critically `collisionTypes: ["move"]`, without which Aura Effects
      // doesn't run a proximity check on any token event. v0.1.8 ships the full schema.
      return {
        aura: {
          name: "Harrowing Presence (Aura)",
          img: "icons/svg/aura.svg",
          type: "auraeffects.aura",
          changes: [
            { key: `flags.${MODULE_ID}.inHarrowingAura`, mode: 5, value: "true", priority: 20 },
            { key: `flags.${MODULE_ID}.auraDC`,          mode: 5, value: String(dc), priority: 20 },
          ],
          disabled: false,
          transfer: false,
          duration: { seconds: ANCHOR_DURATION_SECONDS },
          system: {
            distanceFormula: "10",
            disposition: -1,
            applyToSelf: false,
            showRadius: true,
            color: PRESETS[damageType].auraTint,
            opacity: 0.25,
            script: "true",
            collisionTypes: ["move"],
            canStack: false,
            combatOnly: false,
            disableOnHidden: true,
            evaluatePreApply: false,
            overrideName: "",
            bestFormula: "",
            stashedChanges: [],
            stashedStatuses: [],
          },
          flags: { [MODULE_ID]: { auraDC: dc, source: "modification" } },
        },
      };
    },
  },
  relentless: {
    category: "combat", slots: 1, kind: "ae",
    template: aeTemplate({
      name: "Relentless",
      icon: "icons/svg/regen.svg",
      changes: [],
    }),
  },

  ...Object.fromEntries(
    ["acid","bludgeoning","cold","fire","lightning","necrotic","piercing","radiant","slashing","thunder"]
      .map(dt => [`resistance_${dt}`, {
        category: "resistance", slots: 1, kind: "ae",
        template: aeTemplate({
          name: `Damage Resistance: ${dt.charAt(0).toUpperCase()}${dt.slice(1)}`,
          icon: "icons/svg/shield.svg",
          changes: [{ key: "system.traits.dr.value", mode: 2, value: dt, priority: 20 }],
        }),
      }])
  ),

  flySpeed: {
    category: "movement", slots: 1, kind: "ae",
    template: aeTemplate({
      name: "Fly Speed",
      icon: "icons/svg/wing.svg",
      changes: [{ key: "system.attributes.movement.fly", mode: 4, value: "@attributes.movement.walk", priority: 20 }],
    }),
  },
  swimSpeed: {
    category: "movement", slots: 1, kind: "ae",
    template: aeTemplate({
      name: "Swim Speed",
      icon: "icons/svg/water.svg",
      changes: [{ key: "system.attributes.movement.swim", mode: 4, value: "@attributes.movement.walk", priority: 20 }],
    }),
  },
  spiderClimb: {
    category: "movement", slots: 1, kind: "ae",
    template: aeTemplate({
      name: "Spider Climb",
      icon: "icons/svg/up.svg",
      changes: [],
    }),
  },
  tremorsense: {
    category: "movement", slots: 1, kind: "ae",
    template: aeTemplate({
      name: "Tremorsense",
      icon: "icons/svg/eye.svg",
      changes: [{ key: "system.attributes.senses.tremorsense", mode: 4, value: "30", priority: 20 }],
    }),
  },

  ...Object.fromEntries(
    // 3-letter codes are dnd5e's `CONFIG.DND5E.skills` keys; the picker showed raw codes
    // (e.g. "Skill Affinity: STE") in v0.1.7. Map to full English names for display.
    // Lookup-table-fallback to `code.toUpperCase()` keeps the picker readable if a future
    // skill key gets added without a matching label entry.
    Object.entries({
      acr: "Acrobatics", ani: "Animal Handling", arc: "Arcana",      ath: "Athletics",
      dec: "Deception",  his: "History",         ins: "Insight",     itm: "Intimidation",
      inv: "Investigation", med: "Medicine",     nat: "Nature",      prc: "Perception",
      prf: "Performance",   per: "Persuasion",   rel: "Religion",    slt: "Sleight of Hand",
      ste: "Stealth",       sur: "Survival",
    }).map(([skill, fullName]) => [`skill_${skill}`, {
      category: "skill", slots: 1, kind: "ae",
      template: aeTemplate({
        name: `Skill Affinity: ${fullName}`,
        icon: "icons/svg/book.svg",
        changes: [{ key: `system.skills.${skill}.value`, mode: 4, value: "1", priority: 20 }],
      }),
    }])
  ),

  telepathicLink: {
    category: "special", slots: 1, kind: "ae",
    template: aeTemplate({
      name: "Telepathic Link",
      icon: "icons/svg/sound.svg",
      changes: [],
    }),
    postApply: async ({ caster, tulpa, castConfig }) => {
      await caster.setFlag(MODULE_ID, "telepathicLink", true);
      await tulpa.setFlag(MODULE_ID,  "telepathicLink", true);
      const { postLinkOpen } = await import("./chat-cards.js");
      await postLinkOpen({ caster, tulpa });
    },
  },
};
