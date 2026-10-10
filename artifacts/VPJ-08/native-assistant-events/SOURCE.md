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
