# Native assistant events source / integration candidate

Owner: new Native chat 01a1245a-e7d1-7261-9dbe-32041ac5ea1a.
WT/branch: vpj08-native-assistant-events-20261010, base 6e341f10e6076d259e1781246c493d5d60137e71.
First actual own product write: exec fa5dde after apply_patch, 2026-10-10T05:49:57Z, exit 0; first product commit 86290bc0.

Own production files: Features/AssistantEvents/{Lifetime,Projection,Decoder,Store,Cursor,Invalidation} with NativeAssistantEvents prefix. No shared source edited.

The decoder follows the sole TS owner's actual candidate protocol.ts (assistant-events/1); it is not a second externally authoritative WIRE. Reads complete finite <=65536 byte / <=50-event SSE pages, requires final checkpoint, exact fields/types, contiguous sequence and conversation-derived eventId, rejects unknown schemas/types/statuses, truncation and cursor rollback. Task sequence is delivery ordering only, never a Task revision authority. Artifact revision remains the original revision.

Selection binds original NativeDataScope (endpoint, subject, mobileEpoch, generation), current session, original policy, conversation and selection generation. Late callback/account/epoch/selection/background changes cannot advance ack. Store does not own draft, pending intake/planning bytes, navigation, focus, scroll, billing, cancellation or Trip confirmation. Original readers must fence their own publications and recheck original current policy, conversation/task membership and artifact revision; events contain no display content.

Cursor codec persists only owner/endpoint/epoch/session/policy/conversation/sequence. No message/result content or action receipts; restore requires freshly qualified exact conversation. Vault storage remains in the shared Session candidate. Store advances only after whole-page decode, original readback and successful cursor write. Failed reads clear sensitive displays while original immutable pending remains outside this store.

## Shared full-scope candidate; not applied and not leased

Complete five-file/26-hunk package is now in `Candidates/README.md` and `Candidates/pins.json` with actual current Journal baselines, individual full/hunk before/after SHA, current owner release requirements, and preserved original39 / PBX IDs. Main6e old Session candidate was removed because actual owners carry unmerged newer source. Candidate source parsing and isolated application are preparation checks, never actual registration/product delivery.

## Actual checks

PASS: Swift typecheck on own source using exact minimal NativeDataScope/NativeDataError support types.
PASS: 7 XCTest behavior tests on same owned source copied into a disposable macOS14 Swift package (check-foundation.py); 0 failures, exit0, log /tmp/vpj08-native-events-foundation.log. This is foundation evidence, not App target/Simulator/Auth evidence.
Initial package build failed because temporary package lacked macOS14 Observation minimum; fixed only temporary package platform, no production source change.
UNRUN: registered App target/owned Simulator, actual signed Auth/durable SQL/SSE integration, process restart/cross-account server replay, original privacy erasure consumer integration. Shared lease and reviewed durable WIRE are still inputs.
UNRUN: physical device/SDK physical attributes/sharing/provider target. No production/permission/payment/model operations.

Final same-task candidate evolution: Main canonical-forward-source blocker fixed with a selection-local monotonic source floor and exact original page snapshot match after each await; older reply cannot clear newer qualified projection or ack. Main-approved source_retired ordinal-only union aligns with soleTS c717570b: retire known hint or invalidate read caches without clearing context/pending/navigation or stopping replay. Original7 foundation PASS remains scoped historical evidence; new targeted retirement2 and source-race1 evidence is separate. Shared5file/26hunk latest pins are Candidates/pins.json. No actual owner release, Main lease, App registration or Auth/SQL capability is inferred from preparation validation.

Current cursor privacy batch adds original Journal Models/VaultSources/Store/View candidates and Session typed reader/physical absence, documented in Candidates/CURSOR-PRIVACY.md. Package now9files; current pins supersede old5-file inventory only. Original29 sources preserved plus one real new cache projection source; All34/catalog remains same domain set. No artifact正文/raw JSON/credential export or invented receipt; all shared still unapplied.

## Actual granted integration (supersedes preparation status above)

Main granted exact pins60768c3a, 9files/39hunks after actual current Journal/Turn/Result Native releases. Normal dependency merges collect true maine369 and unmerged Journal020f9d72; all9 actual before matched original pins, then exec2658dd applied precise zero-context patches and independently verified all9 after. Production source fixed at e4f68c66; own registered tests at a76cf002. No whole-file overwrite, originalPBX IDs/29 sources/All34/catalog/immutable request/choice/writer fields lost. Final #196 main-base PR must wait for Journal675 actual protectedmain/sourceEQ; dependency merge is not its final PR scope.

Observed affected gate: unsigned Appbuild PASS; initial testbuild FAIL on own XCTest inherited initializer isolation, corrected only own nonisolated class/explicit MainActor methods; incremental ad-hoc testbuild and strict signature verification PASS. Exactly2 selected registered tests PASS0FAIL0skip, raw summary at registered-r1/: original Session synthetic Auth transport→finite byte SSE→closed decoder→original Activity GET→cursor persistence; actual Simulator Keychain→original30-source Journal (old29 plus typedcache)→protected export2 safe fields→A denial preserves B and original ResultJournal immutable bytes→matching purge physicalabsence→originallogout fixed cursor absence. Test host no provider, no real server Auth/SQL/RLS/durable storage claim. Tests do not dispatch Ask/planning/choice/Trip writes; fixture credential login is synthetic. Only selfcreated85646BD4 Simulator was booted; shutdown/delete actual exit0. Source hashes pin exact tested product/test version; original7/retirement2/sourceRace1/A-B2 evidence stays separate and reused, no new all-suite green claim.

Remaining specific owned test seam: NativeJournalDataTests.swift original line52 expects29 and needs original29 exact IDs plus one genuine projection. Candidate only3hunks, before1edde6dd/after539ec51e/patch560ff1a5. Current owner release received via Main; exact Main apply lease still pending, sharedtest unchanged. Real Auth/SQL consumer chain, provider/physical device/share/backup/physical attributes remain UNRUN. Parent#196 is not closed by this local scope.
