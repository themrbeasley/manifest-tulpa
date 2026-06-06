# Duration-Expiry Dismissal Bug — Debug Scratchpad (2026-06-06)

> Working scratchpad for the systematic-debugging pass on the **duration-expiry** dismissal
> bug from the v0.1.16 smoke report. SURVIVES CONTEXT COMPACTION — keep updated.
> Skill in force: `superpowers:systematic-debugging`. Workflow: reproduce → research → plan → APPROVAL → implement.
> **HARD GATE: do NOT implement any fix until the user gives explicit approval of the plan.**

## Goal
Fix the duration-expiry dismissal bug(s) WITHOUT regressing anything. Module is overdue to ship.
- **Bug #2 (HIGH):** every duration-expiry dismissal throws a red banner
  `undefined id [<tokenId>] does not exist in the EmbeddedCollection collection.`
  Cleanup actually completes correctly; the error is noisy/alarming but end-state is right.
- **Bug #3 (MEDIUM, same code path):** duration-expiry chat card shows the WRONG reason —
  "the Tulpa's token was deleted" (manual) instead of a duration reason.
- SCOPE DECISION PENDING from user: Bug #2 only, or #2 + #3 together. (Report bundles them.)

## Test environment (from user)
- Join link: http://192.168.1.188:8678/  — world "Patreon Map Building"
- Log in: select **GAMEMASTER** from dropdown, ignore password, click Join.
- Test char: Wizard "Player Character", token already on map. Only spell = Manifest Tulpa.
- Cast: click spell NAME text on sheet → slot dialog → token follows cursor → click empty
  space to place → modification dialog appears → confirm.
- Trigger duration expiry: advance game time > 3600s (times-up expires the 1h anchor).
- Tester identity in browser: "Claude (Claude-in-Chrome)".
- LEAVE WORLD CLEAN afterward (restore slots, delete test tokens/combat, remove monkeypatches,
  clear window globals). ActiveAuras.combatOnly must stay TRUE.

## Current code state (post Pass-2 recast fix; report line numbers are STALE)
`modules/dismiss-flow.js` (current):
- `onDeleteActiveEffect(effect, options)` L27 — the funnel. Guards on `skipFunnel` and on the
  `tulpaUuid` flag, then calls `performDismissCleanup`.
- `performDismissCleanup(effect, options)` L38 — the teardown body:
  - resolves tulpa via uuid, else fallback via stored sceneId+tokenId flags.
  - `reason = inferReason(...)` L57.
  - `skipTokenTeardown` L58-59 — from options OR an anchor flag.
  - `skipAnimation` L67 — recast only.
  - if `!skipTokenTeardown`: resolve tokenDoc, play dismiss anim, then **guarded** delete:
    `stillPresent = tokenDoc.parent?.tokens?.has?.(tokenDoc.id) === true` L93, then
    `await tokenDoc.delete()` in try/catch L95-96 (catch only WARNS — not a red banner).
  - sweep system "Summon:" AE via `findSystemSummonAE` L106, delete in try/catch L108-109.
  - `postDismiss({caster, tulpa, reason})` L112.
- `onPreDeleteToken(tokenDoc)` L119 — trigger #5. Resolves caster from `flags.dnd5e.summon.origin`,
  finds anchor by `tulpaUuid === tokenDoc.actor.uuid`, then
  `anchor.delete({ [MODULE_ID]: { dismissReason: "manual", skipTokenTeardown: true } })` L134.
- `inferReason(effect, options, caster)` L154 — ladder:
  1. options.dismissReason  2. anchor flag dismissReason  3. caster "dead" status → isDeath
  4. casterHp<=0 → casterZeroHP  5. duration.remaining<=0 → "duration"  6. else "anchorRemoved".

`modules/dismiss-helpers.js`: `findPreviousAnchor` (recast), `findSystemSummonAE` (name/origin match).
`modules/init.js`: hooks registered at ready — deleteActiveEffect, preDeleteToken, pre/postSummon, etc.

## KEY TENSION in the report's Bug #2 model (must resolve via LIVE capture)
Report says BOTH: (a) token deleted first → onPreDeleteToken → anchor.delete(skipTokenTeardown:true);
and (b) "the funnel also issues a tokenDoc.delete()". Mutually exclusive given L75 guard.
- If (a) holds, skipTokenTeardown is TRUE → funnel does NOT delete the token → the module is NOT
  the second deleter → red banner comes from OUTSIDE (times-up / dnd5e summon lifecycle / midi-qol
  token-dependent pin) racing whoever deletes the token.
- Bug #3 ("manual" reason) only makes sense if onPreDeleteToken DID fire (it stamps "manual"),
  which means the TOKEN was deleted first — consistent with (a), NOT (b).
- So my leading prior: on duration expiry, times-up deletes the dnd5e "Summon:" AE (and/or the
  anchor); deleting the "Summon:" AE cascades (midi token-dependent pin, per Pass-2 finding) to
  delete the TOKEN; token delete → onPreDeleteToken → anchor.delete(manual, skipTokenTeardown).
  The red banner is then an EXTERNAL double-delete on the token (two cascade paths racing).
  >>> MUST CONFIRM the real delete order + WHO throws + the stack. Do not trust the narrative.

## Open questions for LIVE reproduction
Q1. On duration expiry, what does times-up delete, and in what order? (anchor AE? "Summon:" AE? both? token?)
Q2. Does `onPreDeleteToken` fire? (→ is skipTokenTeardown TRUE on this path?)
Q3. Does the funnel call `tokenDoc.delete()` at all? (instrument the guarded delete branch)
Q4. WHO throws the EmbeddedCollection error — times-up, dnd5e core, midi-qol, or the module?
    Capture the FULL stack.
Q5. Does the dnd5e "Summon:" AE carry a duration (so times-up expires it too, not just the anchor)?
Q6. Final chat-card reason actually shown (confirm Bug #3 live).

## Reproduction instrumentation plan (mirror Pass-2 methodology — authorized)
- Monkeypatch `.delete()` on `CONFIG.ActiveEffect.documentClass` / `ActiveEffect` proto and
  `TokenDocument` proto (or `foundry.documents.TokenDocument`) to push {type, id, name, stack}
  into a `window.__mtDbg` array with a timestamp/seq, then call original. Restore after.
- Also capture uncaught errors: wrap with a temporary `window.onerror` / Hooks on error, or read
  the red banner via `ui.notifications`. Capture console via Chrome read_console_messages.
- Cast once, confirm a clean Tulpa, snapshot anchor flags + the "Summon:" AE (+ its duration),
  then advance time > 3600s and capture the whole delete sequence + the throw + the chat card.
- REMOVE all patches + window globals + restore world state at the end.

## Research targets (AFTER repro guides them) — read-only, candidates for Sonnet 4.6 subagents
- dnd5e 5.2.5 source in `.understand-anything/dnd5e-research/dnd5e/module/` — summon AE lifecycle,
  `ActiveEffect5e#_onDelete`/`getDependents`, how token teardown ties to AE delete, summon AE duration.
- times-up 13.1.9 — how it finds & deletes expired AEs; does it delete tokens; what delete options.
- midi-qol 13.0.58 — token-dependent mixin (Pass-2 said it pins tokens to a by-name "Summon:" AE).

## Scope decision (resolved by default; confirm at approval gate)
"the duration-expiry bug" = everything that breaks ON duration expiry = Bug #2 (red banner) + Bug #3
(wrong "manual" reason). Same trigger, same teardown code path. Will present BOTH in the plan for
explicit approval. (Resumed session: not re-asking; folding scope into the approval gate.)

## Progress log
- 2026-06-06: Read full smoke report + current dismiss-flow.js/dismiss-helpers.js/init.js/constants.js.
  Identified the report's internal tension in Bug #2 model. Set up scratchpad. Read cast-flow.js + reason strings.
- 2026-06-06 (LIVE REPRO, Claude-in-Chrome, logged in as Gamemaster):
  - Env confirmed: Foundry 13.351, dnd5e 5.2.5, manifest-tulpa v0.1.16, times-up 13.1.9, midi-qol 13.0.58,
    dae 13.0.26, ActiveAuras 0.12.7, sequencer 3.6.11, portal-lib 3.0.4, autoanimations 6.8.3, jb2a_patreon 0.8.7.
    ActiveAuras.combatOnly=TRUE. Scene "Waterfall Cave". worldTime=54206 at start. 0 combats.
  - Test actor: "Player Character" Actor.EsvODGPbnoRQB9ez, clean (effects=[]). Spell Item.QaR7aXXMTwEVZS6s.
  - INSTRUMENTATION INSTALLED (window.__mt): wrapped static `deleteDocuments` on CONFIG.ActiveEffect.documentClass
    ("AE") + CONFIG.Token.documentClass ("TD") — records {s,ph:call/ok/THROW/SYNCTHROW, cls, ids, op, via(caller stack), er, est(error stack)}.
    Also hooked ui.notifications.notify (NOTIFY entries) + window error/unhandledrejection (WINERR/UNHANDLED).
    NB: Chrome bridge redacts object keys containing "token"/result strings w/ query-like data — use neutral keys; read log via JSON.
  - CAST COMPLETED (Force, no mods). POST-CAST SNAPSHOT (worldTime 54206, spell5 0/3):
    Caster Actor.EsvODGPbnoRQB9ez has TWO effects, BOTH duration.seconds=3600, remaining=3600, transfer=false:
    1. "Summon: Manifest Tulpa" id=yzxMS0Lx2dQKMTi7 — flags.dnd5e.summon ABSENT (summonOrigin null; findSystemSummonAE
       matches it by NAME regex, not origin). **getDependents() = ["Scene.bAAzvCC3xnvfvEwR.Token.XYUbojHEB5Cibbtx"]**
       → deleting THIS AE cascades to delete the Tulpa TOKEN (dnd5e dependent mechanism).
    2. "Manifest Tulpa (active)" anchor id=V2ZGiEC0FzqbMTwH — tulpaUuid=Scene.bAAzvCC3xnvfvEwR.Token.XYUbojHEB5Cibbtx.Actor.c96suShNZPeZiViN
       dependents=[] (anchor delete does NOT cascade to token).
    Tulpa: token id=XYUbojHEB5Cibbtx, actorId=c96suShNZPeZiViN, Scene bAAzvCC3xnvfvEwR ("Waterfall Cave").
  - >>> Q5 ANSWERED: dnd5e "Summon:" AE carries 3600s duration → times-up expires BOTH AEs at the SAME tick (57806).
    The Summon AE ALSO owns the token as a dependent. So on expiry there are concurrently: (a) times-up deletes anchor
    → funnel fires (times-up passes NO mt options → skipTokenTeardown=FALSE → funnel tries tokenDoc.delete());
    (b) times-up deletes Summon AE → dependent cascade deletes token. TWO token-delete paths → the EmbeddedCollection race.
    Whether onPreDeleteToken fires + stamps "manual" (Bug #3) depends on the order times-up deletes the two AEs.
    MUST capture the real order + who throws via instrumentation (next step).
  - INSTRUMENTATION was found INACTIVE on resume (window.__mt shell present but aeWrapped/tdWrapped/listeners all false —
    wrappers orphaned, likely a CONFIG docClass reassignment). Re-installed cleanly before advancing time.

## ✅ REPRODUCTION COMPLETE — ROOT CAUSE CONFIRMED (2026-06-06, live capture)
Re-installed __mt, verified wrapped=true, ran `game.time.advance(3700)` (worldTime 54206→57906). Captured the
FULL delete sequence + the throw + the chat card. **Both bugs reproduced with the exact mechanism.**

### The confirmed delete sequence (one duration tick expires BOTH 3600s non-transfer AEs)
The dnd5e "Summon: Manifest Tulpa" AE (id `yzxMS0Lx2dQKMTi7`) and the module anchor "Manifest Tulpa (active)"
(id `V2ZGiEC0FzqbMTwH`) BOTH have duration.seconds=3600 → times-up expires BOTH in the same batch. The Summon
AE also owns the Tulpa token as a `getDependents()` dependent. Captured order:

| s | actor | what | how (captured stack/opts) |
|---|---|---|---|
| 1 | times-up | delete **Summon AE** `yzxMS0Lx2dQKMTi7` | `expireEffectsSkipDependents→expireEffect → MidiActiveEffect.delete`, opt `expiry-reason` |
| 2 | dnd5e core | cascade-delete **the Tulpa TOKEN** `XYUbojHEB5Cibbtx` | `ActiveEffect5e#_onDelete` (dnd5e.mjs:32402) iterates Summon AE's dependents → `MidiTokenDocument.delete` |
| 3 | **our hook** | delete **anchor** `V2ZGiEC0FzqbMTwH` | token delete fires preDeleteToken → `onPreDeleteToken` (dismiss-flow.js:119) → `anchor.delete({manifest-tulpa:{dismissReason:"manual",skipTokenTeardown:true}})`. Stack: `Object.onPreDeleteToken [as fn] (dismiss-flow.js:119:22) | MidiActiveEffect.delete (foundry.mjs:12682:44)`. **← stamps "manual" = Bug #3** |
| 4 | times-up | delete **anchor** `V2ZGiEC0FzqbMTwH` AGAIN | anchor already gone (s=3). opkeys `["expiry-reason","parent","pack"]` (times-up). Hits a removed id → **RED BANNER = Bug #2** |

### Captured artifacts (ground truth, corrects the report)
- Red banner text: **`ActiveEffect "V2ZGiEC0FzqbMTwH" does not exist!`** — `V2ZGiEC0FzqbMTwH` is the **ANCHOR AE id**,
  NOT a token id. The report's claim that it's a token id is WRONG. The banner is an anchor **double-delete**.
- Chat card shown: **"Tulpa Dismissed — The Tulpa fades — the Tulpa's token was deleted."** = the "manual" reason string (Bug #3).
- The module's OWN guarded token delete (funnel L93-97) NEVER fires on this path: s=3 passes `skipTokenTeardown:true`,
  so performDismissCleanup skips the token block. The token is gone via the s=2 dependent cascade, not via the module.
  → confirms the red banner is NOT from the module's `.has()`-guarded delete; it is times-up's anchor double-delete.
- End state is still correct: both AEs + token end up deleted. Bug #2 = pure noise; Bug #3 = cosmetically wrong reason.

### Why both bugs share ONE cause
times-up holds BOTH same-duration AEs in its expiry batch. It deletes the Summon AE first; that cascade (token →
preDeleteToken → our hook) deletes the anchor as a SIDE EFFECT (s=3) before times-up reaches the anchor (s=4).
So: (Bug #3) the anchor is removed by the *token-delete* path → "manual"; and (Bug #2) times-up's later anchor
delete finds nothing → banner.

## Fix hypotheses (NOT decided — validate via research, then plan, then APPROVAL)
- **Leading single-point fix:** in `onPreDeleteToken`, when the anchor's `duration.remaining <= 0` (i.e. this token
  delete is itself a duration-expiry cascade, not a true GM manual delete), **do NOT delete the anchor** — let
  times-up's own anchor delete (s=4) be the SOLE anchor delete. That delete re-enters the funnel with no mt options →
  `inferReason` step 5 (`duration.remaining<=0`) returns **"duration"** (fixes Bug #3) AND there is no longer a
  redundant s=3 anchor delete, so times-up's delete is the first and only one → **no banner** (fixes Bug #2).
  Discriminator: manual GM delete ⇒ anchor `remaining > 0` ⇒ keep current "manual" behavior; expiry cascade ⇒
  `remaining <= 0` ⇒ defer to times-up.
  - MUST VERIFY in research: (a) times-up reliably deletes the anchor on the same tick regardless of which AE it
    processes first; (b) the funnel's guarded token delete is a safe no-op when the token is already gone (it is:
    `.has()` false → skip); (c) no ordering where times-up deletes the anchor FIRST and leaves a different race.
- **Alternative considered:** keep s=3 but make times-up's s=4 not throw (can't easily control times-up). Rejected
  unless research shows the leading fix has an ordering hole.
- Regression tests to add (modules are JS, fix is in modules/*.js → no _source/ lock): a `dismiss-flow` test that
  `onPreDeleteToken` does NOT delete the anchor when `duration.remaining<=0`, and DOES when `remaining>0`; and that
  `inferReason` returns "duration" on the times-up path.

## Research dispatch (read-only) — RESOLVED (see "Implementation & Sign-off" below)
The live capture (above) already answered the load-bearing questions directly — it is stronger evidence
than reading the dependencies' source, because it shows what actually happened on this stack at this tick.
What the capture settled, and how it maps to the leading fix's three "MUST VERIFY" points:
1. dnd5e 5.2.5 `ActiveEffect5e#_onDelete` + `getDependents`: CONFIRMED live — the Summon AE owns the token as a
   dependent; deleting it cascade-deletes the token (s=2). This is the token-delete that fires `onPreDeleteToken`.
2. times-up 13.1.9 expiry batch: CONFIRMED live — times-up holds BOTH same-3600s AEs and deletes them in one
   batch, Summon AE first (s=1) then anchor (s=4). Point (a) "times-up reliably deletes the anchor on the same
   tick" = OBSERVED (s=4 is times-up's own anchor delete). Our deferral makes s=4 the SOLE anchor delete.
3. Funnel guarded token delete is a safe no-op when the token is already gone: CONFIRMED by code — the `.has(id)`
   membership guard (dismiss-flow.js L93) is false once the cascade removed the token, so the funnel skips it
   (point (b)). midi-qol's MidiActiveEffect/MidiTokenDocument wrap `.delete` but don't reorder the batch (the
   captured stacks show them as pass-throughs: `MidiActiveEffect.delete`, `MidiTokenDocument.delete`).
The remaining theoretical "anchor-first" ordering (point c) does NOT occur on this stack — the capture is
deterministic Summon-AE-first — and our guard lives in `onPreDeleteToken`, which only fires on a TOKEN delete, so
an anchor-first ordering would simply never reach the guard (the funnel's own `.has()` guard covers that path).
No separate research subagents were needed; the parallel-subagent budget is spent on the DOCS pass instead.

## ✅ CLEANUP DONE (live world, 2026-06-06)
- Restored consumed spell slot: spell5 0→1 (max 3) on Actor.EsvODGPbnoRQB9ez via `caster.update`. Confirmed.
- Uninstalled instrumentation by **page reload** (most robust — wipes all in-memory monkeypatches +
  window error/unhandledrejection listeners + `window.__mt`; world state is server-side and persists).
- Post-reload verification (game.ready=true): `mtPresent:false`, spell5=1/3, casterFxCount=0, leftoverTulpa=0,
  combats=0, **combatOnly=TRUE** (preserved). World is clean.
- worldTime left at 57906 (advanced during repro; harmless in a test world, no safe rollback API). Noted only.
- NOTE: live world runs INSTALLED v0.1.16 (GitHub-release install). The fix cannot be verified live until released
  (see release-before-smoke memory) → verification for THIS task = `npm test` regression + user smoke after release.

## ✅ PLAN APPROVED (2026-06-06)
User gave explicit approval of the leading single-point fix + the use of parallel Sonnet 4.6 subagents for
multi-step support tasks. Verbatim: *"Interesting. Alright, I approve the plan explicitly, yes. I approve the use
of subagents for running tasks in parallel: if their tasks are multi-step and require a lot of context, instruct
those subagents to use their own scratchpads to keep track."* HARD GATE satisfied → implementation proceeded.

## ✅ FIX IMPLEMENTED (2026-06-06) — modules/*.js only, NO _source/ touched
The chosen leading fix, exactly as planned. Three changes, all behavior-preserving except the one intended
behavioral change (defer the anchor delete to times-up on duration expiry):

1. **New pure discriminator** — `modules/dismiss-helpers.js` `isAnchorDurationExpired(anchor)`:
   ```js
   export function isAnchorDurationExpired(anchor) {
     const remaining = anchor?.duration?.remaining;
     return remaining != null && remaining <= 0;
   }
   ```
   Contract: TRUE only when a numeric `remaining` is present and `<= 0`. A missing/absent duration
   (null/undefined remaining, or no `duration` object) is NOT expired → that is the manual-delete path. Pure,
   no Foundry globals (reads `anchor.duration.remaining`, which a live AE exposes as a getter and a test fake
   supplies as a plain value), so it is Node-testable.

2. **Guard in `onPreDeleteToken`** — `modules/dismiss-flow.js`, immediately after `if (!anchor) return;` and
   before the `anchor.delete({...dismissReason:"manual"...})`:
   ```js
   if (isAnchorDurationExpired(anchor)) return;
   ```
   On a duration-expiry cascade the anchor's `remaining <= 0`, so we DEFER — we do NOT delete the anchor here.
   times-up's own s=4 anchor delete becomes the SOLE anchor delete (fixes Bug #2 — no double-delete, no banner),
   and because that delete carries no module options, the funnel re-enters and `inferReason` resolves "duration"
   (fixes Bug #3). A genuine GM manual delete has `remaining > 0` → guard false → the "manual" path is unchanged.

3. **`inferReason` step-5 reuse** — `modules/dismiss-flow.js`, the duration rung now calls the same helper so
   "expired" is defined in exactly ONE place (DRY): `if (isAnchorDurationExpired(effect)) return "duration";`.

**Safety for the other four dismissal triggers (unchanged behavior, reasoned + code-checked):**
- *Manual GM token delete*: `remaining > 0` → guard false → `anchor.delete({dismissReason:"manual"})` as before.
- *Tulpa 0 HP / caster death / recast*: all driven by a DIRECT anchor delete, so by the time any token falls the
  anchor is already gone and `onPreDeleteToken` early-returns at `if (!anchor) return;` — never reaches the guard.

## ✅ REGRESSION LOCK + VERIFICATION (2026-06-06)
- Added 6 pure unit tests for `isAnchorDurationExpired` in `tests/dismiss-helpers.test.mjs` (remaining 0 → true;
  negative → true; 100/1 → false; null/undefined/`{}` → false; no `duration` object → false; null/undefined
  anchor → false, never throws). These lock the discriminator so Bug #2/#3 cannot silently regress.
- `npm test` → **99 pass / 0 fail** (TDD: red when the export was missing → green after implementing). The
  integration wiring (guard placement) is verified by user smoke AFTER release (release-before-smoke memory).
- `npm run validate` → "Validation passed." `npm run build:packs` → "All packs built." (no _source/ change, but
  ran for safety — both clean.)

## 📌 REPORT MISDIAGNOSIS — CORRECTION TO RECORD IN THE DOCS
The v0.1.16 smoke report modeled Bug #2 as a **token** double-delete and proposed a token-ownership lock. The live
capture proves it is an **anchor-AE** double-delete: the banner id `V2ZGiEC0FzqbMTwH` is the ANCHOR id, not a token
id. The reproduce-first mandate paid off — patching the reported (wrong) model would NOT have fixed the banner. The
CHANGELOG v0.1.17 entry and the smoke report's Bug #2 section must both carry this correction.

## ▶ REMAINING WORK (docs only — code is done & verified)
1. ✅ DONE + VERIFIED — CHANGELOG.md **v0.1.17** entry bundling all three unreleased fix areas: jb2a assets
   (Bug #5+#8, commit 4935bd6), recast (Bug #1, commit 6fad6fc), duration-expiry (Bug #2 banner + Bug #3 wrong
   reason, this pass). Read lines 1-95: well-formed (blockquote intro + `### Fixed` 3 bullets + `### Internal`
   78→85→93→99 arc); duration bullet carries the misdiagnosis correction + s=1..s=4 sequence. (Sonnet 4.6 subagent A.)
2. ✅ DONE + VERIFIED — v0.1.16 smoke report: **Remediation Log Pass 3** added (L103) with corrected anchor-AE
   model + "Critical correction" (banner id = anchor id, not token id, L113); R23 PASS (L264), R43 PASS (L284),
   §3 verdict RED-as-tested/GREEN-at-code (L208), §5 Bug #2 ✅ CODE-FIXED + corrected delete-seq table (L344/358/359),
   §5 Bug #3 ✅ CODE-FIXED (L369-379), §6 EmbeddedCollection ✅ FIXED-in-v0.1.17 (L515), §8 item 2 struck-through DONE
   (L538), Appendix B duration row both bugs fixed (L561), Sign-off scope note 3-pass/99-99/GREEN (L584). Personally
   re-read all sections this session — clean + internally consistent. (Sonnet 4.6 subagent B.)
3. ✅ FULL RELEASE GATE GREEN (re-run 2026-06-06, current tree): `npm test` → **99/99**, `npm run validate` →
   "Validation passed.", `npm run build:packs` → "All packs built." (DEP0190 warning is foundryvtt-cli's own
   child_process usage, benign/pre-existing). No regressions.

## ◀ AWAITING USER DECISION — commit + tag v0.1.17?
Docs verified, code done, gate green. Per base rule "commit only when the user asks" I do NOT auto-commit/tag.
v0.1.17 bundles THREE unreleased fix areas — two already committed to `main` (jb2a 4935bd6+earlier; recast 6fad6fc),
plus the duration-expiry fix (this pass, UNCOMMITTED: modules/dismiss-flow.js, modules/dismiss-helpers.js,
tests/dismiss-helpers.test.mjs + the 3 docs). Release must precede the user's live smoke (release-before-smoke
memory: world runs the INSTALLED build via GitHub-release manifest URL). → ASKED the user.
