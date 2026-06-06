# Recast Bug (Bug #1) — Fix Scratchpad — 2026-06-06

> Working scratchpad for the v0.1.16 **recast** fix. Survives context compaction.
> Process: superpowers `systematic-debugging` → reproduce LIVE → research → PLAN → **explicit approval** → implement (TDD) → update smoke report.
> **DO NOT implement any fix until the user explicitly approves the plan.**

## Goal (this sprint)
Fix **Bug #1 only** — recast over a live Tulpa destroys BOTH tulpas + silently aborts. Other bugs = future sprints.
User's prime directive: **STOP REGRESSING.** Module is overdue to ship.

## Environment
- World: "Patreon Map Building" @ http://192.168.1.188:8678/
- Login: select **GAMEMASTER** from dropdown, ignore password, click Join.
- Test char: **Player Character** (Wizard 20, INT 20 / +5, only spell = Manifest Tulpa).
- Cast: click spell NAME on sheet → dragon SVG follows cursor → click empty canvas to place → mod dialog appears.
- Versions (live): Foundry 13.351, dnd5e 5.2.5, MT 0.1.16, sequencer 3.6.11, jb2a 0.8.7, dae 13.0.26, times-up 13.1.9, ActiveAuras 0.12.7. `ActiveAuras.combatOnly = TRUE`.
- Browser: deviceId 09e5cb1a-38fc-47a6-b7f7-a9f976a8f5d3 ("Browser 1", local).

## The bug (from smoke report §5 Bug #1)
Symptoms: cast over a live Tulpa → BOTH tokens vanish, slot consumed, dialog never opens, no new anchor. Two errors:
- UI banner: `ActiveEffect "<id>" does not exist!`
- Console: `EXCEPTION Error: undefined id [<id>] does not exist in the EmbeddedCollection collection.`
Affected rows: R15 FAIL, R43 FAIL. Called a regression of the v0.1.13 REG-2 fix.

## Code trace (current source, confirmed by reading)
Files: cast-flow.js, dismiss-flow.js, dismiss-helpers.js, init.js.

Recast path:
1. `preUseActivity` captures slot. dnd5e consumes slot, creates NEW token #2 + NEW summon AE on caster, fires `postSummon`.
2. `onPostSummon` (cast-flow.js:64-69): finds `previous` = Anchor #1 (old). Calls `performDismissCleanup(previous, {dismissReason:"recast"})` — **note: NO skipTokenTeardown passed**.
3. In `performDismissCleanup` (dismiss-flow.js:31): skipTokenTeardown=false → enters token-teardown → `tokenDoc.delete()` deletes OLD token #1.
4. Deleting old token #1 fires `onPreDeleteToken` (dismiss-flow.js:104): finds Anchor #1 (still present), calls `anchor.delete({dismissReason:"manual", skipTokenTeardown:true})` — **note: NO skipFunnel**.
5. That fires `onDeleteActiveEffect` (dismiss-flow.js:20): skipFunnel not set → does NOT short-circuit → **RE-ENTRANT** `performDismissCleanup(anchor1, {dismissReason:"manual", skipTokenTeardown:true})`.
6. Re-entrant call: skipTokenTeardown=true (skips token block) BUT calls `findSystemSummonAE(caster)` (dismiss-helpers.js:10). Caster now has BOTH old + new summon AEs (same origin + same name) → `.find()` returns first → may delete the NEW summon AE → (CRUX) dnd5e tears down NEW token #2.
7. Back at cast-flow.js:68: `previous.delete({skipFunnel:true})` — but Anchor #1 ALREADY deleted in step 4 → throws uncaught `undefined id … EmbeddedCollection` → onPostSummon aborts before `openCastDialog`.

## CRUX — RESOLVED (dnd5e source, via Sonnet subagent 2026-06-06)
**Q: Does deleting the caster's dnd5e summon/Summon AE tear down the summoned token in dnd5e 5.2.5?**
**A: NO.** Hard evidence from `.understand-anything/dnd5e-research/dnd5e/module/`:
1. dnd5e does **NOT** create a "Summon: <spell>" AE on the caster. `SummonActivity` (`summon.mjs`) writes `flags.dnd5e.summon = {level,mod,origin,activity,profile}` onto the **summoned actor**, never the caster, and never stores token ids in any AE.
2. dnd5e DOES create a **"Concentrating: <spell>"** AE on the caster *iff the spell concentrates* (`actor.mjs:967` beginConcentrating → `active-effect.mjs:656` createConcentrationEffectData); stores `flags.dnd5e.{activity,item,spellLevel}`, status `"concentrating"`.
3. `ActiveEffect5e#_onDelete` (`active-effect.mjs:630`) calls `getDependents().forEach(e=>e.delete())` — but dependents are ONLY AEs/Items carrying `flags.dnd5e.dependentOn`; **never tokens**. So deleting a caster AE does not delete a token in core.
4. Token delete → `TokenDocument5e#_onDelete` (`token.mjs:237`) only does `SummonRegistry.untrack` (in-memory); does NOT touch any caster AE. Relationship is one-directional bookkeeping.
5. No `deleteSummons` / no auto-teardown method tied to AE deletion.

**Consequences (rewrites the report's trace):**
- Report's step 6 ("re-entrant deletes the NEW summon AE → dnd5e tears down NEW token #2") is **FALSE as stated** — no such core mechanism.
- The module's `findSystemSummonAE` name-regex `\bmanifest\s*tulpa\b` **matches "Concentrating: Manifest Tulpa"** → the funnel's "system AE cleanup" is very likely deleting the caster's **CONCENTRATION**, not a summon AE. (VERIFY live whether MT concentrates + what that AE is named.)
- So "both tokens vanish" must come from one of: (a) the MODULE deleting old token #1 directly (confirmed path), + (b) NEW token #2 vanishing via some OTHER mechanism — candidates: **concentration break** (dnd5e enforces single concentration; recast breaks old conc; if summons are tied to concentration by midi-qol/DAE/times-up, the tied token is removed) OR the funnel deleting the new concentration AE and a peer module reacting. **dnd5e CORE alone does not do it — a peer module (midi/DAE/times-up) must, OR my model of which token vanishes is wrong.**
- ⚠️ Subagent read dnd5e CORE only. Live world also runs midi-qol, DAE, times-up — any can delete summons on concentration-break. MUST confirm the actual cascade live.

### New questions to answer LIVE (before any fix)
1. Does Manifest Tulpa require concentration? What exact AE name(s) appear on the caster after one cast? (look for "Concentrating: Manifest Tulpa")
2. On recast, in what ORDER do tokens/AEs get deleted, and which module fires each delete? (use the observation harness below)
3. Does `findSystemSummonAE` grab the concentration AE? Does deleting it cascade (getDependents / midi / DAE)?
4. Which token actually throws the `undefined id … EmbeddedCollection` error, and at which call site?

## v0.1.13 fix that was insufficient
v0.1.13 added `skipFunnel` so the recast branch's OWN anchor delete (line 68) wouldn't re-run the funnel. But the real recast path is token-delete → onPreDeleteToken → anchor.delete(skipTokenTeardown, NO skipFunnel) → funnel re-entry. skipFunnel never set on THAT path.

## Candidate fix directions (from report — NOT yet chosen)
- A) Disambiguate summon AE by the SPECIFIC tulpa/token, not name/origin (`findSystemSummonAE` is too greedy).
- B) Dismiss previous Tulpa in `preUseActivity` BEFORE the new token exists (eliminates old/new ambiguity window).
- C) Pass `skipTokenTeardown`+`skipFunnel` correctly through the recast cleanup so no re-entrancy / no competing deletes.
- D) Wrap cast-flow.js:68 in try/catch (band-aid only — stops abort, not double-destroy).
- Likely real fix = combination. Decide AFTER live repro + dnd5e research.

## STATUS / progress
- [x] Read smoke report + all relevant source files
- [x] Confirmed browser connected
- [x] Reproduce recast bug LIVE (monkeypatch on AE+Token `.delete`, real UI recast) — see "Live findings" below
- [x] Verify CRUX in dnd5e source + midi-qol bundle (the new-token death is midi-qol `dependentOn`, NOT origin sweep — see "Mechanism correction" below)
- [x] Form single root-cause hypothesis (Phase 3) — see "ROOT CAUSE" below
- [x] Write plan; explain in plain English; GET APPROVAL  ← **DONE — user approved explicitly 2026-06-06 ("Approved explicitly")**
- [x] Implement (TDD where feasible) — B1 + skipAnimation. 4 files: dismiss-helpers.js (+findPreviousAnchor), dismiss-helpers.test.mjs (+8 tests), dismiss-flow.js (+skipAnimation gate + JSDoc), cast-flow.js (import swap, RECAST_DISMISS map, preUseActivity pre-dismiss, postSummon await). performDismissCleanup stays exported (funnel still uses it).
- [x] npm test (93/93) + validate (passed) + build:packs (built) — full gate GREEN 2026-06-06
- [x] Update smoke report fix log + remaining-work list — Pass 2 remediation log + 7 dated forward-pointers (§1 intro, §5 Bug #1 heading + correction note, §6 two rows, §8 item 1, Appendix B note, Sign-off); R15/R43 left FAIL (live re-smoke pending), build still RED (Bug #2 open)
- [→] Commit to main  ← **CURRENT STEP** (modules/cast-flow.js, dismiss-flow.js, dismiss-helpers.js, tests/dismiss-helpers.test.mjs, smoke report, scratchpad). No version bump / tag / push.

## Live findings — REPRODUCED 2026-06-06 (Step 1 GATE SATISFIED)

Method: cast #1 (happy path) established a live Tulpa; installed a `.delete()` monkeypatch on
`ActiveEffect`+`TokenDocument` prototypes that logs, per call: doc type, name, id6, the module
chain from `new Error().stack` (modules/systems, innermost-first), and the literal options arg.
Then performed the recast via the real UI (CAST SPELL → Portal crosshair → placed NEW token on
empty grass). Pre-recast authoritative state: OLD token `wWNfW4`, anchor `pqxsqY`, DAE summon AE
`uvdQPK`.

**Result: DRG#0 (both dragons gone), caster FX=[] (anchor + summon AE both gone), mod dialog never
opened, slot consumed.** Exact smoke-report symptom reproduced.

**Cascade (call order, module attribution from live stacks):**
1. `DEL TOK wWNfW4  via manifest-tulpa  opt={}` — OUTER `performDismissCleanup` token-teardown deletes OLD token.
2. `DEL AE  pqxsqY  via manifest-tulpa  opt={dismissReason:"manual", skipTokenTeardown:true}` — `onPreDeleteToken` (fired by step 1) deletes anchor. **NO skipFunnel → re-enters funnel.**
3. `DEL AE  uvdQPK  via manifest-tulpa  opt={}` — re-entrant `performDismissCleanup` → `findSystemSummonAE` deletes the DAE summon AE.
4. `DEL AE  uvdQPK  via manifest-tulpa  opt={}` AGAIN — OUTER cleanup's `findSystemSummonAE` deletes it a 2nd time → **`ActiveEffect "uvdQPKtMzE8F7fFE" does not exist!`** (UI banner; caught at dismiss-flow.js:93).
5. `DEL TOK b8SzVQ via dnd5e>midi-qol>manifest-tulpa opt={}` — **NEW token deleted via midi-qol's `flags.dnd5e.dependentOn` cascade** (see "Mechanism correction" below), riding on our AE deletion. (`dnd5e` in the stack = `TokenDocument5e.delete`, the executor; `midi-qol` = wraps the dependent mixin onto the Token class; `manifest-tulpa` = our AE-delete that triggered the cascade.)
6. `DEL AE  pqxsqY via manifest-tulpa opt={dismissReason:"recast", skipFunnel:true}` — cast-flow.js:68 deletes the anchor that step 2 ALREADY deleted → **uncaught `undefined id [pqxsqY7f8oGmX5zS] does not exist in the EmbeddedCollection collection`** at Foundry `#preDeleteDocumentArray` → `onPostSummon` aborts before `openCastDialog`.

Also observed (non-causal): dismiss animation 15s timeout (caught), and `dismiss: could not
resolve tulpa (uuid=…wWNfW4…)` debug (old token mid-deletion). Not root cause.

### ROOT CAUSE (single, Phase-3 hypothesis — CONFIRMED by the cascade above)
The recast cleanup in `onPostSummon` tears down the OLD Tulpa **by deleting the old token first**.
That token-delete fires `onPreDeleteToken`, which deletes the anchor **without `skipFunnel`**,
re-entering the dismissal funnel. The funnel then (a) double-deletes the summon AE (→ "does not
exist" banner) and (b) deletes the OLD summon AE while the NEW token still exists, which makes
**midi-qol sweep summoned tokens by shared origin and kill the NEW token too**. Finally control
returns to cast-flow.js:68, which deletes the already-deleted anchor → **uncaught EmbeddedCollection
throw aborts the cast** before the mod dialog. The v0.1.13 `skipFunnel` fix only covered the recast
block's OWN anchor delete (step 6), never the token-delete→onPreDeleteToken→anchor.delete path (step 2).

**Why the new token is collateral (the crux the report missed):** the destructive teardown of the
OLD cast happens AFTER the NEW token already exists, and by then the NEW token already shares the
SAME caster-side "Summon: Manifest Tulpa" AE as the old one (midi-qol reuses that AE by name across
casts and pins each summoned token to it via `flags.dnd5e.dependentOn`). Deleting that AE during the
old teardown therefore kills the new token too. The only structural fix is to ensure the OLD Tulpa
(token + anchor + its "Summon:" AE) is fully gone BEFORE the NEW token is created — so the new cast
gets a FRESH "Summon:" AE that nothing else is pinned to.

## Mechanism correction (Step 2 research, supersedes earlier "origin-based sweep" wording)
Earlier scratchpad text guessed the new token died via a midi-qol *origin-based* summon sweep, or via
*concentration* break. Both are WRONG. Step 2 research (midi-qol bundle read + dnd5e source) found:
- **Manifest Tulpa does NOT concentrate** (confirmed live: no "Concentrating:" AE). So concentration
  is not involved at all.
- **dnd5e CORE never makes a token a dependent** — `ActiveEffect5e#_onDelete` → `getDependents()`
  only returns AEs/Items carrying `flags.dnd5e.dependentOn`, never tokens.
- **midi-qol EXTENDS the dependent mixin onto the Token document class**
  (`MidiTokenDocument extends MidiDependentDocumentMixin(dnd5e…DependentDocumentMixin(CONFIG.Token.documentClass))`).
  So *under midi-qol*, tokens CAN be deleted as dependents.
- midi-qol's `autoRemoveSummonedCreature` setting (TRUE in this world) makes midi, after a summon
  workflow, set `flags.dnd5e.dependentOn = <AE uuid>` on each summoned TokenDocument. The AE it picks
  is an existing **"Summon: <item.name>" AE reused BY NAME** (`effects.find(ef => ef.name === "Summon: " + item.name)`),
  or a fresh one if none exists.
- ∴ across recasts the OLD and NEW tokens can both be pinned to the **same reused** "Summon: Manifest
  Tulpa" AE. Deleting that AE (which our funnel's `findSystemSummonAE` does) deletes BOTH via the
  dnd5e dependent cascade. The match key is the **AE UUID**, not the spell origin.
- DAE creates NO summon AE and deletes NO tokens (DAE subagent confirmed) — it's a passive bystander.

**Timing fact that makes the fix robust** (dnd5e source, confirmed): `use()` fires
`dnd5e.preUseActivity` (sync) → `await consume()` (slot spent) → `_finalizeUsage` → `placeSummons` →
**interactive crosshair (multi-second, user clicks to place)** → `createEmbeddedDocuments("Token")` →
`dnd5e.postSummon`. So there is a guaranteed multi-second gap between preUseActivity and the new
token's existence. Dismissing the old Tulpa in preUseActivity completes long before the new token (or
its "Summon:" AE) exists.

## CHOSEN FIX PLAN (Option B1 + skipAnimation) — APPROVED 2026-06-06, IMPLEMENTING
**Runtime only (`modules/*.js`), NOT `_source/` — so CLAUDE.md source-tree-discipline locks don't apply.**

**Touch 4 files:**

1. **`modules/dismiss-helpers.js`** — ADD a pure sibling helper `findPreviousAnchor(caster, moduleId)`
   that returns the caster effect carrying `flags[moduleId].tulpaUuid` (or null). Pure, Node-testable.

2. **`tests/dismiss-helpers.test.mjs`** — ADD failing tests for `findPreviousAnchor` FIRST (TDD), then
   make them pass. Asserts: null caster→null; no/невalid effects→null; finds the anchor by
   `flags[moduleId].tulpaUuid`; ignores the system summon AE (has `flags.dnd5e.summon`, not our flag);
   custom moduleId; works on a plain array (live `effects` is an EmbeddedCollection — has `.find`).

3. **`modules/dismiss-flow.js`** — ADD `skipAnimation` option to `performDismissCleanup`:
   `const skipAnimation = options?.[MODULE_ID]?.skipAnimation === true;` and gate the dismiss
   animation on it: `if (placeable && castConfig.damageType && !skipAnimation) await playDismiss(...)`.

4. **`modules/cast-flow.js`** (the real fix):
   - Swap imports: DROP `import { performDismissCleanup } from "./dismiss-flow.js";`; ADD
     `import { findPreviousAnchor } from "./dismiss-helpers.js";`.
   - Add module-locals: `const RECAST_DISMISS = new Map();` (activity.uuid → in-flight teardown
     promise) and `const RECAST_DISMISS_OPTIONS = { [MODULE_ID]: { dismissReason: "recast",
     skipAnimation: true } };`.
   - **`onPreUseActivity`:** after `SLOT_CAPTURE.set(...)`, resolve `caster = activity.item?.actor`,
     `previous = findPreviousAnchor(caster)`; if present, fire-and-forget dismiss it **through the
     funnel**: `const p = previous.delete(RECAST_DISMISS_OPTIONS).catch(log); RECAST_DISMISS.set(activity.uuid, p);`.
   - **`onPostSummon`:** at the top (after caster + slot), `const t = RECAST_DISMISS.get(activity.uuid);
     if (t) { RECAST_DISMISS.delete(activity.uuid); await t; }` — safety net so the new pipeline never
     races a half-torn-down old Tulpa. Then **REMOVE the old recast block (current lines 57-69)** — its
     `previous.delete({skipFunnel})` is the source of the `cast-flow.js:68` double-delete throw.

**Why funnel (not performDismissCleanup directly):** `anchor.delete()` removes the anchor from the
collection BEFORE the `deleteActiveEffect` post-delete hook runs cleanup → when cleanup deletes the
old token → `onPreDeleteToken` → `findPreviousAnchor` returns null → funnel does NOT re-enter. (The
old bug deleted the token FIRST via performDismissCleanup-called-directly, so the anchor was still
present when onPreDeleteToken ran → re-entrancy.)

**Why preUseActivity (not postSummon):** preUseActivity fires AFTER slot selection but BEFORE the
placement crosshair, so the old token+anchor+"Summon:" AE are fully gone before the NEW token exists.
midi-qol then makes a FRESH "Summon: Manifest Tulpa" AE for the new token (it reuses by NAME; with no
old one around it can't reuse) → nothing else is pinned to it → no collateral kill.

**Why skipAnimation (the refinement I caught after first presenting B1):** `performDismissCleanup`
runs `playDismiss` (up to a 15s timeout) BEFORE the "Summon:" AE sweep. Without skipAnimation, a fast
placement could beat the animation: the old "Summon:" AE would still be alive when midi pins the new
token to it, then the old teardown's sweep would delete it → drag the new token down (collateral kill
returns). skipAnimation collapses the old teardown to a few fast DB ops that finish well before the
crosshair is placed. (Disclosed to user; part of approved plan.)

**Why it fixes all three failures:** (a) no "ActiveEffect does not exist" banner — the summon AE is
deleted once, before any duplicate exists; (b) no uncaught crash / dialog opens — the double-delete
line is gone; (c) new token survives — old "Summon:" AE is gone before the new token/AE exist.

**Test (Phase 4):** `findPreviousAnchor` is the only unit-testable piece (pure selection). Full
timing/hook-ordering verified by LIVE smoke re-test of R15+R43 — NOT unit-testable without a Foundry
mock (none in tests/). Honest limitation; do NOT mark R15/R43 PASS until live-verified.

**Tradeoff to disclose in smoke report:**
- Cancel at the placement crosshair → the OLD Tulpa is already dismissed. Recast = replace, so
  acceptable; slot is already consumed-on-cancel today (invariant #2).
- **Chat-card "Summon"-button path (deferred cast):** preUseActivity may not fire for that path, so
  the recast pre-dismissal wouldn't run → casting over a live Tulpa via the chat button would leave
  TWO live tulpas (no crash, graceful degradation). The live cast path is INLINE (crosshair, fires
  preUseActivity), so this is an unexercised edge; note as a known limitation, not a blocker.
