// Section 6 of the spec — fixed presets per damage type.
// Asset keys locked against jb2a_patreon 0.8.7 (verified live via Sequencer.Database).
// All values are pure data; no Foundry globals referenced here.
//
// v0.1.17 (smoke Bug #8): impacts use the base `jb2a.impact.<color>` family. The prior
// `jb2a.impact.010.<color>` keys pointed at single numbered impact #10, which jb2a ships
// in only 5 colors [blue,green,orange,purple,red] — yellow & pinkpurple never existed and
// crashed playRelentless with an unhandled `baseTexture` rejection. Strikes use the
// colorless `jb2a.unarmed_strike.magical` (the `.<color>` strike variants don't exist).
// tests/animation-presets.test.mjs bans `.impact.010.` forever to kill this bug class.

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
    strike: { asset: "jb2a.unarmed_strike.magical" },
    impact: { asset: "jb2a.impact.purple" },
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
    strike: { asset: "jb2a.unarmed_strike.magical" },
    impact: { asset: "jb2a.impact.yellow" },
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
    strike: { asset: "jb2a.unarmed_strike.magical" },
    impact: { asset: "jb2a.impact.pinkpurple" },
    auraTint: "#d650a8",
  },
};
