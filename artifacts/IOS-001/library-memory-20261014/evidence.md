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
