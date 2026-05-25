// Section 4 of the spec — single source of truth for what each modification does.
// Pure data + pure helper functions. No Foundry globals referenced here.

import { PRESETS } from "./animation-presets.js";
import { MODULE_ID, ANCHOR_DURATION_SECONDS, SIZE_TOKEN_SCALE } from "./constants.js";

export const KINDS = ["ae", "item-patch", "item-insert", "aura+marker"];

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
    // damage type to every activity (melee + ranged) so both attack profiles benefit.
    patch: (strike, damageType) => {
      const clone = globalThis.foundry?.utils?.deepClone ?? structuredClone;
      const update = {};
      const activities = strike?.system?.activities ?? {};
      for (const [actId, act] of Object.entries(activities)) {
        const parts = clone(act.damage?.parts ?? []);
        parts.push({
          number: 1,
          denomination: 8,
          bonus: "",
          types: [damageType],
          custom: { enabled: false, formula: "" },
          scaling: { mode: "", number: null, formula: "" },
        });
        update[`system.activities.${actId}.damage.parts`] = parts;
      }
      return update;
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
      return {
        aura: {
          name: "Harrowing Presence (Aura)",
          img: "icons/svg/aura.svg",
          type: "auraeffects.aura",
          changes: [],
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
          },
          flags: { [MODULE_ID]: { auraDC: dc, source: "modification" } },
        },
        markerOnApply: {
          name: "In Harrowing Presence",
          img: "icons/svg/terror.svg",
          changes: [],
          disabled: false,
          transfer: false,
          flags: {
            [MODULE_ID]: { inHarrowingAura: true, auraDC: dc },
          },
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
    ["acr","ani","arc","ath","dec","his","ins","itm","inv","med","nat","prc","prf","per","rel","slt","ste","sur"]
      .map(skill => [`skill_${skill}`, {
        category: "skill", slots: 1, kind: "ae",
        template: aeTemplate({
          name: `Skill Affinity: ${skill.toUpperCase()}`,
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
