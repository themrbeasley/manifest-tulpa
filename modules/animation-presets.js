// Section 6 of the spec — fixed presets per damage type.
// Asset keys locked against jb2a_patreon (see Section 6 table).
// All values are pure data; no Foundry globals referenced here.

export const PRESETS = {
  force: {
    manifest: {
      asset: "jb2a.magic_signs.circle.02.conjuration.intro.purple",
      scale: 0.8,
      fadeIn: 400,
      fadeOut: 800,
    },
    dismiss: {
      asset: "jb2a.magic_signs.circle.02.conjuration.outro.purple",
      scale: 0.8,
      fadeIn: 200,
      fadeOut: 800,
    },
    strike: { asset: "jb2a.unarmed_strike.magical.purple" },
    impact: { asset: "jb2a.impact.010.purple" },
    auraTint: "#9b4ae0",
  },
  radiant: {
    manifest: {
      asset: "jb2a.magic_signs.circle.02.conjuration.intro.yellow",
      scale: 0.8,
      fadeIn: 400,
      fadeOut: 800,
    },
    dismiss: {
      asset: "jb2a.magic_signs.circle.02.conjuration.outro.yellow",
      scale: 0.8,
      fadeIn: 200,
      fadeOut: 800,
    },
    strike: { asset: "jb2a.unarmed_strike.magical.yellow" },
    impact: { asset: "jb2a.impact.010.yellow" },
    auraTint: "#f0d56a",
  },
  psychic: {
    manifest: {
      asset: "jb2a.magic_signs.circle.02.conjuration.intro.pink",
      scale: 0.8,
      fadeIn: 400,
      fadeOut: 800,
    },
    dismiss: {
      asset: "jb2a.magic_signs.circle.02.conjuration.outro.pink",
      scale: 0.8,
      fadeIn: 200,
      fadeOut: 800,
    },
    strike: { asset: "jb2a.unarmed_strike.magical.pinkpurple" },
    impact: { asset: "jb2a.impact.010.pinkpurple" },
    auraTint: "#d650a8",
  },
};
