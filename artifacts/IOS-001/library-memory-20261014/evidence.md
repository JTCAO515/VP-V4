# IOS-001 Library / Memory local frontend slice

Owner: this independently dispatched library-memory chat; no delegation. Worktree `ios-library-memory-20261014`, branch `codex/ios-library-memory-20261014`, base `de0ce108aab1df832913a2b9103f10977443c6af`. Git started clean. Current effective model/service tier are not exposed and were not verified. Read root AGENTS, current DEVELOPMENT-RULES and unique VP-V5-worktrees/HANDOFF; the root historical handoff does not provide authority.

## Implementation and Main integration

- Add the three Swift files in `ios/VisePanda/VisePanda/Features/Frontend/LibraryMemory/` to the app target (PBX is Main-owned).
- Main wraps each `NativeFrontendLibraryView(state: state)` / `NativeFrontendMemoryView(state: state)` in its outer per-tab NavigationStack. Both receive the same `NativeFrontendState` reference. Only modal editors/previews own nested stacks.
- Library consumes Main-owned material IDs; Chat's `openMaterial(id)` sets the same selectedMaterialID and opens detail, independent of search/filter. Source and journey are visible. Save/unsave mutates the existing material; unsave does not delete it. Search covers title/content/source, including user input and assistant output.
- Detail routes through existing `openJourney` / `openChat`. Export is a local text preview without file creation. Sharing shows content/source and explicit intended audience, confirms preview only, resets confirmation when audience changes, and supports cancellation. No external send/system share invocation.
- Memory shows original source/scope; travel preference is distinct from assistant personality. Editor validates and reviews old/new text and scope before confirmation. Cancel preserves original bytes. Forget requires confirmation and removes only the current sample. Empty restore is explicit and restores only sample memories, preserving materials/journeys/chat. Feedback uses Main-owned `notice` and is explicitly local, not durable history or tracking.
- Uses existing Boundary/StatePanel and iOS17 APIs, semantic fonts, wrapping text, lists and stable accessibility IDs. No brand/media assets, backend model, transport, persistence or production/domain-store changes.

## Validation (2026-10-14)

PASS: `tests/contract/ios-frontend-library-memory/verify.sh`: Swift parse; real iPhoneSimulator SDK Swift6 typecheck targeting iOS17 with exact Main State/AppTab source; compiled macOS executable with 22 preconditions against actual State/actions. Cases cover content/source searches, saved filtering, save/unsave, same-ID library/journey/chat navigation, correction blanks/size/missing-ID rejection, stable ID/source, personality independence, forget, missing correction after forget, explicit empty-only restore and material preservation.

PASS: `pnpm docs:check` (existing documentation baseline).
PASS: `git diff --check` and owner review of exclusive changed paths.

UNRUN: whole App target compile, PBX/outer-stack integration and Simulator click/visual/dynamic type QA: Main's exclusive integration/build/resource ownership. Real device/VoiceOver, real backend Auth/provider/persistence/Memory recomputation and release are also UNRUN; this code is an explicit local frontend example. UI alert cancellation and modal interaction are source-reviewed, not asserted as observed runtime behavior.

No Issue closure: this slice does not complete #203 or #187. No remote deployment, permission/configuration change, provider fee, database operation or use of another owner's simulator/derived data. Revert the slice commit to roll back; it carries no migration or persistent state.

## IOS-011/#692 navigation repair (2026-10-14)

Main reported whole App build PASS (34.2s) and actual library list/detail/share preview/confirm/cancel/same-ID Chat PASS. Memory row tap succeeded but two subsequent snapshots and the supplied screenshot remained on the Memory root, with no edit/forget detail. This is retained as a real UI FAIL; the 22 state checks did not cover SwiftUI presentation. Read the provided runtime log (no navigation/destination error match) and inspected the provided root screenshot. Main owns the exact simulator feedback loop; no local simulator/resource copy was created.

The suspected seam was a Boolean presentation binding derived from an optional local selection, combined with a conditional destination. Replace it with `NavigationLink(value: NativeFrontendMemoryRoute.detail(memoryID:))` and a dedicated Hashable route destination receiving the ID directly; remove the nullable selection and empty destination branch. Main's existing outer stack retains navigation ownership. This is a bounded repair hypothesis, not a confirmed root-cause claim before runtime retest.

PASS: reran `verify.sh` against the repair (Swift parse, actual iOS17 Simulator SDK Swift6 typecheck, 22 unchanged actual-State assertions) and reviewed the source diff. No state/store/shared-shell change. UNRUN here: actual Memory row → detail → edit/correction confirm/cancel → forget confirm/cancel → empty restore. Main must rerun that original scenario and record observed PASS/FAIL; state assertions or typecheck cannot substitute for it.

## Main Root integration and actual retest (2026-10-14)

The `10b27d33` leaf repair alone still failed in Main's settled simulator: the row became selected but remained on the root. Main identified the integration mismatch: the shared root used `NavigationStack(path: $router.path)` with a strongly typed `[AppRoute]` path, while this leaf supplies `NativeFrontendMemoryRoute` values. This second actual FAIL is preserved; the original optional-selection hypothesis was not sufficient.

Main, the sole shared Root writer, changed only the local frontend branch to an implicit NavigationStack in the existing TabRoot. The production `[AppRoute]` router and existing TabView remain. No shared Root change is included in this slice branch. The integration requirement for this value-based leaf is an outer stack capable of carrying its dedicated route type; the production strongly typed AppRoute stack is not compatible as-is.

Main's source-thread report `01a13311-9212-7db3-8c75-691eac0f03ea` states actual whole App build PASS (28.7s) and real simulator PASS after that Root fix: Memory row → detail → editor with actual input → old/new diff alert → confirm correction with the same ID and new title → cancel forgetting retaining content → confirm forgetting returning to empty → explicit restore returning the original sample. Main retains the video and rs/1 step evidence in its own artifact; the exact artifact path and integrated full head were not supplied to this owner, so this is attributed Main runtime evidence, not an independently executed owner test or a claim that `10b27d33` alone passes. Library actual interaction PASS from the earlier Main run is retained above.

No additional Swift source change or test-matrix expansion in this update. Existing unchanged-source checks are reused; evidence diff check PASS. Dynamic Type, physical device/VoiceOver, correction cancellation not explicitly reported in this retest, real backend/Auth/provider/persistence, actual Memory-driven answer changes and release remain UNRUN. Local example mutation is not real Memory acceptance. Owner/lease remains with the original library-memory chat for later scoped repair.
