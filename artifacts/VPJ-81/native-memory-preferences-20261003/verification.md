# Native explicit Memory correction — 2026-10-03

#562 owned client core completed against fixed wire 1e3f0fe3dd9760b11d6136337d1cb4a3d51db14f:docs/contracts/native-memory-v1.md and backend72bcce616f3a449043c42470ce2c4e3147ad9dcd. Main owns Issue closure, final integration/review and merge. #564's separate completed snapshot remains0b48b576.

Implemented one shared Native Memory store and UI in VP and first-level Memory. Management GET is only for owner display; it never becomes model context. A current-input correction changes the unsent input only. Long-term create/update requires the explicit toggle and save action. Create captures explicit intent, obtains a server-minted consent through an immutable consentCreate operation, then creates exactly the requested profile. Correcting an existing record uses its ID/source receipt/revision CAS; no duplicate profile is substituted.

Unknown writes retain exact Data and operation IDs for explicit retry. Closed receipt fields bind actor/action/operation/profile/source/consent; only current readback matching actual saved summary/revision/state/granted consent permits the save cue or Undo. createUndo is revision1 only. updateUndo uses the distinct update operation, current resulting revision and bounded10-minute window. Pause, resume, revoke and delete use existing lifecycle authority. Revoked/deleted summary must be null. Actor changes clear profiles/pending/Undo. Conflict and unknown outcomes remain truthful; no automatic new operation/regrant/state recovery.

Explicitly selected current eligible Memory references (at most3) supply IDs to the existing ordinary goal context and planning task request. The v6 pending context selectors remain frozen across retries. A changed/revoked profile drops stale selected references; refreshed selection is explicit. The common five-result renderer discloses actual recorded Memory IDs/revisions and does not claim proven influence on every option. Existing pace Profile management remains accessible.

PASS: full native build and8/8 selected tests (Memory4 + existing selected-message4), zero skipped, owned Simulator/derived data. /tmp/vpj81-memory-native-unit2.xcresult. Tests exercise same-profile update vs createUndo, separate updateUndo CAS, same-byte unknown-write retry, canonical current readback after withdrawal and late actor fencing. git diff --check PASS. Original backend actualPG4/AuthHTTP1/security7/ACL11 evidence is source-owned and reusable; it is not relabeled as Native Auth evidence.

UNRUN: Native actual Auth against the combined130000 backend source, physical/accessibility/human/provider/target. No merge/release/user-acceptance claim. Native compilation/tests and backend source integration are separate evidence; no SQL/CI/domain writer changes are authored by Native.

## Actual Native Auth follow-up on the combined source

PASS:1/1 actual NativeSession Auth test, zero skipped, /tmp/vpj81-memory-native-actual2/tests.xcresult. Same-profile create1 → update2 → updateUndo3 → pause4 → resume5 → revoke5 (summarynull) → logout/cacheclear. Ordinary Auth/HTTP and current readback were real against the disposable current-migration stack; in-memory credential vault was used. No Task admission/providercall/Tripwrite. Instance vp-native-ask-be2ed5e0, ownedbase63220, cleanupPASS. Source hashes and summary copied alongside this record. First attempt failed only the fixture port-environment contract before creating any stack; retained /tmp/vpj81-memory-native-actual1.log. Fixed by using the existing owned stack wrapper rather than an incomplete direct invocation. Generated nextdev AGENTS/next-env changes were inspected and restored after cleanup.

Physical/human/VoiceOver/provider/target remainUNRUN. This test does not imply those outcomes.
