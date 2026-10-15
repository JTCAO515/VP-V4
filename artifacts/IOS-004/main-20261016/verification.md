# IOS004 integrated development evidence

Issue #506; QA baseline `24570c2fb284b9c12577afc012720a56553b8f50`. Main integration uses the original Trip, Proposal, confirmation, snapshot and Support authorities. Implementation is complete; independent final-head review, applicable CI and protected merge are recorded in the PR.

## Actual checks

- Native source `cf2cbdec` plus Main Today/Trip/offline-deny/PBX integration: full App Simulator builds PASS (62.2s initial, 39.9s after recovery fix). Main Archive strict optional-field integration and new `38d36dad` test class: actual App target XCTest PASS 9/9 (four NativeTripAddressTests and five existing NativeArchiveDataTests). XcodeBuildMCP test log `test_sim_parser-debug_2026-10-15T16-44-07-179Z_pid2509_f4300b06.log` records TEST BUILD/EXECUTE SUCCEEDED. Existing unrelated compiler/runtime warnings remain; no device/VoiceOver claim.
- Final backend SQL `441e51dc`, actual Main checkout: owned PostgreSQL17 entry PASS 1/1, zero skips, 6.376s. Original Proposal/Confirm/replay/stale/actor/clear/restore/delete/export, Web Cookie and Native Bearer SDK projections, exact source/ACL/config drift rejection, codec parity, scoped moves/replacement, eight original guards and owned-resource failure cleanup are exercised. The SDK transport uses synthetic local signing and a bounded REST adapter to the actual private PG, not managed GoTrue/PostgREST.
- Current coherent canonical regression: PASS 33/33, zero skips, 22.348s. Historical prefix -> original canonical append rollback/commit/catalog proof -> current successors -> original consumers; HTTP uses all 161 migrations/164 SHA-pinned sources in natural order. Original guards, role/ACL and Task/capacity/source withdrawal cases remain intact. Fresh synthetic output is preserved privately; historical committed artifacts are unchanged.
- Main shared/backend/Web contracts PASS 36/36 at the pre-final Web review boundary; Web owner final hidden-diff/version review adds focused cases, with final exact-head results recorded in the PR. Original Trip/scoped contracts PASS 31/31; backend reports its final affected 168/168 plus old core-export17/archive6 checks, source-pinned in its verification file.
- TypeScript, source lint, documentation, PBX syntax and diff checks PASS at their recorded boundaries; final results belong to the PR. Artifact guard against actual QA base PASS (+0.25 MiB before final evidence). Its first default-origin/main run included historical QA changes and failed at 8.23 MiB; the 5 MiB limit was not changed.

## Actual browser interactions

Browser plugin absent; existing system Chrome through installed Playwright, with no browser/dependency installation or borrowed browser session. Actual Next route and production Canvas/Section/Editor components, desktop 1440x1000 and mobile 390x844. Cookie API replies and a locally signed identity are explicitly synthetic fixtures, with no target database or provider. The fixture Trip is labeled `Synthetic UI fixture / 非真实账号或数据库`.

Final Web source `5255ea0a` / Main `1eeb4028`, actual DOM interactions PASS:

1. Input Chinese text -> original pending before/after diff; no confirmed version changes before explicit Confirm.
2. Identity invalidation hides review and disables original Confirm; requalification restores it.
3. Explicit original Confirm -> authoritative fixture version6 readback with unchanged original text and separately unavailable source.
4. Lost prepare ACK -> exactly one POST, original GET-only recovery -> explicit original Reject; saved version6/address remain, editing unlocks.
5. English fixed copy preserves Chinese user text. No horizontal overflow, framework overlay or relevant browser runtime error.

Screenshots: `web-desktop-review.png`, `web-mobile-confirmed.png`, `web-mobile-en.png`. Initial temporary harness failures were an incorrect old places/actions response shape and use of context instead of page viewport API; both were corrected in the private test harness, without product changes. Mobile screenshots were reframed after visual inspection.

## Limits and invariants

Ordinary `read_trip_item_support_v1` EXECUTE remains disabled in the accepted migration chain. Confirmed manual text remains readable independently; references report unavailable. No grant, source activation, model/provider call, offline address permission, fee, shared database apply or production/release action occurred. The original Confirm definition and ACL remain unchanged; the runtime guard retains all 296 entries and metadata checks, changing only exact authored pins for five affected functions. Target Auth/grounded-source activation, true browser-to-managed-database joint acceptance, physical device, VoiceOver and release remain UNRUN.
