# Spell description polish + 404 diagnosis (v0.1.16)

| Field | Value |
|---|---|
| Date | 2026-05-27 |
| Status | Approved (brainstormed and signed off interactively, 2026-05-27) |
| Target release | v0.1.16 (patch — content polish, no module-code change) |
| Touches | `_source/manifest-tulpa-spells/Item.manifest-tulpa.json`, `tests/spell-source.test.mjs`, `CLAUDE.md`, `CHANGELOG.md`, `docs/superpowers/test-plans/2026-05-24-manifest-tulpa-smoke.md` |
| Does NOT touch | any `modules/*.js`, any `scripts/*`, `module.json` (except `version`), CSS, actor source |

## Revision history

| Rev | Date | Note |
|---|---|---|
| 1 | 2026-05-27 | Initial draft. Approved during brainstorming session 2026-05-27. |

## Goals

Three user-facing outcomes:

1. **Diagnose** the `projectile-explosion-light-yellow.webp` 404 that fires when the Tulpa Compendia folder is opened. Code audit established our module ships zero references to that asset path; we want hard evidence of who *is* emitting the request before deciding whether any action is warranted on our side.
2. **Restructure** the spell's `system.description.value` HTML so the long, dense spell reads cleanly in both the spellbook and the compendium browser. Current state: a flat run of 35 `<p>` tags with literal `\r` carriage returns and no semantic structure (no section headers, no lists, no emphasis on modification names).
3. **Populate** `system.description.chat` with a concise two-paragraph summary so the cast chat card no longer dumps the full spell text into the chat log every time the spell is cast.

## Scope

### In scope (v0.1.16)

- 404 diagnostic flow: one-time browser DevTools console snippet (lives in this spec, not in shipped code), with a decision tree for what to do with the finding.
- Hand-edit `_source/manifest-tulpa-spells/Item.manifest-tulpa.json`:
  - Replace `system.description.value` with the structured HTML drafted below (Section 2).
  - Replace `system.description.chat` with the two-paragraph summary drafted below (Section 3).
- Add regression assertions to `tests/spell-source.test.mjs` that lock the new structure (Section 4).
- Extend the CLAUDE.md "Fields locked by tests or the validator" table (Section 5).
- CHANGELOG.md entry under v0.1.16 (Section 6).
- Smoke matrix additions R46–R49 (Section 7).
- Version bump in `module.json` to `0.1.16`, tag, push, let `release.yml` ship.

### Out of scope (explicit)

- Any change to `modules/*.js`. This is content polish, not a behavior change.
- Any new file under `scripts/`. Editing `_source/` is direct and the only sanctioned path; see "Source-tree discipline" in CLAUDE.md and the v0.1.13→v0.1.15 scar.
- Any CSS change. dnd5e's default item-sheet CSS already styles `<table>`, `<h4>`, `<ul>` adequately for both the sheet and the compendium browser.
- Any change to the actor source JSON.
- Maximalist lookup-enricher application (e.g. `[[lookup @prof]]`, `[[lookup @attributes.spelldc]]`, materials cost). Explicitly considered and rejected in favor of restraint that mirrors dnd5e's own 2024 PHB spells; see Decision 3.
- Dynamic injection of the chosen modifications into the chat card. The cast-flow chat card (`modules/chat-cards.js`) already announces the player's chosen mods; we are not duplicating that in the static spell-item chat description.

## Decisions made during brainstorming

### Decision 1 — 404 diagnosis approach

**Chose:** investigative diagnostic snippet (Option B from brainstorming). User wanted concrete evidence rather than dismiss-by-audit, but is explicitly OK with the outcome being "documented finding, no fix" if the source turns out to be another module or Foundry core.

**Rejected:**
- Document-and-dismiss (Option A) — user wanted to *see* the culprit, not just trust the negative audit.
- README breadcrumb (Option C) — was a sub-option; folded into the smoke-report deliverable instead, since the breadcrumb belongs with the smoke evidence.

### Decision 2 — Description structure

**Chose:** Option C from brainstorming — section headers (`<h4>`), bold (`<strong>`) on modification names, bullet lists (`<ul><li>`) for the modification options, and a two-column `<table>` for the stat block ("Its AC equals…", "Its hit point maximum equals…", etc.).

**Rejected:**
- Light formatting (A) — too sparse for a 20+ modification spell.
- Medium formatting (B) — close but loses density on the stat block, which is the part the player checks most frequently at the table.

**Rationale for table over bullet list on the stat block:** the user noted that FoundryVTT isn't used on mobile, so the table's narrow-column fragility is not a concern. At-a-glance density wins. dnd5e's own monster stat blocks use tables for the same reason.

### Decision 3 — Lookup enricher scope

**Chose:** Option A from brainstorming — `[[lookup ...]]{fallback}` enrichers on only two lines, both in the stat-block table:
- AC line: `13 + [[lookup @attributes.spellmod]]{your spellcasting ability modifier} ([[13 + @attributes.spellmod]]{total})`
- HP line: `[[40 + 5 * @details.level]]{40 + 5 × your character level}`

**Rejected:**
- Maximalist (B) — also wrap `proficiency`, `spell save DC`, materials cost. Costs: every enricher path is a fragility surface against future dnd5e schema renames, and the compendium-browser view degrades to the literal `@`-path when the fallback is shorter than the prose.
- Minimalist (C) — no enrichers at all. Loses the AC/HP math savings, which are exactly the two numbers the player has to compute and copy onto the summoned token each cast.

**Rationale:** dnd5e's own 2024 PHB spells (Magic Missile, Scorching Ray, Chromatic Orb) use lookup enrichers *only* for cast-time-derived numbers the player can't quickly compute (dart count from slot level, etc.). Spellcasting modifier and proficiency are written as prose. We mirror that restraint. The two paths chosen (`@attributes.spellmod`, `@details.level`) are already in use elsewhere in our spell (`bonuses.ac` and `bonuses.hp` activity bonuses), so they are verified to resolve in dnd5e 5.2.5 roll data.

**Verified compendium-browser fallback behavior** (dnd5e Enrichers wiki + `module/data/abstract/item-data-model.mjs`): when the item has no parent actor, `[[lookup @path]]{fallback}` renders the fallback string verbatim. So the compendium-browser reader sees clean prose; an actor-parented spellbook shows live numbers.

### Decision 4 — Chat description content

**Chose:** Option B from brainstorming — two-paragraph summary. Covers stat block + cast-time choices in paragraph 1, dismissal triggers in paragraph 2.

**Rejected:**
- One-paragraph minimum (A) — too sparse; loses the dismissal triggers, which are the most-asked-about detail mid-session.
- Reference-card bulleted form (C) — bulleted lists with backticks render as visual clutter in the narrow chat column.

**No enrichers in the chat description.** Chat cards always render with an actor parent, so enrichers *would* resolve, but: the AC/HP enrichers already exist in the full `description.value` (one click away in the chat card), and adding them again here doubles the regression-test surface for a string that should age well across dnd5e versions.

## 1. 404 diagnostic flow

Paste this into Foundry's browser DevTools console (F12 → Console) **before** opening the Tulpa Compendia folder. It instruments both `fetch` and `Image.src` to log every request for the 404 path along with a stack trace pointing at the call site.

```js
(() => {
  const needle = "projectile-explosion-light-yellow";
  const origFetch = window.fetch;
  window.fetch = function (...args) {
    const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
    if (url?.includes(needle)) console.warn("[404-hunt] fetch:", url, new Error().stack);
    return origFetch.apply(this, args);
  };
  const ImgProto = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
  Object.defineProperty(HTMLImageElement.prototype, "src", {
    set(v) { if (v?.includes?.(needle)) console.warn("[404-hunt] Image.src:", v, new Error().stack); return ImgProto.set.call(this, v); },
    get() { return ImgProto.get.call(this); },
  });
  console.log("[404-hunt] installed — reopen the compendium folder to capture");
})();
```

After running it, close and reopen the Tulpa Compendia folder so the compendium browser repaints its icons. The first `[404-hunt]` log line names the offending document and module.

**Decision tree from the result:**

- **If the source is our module** (any file under `_source/`, `packs/`, `modules/`, or `module.json` for our pack) → escalate immediately, treat as a regression, fix in this same v0.1.16 cycle, add an `img`-path lock to the validator.
- **If the source is another module's compendium item or a Foundry-core icon-migration mapping** → document the finding in the v0.1.16 smoke report under R49 "investigated — not us". No code change. Optionally suggest the user file an issue with the responsible module if they care to.
- **If the snippet captures nothing** (the 404 doesn't reproduce on a clean session) → mark R49 as "could not reproduce" with the session details; leave the snippet in this spec for future hunting.

## 2. Full new `system.description.value` HTML

The HTML below is the verbatim replacement string. JSON-escaped (with `\"` for double quotes and `—` etc. via the editor's UTF-8 handling) when written into `_source/manifest-tulpa-spells/Item.manifest-tulpa.json`. No literal `\r` carriage returns. All prose is verbatim from [manifest-tulpa.txt](../../../manifest-tulpa.txt) — only structure is added.

```html
<div class="manifest-tulpa-spell">
<p>You crystallize a fragment of your mental essence into a psychic construct called a Tulpa — a loyal combatant that fights alongside you and shares your magical attunement.</p>
<p>The Tulpa manifests in an unoccupied space that you can see within range. It uses the Tulpa stat block, modified as follows:</p>
<table><tbody>
<tr><th>AC</th><td>13 + [[lookup @attributes.spellmod]]{your spellcasting ability modifier} ([[13 + @attributes.spellmod]]{total})</td></tr>
<tr><th>HP maximum</th><td>[[40 + 5 * @details.level]]{40 + 5 × your character level}</td></tr>
<tr><th>Proficiency bonus</th><td>Equals yours.</td></tr>
<tr><th>Spell attack &amp; save DC</th><td>Equal yours.</td></tr>
<tr><th>STR &amp; CON save proficiencies</th><td>Equal yours.</td></tr>
<tr><th>Manifestation Strike damage</th><td>Force, radiant, or psychic (chosen at cast).</td></tr>
</tbody></table>
<p>The Tulpa is friendly to you and your companions and obeys your commands. In combat, the Tulpa shares your Initiative count, but it takes its turn immediately after yours. If you don't command it, it defends itself but takes no other actions.</p>
<p><strong>Modifications.</strong> When you cast this spell, you shape your Tulpa with modifications chosen from the list below. You have 2 modification slots. Each modification costs the number of slots listed. <em>Size Shift modifications are mutually exclusive — you can choose only one.</em></p>
<h4>Morphic</h4>
<ul>
<li><strong>Reinforced Form</strong> (1 slot). The Tulpa's AC increases by 2.</li>
<li><strong>Vital Surge</strong> (1 slot). The Tulpa's hit point maximum increases by 30.</li>
<li><strong>Unsettling Form</strong> (1 slot). The Tulpa's appearance is deeply disturbing. Creatures that can see it have Disadvantage on saving throws against the Frightened condition.</li>
<li><strong>Size Shift: Small</strong> (1 slot). The Tulpa becomes Small.</li>
<li><strong>Size Shift: Large</strong> (1 slot). The Tulpa becomes Large.</li>
<li><strong>Size Shift: Tiny</strong> (2 slots). The Tulpa becomes Tiny.</li>
<li><strong>Size Shift: Huge</strong> (2 slots). The Tulpa becomes Huge.</li>
<li><strong>Size Shift: Gargantuan</strong> (3 slots). The Tulpa becomes Gargantuan.</li>
</ul>
<h4>Combat</h4>
<ul>
<li><strong>Empowered Strikes</strong> (1 slot). The Tulpa's Manifestation Strike deals an additional 1d8 damage.</li>
<li><strong>Multiattack</strong> (1 slot). When the Tulpa takes the Attack action, it makes two Manifestation Strike attacks instead of one.</li>
<li><strong>Harrowing Presence</strong> (1 slot). The Tulpa radiates dread in a 10-foot aura. At the start of each hostile creature's turn within the aura, that creature must succeed on a Wisdom saving throw against your spell save DC or have the Frightened condition until the start of its next turn.</li>
<li><strong>Relentless</strong> (1 slot). Once per casting of this spell, when the Tulpa would be reduced to 0 hit points, it drops to 1 hit point instead.</li>
</ul>
<h4>Resistance</h4>
<p><strong>Resistance</strong> (1 slot each). The Tulpa gains resistance to one of the following damage types of your choice: acid, bludgeoning, cold, fire, lightning, necrotic, piercing, radiant, slashing, or thunder.</p>
<h4>Movement</h4>
<ul>
<li><strong>Fly Speed</strong> (1 slot). The Tulpa gains a flying speed equal to its walking speed.</li>
<li><strong>Swim Speed</strong> (1 slot). The Tulpa gains a swimming speed equal to its walking speed.</li>
<li><strong>Spider Climb</strong> (1 slot). The Tulpa can climb difficult surfaces, including upside down on ceilings, without an ability check.</li>
<li><strong>Tremorsense</strong> (1 slot). The Tulpa gains tremorsense with a range of 30 feet.</li>
</ul>
<h4>Skill Affinity</h4>
<p><strong>Skill Affinity</strong> (1 slot each). The Tulpa gains proficiency in one skill of your choice: Acrobatics, Animal Handling, Arcana, Athletics, Deception, History, Insight, Intimidation, Investigation, Medicine, Nature, Perception, Performance, Persuasion, Religion, Sleight of Hand, Stealth, or Survival.</p>
<h4>Special</h4>
<ul>
<li><strong>Telepathic Link</strong> (1 slot). You and the Tulpa can communicate telepathically with each other as long as you are on the same plane of existence. You always know the Tulpa's location while this link is active.</li>
</ul>
<p><strong>Using a Higher-Level Spell Slot.</strong> For each spell slot level above 5th used to cast this spell, you gain 1 additional modification slot (maximum 6 slots at 9th level).</p>
</div>
```

**R36 header-lock compliance:** the HTML above contains none of the front-matter header strings (`Level 5 Conjuration`, `Casting Time:`, `Range: 30 feet`, `Components:`, `Duration: 1 Hour`). Verified by inspection. The existing R36 test in `tests/spell-source.test.mjs` continues to pass.

## 3. Full new `system.description.chat` HTML

```html
<p>You manifest a psychic Tulpa as a loyal combatant. The Tulpa uses the Tulpa stat block with AC 13 + your spellcasting ability mod and HP 40 + 5 × your level, sharing your proficiency, spell attack, and save DC. It acts on your initiative count immediately after your turn.</p><p>At cast time, choose a damage type (force, radiant, or psychic) for its Manifestation Strike, and shape it with 2 modifications (+1 per slot level above 5th, max 6). The Tulpa dismisses at 0 HP, on death, when the spell ends, when you recast it, or when you delete its token.</p>
```

**R36 header-lock compliance:** contains none of the header strings. The new assertion in Section 4 extends the R36 check to scan both `description.value` and `description.chat`.

## 4. Regression assertions to add to `tests/spell-source.test.mjs`

The new assertions live in the same file as the existing v0.1.13 silent-regression locks. They lock the *structure* of the new description fields so a future flatten-back to a paragraph wall or wipe of the chat field fails before tag.

Append to `tests/spell-source.test.mjs`:

```js
// --- v0.1.16 description-structure locks ---
// description.value was restructured from a flat <p>-wall into:
//   * a 6-row stat-block table with [[lookup ...]] enrichers on AC and HP
//   * <h4> section headers for the six modification categories
//   * <ul><li><strong>NAME</strong>...</li> bullet lists for the named options
// description.chat was populated with a two-paragraph cast-card summary.
// Each assertion below locks one structural element. If a future edit (or a
// future agent's "let me just regenerate this" rationalization) flattens the
// HTML or wipes the chat field, npm test fails before .github/workflows/release.yml
// can build packs. v0.1.13 silent-regression class extension.

test("spell description.value contains the stat-block table (v0.1.16 structure lock)", () => {
  const v = spell.system?.description?.value ?? "";
  assert.match(v, /<table>/, "description.value must contain the stat-block <table>");
  assert.match(v, /<th>AC<\/th>/, "stat-block table must have an AC row");
  assert.match(v, /<th>HP maximum<\/th>/, "stat-block table must have an HP maximum row");
});

test("spell description.value contains the two scoped lookup enrichers (v0.1.16 enricher lock)", () => {
  const v = spell.system?.description?.value ?? "";
  assert.match(v, /\[\[lookup @attributes\.spellmod\]\]\{your spellcasting ability modifier\}/,
    "AC line must use the @attributes.spellmod lookup with prose fallback");
  assert.match(v, /\[\[13 \+ @attributes\.spellmod\]\]\{total\}/,
    "AC line must compute the total with the {total} fallback");
  assert.match(v, /\[\[40 \+ 5 \* @details\.level\]\]\{40 \+ 5 × your character level\}/,
    "HP line must compute 40 + 5 × @details.level with prose fallback");
});

test("spell description.value contains all six modification-section <h4> headers (v0.1.16 structure lock)", () => {
  const v = spell.system?.description?.value ?? "";
  for (const section of ["Morphic", "Combat", "Resistance", "Movement", "Skill Affinity", "Special"]) {
    assert.match(v, new RegExp(`<h4>${section}<\\/h4>`), `description.value must contain <h4>${section}</h4>`);
  }
});

test("spell description.value bolds a representative sample of modification names (v0.1.16 structure lock)", () => {
  // A spot-check of one mod per section — if these go missing the list-flatten regression has happened.
  const v = spell.system?.description?.value ?? "";
  for (const mod of ["Reinforced Form", "Empowered Strikes", "Fly Speed", "Telepathic Link"]) {
    assert.match(v, new RegExp(`<strong>${mod}<\\/strong>`), `description.value must bold "${mod}"`);
  }
});

test("spell description.chat is populated, brief, and on-topic (v0.1.16 chat-card lock)", () => {
  const c = spell.system?.description?.chat ?? "";
  assert.ok(c.length > 0, "description.chat must not be empty (overrides description.value in cast card)");
  assert.ok(c.length < 1500, `description.chat must stay brief; current length ${c.length} exceeds 1500-char budget`);
  assert.match(c, /Tulpa/, "description.chat must mention the Tulpa");
  assert.match(c, /dismiss/i, "description.chat must cover dismissal triggers (rationale for picking Option B during brainstorming)");
});

test("spell description.chat also avoids the R36 front-matter header strings", () => {
  // R36 originally checked only description.value. v0.1.16 introduces description.chat as a second
  // surface that could regress in the same way; extend the same lock to it.
  const c = spell.system?.description?.chat ?? "";
  for (const needle of HEADER_NEEDLES) {
    assert.ok(!c.includes(needle), `description.chat must not contain header line ${JSON.stringify(needle)}`);
  }
});
```

Note: the HP enricher regex locks the exact shipped fallback string `40 + 5 × your character level`. If an editor auto-corrects the `×` to `x` or similar, the regression fires before tag — which is the intent.

## 5. CLAUDE.md additions

Append the following rows to the "Fields locked by tests or the validator" table in CLAUDE.md, under the Spell side:

| Side | Field | Canonical value | Locked by |
|---|---|---|---|
| Spell | `system.description.value` (table) | contains `<table>`, `<th>AC</th>`, `<th>HP maximum</th>` | tests/spell-source.test.mjs (v0.1.16 structure lock) |
| Spell | `system.description.value` (enrichers) | contains `[[lookup @attributes.spellmod]]{...}` and `[[40 + 5 * @details.level]]{...}` | tests/spell-source.test.mjs (v0.1.16 enricher lock) |
| Spell | `system.description.value` (sections) | contains `<h4>` for Morphic / Combat / Resistance / Movement / Skill Affinity / Special | tests/spell-source.test.mjs (v0.1.16 structure lock) |
| Spell | `system.description.value` (mod names) | `<strong>` on Reinforced Form, Empowered Strikes, Fly Speed, Telepathic Link (sample) | tests/spell-source.test.mjs (v0.1.16 structure lock) |
| Spell | `system.description.chat` | non-empty, < 1500 chars, mentions Tulpa + dismiss; no R36 header strings | tests/spell-source.test.mjs (v0.1.16 chat-card lock) |

Also add a one-line note under "Source-tree discipline" pointing at v0.1.16 as another precedent for "edit `_source/` directly; add a test; never write a generator."

## 6. CHANGELOG entry draft

Under a new `## v0.1.16` section in CHANGELOG.md:

```markdown
## v0.1.16 — 2026-05-XX

### Spell description polish
- Restructure `system.description.value` from a 35-paragraph flat run into a stat-block table, section-headed modification lists, and bold modification names. Prose unchanged from `manifest-tulpa.txt`.
- Scope two lookup enrichers (`@attributes.spellmod` for AC, `40 + 5 * @details.level` for HP) with prose fallbacks so the compendium browser still reads cleanly.
- Populate `system.description.chat` with a two-paragraph cast-card summary so the chat log no longer dumps the full spell text every cast.

### Regression protection
- Add five new structure locks to `tests/spell-source.test.mjs` covering the table, the enricher scope, the six section headers, the bolded mod-name sample, and the chat-description constraints. Extend the R36 header-needles check to also scan `description.chat`.
- Extend the CLAUDE.md field-lock table with the new rows.

### Diagnostics
- Investigated the `projectile-explosion-light-yellow.webp` 404 reported on Tulpa Compendia open. Source: see v0.1.16 smoke report R49.
```

## 7. Smoke matrix additions (`docs/superpowers/test-plans/2026-05-24-manifest-tulpa-smoke.md`)

Add four R-rows to the regression matrix:

| ID | Description | Pass criteria |
|---|---|---|
| R46 | Cast chat card uses the chat description, not the full spell text | After casting Manifest Tulpa, the chat card description box shows the two-paragraph summary (under 1500 chars), not the full description.value HTML. |
| R47 | Spell sheet renders the structured description | Opening the Manifest Tulpa spell from a character's spellbook displays the stat-block as a table, the six modification sections as `<h4>` headers, and named modifications as bulleted bold entries. No literal `\r` artefacts visible. |
| R48 | AC and HP enrichers resolve on actor, fall back in compendium | When the spell is on a character sheet (with a valid spellcasting ability), the stat-block AC row shows `13 + <mod>` numerically and the HP row shows `40 + 5 × <level>` numerically. When opened in the compendium browser (no parent actor), both rows show the prose fallback ("your spellcasting ability modifier", "40 + 5 × your character level") with no raw `@`-path strings visible. |
| R49 | `projectile-explosion-light-yellow.webp` 404 — investigated | Diagnostic snippet from `docs/superpowers/specs/2026-05-27-spell-description-polish-design.md` Section 1 has been run; finding documented in v0.1.16 smoke report. PASS = documented (any of: confirmed not-us / could-not-reproduce / identified-and-actioned). FAIL = capture shows source is our module without an action taken. |

## 8. Release flow

1. Make all edits described above to `_source/manifest-tulpa-spells/Item.manifest-tulpa.json`, `tests/spell-source.test.mjs`, `CLAUDE.md`, `CHANGELOG.md`, and the smoke plan.
2. `npm test` → all assertions including the new v0.1.16 locks must pass.
3. `npm run validate` → existing validator must continue to pass against the new source.
4. `npm run build:packs` → packs rebuild cleanly from `_source/`. Spot-check the built spell document opens correctly in a Foundry V13.351 + dnd5e 5.2.5 world.
5. Smoke-test R46–R49 plus a regression sweep of R1–R45 / A1–A9 in a fresh world.
6. Write the per-version smoke report at `docs/superpowers/test-plans/2026-05-XX-v0.1.16-smoke-report.md`. R49 captures the 404 finding.
7. Bump `module.json` `version` to `0.1.16`.
8. Commit, `git tag v0.1.16 && git push origin v0.1.16` — `.github/workflows/release.yml` does the rest.

## 9. Regression-protection summary (the "don't undo prior work" guarantee)

This work cannot recreate the v0.1.13 silent regression because:

1. **No new file under `scripts/`.** The only sanctioned edit path is direct hand-edit of `_source/`. This is explicit in scope (Section 2) and in the standing CLAUDE.md "Source-tree discipline" order.
2. **`scripts/scrub-source.mjs` remains absent.** The existing assertion in `tests/spell-source.test.mjs:145-150` enforces this; `release.yml` runs tests before validate/build, so a restored scrub script fails before any pack ships.
3. **`scripts/build-packs.mjs` is one-way.** Verified at [scripts/build-packs.mjs](../../../scripts/build-packs.mjs) — reads `_source/`, writes `packs/`, never modifies `_source/`.
4. **The five new structure locks** in Section 4 protect the *new* fields (`description.value` structure, `description.chat` content) the same way the existing v0.1.13 locks protect range / target / materials. Any future flattening, wipe, or "regeneration" that erases the structure fails the test suite.
5. **CLAUDE.md table is extended** so the next agent in this codebase has the locks visible without reading the test file first.

## 10. Risks and open questions

- **Enricher path drift.** If dnd5e 5.X.X renames `@attributes.spellmod` or `@details.level`, the enrichers resolve to `undefined` and the sheet shows broken values. Mitigation: both paths are *currently* used in our own `bonuses.ac` and `bonuses.hp` activity expressions, so a dnd5e rename would break those at the same time and we'd notice via the existing smoke matrix. No additional test added — duplicating that lock here would be busywork.
- **Foundry rich-text editor round-trip.** If a user opens the spell sheet, clicks "edit description", and saves without changes, ProseMirror may normalize the HTML (e.g. self-closing tags, whitespace). Mitigation: the new tests use loose regex matchers on the *presence* of structural elements, not exact-string equality, so ProseMirror round-trips don't break the locks. The user is unlikely to edit the shipped spell description anyway since it's in a module-shipped compendium.
- **Chat-card width vs. table rendering.** The cast chat card is narrower than the spell sheet. The chat description is plain `<p>` text and renders fine; the *full* description (which the user can expand from the chat card) contains the table, which may wrap awkwardly in the chat-card-expanded view. Mitigation: accept as a minor cosmetic; smoke R47 will catch it if it's bad enough to act on.
- **404 outcome is unknown.** R49 is the diagnostic, not the fix. If the snippet identifies our module as the source (unexpected given the audit), we treat that as a v0.1.16 regression and fix in-cycle; design will require a small amendment but not a re-spec.
