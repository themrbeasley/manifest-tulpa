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
};
