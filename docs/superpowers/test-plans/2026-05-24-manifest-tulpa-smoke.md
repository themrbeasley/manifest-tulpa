# Manifest Tulpa — Manual Smoke Test

**Setup:**
1. dnd5e world V13.351 / dnd5e 5.2.5.
2. Required modules enabled: midi-qol, dae, times-up, sequencer, portal-lib, aura-effects ≥1.5.2.
3. Recommended: jb2a_patreon, automated-animations.
4. Install the module from a local build (Foundry → Setup → Install Module → Manifest URL → file path or local-network URL).
5. Create or pick a PC at character level 9+ (so 5th-level slots exist).
6. Drag the spell from the **Manifest Tulpa - Spells** compendium onto the PC.

## Module-load test (verifies Tasks 1, 2)

- Open the browser console. Expected: two log lines `manifest-tulpa | init` and `manifest-tulpa | ready`.

## Cast flow happy path (verifies Tasks 10, 11)

1. Cast Manifest Tulpa at slot 5.
2. Slot dialog appears → submit. Slot is consumed.
3. **Tulpa appears on canvas with base stats** (no AC bonus, no extra HP).
4. Cast dialog opens. Radio shows force/radiant/psychic; checkboxes are grouped by category.
5. Pick **psychic**, **Reinforced Form**, **Vital Surge**. Slot counter shows 2/2. Confirm.
6. Tulpa sheet now shows AC +2 and HP max +30. Manifestation Strike damage type is psychic.
7. Cast confirmation chat card posts.
8. Manifestation animation plays (purple→pink ring) if jb2a_patreon present.

## Modification correctness (verifies Tasks 6–9)

For each pair below, cast → confirm → inspect the Tulpa:

| Mod | Expected |
|---|---|
| Unsettling Form | Tulpa has flags `flags.midi-qol.grants.disadvantage.save.wis = 1` and `.cha = 1` |
| Size Shift: Large | Tulpa sheet says Large; token is 2×2 squares |
| Empowered Strikes | Manifestation Strike has an added 1d8 of the chosen damage type |
| Multiattack | A "Multiattack" feat item is on the Tulpa with the descriptive text |
| Resistance: Fire | Tulpa traits show Damage Resistance: Fire |
| Fly Speed | Tulpa movement: Fly = walking speed |
| Skill Affinity: Stealth | Tulpa is proficient in Stealth |
| Telepathic Link | Chat card "Telepathic Link established"; caster has `flags["manifest-tulpa"].telepathicLink = true` |

## Harrowing Presence (verifies Tasks 8, 14)

1. Cast with **Harrowing Presence** + **psychic**.
2. Place a hostile NPC within 10ft of the Tulpa. Confirm the Aura Effects ring is visible (subtle magenta tint at 0.25 opacity).
3. The NPC should immediately gain a "In Harrowing Presence" marker AE.
4. Start a combat. On the NPC's turn-start, a Wis save roll posts to chat against your spell save DC.
5. On failure: NPC gets `frightened` status; auto-clears at the start of its NEXT turn (times-up).
6. Move the NPC out of range; marker AE disappears within the next aura-effects pulse.

## Shared initiative (verifies Task 12)

1. Cast during active combat. Roll the caster's initiative. Confirm the Tulpa enters the tracker at caster's initiative - 0.01 (directly after).
2. End combat. Cast again. Start combat. Roll initiative. Confirm Tulpa initiative re-aligns.

## Relentless (verifies Task 13)

1. Cast with **Relentless**.
2. Deal damage equal to or exceeding the Tulpa's HP via Midi (auto-apply).
3. Expected: HP clamps to 1 (not 0). Chat card "Relentless triggers" posts. Tulpa's `flags["manifest-tulpa"].relentlessUsed = true`.
4. Repeat damage. Tulpa drops to 0 normally (Relentless does not re-trigger).

## Dismissal triggers (verifies Task 15)

For each, perform the action then verify the anchor AE, the Tulpa token, and a "Tulpa Dismissed" chat card all go away:

| # | Action | Reason in chat |
|---|---|---|
| 1 | Wait 1 hour of game-world time (use `game.time.advance(3600)`) | duration |
| 2 | Deal damage equal to caster HP | zeroHP |
| 3 | Toggle caster dead status | isDeath |
| 4 | Re-cast Manifest Tulpa | recast |
| 5 | Right-click → delete the Tulpa token | manual |

## Session reload (verifies the startup scan in Task 13 / 15)

1. Cast with **Relentless**.
2. Reload the world (refresh the tab).
3. Inflict killing damage on the Tulpa. Expected: HP clamps to 1, Relentless chat posts. (Confirms the watcher was re-armed at `ready`.)

## Failure modes documented in the spec

- `jb2a_patreon` absent → mechanics still work, no manifest/dismiss/Relentless visuals, one console warning per attempt.
- `automated-animations` absent → strikes resolve mechanically, no strike animation.

## Sign-off

Tester: ___________  Date: ___________  Foundry build: ___________  dnd5e version: ___________
