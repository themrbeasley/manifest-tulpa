# Manifest Tulpa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a FoundryVTT V13 / dnd5e 5.2.5 module that fully automates the custom 5th-level Conjuration spell "Manifest Tulpa" — cast dialog, summon wiring, modification registry, in-combat behaviors (shared initiative, Harrowing Presence, Relentless), five-trigger dismissal flow, animations, and a tag-driven GitHub release pipeline.

**Architecture:** Plain ES2022 module entry registers all hooks on `ready`. A caster-side anchor Active Effect is the single source of truth for "a Tulpa is live"; deleting it funnels all five dismissal triggers through one handler. Modifications live in an in-memory registry and are inserted at summon time (item-patch → item-insert → batched AEs → aura → postApply hooks). Two compendium packs (Item + Actor) are built from `_source/*.json` via the official Foundry CLI at release time.

**Tech Stack:** FoundryVTT V13.351 client APIs, dnd5e 5.2.5 system, midi-qol, dae, times-up, sequencer, portal-lib, aura-effects 1.5.2+, @foundryvtt/foundryvtt-cli (LevelDB pack builder), Node 20+ built-in test runner (`node --test`), GitHub Actions.

---

## Authoritative references (read before each task)

- Spec: [docs/superpowers/specs/2026-05-24-manifest-tulpa-design.md](../specs/2026-05-24-manifest-tulpa-design.md) — revision 2 approved. Section numbers cited throughout this plan refer to it.
- Spell RAW: [manifest-tulpa.txt](../../../manifest-tulpa.txt) — authoritative spell text; pastes verbatim into `system.description.value`.
- Pre-module world exports (reference material only — these stay at the repo root, never shipped):
  - `fvtt-Actor-tulpa-rfi8EPvTDFduYlW5.json` — source for the actor scrub (Task 16)
  - `fvtt-Item-manifest-tulpa-YwUNZpFtX3dwNQPx.json` — source for the spell scrub (Task 16)
  - `fvtt-ActiveEffect-harrowing-presence.json`, `fvtt-Macro-*.json` — pre-module exploration, not bundled

## Testing strategy

**Unit-testable in Node** (pure data + pure logic, no Foundry globals):
- `modules/animation-presets.js`
- `modules/modification-registry.js`
- `scripts/validate-pack.js`

Run with: `node --test tests/`. No dependency added — uses Node 20+ built-in test runner.

**Not unit-testable** (depend on Foundry globals like `game`, `Hooks`, `Sequencer`, `ChatMessage`, dnd5e/midi-qol APIs):
- All other `modules/*.js`. Verified via the manual smoke-test checklist (Task 20) executed inside a real dnd5e world.

**Discipline:** every task that touches a unit-testable file MUST add a failing test first, then implementation, then green. Tasks that touch only Foundry-bound files document the manual verification steps; do not invent a fake Foundry harness.

## Module ID and namespace

- Foundry module ID: `manifest-tulpa`
- Flag namespace: `flags["manifest-tulpa"]` (see Section 7 item 8 of the spec — the canonical flag map)
- Compendium pack IDs: `manifest-tulpa-spells`, `manifest-tulpa-actors`
- Packed actor UUID (placeholder until the actor is scrubbed and given a stable `_id`): `Compendium.manifest-tulpa.manifest-tulpa-actors.Actor.<tulpa-actor-id>` — Task 16 locks the id.

---

## File Structure

```
manifest-tulpa/
├── module.json                                 # Task 1
├── package.json                                # Task 1
├── README.md                                   # Task 1 (skeleton); finalized Task 20
├── LICENSE                                     # Task 1
├── .gitignore                                  # Task 1 (extends existing)
├── lang/en.json                                # Task 1
├── styles/manifest-tulpa.css                   # Task 1
├── modules/
│   ├── constants.js                            # Task 2 — MODULE_ID, NS, flag keys
│   ├── init.js                                 # Task 2 (shell), wired across Tasks 11–15
│   ├── animation-presets.js                    # Task 3 — PRESETS by damage type
│   ├── animations.js                           # Task 4 — playManifest/playDismiss/playRelentless
│   ├── chat-cards.js                           # Task 5 — 5 named card helpers
│   ├── modification-registry.js                # Tasks 6–9 — MODIFICATIONS map
│   ├── cast-dialog.js                          # Task 10 — ApplicationV2 picker
│   ├── cast-flow.js                            # Task 11 — Phase 1 + Phase 3
│   ├── initiative.js                           # Task 12 — shared-initiative hook
│   ├── relentless-watcher.js                   # Task 13 — preUpdateActor scope + restore
│   ├── harrowing-presence-hook.js              # Task 14 — combatTurnStart save + frightened
│   └── dismiss-flow.js                         # Task 15 — anchor-deletion handler + 5 triggers
├── _source/                                    # Task 16 — git-tracked
│   ├── manifest-tulpa-spells/Item.manifest-tulpa.json
│   └── manifest-tulpa-actors/Actor.tulpa.json
├── packs/                                      # gitignored build output
├── scripts/
│   ├── scrub-source.mjs                        # Task 16 — one-shot source builder
│   └── validate-pack.js                        # Task 17 — pre-release assertions
├── tests/                                      # Tasks 3, 6–9, 17 (Node test runner)
│   ├── animation-presets.test.mjs
│   ├── modification-registry.test.mjs
│   └── validate-pack.test.mjs
├── docs/superpowers/test-plans/
│   └── 2026-05-24-manifest-tulpa-smoke.md      # Task 20 — manual Foundry checklist
└── .github/workflows/release.yml               # Task 19
```

**Responsibility boundaries (one job per file):**
- `constants.js` — string constants only. No logic.
- `init.js` — hook registration + the on-load Relentless rearm scan. Imports everything; almost no logic of its own.
- `animation-presets.js` — pure data table; importable from Node.
- `animations.js` — Sequencer orchestration; wraps every call in try/catch so missing assets never break mechanics.
- `chat-cards.js` — every `ChatMessage.create` lives here; nothing else creates chat messages.
- `modification-registry.js` — pure data + pure helper functions (e.g., `buildAura(caster, dmgType)`); no AE/item creation. Node-importable.
- `cast-dialog.js` — the picker UI. Returns a `{ damageType, modifications }` result; does not write flags or hit the canvas.
- `cast-flow.js` — owns the `dnd5e.postUseActivity` handler. The only file that creates the anchor AE.
- `initiative.js` — owns the `combatStart` hook and the in-cast initiative tweak.
- `relentless-watcher.js` — owns the per-Tulpa `preUpdateActor` hook lifecycle (register/unregister/restore).
- `harrowing-presence-hook.js` — owns the `dnd5e.combatTurnStart` hook for marker-AE-carrying actors.
- `dismiss-flow.js` — owns `deleteActiveEffect` (anchor → dismiss) and `preDeleteToken` (token → anchor delete). The only file that deletes the Tulpa token.
- `scripts/scrub-source.mjs` — reads the world-export JSON at repo root and writes the scrubbed `_source/*.json`. Re-runnable.
- `scripts/validate-pack.js` — reads `_source/*.json`, asserts spec invariants, non-zero exit on failure.

---

## Task 1: Repository scaffolding

**Files:**
- Create: `module.json`
- Create: `package.json`
- Create: `LICENSE` (MIT)
- Create: `README.md` (skeleton)
- Create: `lang/en.json`
- Create: `styles/manifest-tulpa.css`
- Modify: `.gitignore`

- [ ] **Step 1: Write `module.json`**

```json
{
  "id": "manifest-tulpa",
  "title": "Manifest Tulpa",
  "description": "Adds the 5th-level Conjuration spell 'Manifest Tulpa' with full automation: cast dialog, modification picker, summon wiring, in-combat behaviors, and lifecycle management.",
  "version": "0.1.0",
  "authors": [{ "name": "themrbeasley" }],
  "compatibility": { "minimum": "13", "verified": "13.351" },
  "esmodules": ["modules/init.js"],
  "styles": ["styles/manifest-tulpa.css"],
  "languages": [{ "lang": "en", "name": "English", "path": "lang/en.json" }],
  "packs": [
    {
      "name": "manifest-tulpa-spells",
      "label": "Manifest Tulpa - Spells",
      "type": "Item",
      "path": "packs/manifest-tulpa-spells",
      "system": "dnd5e"
    },
    {
      "name": "manifest-tulpa-actors",
      "label": "Manifest Tulpa - Actors",
      "type": "Actor",
      "path": "packs/manifest-tulpa-actors",
      "system": "dnd5e"
    }
  ],
  "relationships": {
    "systems": [
      {
        "id": "dnd5e",
        "type": "system",
        "compatibility": { "minimum": "5.2.5" }
      }
    ],
    "requires": [
      { "id": "midi-qol", "type": "module" },
      { "id": "dae", "type": "module" },
      { "id": "times-up", "type": "module" },
      { "id": "sequencer", "type": "module" },
      { "id": "portal-lib", "type": "module" },
      {
        "id": "aura-effects",
        "type": "module",
        "compatibility": { "minimum": "1.5.2" }
      }
    ],
    "recommends": [
      { "id": "automated-animations", "type": "module" },
      { "id": "jb2a_patreon", "type": "module" }
    ]
  },
  "url": "https://github.com/themrbeasley/manifest-tulpa",
  "manifest": "https://github.com/themrbeasley/manifest-tulpa/releases/latest/download/module.json",
  "download": "https://github.com/themrbeasley/manifest-tulpa/releases/download/v0.1.0/manifest-tulpa.zip"
}
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "manifest-tulpa",
  "private": true,
  "version": "0.1.0",
  "description": "Build tooling for the Manifest Tulpa Foundry module.",
  "type": "module",
  "scripts": {
    "build:packs": "node scripts/build-packs.mjs",
    "scrub": "node scripts/scrub-source.mjs",
    "validate": "node scripts/validate-pack.js",
    "test": "node --test tests/"
  },
  "devDependencies": {
    "@foundryvtt/foundryvtt-cli": "^1.0.4"
  },
  "engines": { "node": ">=20" }
}
```

> Note: `scripts/build-packs.mjs` is created in Task 18. The script entry is added here so the engineer doesn't double back to edit `package.json` later.

- [ ] **Step 3: Extend `.gitignore`**

Append (the existing file already ignores `packs/` and `node_modules/` — do not re-add those lines):

```
# Foundry CLI build cache
.foundryvtt-cli/

# Test output
coverage/
.test-output/
```

- [ ] **Step 4: Write `LICENSE` (MIT)**

```
MIT License

Copyright (c) 2026 themrbeasley

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 5: Write `README.md` (skeleton — finalized Task 20)**

```markdown
# Manifest Tulpa

FoundryVTT V13 / dnd5e 5.2.5 module that automates the custom 5th-level Conjuration spell **Manifest Tulpa**.

## Install

Paste this URL into Foundry's **Install Module** dialog:

```
https://github.com/themrbeasley/manifest-tulpa/releases/latest/download/module.json
```

## Required modules

- dnd5e 5.2.5+
- midi-qol
- dae
- times-up
- sequencer
- portal-lib
- aura-effects 1.5.2+

## Recommended

- automated-animations
- jb2a_patreon

## Development

```bash
npm install
npm test
npm run scrub        # rebuild _source/ from world exports
npm run validate     # pre-release sanity check
npm run build:packs  # convert _source/ → packs/ (LevelDB)
```

Releases are tag-driven: push `vX.Y.Z` to trigger the GitHub Action that builds and publishes.
```

- [ ] **Step 6: Write `lang/en.json`**

```json
{
  "MANIFEST_TULPA": {
    "Dialog": {
      "Title": "Manifest Tulpa — Configure Cast",
      "DamageType": "Damage Type",
      "Force": "Force",
      "Radiant": "Radiant",
      "Psychic": "Psychic",
      "Modifications": "Modifications",
      "SlotsUsed": "Slots used: {used} / {max}",
      "Cancel": "Cancel",
      "Confirm": "Manifest Tulpa",
      "CategoryMorphic": "Morphic",
      "CategoryCombat": "Combat",
      "CategoryResistance": "Resistance",
      "CategoryMovement": "Movement",
      "CategorySkill": "Skill Affinity",
      "CategorySpecial": "Special"
    },
    "Chat": {
      "CastTitle": "Manifest Tulpa",
      "CastSubtitle": "{caster} manifests a Tulpa.",
      "DismissTitle": "Tulpa Dismissed",
      "Reason": {
        "duration": "the spell's duration ended",
        "zeroHP": "the caster fell to 0 HP",
        "isDeath": "the caster died",
        "recast": "the caster recast the spell",
        "manual": "the token was removed manually"
      },
      "Relentless": "{name} stands at 1 HP — Relentless triggers!",
      "LinkOpen": "Telepathic Link established between {caster} and {tulpa}.",
      "CancelWarning": "Cast aborted after slot was spent — restore manually if intended."
    },
    "Effect": {
      "AnchorName": "Manifest Tulpa (active)",
      "AnchorDescription": "Your Manifest Tulpa is active. Right-click and delete this effect to dismiss the Tulpa."
    }
  }
}
```

- [ ] **Step 7: Write `styles/manifest-tulpa.css`**

```css
.manifest-tulpa-dialog .mt-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.25rem 0;
}
.manifest-tulpa-dialog .mt-category {
  font-weight: bold;
  border-bottom: 1px solid var(--color-border-light-tertiary);
  margin-top: 0.5rem;
}
.manifest-tulpa-dialog .mt-slot-counter {
  font-weight: bold;
  text-align: right;
}
.manifest-tulpa-dialog .mt-slot-counter.over {
  color: var(--color-text-hyperlink, red);
}
.manifest-tulpa-dialog input[type="checkbox"]:disabled + label {
  opacity: 0.5;
}
```

- [ ] **Step 8: Commit**

```bash
git add module.json package.json README.md LICENSE lang/en.json styles/manifest-tulpa.css .gitignore
git commit -m "feat: scaffold module manifest, package, license, and i18n shell"
```

- [ ] **Step 9: Install dev deps and verify package**

Run: `npm install`
Expected: succeeds, creates `node_modules/`, `package-lock.json`.

```bash
git add package-lock.json
git commit -m "chore: lock dev dependencies"
```

---

## Task 2: Constants module and init shell

**Files:**
- Create: `modules/constants.js`
- Create: `modules/init.js`

- [ ] **Step 1: Write `modules/constants.js`**

```js
export const MODULE_ID = "manifest-tulpa";
export const NS = `flags.${MODULE_ID}`;

export const ANCHOR_AE_NAME = "Manifest Tulpa (active)";
export const ANCHOR_DURATION_SECONDS = 3600;

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
```

- [ ] **Step 2: Write `modules/init.js` (shell)**

```js
import { MODULE_ID } from "./constants.js";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | init`);
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | ready`);
  // Hook wiring is filled in by Tasks 11–15.
});
```

- [ ] **Step 3: Smoke-test in Foundry**

Manual verification (no Node test): load the module in a dnd5e world with all required modules present. Open the browser dev tools console. Expected: two lines like `manifest-tulpa | init` and `manifest-tulpa | ready` on world load. Document the result in the smoke-test plan (Task 20) — no automated assertion to write yet.

- [ ] **Step 4: Commit**

```bash
git add modules/constants.js modules/init.js
git commit -m "feat: add constants module and init.js entry shell"
```

---

## Task 3: Animation presets

**Files:**
- Create: `modules/animation-presets.js`
- Test: `tests/animation-presets.test.mjs`

- [ ] **Step 1: Write the failing test**

`tests/animation-presets.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { PRESETS } from "../modules/animation-presets.js";

test("has all three damage-type presets", () => {
  assert.deepEqual(Object.keys(PRESETS).sort(), ["force", "psychic", "radiant"]);
});

test("each preset has manifest, dismiss, auraTint", () => {
  for (const [dt, p] of Object.entries(PRESETS)) {
    assert.ok(p.manifest?.asset, `${dt}.manifest.asset missing`);
    assert.ok(p.dismiss?.asset,  `${dt}.dismiss.asset missing`);
    assert.match(p.auraTint, /^#[0-9a-fA-F]{6}$/, `${dt}.auraTint must be #rrggbb`);
  }
});

test("psychic strike uses pinkpurple not plain pink (jb2a has no plain pink unarmed_strike)", () => {
  assert.match(PRESETS.psychic.strike.asset, /pinkpurple/);
});

test("manifest/dismiss assets reference the spec'd jb2a paths", () => {
  assert.equal(PRESETS.force.manifest.asset,   "jb2a.magic_signs.circle.02.conjuration.intro.purple");
  assert.equal(PRESETS.force.dismiss.asset,    "jb2a.magic_signs.circle.02.conjuration.outro.purple");
  assert.equal(PRESETS.radiant.manifest.asset, "jb2a.magic_signs.circle.02.conjuration.intro.yellow");
  assert.equal(PRESETS.radiant.dismiss.asset,  "jb2a.magic_signs.circle.02.conjuration.outro.yellow");
  assert.equal(PRESETS.psychic.manifest.asset, "jb2a.magic_signs.circle.02.conjuration.intro.pink");
  assert.equal(PRESETS.psychic.dismiss.asset,  "jb2a.magic_signs.circle.02.conjuration.outro.pink");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with `Cannot find module '../modules/animation-presets.js'`.

- [ ] **Step 3: Write the minimal implementation**

`modules/animation-presets.js`:

```js
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
    impact: { asset: "jb2a.impact.010.pink" },
    auraTint: "#d650a8",
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: 4 PASS, 0 FAIL.

- [ ] **Step 5: Commit**

```bash
git add modules/animation-presets.js tests/animation-presets.test.mjs
git commit -m "feat: add animation presets and unit tests for damage-type asset keys"
```

---

## Task 4: Animation driver

**Files:**
- Create: `modules/animations.js`

Not unit-testable in Node (depends on `Sequencer` global). Verified in Task 20 smoke test.

- [ ] **Step 1: Write `modules/animations.js`**

```js
import { PRESETS } from "./animation-presets.js";
import { MODULE_ID } from "./constants.js";

function warn(err, label) {
  console.warn(`${MODULE_ID} | animation ${label} failed:`, err);
}

export async function playManifest(token, damageType) {
  if (!globalThis.Sequencer) return;
  const p = PRESETS[damageType];
  if (!p) return;
  try {
    await new Sequence()
      .effect()
        .file(p.manifest.asset)
        .atLocation(token)
        .scaleToObject(p.manifest.scale)
        .fadeIn(p.manifest.fadeIn)
        .fadeOut(p.manifest.fadeOut)
      .play();
  } catch (err) { warn(err, "manifest"); }
}

export async function playDismiss(token, damageType) {
  if (!globalThis.Sequencer) return;
  const p = PRESETS[damageType];
  if (!p) return;
  try {
    await new Sequence()
      .effect()
        .file(p.dismiss.asset)
        .atLocation(token)
        .scaleToObject(p.dismiss.scale)
        .fadeIn(p.dismiss.fadeIn)
        .fadeOut(p.dismiss.fadeOut)
        .waitUntilFinished(-200)
      .play();
  } catch (err) { warn(err, "dismiss"); }
}

export async function playRelentless(token, damageType) {
  if (!globalThis.Sequencer) return;
  const p = PRESETS[damageType];
  if (!p) return;
  try {
    await new Sequence()
      .effect()
        .file(p.impact.asset)
        .atLocation(token)
        .scaleToObject(0.6)
        .fadeIn(150)
        .fadeOut(400)
      .play();
  } catch (err) { warn(err, "relentless"); }
}

export function endAuraEffect(tulpaUuid) {
  if (!globalThis.Sequencer?.EffectManager) return;
  try {
    Sequencer.EffectManager.endEffects({ name: `${MODULE_ID}-aura-${tulpaUuid}` });
  } catch (err) { warn(err, "endAura"); }
}
```

- [ ] **Step 2: Commit**

```bash
git add modules/animations.js
git commit -m "feat: add Sequencer-backed manifest/dismiss/relentless animation driver"
```

---

## Task 5: Chat cards

**Files:**
- Create: `modules/chat-cards.js`

Not unit-testable in Node (depends on `ChatMessage`, `game.i18n`). Verified in Task 20 smoke test.

- [ ] **Step 1: Write `modules/chat-cards.js`**

```js
import { MODULE_ID } from "./constants.js";

function speakerFor(actor) {
  return ChatMessage.getSpeaker(actor ? { actor } : {});
}

function i18n(key, data = {}) {
  return game.i18n.format(key, data);
}

export async function postCast({ caster, tulpa, castConfig }) {
  const mods = castConfig.modifications.join(", ") || "—";
  const content = `
    <div class="manifest-tulpa-chat-card">
      <h3>${i18n("MANIFEST_TULPA.Chat.CastTitle")}</h3>
      <p>${i18n("MANIFEST_TULPA.Chat.CastSubtitle", { caster: caster.name })}</p>
      <p><strong>Damage:</strong> ${castConfig.damageType} &nbsp;
         <strong>Slot:</strong> ${castConfig.slotLevel}</p>
      <p><strong>Modifications:</strong> ${mods}</p>
    </div>`;
  return ChatMessage.create({ speaker: speakerFor(caster), content });
}

export async function postLinkOpen({ caster, tulpa }) {
  const content = `<p>${i18n("MANIFEST_TULPA.Chat.LinkOpen",
    { caster: caster.name, tulpa: tulpa.name })}</p>`;
  return ChatMessage.create({ speaker: speakerFor(caster), content });
}

export async function postRelentless({ tulpa }) {
  const content = `<p>${i18n("MANIFEST_TULPA.Chat.Relentless", { name: tulpa.name })}</p>`;
  return ChatMessage.create({ speaker: speakerFor(tulpa), content });
}

export async function postDismiss({ caster, tulpa, reason }) {
  const reasonText = i18n(`MANIFEST_TULPA.Chat.Reason.${reason}`) || reason;
  const content = `
    <div class="manifest-tulpa-chat-card">
      <h3>${i18n("MANIFEST_TULPA.Chat.DismissTitle")}</h3>
      <p>${tulpa?.name ?? "The Tulpa"} fades — ${reasonText}.</p>
    </div>`;
  return ChatMessage.create({ speaker: speakerFor(caster), content });
}

export async function postWarning({ message }) {
  return ChatMessage.create({
    speaker: speakerFor(),
    whisper: ChatMessage.getWhisperRecipients("GM"),
    content: `<p><strong>${MODULE_ID}:</strong> ${message}</p>`,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add modules/chat-cards.js
git commit -m "feat: add chat-card helpers (cast/dismiss/relentless/link/warning)"
```

---

## Task 6: Modification registry — skeleton + non-size morphic mods

**Files:**
- Create: `modules/modification-registry.js`
- Test: `tests/modification-registry.test.mjs`

- [ ] **Step 1: Write the failing test**

`tests/modification-registry.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { MODIFICATIONS, KINDS } from "../modules/modification-registry.js";

test("KINDS enumerates the four kinds documented in the spec", () => {
  assert.deepEqual(KINDS.sort(), ["ae", "aura+marker", "item-insert", "item-patch"]);
});

test("every entry has category, slots (positive int), kind, and a payload matching its kind", () => {
  for (const [slug, m] of Object.entries(MODIFICATIONS)) {
    assert.ok(m.category, `${slug} missing category`);
    assert.ok(Number.isInteger(m.slots) && m.slots > 0, `${slug} has invalid slots`);
    assert.ok(KINDS.includes(m.kind), `${slug} has unknown kind ${m.kind}`);
    if (m.kind === "ae")          assert.ok(m.template, `${slug} kind=ae missing template`);
    if (m.kind === "item-patch")  assert.equal(typeof m.patch, "function", `${slug} kind=item-patch missing patch fn`);
    if (m.kind === "item-insert") assert.ok(m.item, `${slug} kind=item-insert missing item`);
    if (m.kind === "aura+marker") assert.equal(typeof m.build, "function", `${slug} kind=aura+marker missing build fn`);
  }
});

test("reinforcedForm adds +2 to system.attributes.ac.flat with ADD mode (2)", () => {
  const m = MODIFICATIONS.reinforcedForm;
  assert.equal(m.kind, "ae");
  assert.equal(m.slots, 1);
  const change = m.template.changes[0];
  assert.equal(change.key, "system.attributes.ac.flat");
  assert.equal(change.mode, 2);
  assert.equal(change.value, "2");
});

test("vitalSurge bumps both hp.max and hp.value by 30 (heals on apply)", () => {
  const m = MODIFICATIONS.vitalSurge;
  const keys = m.template.changes.map(c => c.key).sort();
  assert.deepEqual(keys, ["system.attributes.hp.max", "system.attributes.hp.value"]);
  for (const c of m.template.changes) {
    assert.equal(c.mode, 2);
    assert.equal(c.value, "30");
  }
});

test("unsettlingForm grants disadvantage on Wis and Cha saves via midi-qol flag changes", () => {
  const m = MODIFICATIONS.unsettlingForm;
  const keys = m.template.changes.map(c => c.key).sort();
  assert.deepEqual(keys, [
    "flags.midi-qol.grants.disadvantage.save.cha",
    "flags.midi-qol.grants.disadvantage.save.wis",
  ]);
  for (const c of m.template.changes) assert.equal(c.value, "1");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with `Cannot find module '../modules/modification-registry.js'`.

- [ ] **Step 3: Write the minimal implementation**

`modules/modification-registry.js`:

```js
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
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/modification-registry.js tests/modification-registry.test.mjs
git commit -m "feat: add modification registry skeleton with morphic non-size mods"
```

---

## Task 7: Registry — size shifts

**Files:**
- Modify: `modules/modification-registry.js`
- Modify: `tests/modification-registry.test.mjs`

- [ ] **Step 1: Add failing tests**

Append to `tests/modification-registry.test.mjs`:

```js
test("size shifts share the mutually-exclusive group 'sizeShift'", () => {
  const sizes = ["sizeShift_tiny","sizeShift_small","sizeShift_large","sizeShift_huge","sizeShift_gargantuan"];
  for (const slug of sizes) {
    assert.equal(MODIFICATIONS[slug].mutuallyExclusive, "sizeShift", `${slug} missing mutuallyExclusive`);
  }
});

test("size shift slot costs match the spell text", () => {
  assert.equal(MODIFICATIONS.sizeShift_small.slots,      1);
  assert.equal(MODIFICATIONS.sizeShift_large.slots,      1);
  assert.equal(MODIFICATIONS.sizeShift_tiny.slots,       2);
  assert.equal(MODIFICATIONS.sizeShift_huge.slots,       2);
  assert.equal(MODIFICATIONS.sizeShift_gargantuan.slots, 3);
});

test("size shifts carry a tokenSize for the imperative resize at apply time", () => {
  assert.deepEqual(MODIFICATIONS.sizeShift_tiny.tokenSize,       { width: 0.5, height: 0.5 });
  assert.deepEqual(MODIFICATIONS.sizeShift_small.tokenSize,      { width: 1,   height: 1   });
  assert.deepEqual(MODIFICATIONS.sizeShift_large.tokenSize,      { width: 2,   height: 2   });
  assert.deepEqual(MODIFICATIONS.sizeShift_huge.tokenSize,       { width: 3,   height: 3   });
  assert.deepEqual(MODIFICATIONS.sizeShift_gargantuan.tokenSize, { width: 4,   height: 4   });
});

test("each size shift OVERRIDEs system.traits.size with the correct dnd5e size code", () => {
  const cases = [
    ["sizeShift_tiny",       "tiny"],
    ["sizeShift_small",      "sm"],
    ["sizeShift_large",      "lg"],
    ["sizeShift_huge",       "huge"],
    ["sizeShift_gargantuan", "grg"],
  ];
  for (const [slug, sizeCode] of cases) {
    const c = MODIFICATIONS[slug].template.changes.find(x => x.key === "system.traits.size");
    assert.ok(c, `${slug} missing size change`);
    assert.equal(c.mode, 5);
    assert.equal(c.value, sizeCode);
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL (size entries don't exist yet).

- [ ] **Step 3: Add size-shift entries to the registry**

Inside `MODIFICATIONS` (after `unsettlingForm`, before the closing brace) add:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: 9 PASS total.

- [ ] **Step 5: Commit**

```bash
git add modules/modification-registry.js tests/modification-registry.test.mjs
git commit -m "feat(registry): add size-shift modifications with mutex group and token resize"
```

---

## Task 8: Registry — combat mods (empoweredStrikes, multiattack, harrowingPresence, relentless)

**Files:**
- Modify: `modules/modification-registry.js`
- Modify: `tests/modification-registry.test.mjs`

- [ ] **Step 1: Add failing tests**

Append to `tests/modification-registry.test.mjs`:

```js
test("empoweredStrikes patches a strike item to add 1d8 of the chosen damage type", () => {
  const m = MODIFICATIONS.empoweredStrikes;
  assert.equal(m.kind, "item-patch");
  const update = m.patch({
    system: { damage: { parts: [{ number: 1, denomination: 8, types: ["force"] }] } },
  }, "psychic");
  // The patch must return a diff that adds a new damage part with 1d8 psychic.
  const newParts = update["system.damage.parts"] ?? update.system?.damage?.parts;
  assert.ok(Array.isArray(newParts) && newParts.length >= 2, "expected an added 1d8 part");
  const added = newParts.find(p => p.number === 1 && p.denomination === 8 && (p.types ?? []).includes("psychic"));
  assert.ok(added, "1d8 psychic part missing");
});

test("multiattack inserts a feat item the player triggers manually", () => {
  const m = MODIFICATIONS.multiattack;
  assert.equal(m.kind, "item-insert");
  assert.equal(m.item.type, "feat");
  assert.equal(m.item.name, "Multiattack");
  assert.match(m.item.system.description.value, /two Manifestation Strike/);
});

test("harrowingPresence.build returns aura + markerOnApply with caster spell save DC baked in", () => {
  const m = MODIFICATIONS.harrowingPresence;
  assert.equal(m.kind, "aura+marker");
  const fakeCaster = { system: { attributes: { spell: { dc: 17 } } }, name: "Vex" };
  const built = m.build(fakeCaster, "psychic");
  assert.equal(built.aura.type, "auraeffects.aura");
  assert.equal(built.aura.system.distanceFormula, "10");
  assert.equal(built.aura.system.disposition, -1);
  assert.equal(built.aura.system.applyToSelf, false);
  assert.equal(built.aura.system.showRadius, true);
  assert.equal(built.aura.system.script, "true");
  // The marker payload that Aura Effects will stamp onto in-range hostiles:
  assert.equal(built.markerOnApply.flags["manifest-tulpa"].inHarrowingAura, true);
  assert.equal(built.markerOnApply.flags["manifest-tulpa"].auraDC, 17);
});

test("relentless is a marker-only AE (no system changes) with the slug-visible name", () => {
  const m = MODIFICATIONS.relentless;
  assert.equal(m.kind, "ae");
  assert.deepEqual(m.template.changes, []);
  assert.equal(m.template.name, "Relentless");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL (entries don't exist).

- [ ] **Step 3: Add the combat entries**

Add these inside `MODIFICATIONS`:

```js
  empoweredStrikes: {
    category: "combat", slots: 1, kind: "item-patch",
    patch: (strike, damageType) => {
      const parts = foundry?.utils?.deepClone
        ? foundry.utils.deepClone(strike.system.damage.parts)
        : structuredClone(strike.system.damage.parts);
      parts.push({ number: 1, denomination: 8, bonus: "", types: [damageType], custom: { enabled: false, formula: "" }, scaling: { mode: "", number: null, formula: "" } });
      return { "system.damage.parts": parts };
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: 13 PASS total.

- [ ] **Step 5: Commit**

```bash
git add modules/modification-registry.js tests/modification-registry.test.mjs
git commit -m "feat(registry): add combat mods (empowered/multiattack/harrowing/relentless)"
```

---

## Task 9: Registry — resistances, movement, skills, telepathicLink

**Files:**
- Modify: `modules/modification-registry.js`
- Modify: `tests/modification-registry.test.mjs`

- [ ] **Step 1: Add failing tests**

Append:

```js
test("ten resistance entries — one per spell-text damage type", () => {
  const expected = ["acid","bludgeoning","cold","fire","lightning","necrotic","piercing","radiant","slashing","thunder"];
  for (const dt of expected) {
    const slug = `resistance_${dt}`;
    assert.ok(MODIFICATIONS[slug], `${slug} missing`);
    const c = MODIFICATIONS[slug].template.changes[0];
    assert.equal(c.key, "system.traits.dr.value");
    assert.equal(c.mode, 2);
    assert.equal(c.value, dt);
  }
});

test("movement entries UPGRADE the appropriate movement key", () => {
  assert.equal(MODIFICATIONS.flySpeed.template.changes[0].key,  "system.attributes.movement.fly");
  assert.equal(MODIFICATIONS.flySpeed.template.changes[0].mode, 4);
  assert.equal(MODIFICATIONS.flySpeed.template.changes[0].value, "@attributes.movement.walk");
  assert.equal(MODIFICATIONS.swimSpeed.template.changes[0].key, "system.attributes.movement.swim");
  assert.equal(MODIFICATIONS.tremorsense.template.changes[0].key,   "system.attributes.senses.tremorsense");
  assert.equal(MODIFICATIONS.tremorsense.template.changes[0].mode,  4);
  assert.equal(MODIFICATIONS.tremorsense.template.changes[0].value, "30");
  assert.ok(MODIFICATIONS.spiderClimb, "spiderClimb entry exists");
});

test("eighteen skill entries — one per dnd5e skill key", () => {
  const SKILLS = ["acr","ani","arc","ath","dec","his","ins","itm","inv","med","nat","prc","prf","per","rel","slt","ste","sur"];
  for (const skill of SKILLS) {
    const slug = `skill_${skill}`;
    assert.ok(MODIFICATIONS[slug], `${slug} missing`);
    const c = MODIFICATIONS[slug].template.changes[0];
    assert.equal(c.key, `system.skills.${skill}.value`);
    assert.equal(c.mode, 4);
    assert.equal(c.value, "1");
  }
});

test("telepathicLink is an AE with a postApply hook", () => {
  const m = MODIFICATIONS.telepathicLink;
  assert.equal(m.kind, "ae");
  assert.equal(typeof m.postApply, "function");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`. Expected: FAIL.

- [ ] **Step 3: Add the bulk entries**

Inside `MODIFICATIONS`, after `relentless`, append (the loops keep the source compact while expanding to ~40 keyed entries):

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`. Expected: 17 PASS total. Total registry entries ≈ 40 — matches the spec.

- [ ] **Step 5: Commit**

```bash
git add modules/modification-registry.js tests/modification-registry.test.mjs
git commit -m "feat(registry): add resistances, movement, skills, and telepathic link"
```

---

## Task 10: Cast dialog

**Files:**
- Create: `modules/cast-dialog.js`

Not unit-testable in Node (extends `foundry.applications.api.ApplicationV2`). Verified in Task 20 smoke test.

- [ ] **Step 1: Write `modules/cast-dialog.js`**

```js
import { MODIFICATIONS } from "./modification-registry.js";
import { MODULE_ID, DAMAGE_TYPES } from "./constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const CATEGORY_LABEL = {
  morphic: "MANIFEST_TULPA.Dialog.CategoryMorphic",
  combat:  "MANIFEST_TULPA.Dialog.CategoryCombat",
  resistance: "MANIFEST_TULPA.Dialog.CategoryResistance",
  movement:   "MANIFEST_TULPA.Dialog.CategoryMovement",
  skill:      "MANIFEST_TULPA.Dialog.CategorySkill",
  special:    "MANIFEST_TULPA.Dialog.CategorySpecial",
};

/**
 * @returns Promise<{damageType, modifications: string[]} | null>  resolves to null on cancel
 */
export function openCastDialog({ availableSlots }) {
  return new Promise(resolve => {
    new ManifestTulpaCastDialog({ availableSlots, resolve }).render(true);
  });
}

class ManifestTulpaCastDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "manifest-tulpa-cast-dialog",
    classes: ["manifest-tulpa-dialog"],
    tag: "form",
    window: { title: "MANIFEST_TULPA.Dialog.Title", contentClasses: ["standard-form"] },
    position: { width: 480, height: "auto" },
    form: { handler: ManifestTulpaCastDialog.#onSubmit, closeOnSubmit: true },
    actions: { cancel: ManifestTulpaCastDialog.#onCancel },
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/cast-dialog.hbs` },
  };

  constructor({ availableSlots, resolve }) {
    super({});
    this.availableSlots = availableSlots;
    this.resolve = resolve;
    this.selected = new Set();
    this.damageType = "force";
    this._resolved = false;
  }

  async _prepareContext() {
    const grouped = {};
    for (const [slug, m] of Object.entries(MODIFICATIONS)) {
      (grouped[m.category] ??= []).push({ slug, ...m });
    }
    const used = this._slotsUsed();
    return {
      damageTypes: DAMAGE_TYPES,
      damageType: this.damageType,
      grouped,
      categories: Object.keys(grouped).map(k => ({ key: k, label: CATEGORY_LABEL[k] ?? k })),
      slotsUsed: used,
      slotsMax: this.availableSlots,
      overBudget: used > this.availableSlots,
    };
  }

  _slotsUsed() {
    let n = 0;
    for (const slug of this.selected) n += MODIFICATIONS[slug]?.slots ?? 0;
    return n;
  }

  _attachPartListeners(_partId, htmlElement) {
    htmlElement.querySelectorAll("input[name='damageType']").forEach(el =>
      el.addEventListener("change", ev => { this.damageType = ev.currentTarget.value; })
    );
    htmlElement.querySelectorAll("input[type='checkbox'][data-slug]").forEach(el =>
      el.addEventListener("change", ev => this._onToggle(ev))
    );
  }

  _onToggle(event) {
    const slug = event.currentTarget.dataset.slug;
    const m = MODIFICATIONS[slug];
    if (!m) return;
    if (event.currentTarget.checked) {
      // Enforce mutually-exclusive size shifts.
      if (m.mutuallyExclusive) {
        for (const other of [...this.selected]) {
          if (MODIFICATIONS[other]?.mutuallyExclusive === m.mutuallyExclusive) this.selected.delete(other);
        }
      }
      this.selected.add(slug);
    } else {
      this.selected.delete(slug);
    }
    this.render();
  }

  static async #onSubmit(event, form, formData) {
    const used = this._slotsUsed();
    if (used > this.availableSlots) {
      ui.notifications.error(`Over budget: ${used} / ${this.availableSlots}`);
      return false;
    }
    this._resolved = true;
    this.resolve({ damageType: this.damageType, modifications: [...this.selected] });
  }

  static #onCancel() {
    this._resolved = true;
    this.resolve(null);
    return this.close();
  }

  async close(options) {
    if (!this._resolved) {
      this._resolved = true;
      this.resolve(null);
    }
    return super.close(options);
  }
}
```

- [ ] **Step 2: Write `templates/cast-dialog.hbs`**

```handlebars
<section>
  <fieldset>
    <legend>{{localize "MANIFEST_TULPA.Dialog.DamageType"}}</legend>
    {{#each damageTypes}}
      <label class="mt-row">
        <input type="radio" name="damageType" value="{{this}}" {{#if (eq this ../damageType)}}checked{{/if}}>
        {{localize (concat "MANIFEST_TULPA.Dialog." (capitalize this))}}
      </label>
    {{/each}}
  </fieldset>

  <fieldset>
    <legend>{{localize "MANIFEST_TULPA.Dialog.Modifications"}}</legend>
    {{#each categories}}
      <div class="mt-category">{{localize this.label}}</div>
      {{#each (lookup ../grouped this.key)}}
        <label class="mt-row">
          <input type="checkbox" data-slug="{{this.slug}}"
                 {{#if (in this.slug ../../selected)}}checked{{/if}}>
          <span>{{this.slug}}</span>
          <span>({{this.slots}})</span>
        </label>
      {{/each}}
    {{/each}}
  </fieldset>

  <div class="mt-slot-counter {{#if overBudget}}over{{/if}}">
    {{localize "MANIFEST_TULPA.Dialog.SlotsUsed" used=slotsUsed max=slotsMax}}
  </div>
</section>

<footer class="form-footer">
  <button type="button" data-action="cancel">{{localize "MANIFEST_TULPA.Dialog.Cancel"}}</button>
  <button type="submit" {{#if overBudget}}disabled{{/if}}>{{localize "MANIFEST_TULPA.Dialog.Confirm"}}</button>
</footer>
```

> Note: `eq`, `concat`, `capitalize`, `in` helpers are provided by Handlebars built-ins / Foundry. If any helper is missing in your Foundry build, replace with literal logic — verify during Task 20 smoke test.

- [ ] **Step 3: Commit**

```bash
git add modules/cast-dialog.js templates/cast-dialog.hbs
git commit -m "feat: add ManifestTulpaCastDialog with damage-type + mod picker"
```

---

## Task 11: Cast flow (Phase 1 + Phase 3)

**Files:**
- Create: `modules/cast-flow.js`
- Modify: `modules/init.js`

Not unit-testable in Node. Verified in Task 20 smoke test.

- [ ] **Step 1: Write `modules/cast-flow.js`**

```js
import { MODIFICATIONS } from "./modification-registry.js";
import { MODULE_ID, NS, ANCHOR_AE_NAME, ANCHOR_DURATION_SECONDS } from "./constants.js";
import { openCastDialog } from "./cast-dialog.js";
import { postCast, postWarning } from "./chat-cards.js";
import { playManifest } from "./animations.js";

const SPELL_IDENTIFIER = "manifest-tulpa";

/**
 * dnd5e.postUseActivity hook handler — Phase 1 + Phase 3 in one entry point.
 * Phase 2 (the actual summon) is dnd5e's native flow and has already run by now.
 */
export async function onPostUseActivity(activity, usageConfig, results) {
  if (activity?.type !== "summon") return;
  if (activity.item?.system?.identifier !== SPELL_IDENTIFIER &&
      activity.item?.name !== "Manifest Tulpa") return;

  const caster = activity.item.actor;
  if (!caster) return;

  // ---- Phase 1: pre-cast dialog ----
  const slotLevel = parseSlotLevel(usageConfig);
  const availableSlots = Math.min(6, 2 + Math.max(0, slotLevel - 5));

  // Trigger #4 — if a previous anchor exists, delete it first (dismisses the previous Tulpa).
  const previous = caster.effects.find(e => e.getFlag(MODULE_ID, "tulpaUuid"));
  if (previous) await previous.delete();

  const selection = await openCastDialog({ availableSlots });
  if (!selection) {
    await postWarning({ message: game.i18n.localize("MANIFEST_TULPA.Chat.CancelWarning") });
    return;
  }

  const castConfig = { ...selection, slotLevel };

  // Defensive slot-budget check (matches Section 4 step "Defensive: refuse if over").
  const used = selection.modifications.reduce((n, s) => n + (MODIFICATIONS[s]?.slots ?? 0), 0);
  if (used > availableSlots) {
    await postWarning({ message: `castConfig over budget (${used}/${availableSlots}) — aborting.` });
    return;
  }

  // ---- Phase 3: apply mods to the just-summoned Tulpa ----
  const token = locateSummonedTulpa(results, caster);
  if (!token) {
    await postWarning({ message: "Summon produced no token — check the spell's summon activity." });
    return;
  }
  const tulpa = token.actor;

  // Step 2: damage type on the Manifestation Strike.
  await setStrikeDamageType(tulpa, castConfig.damageType);

  // Step 3: apply modifications in spec order.
  await applyModifications(tulpa, caster, castConfig);

  // Step 4: caster-side anchor AE.
  await createAnchorAE(caster, tulpa, castConfig);

  // Step 5: Relentless watcher (registered by Task 13 module).
  if (castConfig.modifications.includes("relentless")) {
    const { armRelentlessWatcher } = await import("./relentless-watcher.js");
    armRelentlessWatcher(tulpa.uuid, castConfig.damageType);
  }

  // Step 6: shared initiative.
  if (game.combat) {
    const { alignTulpaInitiative } = await import("./initiative.js");
    await alignTulpaInitiative(game.combat, caster, tulpa);
  }

  // Step 7: animation.
  await playManifest(token, castConfig.damageType);

  // Step 8: cast confirmation card.
  await postCast({ caster, tulpa, castConfig });
}

function parseSlotLevel(usageConfig) {
  const raw = usageConfig?.spell?.slot;
  if (typeof raw === "string") {
    const m = /spell(\d+)/.exec(raw);
    if (m) return Number(m[1]);
  }
  if (typeof usageConfig?.scaling === "number") return 5 + usageConfig.scaling;
  return 5;
}

function locateSummonedTulpa(results, caster) {
  const created = results?.createdTokens?.[0];
  if (created) return created;
  // Fallback: most recently created token whose summon.origin is this caster.
  const candidates = canvas.tokens.placeables
    .filter(t => t.actor?.getFlag?.("dnd5e", "summon")?.origin === caster.uuid);
  candidates.sort((a, b) => (b.document._stats?.createdTime ?? 0) - (a.document._stats?.createdTime ?? 0));
  return candidates[0] ?? null;
}

async function setStrikeDamageType(tulpa, damageType) {
  const strike = tulpa.items.find(i => i.name === "Manifestation Strike");
  if (!strike) return;
  const parts = foundry.utils.deepClone(strike.system.damage?.parts ?? []);
  if (!parts.length) return;
  parts[0].types = [damageType];
  await strike.update({ "system.damage.parts": parts });
}

async function applyModifications(tulpa, caster, castConfig) {
  const chosen = castConfig.modifications.map(s => ({ slug: s, ...MODIFICATIONS[s] })).filter(m => m.kind);

  // 1: item patches (so AEs see the final strike shape).
  for (const m of chosen.filter(x => x.kind === "item-patch")) {
    const strike = tulpa.items.find(i => i.name === "Manifestation Strike");
    if (!strike) continue;
    const update = m.patch(strike, castConfig.damageType);
    await strike.update(update);
  }

  // 2: item inserts.
  const insertedItems = chosen.filter(x => x.kind === "item-insert").map(x => x.item);
  if (insertedItems.length) await tulpa.createEmbeddedDocuments("Item", insertedItems);

  // 3: AE-only mods (single batched insert).
  const aes = chosen.filter(x => x.kind === "ae").map(x => x.template);
  if (aes.length) await tulpa.createEmbeddedDocuments("ActiveEffect", aes);

  // 3b: token resize for size shifts (V13 doesn't auto-resize from a size-trait AE).
  for (const m of chosen.filter(x => x.tokenSize)) {
    const tokenDoc = tulpa.token ?? tulpa.getActiveTokens()[0]?.document;
    if (tokenDoc) await tokenDoc.update(m.tokenSize);
  }

  // 4: aura+marker (Harrowing Presence).
  const auraMods = chosen.filter(x => x.kind === "aura+marker");
  for (const m of auraMods) {
    const { aura } = m.build(caster, castConfig.damageType);
    await tulpa.createEmbeddedDocuments("ActiveEffect", [aura]);
  }

  // 5: postApply hooks.
  for (const m of chosen) {
    if (typeof m.postApply === "function") {
      await m.postApply({ caster, tulpa, castConfig });
    }
  }
}

async function createAnchorAE(caster, tulpa, castConfig) {
  await caster.createEmbeddedDocuments("ActiveEffect", [{
    name: ANCHOR_AE_NAME,
    img: caster.items.find(i => i.system?.identifier === SPELL_IDENTIFIER)?.img
         ?? "icons/svg/crystal.svg",
    duration: { seconds: ANCHOR_DURATION_SECONDS },
    changes: [],
    transfer: false,
    description: game.i18n.localize("MANIFEST_TULPA.Effect.AnchorDescription"),
    flags: {
      [MODULE_ID]: { tulpaUuid: tulpa.uuid, castConfig },
      dae: { specialDuration: ["zeroHP", "isDeath"], showIcon: false },
    },
  }]);
}
```

- [ ] **Step 2: Wire into `modules/init.js`**

Replace the `ready` block in `modules/init.js`:

```js
import { MODULE_ID } from "./constants.js";
import { onPostUseActivity } from "./cast-flow.js";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | init`);
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | ready`);
  Hooks.on("dnd5e.postUseActivity", onPostUseActivity);
});
```

- [ ] **Step 3: Commit**

```bash
git add modules/cast-flow.js modules/init.js
git commit -m "feat: wire cast flow (Phase 1 dialog + Phase 3 mod application + anchor AE)"
```

---

## Task 12: Initiative

**Files:**
- Create: `modules/initiative.js`
- Modify: `modules/init.js`

Not unit-testable in Node. Verified in Task 20 smoke test.

- [ ] **Step 1: Write `modules/initiative.js`**

```js
import { MODULE_ID } from "./constants.js";

/**
 * Aligns a single Tulpa combatant to its summoner's initiative - 0.01.
 * Idempotent — re-aligns if combat re-starts mid-cast.
 */
export async function alignTulpaInitiative(combat, caster, tulpa) {
  const casterCombatant = combat.combatants.find(c => c.actorId === caster.id);
  const tulpaCombatant  = combat.combatants.find(c => c.actorId === tulpa.id);
  if (!casterCombatant || !tulpaCombatant) return;
  if (casterCombatant.initiative == null) return;
  const target = casterCombatant.initiative - 0.01;
  if (tulpaCombatant.initiative === target) return;
  await tulpaCombatant.update({ initiative: target });
}

/**
 * combatStart hook — re-align every summoned Tulpa whose summoner is in this combat.
 * Handles the "combat starts after the cast" path.
 */
export function onCombatStart(combat) {
  for (const tCombatant of combat.combatants) {
    const tulpa = tCombatant.actor;
    if (!tulpa) continue;
    const summon = tulpa.getFlag?.("dnd5e", "summon");
    if (!summon?.origin) continue;
    const caster = fromUuidSync(summon.origin);
    if (!caster?.id) continue;
    const cCombatant = combat.combatants.find(c => c.actorId === caster.id);
    if (!cCombatant) continue;
    if (cCombatant.initiative == null) continue;
    tCombatant.update({ initiative: cCombatant.initiative - 0.01 });
  }
  console.debug(`${MODULE_ID} | initiative re-aligned at combatStart`);
}
```

- [ ] **Step 2: Wire into `modules/init.js`**

Add to the `ready` block, after the `postUseActivity` registration:

```js
import { onCombatStart } from "./initiative.js";
// ... inside the ready handler:
  Hooks.on("combatStart", onCombatStart);
```

(Keep the existing imports above and add `onCombatStart` to the imports.)

- [ ] **Step 3: Commit**

```bash
git add modules/initiative.js modules/init.js
git commit -m "feat: add shared-initiative alignment hook"
```

---

## Task 13: Relentless watcher

**Files:**
- Create: `modules/relentless-watcher.js`
- Modify: `modules/init.js`

Not unit-testable in Node. Verified in Task 20 smoke test.

- [ ] **Step 1: Write `modules/relentless-watcher.js`**

```js
import { MODULE_ID } from "./constants.js";
import { postRelentless } from "./chat-cards.js";
import { playRelentless } from "./animations.js";

const watchers = new Map(); // tulpaUuid -> hook id

export function armRelentlessWatcher(tulpaUuid, damageType) {
  if (watchers.has(tulpaUuid)) return;
  const id = Hooks.on("preUpdateActor", async (actor, changes) => {
    if (actor.uuid !== tulpaUuid) return;
    const newHp = foundry.utils.getProperty(changes, "system.attributes.hp.value");
    if (newHp == null || newHp > 0) return;
    if (actor.getFlag(MODULE_ID, "relentlessUsed")) return;

    foundry.utils.setProperty(changes, "system.attributes.hp.value", 1);
    await actor.setFlag(MODULE_ID, "relentlessUsed", true);
    unarmRelentlessWatcher(tulpaUuid);

    await postRelentless({ tulpa: actor });
    const token = actor.getActiveTokens()[0];
    if (token) await playRelentless(token, damageType);
  });
  watchers.set(tulpaUuid, id);
  console.debug(`${MODULE_ID} | relentless armed for ${tulpaUuid}`);
}

export function unarmRelentlessWatcher(tulpaUuid) {
  const id = watchers.get(tulpaUuid);
  if (id == null) return;
  Hooks.off("preUpdateActor", id);
  watchers.delete(tulpaUuid);
}

/** Restore watchers at world load for any active anchor that includes 'relentless'. */
export async function restoreRelentlessWatchers() {
  for (const caster of game.actors) {
    const anchor = caster.effects.find(e => e.getFlag(MODULE_ID, "tulpaUuid"));
    if (!anchor) continue;
    const cfg = anchor.getFlag(MODULE_ID, "castConfig");
    if (!cfg?.modifications?.includes("relentless")) continue;
    const tulpa = await fromUuid(cfg.tulpaUuid ?? anchor.getFlag(MODULE_ID, "tulpaUuid"));
    if (!tulpa) continue;
    if (tulpa.getFlag?.(MODULE_ID, "relentlessUsed")) continue;
    armRelentlessWatcher(tulpa.uuid, cfg.damageType);
  }
}
```

- [ ] **Step 2: Wire restore into `modules/init.js`**

Add to `ready` (after the other hook registrations):

```js
import { restoreRelentlessWatchers } from "./relentless-watcher.js";
// ... inside the ready handler:
  await restoreRelentlessWatchers();
```

(Convert `Hooks.once("ready", ...)` callback to `async`.)

- [ ] **Step 3: Commit**

```bash
git add modules/relentless-watcher.js modules/init.js
git commit -m "feat: add Relentless watcher with reload-time restore"
```

---

## Task 14: Harrowing Presence combat-turn hook

**Files:**
- Create: `modules/harrowing-presence-hook.js`
- Modify: `modules/init.js`

Not unit-testable in Node. Verified in Task 20 smoke test.

- [ ] **Step 1: Write `modules/harrowing-presence-hook.js`**

```js
import { MODULE_ID } from "./constants.js";

/**
 * dnd5e.combatTurnStart — if the actor whose turn is starting carries an inHarrowingAura
 * marker AE, roll a Wis save vs the carried DC; on failure, apply 'frightened' with
 * specialDuration: ["turnStart"] so DAE/times-up auto-clears it next turn.
 */
export async function onCombatTurnStart(actor /*, combat, combatant */) {
  if (!actor) return;
  const marker = actor.effects.find(e => e.getFlag?.(MODULE_ID, "inHarrowingAura"));
  if (!marker) return;
  const dc = marker.getFlag(MODULE_ID, "auraDC");
  if (!Number.isFinite(dc)) return;

  const roll = await actor.rollSavingThrow({ ability: "wis", target: dc });
  if (!roll || roll.total >= dc) return;

  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: "Frightened (Harrowing Presence)",
    img: "icons/svg/terror.svg",
    statuses: ["frightened"],
    changes: [],
    transfer: false,
    duration: { rounds: 1 },
    flags: {
      dae: { specialDuration: ["turnStart"] },
      [MODULE_ID]: { fromHarrowingPresence: true },
    },
  }]);
}
```

- [ ] **Step 2: Wire into `modules/init.js`**

Add to ready:

```js
import { onCombatTurnStart } from "./harrowing-presence-hook.js";
// ... inside ready:
  Hooks.on("dnd5e.combatTurnStart", onCombatTurnStart);
```

- [ ] **Step 3: Commit**

```bash
git add modules/harrowing-presence-hook.js modules/init.js
git commit -m "feat: add Harrowing Presence combat-turn save hook"
```

---

## Task 15: Dismiss flow + all five triggers + startup scan

**Files:**
- Create: `modules/dismiss-flow.js`
- Modify: `modules/init.js`

Not unit-testable in Node. Verified in Task 20 smoke test.

- [ ] **Step 1: Write `modules/dismiss-flow.js`**

```js
import { MODULE_ID } from "./constants.js";
import { postDismiss } from "./chat-cards.js";
import { playDismiss, endAuraEffect } from "./animations.js";
import { unarmRelentlessWatcher } from "./relentless-watcher.js";

/**
 * deleteActiveEffect hook — fires when the caster-side anchor AE is removed for any reason.
 * This is the single funnel for all five dismissal triggers (see Section 5).
 */
export async function onDeleteActiveEffect(effect /*, options, userId */) {
  const tulpaUuid = effect.getFlag?.(MODULE_ID, "tulpaUuid");
  if (!tulpaUuid) return; // only anchors carry this flag
  const castConfig = effect.getFlag(MODULE_ID, "castConfig") ?? {};
  const caster = effect.parent;
  const tulpa = await fromUuid(tulpaUuid);

  const reason = inferReason(effect);

  // Tear down in-memory watchers first.
  unarmRelentlessWatcher(tulpaUuid);
  endAuraEffect(tulpaUuid);

  // If the token is still on the canvas, play the dismissal animation then delete it.
  const token = tulpa?.getActiveTokens()[0];
  if (token) {
    if (castConfig.damageType) await playDismiss(token, castConfig.damageType);
    try { await token.document.delete(); }
    catch (err) { console.warn(`${MODULE_ID} | token delete failed:`, err); }
  }

  await postDismiss({ caster, tulpa, reason });
}

/**
 * preDeleteToken hook — trigger #5: when a GM manually deletes the Tulpa token,
 * find the summoner's matching anchor AE and delete it (which re-enters the funnel above).
 */
export async function onPreDeleteToken(tokenDoc) {
  const summonOrigin = tokenDoc.actor?.getFlag?.("dnd5e", "summon")?.origin;
  if (!summonOrigin) return;
  const caster = await fromUuid(summonOrigin);
  if (!caster) return;
  const anchor = caster.effects.find(e => e.getFlag(MODULE_ID, "tulpaUuid") === tokenDoc.actor.uuid);
  if (!anchor) return;
  // Tag the anchor so the deleteActiveEffect handler reports the right reason.
  await anchor.setFlag(MODULE_ID, "dismissReason", "manual");
  await anchor.delete();
}

function inferReason(effect) {
  const tagged = effect.getFlag?.(MODULE_ID, "dismissReason");
  if (tagged) return tagged;
  // DAE specialDuration triggers stamp flags.dae.disabled or similar at delete time;
  // without a reliable signal we fall back to 'duration'.
  return "duration";
}
```

- [ ] **Step 2: Wire into `modules/init.js`**

Final `modules/init.js` (replace entirely):

```js
import { MODULE_ID } from "./constants.js";
import { onPostUseActivity } from "./cast-flow.js";
import { onCombatStart } from "./initiative.js";
import { restoreRelentlessWatchers } from "./relentless-watcher.js";
import { onCombatTurnStart } from "./harrowing-presence-hook.js";
import { onDeleteActiveEffect, onPreDeleteToken } from "./dismiss-flow.js";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | init`);
});

Hooks.once("ready", async () => {
  console.log(`${MODULE_ID} | ready`);
  Hooks.on("dnd5e.postUseActivity",  onPostUseActivity);
  Hooks.on("dnd5e.combatTurnStart",  onCombatTurnStart);
  Hooks.on("combatStart",            onCombatStart);
  Hooks.on("deleteActiveEffect",     onDeleteActiveEffect);
  Hooks.on("preDeleteToken",         onPreDeleteToken);
  await restoreRelentlessWatchers();
});
```

- [ ] **Step 3: Commit**

```bash
git add modules/dismiss-flow.js modules/init.js
git commit -m "feat: add single-funnel dismiss flow + 5 triggers + startup scan wiring"
```

---

## Task 16: Compendium asset scrub (source build)

**Files:**
- Create: `scripts/scrub-source.mjs`
- Create: `_source/manifest-tulpa-spells/Item.manifest-tulpa.json` (generated)
- Create: `_source/manifest-tulpa-actors/Actor.tulpa.json` (generated)

The scrub script transforms the world-export JSON at repo root into shipable source JSON. Re-runnable — never hand-edit the `_source/` output; always re-run `npm run scrub` if the upstream world export changes.

- [ ] **Step 1: Write `scripts/scrub-source.mjs`**

```js
#!/usr/bin/env node
// Reads fvtt-* exports at repo root, strips world-only flags and modification
// content, fills in the spell description, and writes scrubbed JSON into _source/.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ACTOR_SRC = resolve(ROOT, "fvtt-Actor-tulpa-rfi8EPvTDFduYlW5.json");
const SPELL_SRC = resolve(ROOT, "fvtt-Item-manifest-tulpa-YwUNZpFtX3dwNQPx.json");
const SPELL_TXT = resolve(ROOT, "manifest-tulpa.txt");
const ACTOR_OUT = resolve(ROOT, "_source/manifest-tulpa-actors/Actor.tulpa.json");
const SPELL_OUT = resolve(ROOT, "_source/manifest-tulpa-spells/Item.manifest-tulpa.json");

const WORLD_FLAGS = ["activity-macro", "LocknKey", "scene-packer", "exportSource"];
const STATS_DROP = ["lastModifiedBy", "createdTime", "modifiedTime", "compendiumSource", "duplicateSource", "exportSource"];

// Names of items that survive the scrub (everything else is a modification artifact).
const KEEP_ITEM_NAMES = new Set([
  "Manifestation Strike",
  "Manifestation Strike (Melee)",
  "Manifestation Strike (Ranged)",
  "Tether",
]);

// Stable packed actor _id — used by the spell's summon profile UUID after scrub.
const PACKED_ACTOR_ID = "manifesttulpa0001";

function stripFlags(doc) {
  for (const k of WORLD_FLAGS) delete doc.flags?.[k];
  for (const k of STATS_DROP) delete doc._stats?.[k];
}

function clean(doc) {
  stripFlags(doc);
  // Recursive: clean nested effects/items so their _stats and world flags also vanish.
  for (const e of doc.effects ?? []) stripFlags(e);
  for (const i of doc.items   ?? []) {
    stripFlags(i);
    for (const e of i.effects ?? []) stripFlags(e);
    for (const a of Object.values(i.system?.activities ?? {})) stripFlags(a);
  }
}

function scrubActor() {
  const a = JSON.parse(readFileSync(ACTOR_SRC, "utf8"));
  // Lock the actor _id so the spell can reference it deterministically.
  a._id = PACKED_ACTOR_ID;

  // Drop ALL effects (every effect on the export is a modification).
  a.effects = [];

  // Keep only base-statblock items.
  a.items = (a.items ?? []).filter(i => KEEP_ITEM_NAMES.has(i.name));

  // Reset Manifestation Strike damage to a placeholder for in-module rewrite.
  for (const it of a.items) {
    if (!/^Manifestation Strike/.test(it.name)) continue;
    for (const act of Object.values(it.system?.activities ?? {})) {
      for (const part of act.damage?.parts ?? []) part.types = ["bludgeoning"]; // placeholder
    }
    delete it.flags?.ActiveAuras;
  }

  // Drop Harrowing-Presence-related world flags if present anywhere on the doc.
  delete a.flags?.ActiveAuras;

  clean(a);
  mkdirSync(dirname(ACTOR_OUT), { recursive: true });
  writeFileSync(ACTOR_OUT, JSON.stringify(a, null, 2) + "\n", "utf8");
  console.log(`wrote ${ACTOR_OUT}`);
}

function scrubSpell() {
  const s = JSON.parse(readFileSync(SPELL_SRC, "utf8"));
  s._id = "manifesttulpaspell";

  // Pull RAW spell text in.
  const raw = readFileSync(SPELL_TXT, "utf8");
  s.system ??= {};
  s.system.description ??= {};
  s.system.description.value = `<div class="manifest-tulpa-spell">${raw
    .split("\n")
    .map(line => line.trim() ? `<p>${escapeHtml(line)}</p>` : "")
    .join("")}</div>`;

  // Point the summon activity's profile UUID at the packed actor.
  for (const act of Object.values(s.system.activities ?? {})) {
    if (act.type !== "summon") continue;
    for (const p of act.profiles ?? []) {
      p.uuid = `Compendium.manifest-tulpa.manifest-tulpa-actors.Actor.${PACKED_ACTOR_ID}`;
    }
    // Confirm consumption.scaling.allowed is false (the validator also checks).
    act.consumption ??= {};
    act.consumption.scaling ??= {};
    act.consumption.scaling.allowed = false;
  }

  // Set a stable identifier so the cast-flow handler can match the spell.
  s.system.identifier = "manifest-tulpa";
  s.system.source ??= {};
  s.system.source.rules ??= "2024";

  clean(s);
  mkdirSync(dirname(SPELL_OUT), { recursive: true });
  writeFileSync(SPELL_OUT, JSON.stringify(s, null, 2) + "\n", "utf8");
  console.log(`wrote ${SPELL_OUT}`);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
}

scrubActor();
scrubSpell();
```

- [ ] **Step 2: Run the scrub**

Run: `npm run scrub`
Expected: writes `_source/manifest-tulpa-actors/Actor.tulpa.json` and `_source/manifest-tulpa-spells/Item.manifest-tulpa.json`.

- [ ] **Step 3: Inspect outputs**

Open both files. Verify:
- Actor `effects` is `[]`.
- Actor `items` contains only the names in `KEEP_ITEM_NAMES` (Tether, Manifestation Strike + sub-activities). No "Multiattack", "Harrowing Presence", etc.
- Actor `flags.scene-packer`, `flags.LocknKey`, `flags["activity-macro"]`, `flags.exportSource`, `flags.ActiveAuras` all absent.
- Spell `system.description.value` is non-empty and contains the spell text.
- Spell summon profile UUID matches `Compendium.manifest-tulpa.manifest-tulpa-actors.Actor.manifesttulpa0001`.
- Spell `system.consumption.scaling.allowed` is `false`.

If anything is wrong, fix the script and re-run. Do not hand-edit the `_source/` JSON.

- [ ] **Step 4: Commit**

```bash
git add scripts/scrub-source.mjs _source/
git commit -m "feat: add source-scrub script and generated _source/ JSON for both packs"
```

---

## Task 17: Pre-release validation script

**Files:**
- Create: `scripts/validate-pack.js`
- Test: `tests/validate-pack.test.mjs`

- [ ] **Step 1: Write failing test**

`tests/validate-pack.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAll } from "../scripts/validate-pack.js";

test("validateAll passes on the scrubbed source", async () => {
  const { ok, errors } = await validateAll();
  assert.equal(ok, true, `expected pass, got errors: ${JSON.stringify(errors, null, 2)}`);
});

test("validateAll fails when actor has stray world-export flag (injected fixture)", async () => {
  const { ok, errors } = await validateAll({
    actorMutator: doc => { doc.flags = { ...doc.flags, "scene-packer": { hash: "x" } }; },
  });
  assert.equal(ok, false);
  assert.ok(errors.some(e => /scene-packer/.test(e)));
});

test("validateAll fails when spell description is empty", async () => {
  const { ok, errors } = await validateAll({
    spellMutator: doc => { doc.system.description.value = ""; },
  });
  assert.equal(ok, false);
  assert.ok(errors.some(e => /description/.test(e)));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`. Expected: FAIL (`scripts/validate-pack.js` missing).

- [ ] **Step 3: Write `scripts/validate-pack.js`**

```js
#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ACTOR_PATH = resolve(ROOT, "_source/manifest-tulpa-actors/Actor.tulpa.json");
const SPELL_PATH = resolve(ROOT, "_source/manifest-tulpa-spells/Item.manifest-tulpa.json");

const WORLD_FLAGS = ["activity-macro", "LocknKey", "scene-packer", "exportSource"];
const KEEP_ITEM_NAMES = new Set([
  "Manifestation Strike",
  "Manifestation Strike (Melee)",
  "Manifestation Strike (Ranged)",
  "Tether",
]);

function readJSON(p) { return JSON.parse(readFileSync(p, "utf8")); }

export async function validateAll({ actorMutator, spellMutator } = {}) {
  const errors = [];
  const actor = readJSON(ACTOR_PATH);
  const spell = readJSON(SPELL_PATH);
  if (actorMutator) actorMutator(actor);
  if (spellMutator) spellMutator(spell);

  // Actor checks
  if ((actor.effects ?? []).length !== 0) errors.push(`actor.effects must be empty (has ${actor.effects.length})`);
  for (const i of actor.items ?? []) {
    if (!KEEP_ITEM_NAMES.has(i.name)) errors.push(`actor.items contains unexpected item: ${i.name}`);
  }
  if (actor.flags?.ActiveAuras) errors.push(`actor.flags.ActiveAuras must be absent`);
  for (const f of WORLD_FLAGS) {
    if (actor.flags?.[f]) errors.push(`actor.flags.${f} must be absent`);
  }
  for (const it of actor.items ?? []) {
    if (!/^Manifestation Strike/.test(it.name)) continue;
    for (const act of Object.values(it.system?.activities ?? {})) {
      for (const p of act.damage?.parts ?? []) {
        if ((p.types ?? []).some(t => ["force","radiant","psychic"].includes(t))) {
          errors.push(`Manifestation Strike damage type must be a placeholder, not a final type`);
        }
      }
    }
  }

  // Spell checks
  for (const f of WORLD_FLAGS) {
    if (spell.flags?.[f]) errors.push(`spell.flags.${f} must be absent`);
  }
  if (!spell.system?.description?.value) errors.push(`spell.system.description.value must be non-empty`);
  for (const act of Object.values(spell.system?.activities ?? {})) {
    if (act.type !== "summon") continue;
    for (const p of act.profiles ?? []) {
      if (!/^Compendium\.manifest-tulpa\.manifest-tulpa-actors\.Actor\./.test(p.uuid)) {
        errors.push(`summon profile uuid must point to packed actor, got: ${p.uuid}`);
      }
    }
    if (act.consumption?.scaling?.allowed !== false) {
      errors.push(`summon consumption.scaling.allowed must be false`);
    }
  }

  return { ok: errors.length === 0, errors };
}

// CLI entry: when run directly, non-zero exit on failure.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, errors } = await validateAll();
  if (!ok) {
    console.error("Validation failed:");
    for (const e of errors) console.error("  -", e);
    process.exit(1);
  }
  console.log("Validation passed.");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`. Expected: all 3 new tests PASS, plus all earlier registry/preset tests.

Also run: `npm run validate`. Expected: prints `Validation passed.` and exits 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-pack.js tests/validate-pack.test.mjs
git commit -m "feat: add pre-release validation script with positive + injection tests"
```

---

## Task 18: Pack build script

**Files:**
- Create: `scripts/build-packs.mjs`

- [ ] **Step 1: Write `scripts/build-packs.mjs`**

```js
#!/usr/bin/env node
// Wraps the official Foundry CLI to convert _source/<pack>/*.json into LevelDB packs/<pack>.
import { spawnSync } from "node:child_process";
import { rmSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKS = ["manifest-tulpa-spells", "manifest-tulpa-actors"];

function run(args) {
  const r = spawnSync("npx", ["-y", "@foundryvtt/foundryvtt-cli", ...args], { stdio: "inherit", cwd: ROOT, shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

for (const pack of PACKS) {
  const out = resolve(ROOT, "packs", pack);
  if (existsSync(out)) rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  run(["package", "pack", pack, "--in", `_source/${pack}`, "--out", `packs/${pack}`]);
}

console.log("All packs built.");
```

- [ ] **Step 2: Build once locally to confirm**

Run: `npm run build:packs`
Expected: creates `packs/manifest-tulpa-spells/` and `packs/manifest-tulpa-actors/` with LevelDB files. (These are gitignored.)

- [ ] **Step 3: Commit**

```bash
git add scripts/build-packs.mjs
git commit -m "feat: add Foundry-CLI wrapper to build LevelDB packs from _source/"
```

---

## Task 19: GitHub Actions release workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: Release

on:
  push:
    tags: ["v*"]

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install
        run: npm ci

      - name: Derive version from tag
        id: ver
        run: echo "version=${GITHUB_REF_NAME#v}" >> "$GITHUB_OUTPUT"

      - name: Rewrite module.json (version + download URL)
        env:
          VERSION: ${{ steps.ver.outputs.version }}
          REPO: ${{ github.repository }}
        run: |
          node -e "
            const fs = require('node:fs');
            const m = JSON.parse(fs.readFileSync('module.json','utf8'));
            m.version = process.env.VERSION;
            m.download = 'https://github.com/' + process.env.REPO +
                         '/releases/download/v' + process.env.VERSION + '/manifest-tulpa.zip';
            fs.writeFileSync('module.json', JSON.stringify(m, null, 2) + '\n');
          "

      - name: Build packs
        run: npm run build:packs

      - name: Validate
        run: npm run validate

      - name: Unit tests
        run: npm test

      - name: Zip module bundle
        run: |
          zip -r manifest-tulpa.zip \
            module.json LICENSE README.md \
            modules/ styles/ lang/ templates/ packs/ \
            -x "packs/**/.gitkeep"

      - name: Publish release
        uses: softprops/action-gh-release@v2
        with:
          name: ${{ github.ref_name }}
          tag_name: ${{ github.ref_name }}
          files: |
            manifest-tulpa.zip
            module.json
          fail_on_unmatched_files: true
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add tag-driven release workflow (build, validate, test, publish)"
```

---

## Task 20: Manual smoke-test plan + README finalization

**Files:**
- Create: `docs/superpowers/test-plans/2026-05-24-manifest-tulpa-smoke.md`
- Modify: `README.md`

This task does not write JS. It documents the end-to-end test the user runs inside a real Foundry world to gain confidence the wiring is correct. The smoke checklist is the verification gate for every non-unit-testable module.

- [ ] **Step 1: Write the smoke test plan**

`docs/superpowers/test-plans/2026-05-24-manifest-tulpa-smoke.md`:

```markdown
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
```

- [ ] **Step 2: Finalize README**

Append to `README.md`:

```markdown
## How it works

- Cast Manifest Tulpa from the character sheet. The default dnd5e slot dialog runs first.
- After the slot is chosen, the module's modification picker opens (damage type + mods).
- The Tulpa summons via dnd5e's native summon flow (Portal placement), then modifications apply.
- A "Manifest Tulpa (active)" effect appears on the caster — right-click it to dismiss manually.
- The Tulpa is automatically dismissed when any of these happen: 1-hour duration expires, caster hits 0 HP, caster dies, caster re-casts the spell, or the Tulpa token is removed.

## Module architecture

See [docs/superpowers/specs/2026-05-24-manifest-tulpa-design.md](docs/superpowers/specs/2026-05-24-manifest-tulpa-design.md) for the full design.

## Testing

```bash
npm test                                    # Node unit tests (registry, presets, validation)
```

Manual smoke test plan (run in a Foundry world before releasing):

[docs/superpowers/test-plans/2026-05-24-manifest-tulpa-smoke.md](docs/superpowers/test-plans/2026-05-24-manifest-tulpa-smoke.md)
```

- [ ] **Step 3: Execute the smoke test plan**

Walk through every item in the smoke plan inside a real Foundry world. **Do not mark this task complete until every item passes.** Any failure → file a bug, fix the relevant module, re-run the affected section.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/test-plans/2026-05-24-manifest-tulpa-smoke.md README.md
git commit -m "docs: add smoke-test plan and finalize README"
```

- [ ] **Step 5: Tag a pre-release for end-to-end pipeline verification**

```bash
git tag v0.1.0-rc1
git push origin v0.1.0-rc1
```

Watch the GitHub Action. Expected: green run, `manifest-tulpa.zip` + `module.json` published as release assets. Install from the rc URL in a fresh Foundry test world and re-run the smoke checklist.

If green, drop `-rc1`:

```bash
git tag v0.1.0
git push origin v0.1.0
```

---

## Spec coverage map (self-review)

| Spec section / requirement | Plan task(s) |
|---|---|
| Dependencies + module.json shape (§1) | Task 1 |
| Compendium pack distribution (§1) | Task 1, Task 16, Task 18 |
| Anchor AE schema and lifecycle (§2) | Task 11 (creation), Task 15 (deletion funnel) |
| Phase 1 — postUseActivity dialog (§3) | Task 10, Task 11 |
| Phase 2 — dnd5e native summon (§3) | Inherent to dnd5e; verified Task 20 |
| Phase 3 — apply mods + anchor (§3) | Task 11 |
| Compendium asset scrub (§3) | Task 16 |
| Modification registry shape (§4) | Tasks 6–9 |
| All 30+ specific mods (§4 table) | Tasks 6–9 |
| Slot-budget validation, both UI and defensive (§4) | Task 10 (UI), Task 11 (defensive) |
| Five dismissal triggers (§5) | Task 15 (handler + preDeleteToken + recast in Task 11) |
| Dismissal handler steps (§5) | Task 15 |
| Session-reload Relentless re-arm (§5) | Task 13 |
| Race conditions (§5) | Single funnel — Task 15 |
| Animation presets + driver (§6) | Tasks 3, 4 |
| Manifestation Strike via AA (§6) | Task 16 sets damage type; AA reads it at runtime |
| Harrowing Presence ring + dismiss cleanup (§6) | Task 8 (`showRadius`), Task 15 (`endAuraEffect`) |
| Relentless flash (§6) | Task 13 |
| Module-not-present handling (§6) | Task 4 (try/catch + capability checks) |
| Shared initiative (§7.1) | Task 12 |
| Relentless watcher (§7.2) | Task 13 |
| Telepathic Link (§7.3) | Task 9 (`postApply`) |
| Prototype-token disposition + size (§7.4) | Tasks 7, 11 (size resize); disposition is dnd5e built-in (no code) |
| Anchor AE display details (§7.5) | Task 11 (`showIcon: false`, description) |
| Chat cards (§7.6) | Task 5 |
| Harrowing Presence combat-turn hook (§7.7) | Task 14 |
| Flag namespace map (§7.8) | Followed throughout — `flags["manifest-tulpa"]` only |
| Things this design does not need (§7.9) | Honored — no sheet filter macro, no `modEnabled` flag, no macros bundled |
| Repository layout (§8) | Tasks 1, 11–15, 16, 17, 18, 19 |
| `module.json` essentials (§8) | Task 1 |
| Pack building (§8) | Task 18 |
| GitHub Actions release workflow (§8) | Task 19 |
| Pre-release validation script (§8) | Task 17 |
| Versioning policy + install URL (§8) | Task 1 (URLs), Task 19 (semver from tag) |
| Known gaps (out-of-scope items) | Documented, not implemented — matches spec |

## Out-of-scope items intentionally NOT in this plan (matches spec §"Known gaps")

- Caster delay/ready re-shifting Tulpa initiative.
- Non-damage unconscious dismissing the Tulpa.
- `/tulpa <message>` whisper command.
- Languages beyond `en.json`.
- Frightened-target-tag system to fully match RAW Unsettling Form.
- Foundry-side Multiattack enforcement.
