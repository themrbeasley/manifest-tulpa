# Spell description polish + 404 diagnosis (v0.1.16) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v0.1.16 — restructure the Manifest Tulpa spell's `system.description.value` HTML (stat-block table, section headers, bold modification names, two scoped lookup enrichers), populate `system.description.chat` with a two-paragraph cast-card summary, lock all five new fields with regression assertions, and document the 404 diagnostic procedure.

**Architecture:** Hand-edit two leaves of `_source/manifest-tulpa-spells/Item.manifest-tulpa.json` (the spell's `system.description.value` and `system.description.chat`). Append five new structure-lock tests + one R36-extension test to `tests/spell-source.test.mjs` so future flatten/regenerate regressions fire before tag. Update CLAUDE.md field-lock table, append CHANGELOG.md v0.1.16 entry, add R46–R49 rows to the smoke matrix, bump `module.json` to `0.1.16`, tag, push, let `.github/workflows/release.yml` ship. **No `modules/*.js` change. No `scripts/` change. No new script files. No CSS change.** This is content polish with regression armor.

**Tech Stack:** Node `--test` runner for assertions, `foundryvtt-cli` (`npm run build:packs`) for LevelDB pack output, FoundryVTT V13.351 + dnd5e 5.2.5 runtime for manual smoke, GitHub Actions (`release.yml`) for distribution.

**Reference spec:** [`docs/superpowers/specs/2026-05-27-spell-description-polish-design.md`](../specs/2026-05-27-spell-description-polish-design.md) — all verbatim HTML strings, test bodies, and table rows below are copied from there. If a string in this plan disagrees with the spec, the spec wins; update this plan to match.

---

## File Structure

| Path | What changes | Why |
|---|---|---|
| `_source/manifest-tulpa-spells/Item.manifest-tulpa.json` | Replace `system.description.value` and `system.description.chat` (two string-valued leaves) | Source of truth for the shipped compendium pack; hand-edited per CLAUDE.md "Source-tree discipline" |
| `tests/spell-source.test.mjs` | Append 6 new tests at the end | Lock the new description structure so a future flatten/regenerate regression fires before tag (v0.1.13 silent-regression class extension) |
| `CLAUDE.md` | Add 5 rows to the "Fields locked by tests or the validator" table; add one note under "Source-tree discipline" | Make the new locks visible to the next agent without their having to read the test file first |
| `CHANGELOG.md` | Insert new `## [0.1.16]` section above the existing `## [0.1.15]` section | Release notes, per repo convention |
| `docs/superpowers/test-plans/2026-05-24-manifest-tulpa-smoke.md` | Insert a new `### v0.1.16 additions` section with R46–R49 after the existing R45 row | Smoke governance per CLAUDE.md "Repository conventions" — R-rows are graded every smoke from now on |
| `module.json` | Bump `version` from `0.1.15` to `0.1.16` | Triggers the release workflow on tag push; the workflow rewrites `manifest`/`download` URLs to match |
| `docs/superpowers/test-plans/2026-05-XX-v0.1.16-smoke-report.md` | New file — per-version smoke report including R49 finding | Required deliverable per smoke governance; R49 documents the 404 diagnostic outcome |

**Untouched** (verify these are unchanged at end-of-task-7): every `modules/*.js`, every `scripts/*`, `_source/manifest-tulpa-actors/Actor.tulpa.json`, all `styles/*.css`, `lang/en.json`, `package.json`, `assets/*`, `.github/workflows/release.yml`. If `git diff --name-only` at task 7 shows any of these, you have over-reached the design.

---

## Task 1: Add the six new regression tests + edit `_source/` to satisfy them (TDD red→green, single commit)

This is one TDD round. The five structure locks and one R36-extension lock all assert against the *new* shape of the spell JSON, so they all fail until both the tests are appended **and** the source JSON is edited. The fix and the test that locks the fix land in the same commit (per the `feedback_fix_at_generator_layer.md` memory — patch + lock in one atomic commit).

**Files:**
- Modify: `tests/spell-source.test.mjs` (append after line 150 — currently the last line is the closing `});` of the scrub-absence test)
- Modify: `_source/manifest-tulpa-spells/Item.manifest-tulpa.json` (replace the string at `system.description.value`, replace the empty string at `system.description.chat`)
- Test: `tests/spell-source.test.mjs` itself

### - [ ] Step 1: Append the six new tests to `tests/spell-source.test.mjs`

Open `tests/spell-source.test.mjs`. After the existing closing `});` of the `scripts/scrub-source.mjs does not exist` test on line 150, append the block below verbatim. Do not delete or modify any existing test. The block reuses the `spell` variable and `HEADER_NEEDLES` constant already declared at the top of the file.

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

### - [ ] Step 2: Run the tests — confirm the six new tests fail in the expected way

Run: `npm test`

Expected: the original 14 tests still pass; the six new tests fail because `_source/` hasn't been updated yet. Sample failure messages you should see (paraphrased — the exact text comes from Node's test runner, but the gist):
- `description.value must contain the stat-block <table>` — current value is a flat `<p>`-wall, no `<table>` tag.
- `description.value must contain <h4>Morphic</h4>` — current value has none.
- `description.chat must not be empty` — current value is `""`.

If any *original* test fails at this step, **stop** — you have accidentally modified the existing tests. Roll back and re-apply only the append.

### - [ ] Step 3: Replace `system.description.value` in `_source/manifest-tulpa-spells/Item.manifest-tulpa.json`

The current value (one long string at line 162 of the source file) is the flat `<p>`-wall with literal `\r` carriage returns. Replace the entire string value with the JSON-encoded form of the HTML below. The HTML is verbatim from [spec Section 2](../specs/2026-05-27-spell-description-polish-design.md#2-full-new-systemdescriptionvalue-html); when written into JSON, the double quotes inside `class="..."` become `\"`, and the HTML may be on one line or pretty-printed inside the JSON string — either is fine as long as no literal `\r` is reintroduced.

The HTML to JSON-encode and substitute as the value of `system.description.value`:

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

**JSON-encoding rules to follow when substituting:**
- Wrap the whole thing in `"..."` as a JSON string value.
- Replace every literal `"` inside the HTML (only `class="..."`) with `\"`.
- Newlines inside the JSON string are allowed as `\n` or as actual newlines if your editor is comfortable; both parse identically. Do **not** introduce `\r` (the old value had `\r` mid-paragraph which is what produced the cosmetic carriage-return artefacts).
- The `—`, `×`, and curly apostrophe characters above are real UTF-8 characters, not entity escapes. Save the file as UTF-8 (no BOM). The existing source file is already UTF-8.

**Do not modify any other field** in the JSON. The locked fields (`_id`, `identifier`, `range`, `target`, `materials`, summon-activity bonuses, profile UUID, etc.) all stay byte-for-byte identical to their current values.

### - [ ] Step 4: Replace `system.description.chat` in the same JSON file

The current value (around line 163) is the empty string `""`. Replace it with the JSON-encoded form of the HTML below. Verbatim from [spec Section 3](../specs/2026-05-27-spell-description-polish-design.md#3-full-new-systemdescriptionchat-html):

```html
<p>You manifest a psychic Tulpa as a loyal combatant. The Tulpa uses the Tulpa stat block with AC 13 + your spellcasting ability mod and HP 40 + 5 × your level, sharing your proficiency, spell attack, and save DC. It acts on your initiative count immediately after your turn.</p><p>At cast time, choose a damage type (force, radiant, or psychic) for its Manifestation Strike, and shape it with 2 modifications (+1 per slot level above 5th, max 6). The Tulpa dismisses at 0 HP, on death, when the spell ends, when you recast it, or when you delete its token.</p>
```

JSON-encoded as a single string. Same JSON-escape rules as Step 3 (no `\r`, no BOM).

### - [ ] Step 5: Run the tests — confirm all 20 pass (14 existing + 6 new)

Run: `npm test`

Expected: all tests pass. Look for the summary line `# pass 20` (or whatever total matches the new count). If any of the 6 new tests still fails, re-read its assertion against the HTML you pasted — the regex tells you exactly which substring is missing.

Common pitfalls:
- The HP enricher fallback uses `+` (plus) and `×` (multiplication sign, U+00D7), not `x`. If your editor auto-corrected `×` to `x` or wrapped the `+` in `\+` escape, the regex test fails.
- The `<th>` headers are exact-case: `AC`, `HP maximum`, etc. (`HP Maximum` would fail.)
- `description.chat` must mention both "Tulpa" and contain "dismiss" (case-insensitive); the verbatim copy above satisfies both.

### - [ ] Step 6: Run the validator — confirm the existing validator still passes

Run: `npm run validate`

Expected: pass with no diagnostics. The validator does not look at the description fields, but running it confirms you haven't accidentally broken any of the *other* locked fields (actor effects, manifest strike damage type, key fields, summon profile UUID).

### - [ ] Step 7: Build the packs — confirm `_source/` rebuilds into `packs/` cleanly

Run: `npm run build:packs`

Expected: stdout reports both packs rebuilt without error. `packs/manifest-tulpa-spells/` LevelDB files have new modification timestamps. No errors about JSON parse failures or missing `_key` fields.

If `build:packs` errors with `unable to parse JSON`, you have invalid JSON in `_source/manifest-tulpa-spells/Item.manifest-tulpa.json` — most likely an un-escaped `"` inside the description HTML. Re-check that every literal double quote in the HTML is `\"` in the JSON string.

### - [ ] Step 8: Commit the test + source changes together

```bash
git add tests/spell-source.test.mjs _source/manifest-tulpa-spells/Item.manifest-tulpa.json
git commit -m "$(cat <<'EOF'
feat(spell): restructure description.value + populate description.chat (v0.1.16)

Replace the flat <p>-wall in system.description.value with a stat-block
table (with [[lookup @attributes.spellmod]] and [[40 + 5 * @details.level]]
enrichers wrapped in prose fallbacks), <h4> section headers for the six
modification categories, and <ul><li><strong>NAME</strong>...</li> bullet
lists for the named options. Populate system.description.chat with a
two-paragraph cast-card summary so the chat log no longer dumps the full
spell text every cast.

Add five structure locks + one R36-extension lock to
tests/spell-source.test.mjs covering: the table, the two enricher scopes,
the six section headers, the bolded mod-name sample, the chat field
constraints, and the chat field's compliance with the R36 header-needles
ban. v0.1.13 silent-regression class extension.

Spec: docs/superpowers/specs/2026-05-27-spell-description-polish-design.md
EOF
)"
```

---

## Task 2: Extend the CLAUDE.md "Fields locked by tests or the validator" table

**Files:**
- Modify: `CLAUDE.md` (the "Source-tree discipline" section's table — search for the existing row `| Spell | \`system.description.value\` | hand-maintained HTML from`)

### - [ ] Step 1: Find the existing locked-fields table and add 5 rows + reword one row

The existing CLAUDE.md table has a row for `system.description.value` that says it "must NOT contain the front-matter header (...)". That row stays. Add the five rows from [spec Section 5](../specs/2026-05-27-spell-description-polish-design.md#5-claudemd-additions) immediately after it, before the `| Tooling |` row.

Open `CLAUDE.md`, find the existing `system.description.value` row in the locked-fields table, and append these five rows directly after it (before the `Tooling | scripts/scrub-source.mjs` row):

```markdown
| Spell | `system.description.value` (table) | contains `<table>`, `<th>AC</th>`, `<th>HP maximum</th>` | tests/spell-source.test.mjs (v0.1.16 structure lock) |
| Spell | `system.description.value` (enrichers) | contains `[[lookup @attributes.spellmod]]{...}` and `[[40 + 5 * @details.level]]{...}` | tests/spell-source.test.mjs (v0.1.16 enricher lock) |
| Spell | `system.description.value` (sections) | contains `<h4>` for Morphic / Combat / Resistance / Movement / Skill Affinity / Special | tests/spell-source.test.mjs (v0.1.16 structure lock) |
| Spell | `system.description.value` (mod names) | `<strong>` on Reinforced Form, Empowered Strikes, Fly Speed, Telepathic Link (sample) | tests/spell-source.test.mjs (v0.1.16 structure lock) |
| Spell | `system.description.chat` | non-empty, < 1500 chars, mentions Tulpa + dismiss; no R36 header strings | tests/spell-source.test.mjs (v0.1.16 chat-card lock) |
```

### - [ ] Step 2: Add one sentence under "Source-tree discipline" noting v0.1.16 as a precedent

Search `CLAUDE.md` for the end of the **"Anti-pattern: rebuilding the scrub script."** paragraph (which currently ends `…run it once, and delete the script in the same commit.`). Append the following sentence at the end of that paragraph:

```markdown
 **v0.1.16 is another precedent:** the description-polish work was implemented entirely by hand-editing `_source/manifest-tulpa-spells/Item.manifest-tulpa.json` and adding five new structure-lock tests in the same commit. No new script, no regenerator, no round-trip — just edit, lock, ship.
```

### - [ ] Step 3: Sanity-check the table renders correctly

Run: `npm test` (confirms tests still pass — touching CLAUDE.md doesn't affect them, but a no-op sanity check is cheap).

Expected: all 20 tests pass, same as Task 1 Step 5.

### - [ ] Step 4: Commit

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(claude.md): lock v0.1.16 description-structure fields in field table

Add five rows to the "Fields locked by tests or the validator" table
covering description.value (table, enrichers, sections, bolded mod names)
and description.chat. Append a sentence under "Anti-pattern: rebuilding
the scrub script" citing v0.1.16 as another precedent for direct _source/
edits + same-commit test locks.
EOF
)"
```

---

## Task 3: Add the `## [0.1.16]` entry to `CHANGELOG.md`

**Files:**
- Modify: `CHANGELOG.md` (insert above the existing `## [0.1.15]` header on line 7)

### - [ ] Step 1: Insert the v0.1.16 entry above v0.1.15

Open `CHANGELOG.md`. Above the existing line 7 (`## [0.1.15] — 2026-05-27`), insert the new section. Use today's date in `YYYY-MM-DD` format (find via `date +%F` on your shell, or check the system date — the spec says 2026-05-27 in the draft, but if you implement on a later date use that one):

```markdown
## [0.1.16] — 2026-05-XX

> Content polish + regression armor for the shipped spell description. No module-code change. Restructures the spell's `system.description.value` from a 35-paragraph flat `<p>`-wall into a stat-block table, section-headed modification lists, and bold modification names. Adds two scoped `[[lookup ...]]{fallback}` enrichers (AC mod, HP formula) so the spell sheet shows live caster-derived numbers while the compendium browser still reads cleanly. Populates `system.description.chat` with a two-paragraph cast-card summary so the chat log no longer dumps the full spell text every cast. Locks all five new structural elements with regression assertions in [tests/spell-source.test.mjs](tests/spell-source.test.mjs) — the v0.1.13 silent-regression class can't recur on these fields.

### Spell description polish

- **`system.description.value` restructured.** Stat-block now lives in a 6-row `<table>` (AC, HP maximum, proficiency bonus, spell attack/save DC, STR/CON save proficiencies, Manifestation Strike damage). Modifications are grouped under six `<h4>` section headers (Morphic, Combat, Resistance, Movement, Skill Affinity, Special); named options are `<ul><li><strong>NAME</strong> (cost). Effect…</li>` bullets. Prose is verbatim from [manifest-tulpa.txt](manifest-tulpa.txt) — only structure is added.
- **Two scoped lookup enrichers added.** The AC table row uses `13 + [[lookup @attributes.spellmod]]{your spellcasting ability modifier} ([[13 + @attributes.spellmod]]{total})`; the HP row uses `[[40 + 5 * @details.level]]{40 + 5 × your character level}`. Both paths are already in use by the summon activity's `bonuses.ac` and `bonuses.hp` expressions, so resolution is verified in dnd5e 5.2.5. The `{fallback}` form ensures the compendium-browser view (no parent actor) renders prose, not raw `@`-paths.
- **`system.description.chat` populated.** Two-paragraph summary: stat block + cast-time choices in paragraph 1, dismissal triggers in paragraph 2. dnd5e renders `description.chat` in preference to `description.value` on cast chat cards (see [`item-data-model.mjs:198`](.understand-anything/dnd5e-research/dnd5e/module/data/abstract/item-data-model.mjs)), so the chat log stays tidy on each cast.

### Regression protection

- **Five new structure locks in [tests/spell-source.test.mjs](tests/spell-source.test.mjs).** Lock the `<table>` presence + AC/HP rows, the two enricher patterns, the six `<h4>` section headers, the bolded mod-name sample, and the `description.chat` constraints (non-empty, < 1500 chars, mentions Tulpa + dismiss). A future flatten, regenerate, or wipe fires the test suite before tag.
- **R36 header-needles check extended to `description.chat`.** The same header strings banned from `description.value` (R36, v0.1.11/v0.1.15) are now banned from `description.chat` too — same class of regression, second surface.
- **[CLAUDE.md](CLAUDE.md) field-lock table extended** with five new rows so the next agent in this codebase sees the locks without having to read the test file first. Appended a sentence under "Anti-pattern: rebuilding the scrub script" citing v0.1.16 as another precedent for direct `_source/` edits + same-commit test locks.

### Diagnostics

- **`projectile-explosion-light-yellow.webp` 404 investigated.** Diagnostic console snippet in [docs/superpowers/specs/2026-05-27-spell-description-polish-design.md](docs/superpowers/specs/2026-05-27-spell-description-polish-design.md) Section 1. Code audit confirmed no reference to that asset path in `_source/`, `modules/`, or `module.json`. R49 in the v0.1.16 smoke report documents the runtime finding.

```

If today's date is not 2026-05-27, replace `2026-05-XX` with the actual ISO date.

### - [ ] Step 2: Sanity check

Run: `npm test` (cheap re-confirmation). Expected: all 20 tests pass.

### - [ ] Step 3: Commit

```bash
git add CHANGELOG.md
git commit -m "$(cat <<'EOF'
docs(changelog): add v0.1.16 entry — description polish + regression locks

Content polish (stat-block table, enrichers, chat-card summary) plus five
new test locks + CLAUDE.md table extension. No module-code change.
EOF
)"
```

---

## Task 4: Add R46–R49 to the smoke matrix

**Files:**
- Modify: `docs/superpowers/test-plans/2026-05-24-manifest-tulpa-smoke.md` (insert a new `### v0.1.16 additions` section after the existing v0.1.13 fixes table — after line 111, R45)

### - [ ] Step 1: Find the insertion point and add the new section

Open the smoke plan. The existing v0.1.13 fixes table ends with row R45 on line 111, followed by a blank line, then a "If R4, R6…" warning on line 113. Insert the new section between line 112 (blank) and line 113.

The block to insert (verbatim from [spec Section 7](../specs/2026-05-27-spell-description-polish-design.md#7-smoke-matrix-additions-docssuperpowerstest-plans2026-05-24-manifest-tulpa-smokemd)):

```markdown
### v0.1.16 additions — [test report](2026-05-XX-v0.1.16-smoke-report.md)

| # | Check | Why |
|---|---|---|
| R46 | Cast chat card uses the chat description, not the full spell text | After casting Manifest Tulpa, the chat card description box shows the two-paragraph summary (under 1500 chars), not the full description.value HTML. |
| R47 | Spell sheet renders the structured description | Opening the Manifest Tulpa spell from a character's spellbook displays the stat-block as a table, the six modification sections as `<h4>` headers, and named modifications as bulleted bold entries. No literal `\r` artefacts visible. |
| R48 | AC and HP enrichers resolve on actor, fall back in compendium | When the spell is on a character sheet (with a valid spellcasting ability), the stat-block AC row shows `13 + <mod>` numerically and the HP row shows `40 + 5 × <level>` numerically. When opened in the compendium browser (no parent actor), both rows show the prose fallback ("your spellcasting ability modifier", "40 + 5 × your character level") with no raw `@`-path strings visible. |
| R49 | `projectile-explosion-light-yellow.webp` 404 — investigated | Diagnostic snippet from [`docs/superpowers/specs/2026-05-27-spell-description-polish-design.md`](../specs/2026-05-27-spell-description-polish-design.md) Section 1 has been run; finding documented in v0.1.16 smoke report. PASS = documented (any of: confirmed not-us / could-not-reproduce / identified-and-actioned). FAIL = capture shows source is our module without an action taken. |

```

Replace `2026-05-XX` in the test-report link with the same date you used in the CHANGELOG entry.

### - [ ] Step 2: Commit

```bash
git add docs/superpowers/test-plans/2026-05-24-manifest-tulpa-smoke.md
git commit -m "$(cat <<'EOF'
docs(smoke): add R46-R49 for v0.1.16 description polish + 404 diagnostic

R46: chat card uses description.chat (not full description.value).
R47: spell sheet renders the new table + section headers + bullets.
R48: AC/HP enrichers resolve on actor and fall back to prose in compendium.
R49: 404 diagnostic snippet run, finding captured in the v0.1.16 report.
EOF
)"
```

---

## Task 5: Bump `module.json` version to `0.1.16`

**Files:**
- Modify: `module.json` (line 5 — the `"version"` field)

### - [ ] Step 1: Edit the version field

Open `module.json` and change line 5 from `  "version": "0.1.15",` to `  "version": "0.1.16",`. Do not modify any other field — `release.yml` rewrites the `manifest`/`download` URLs on its own.

### - [ ] Step 2: Sanity check the validator + build

Run these in sequence (they're cheap):

```bash
npm test
npm run validate
npm run build:packs
```

Expected: all pass. (`npm test` doesn't read `module.json`, but the other two do — confirms the version bump didn't accidentally invalidate the manifest.)

### - [ ] Step 3: Commit

```bash
git add module.json
git commit -m "chore(release): bump version to 0.1.16"
```

---

## Task 6: Manual smoke test (R46–R49 + R1–R45 regression sweep) and write per-version smoke report

**Files:**
- Create: `docs/superpowers/test-plans/2026-05-XX-v0.1.16-smoke-report.md` (replace `XX` with today's day)

### - [ ] Step 1: Stage a clean Foundry world

Install the locally-built module zip (`packs/` rebuilt from Task 1 Step 7) into a fresh FoundryVTT V13.351 world with dnd5e 5.2.5 and all required modules enabled (midi-qol, dae, times-up, sequencer, portal-lib, lib-wrapper, socketlib, ActiveAuras ≥0.12.7, jb2a_patreon, autoanimations). Create a PC at level 9+.

Drag the Manifest Tulpa spell from the **Manifest Tulpa - Spells** compendium onto the PC.

### - [ ] Step 2: Run the 404 diagnostic snippet (R49)

Open the browser DevTools console (F12 → Console). Paste the snippet from [spec Section 1](../specs/2026-05-27-spell-description-polish-design.md#1-404-diagnostic-flow) (lines 96–112) and press Enter. Confirm the `[404-hunt] installed` log line.

Close the **Manifest Tulpa - Spells** compendium browser window if open. Then open it again (which is what triggers the original 404 in the user's session).

Scroll the console for `[404-hunt]` log lines. Record:
- The URL captured (should contain `projectile-explosion-light-yellow.webp`).
- The first stack-trace frame above the `at .../manifest-tulpa/...` (or first non-Foundry-core frame) — this identifies the calling module/script.
- If no `[404-hunt]` line appears, record "could not reproduce" with the session details.

### - [ ] Step 3: Run R46, R47, R48 on the sheet + chat card

- **R47:** open the spell from the PC's spellbook. Confirm the description renders with: a 6-row stat-block table at the top, six `<h4>` section headers (Morphic, Combat, Resistance, Movement, Skill Affinity, Special), and the named modifications appearing as bulleted bold entries inside `<ul>` blocks. Confirm no literal `\r` characters visible anywhere in the body.
- **R48 (sheet side):** look at the stat-block table's AC and HP rows on the spell-from-sheet view. AC row should show a live numerical value (e.g. `13 + 4 (total 17)` if INT mod is 4 and INT is the spellcasting ability). HP row should show `40 + 5 × 9` numerically (or whatever the PC's level resolves to). If you see `@attributes.spellmod` literal, the enricher didn't resolve and that's a real bug.
- **R48 (compendium side):** open the same spell directly from the compendium browser (no parent actor). The AC row should show the prose fallback `13 + your spellcasting ability modifier (total)`; the HP row should show `40 + 5 × your character level`. No raw `@`-paths.
- **R46:** cast the spell, complete placement and the mod dialog. The chat card's description block should be ~two paragraphs (the cast-card summary), not the full spell text. Visually compare its height in the chat log to a prior v0.1.15 cast card screenshot if you have one — should be ~1/3 the height or less.

### - [ ] Step 4: Regression sweep R1–R45 + A1–A9

Walk the full smoke matrix per [smoke plan](../test-plans/2026-05-24-manifest-tulpa-smoke.md). Grade each row PASS / FAIL / BLOCKED per the smoke governance convention. R36 (header-needles ban on `description.value`) and the new R46–R49 are the most regression-relevant — verify R36 still passes (the v0.1.16 HTML opens with `<div class="manifest-tulpa-spell"><p>You crystallize a fragment…` and contains none of the front-matter header strings).

### - [ ] Step 5: Write the per-version smoke report

Create `docs/superpowers/test-plans/2026-05-XX-v0.1.16-smoke-report.md` (substitute the actual date). Follow the existing per-version report format (look at `2026-05-27-v0.1.12-smoke-report.md` for the latest template). Include at minimum:

- Header with version, date, world details (Foundry/dnd5e/module versions, dependency list).
- R1–R49 graded table (PASS / FAIL / BLOCKED).
- A1–A9 graded table.
- R49 finding written up in detail: the URL captured, the calling stack frame, and your decision (per the decision tree in spec Section 1: if our module → escalate as in-cycle regression; if another module / Foundry core → document; if not reproducible → note).
- Any new bugs/observations surfaced during the smoke that should feed v0.1.17.

### - [ ] Step 6: Commit the smoke report

```bash
git add docs/superpowers/test-plans/2026-05-XX-v0.1.16-smoke-report.md
git commit -m "$(cat <<'EOF'
docs(smoke): v0.1.16 smoke report — description polish + R49 404 finding

R46-R49 PASS. R1-R45 + A1-A9 regression sweep results inline.
R49 finding: <fill in from Step 5>.
EOF
)"
```

If the smoke surfaces a **functional R-bug or any FAIL on R46–R49**, do **not** proceed to Task 7. Open a new issue, drop back to brainstorming/writing-plans for the fix, and only tag when the report is all-PASS (or all-PASS-with-documented-cosmetic-A-deferrals).

---

## Task 7: Tag and push to trigger release

**Files:** none modified (this is a tag-and-push operation).

### - [ ] Step 1: Confirm a clean working tree

Run: `git status`

Expected: `nothing to commit, working tree clean`. If anything is uncommitted, stop and find out why — the release workflow ships what is at the tagged commit.

### - [ ] Step 2: Confirm `git diff --name-only main` shows only the expected files

Run: `git diff --name-only aae9798..HEAD` (where `aae9798` is the v0.1.15 release commit).

Expected: exactly these files changed (in some order):

```
CHANGELOG.md
CLAUDE.md
_source/manifest-tulpa-spells/Item.manifest-tulpa.json
docs/superpowers/plans/2026-05-27-spell-description-polish.md
docs/superpowers/specs/2026-05-27-spell-description-polish-design.md
docs/superpowers/test-plans/2026-05-24-manifest-tulpa-smoke.md
docs/superpowers/test-plans/2026-05-XX-v0.1.16-smoke-report.md
module.json
tests/spell-source.test.mjs
```

(Plus the plan file itself if it wasn't committed earlier.) If any `modules/*.js` or `scripts/*` file appears, **stop** — you have over-reached. Roll back the unintended changes.

### - [ ] Step 3: Run the full pre-tag validation one more time

```bash
npm test
npm run validate
npm run build:packs
```

Expected: all pass. (`build:packs` writes into `packs/` which is gitignored; the release workflow runs `build:packs` again on its own runner, so the local artefact isn't shipped — this run is just a final sanity check.)

### - [ ] Step 4: Create the annotated tag

```bash
git tag -a v0.1.16 -m "v0.1.16 — spell description polish + 404 diagnostic"
```

### - [ ] Step 5: Push the tag

Pushing a new tag triggers `.github/workflows/release.yml`. **This is the action-with-blast-radius checkpoint** — it publishes a GitHub Release that end-users immediately fetch from the `releases/latest/download/module.json` manifest URL.

```bash
git push origin main
git push origin v0.1.16
```

### - [ ] Step 6: Watch the release workflow

Open the repo's Actions tab in a browser and confirm the `release.yml` run for `v0.1.16` goes green. It should rebuild packs, rewrite `module.json` URLs, run `validate`, zip the module, and attach `module.json` + `manifest-tulpa.zip` to the v0.1.16 GitHub Release.

If the workflow fails, do **not** delete the tag — investigate the failure in the Actions logs. Most failures at this point are CI-environment issues (Node version, npm-ci); fix on a follow-up commit, re-tag as `v0.1.17` if necessary.

### - [ ] Step 7: Spot-check the released module in a fresh Foundry world

Install via the canonical manifest URL `https://github.com/themrbeasley/manifest-tulpa/releases/latest/download/module.json`. Confirm the spell description renders correctly (R47 spot-check). Done.

---

## Self-Review Notes (for plan writer — already executed)

**Spec coverage:** every spec section maps to a task —
- Spec Section 1 (404 diagnostic) → Task 6 Step 2 + R49 in Task 4.
- Spec Section 2 (full description.value HTML) → Task 1 Step 3.
- Spec Section 3 (full description.chat HTML) → Task 1 Step 4.
- Spec Section 4 (six regression assertions) → Task 1 Step 1.
- Spec Section 5 (CLAUDE.md additions) → Task 2.
- Spec Section 6 (CHANGELOG draft) → Task 3.
- Spec Section 7 (smoke matrix R46–R49) → Task 4.
- Spec Section 8 (release flow) → Tasks 5–7.
- Spec Section 9 (regression-protection summary) → embedded throughout; the "Untouched" assertion at the end of File Structure and the `git diff --name-only` check at Task 7 Step 2 enforce it.
- Spec Section 10 (risks/open questions) → documented in spec; Task 6 (smoke) is where they're exercised.

**Placeholder scan:** `2026-05-XX` appears in three places (CHANGELOG header, smoke-plan section header, smoke-report filename), each accompanied by an explicit instruction to substitute today's actual date. No TBD / TODO / "implement later". Every code/HTML block is verbatim from the spec, no `<placeholder>` content.

**Type consistency:** the test names, regex patterns, and assertion strings in Task 1 Step 1 match the spec verbatim. The HTML in Task 1 Step 3 matches the spec verbatim. The CLAUDE.md rows in Task 2 Step 1 match the spec verbatim. The smoke rows in Task 4 Step 1 match the spec verbatim.
