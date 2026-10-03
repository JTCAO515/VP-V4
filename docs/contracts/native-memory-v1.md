# Native ordinary-owner Memory v1 (#562 / #199)

Owner: Main delegated backend/SQL owner, 2026-10-03. Native client owner consumes this contract.
Base: main 49e9b88c1809642ccf2f4167f7c9ca3fe62cb71d. No new Memory store, automatic save, model call or Trip write.

## Transport and current authority

`GET /api/memory/native/v1/profiles` returns owner management records (including paused/revoked/tombstones), never model context.
`POST /api/memory/native/v1/profiles` accepts the closed commands below. Bearer JWT only; Cookie, Origin, query arguments and extra JSON keys are rejected. The same ordinary JWT accesses owner RLS / existing authenticated RPCs. `native_session_v2` validates subject/session before and after work, including after an RPC error. Responses are private/no-store. Account replacement is 401; never return a prior actor's body. There is no legacy revision fallback.

GET response: `{version:1, ownerId, profiles:[{id,revision,state,constraintKind,summary,sourceReceiptId,consentId,consentStatus,createdAt,updatedAt}]}`. Summary is null for deleted or revoked profiles. Native clears cached result/Undo on actor change, 401 or a stale/withdrawn source; unknown write outcome retains the exact input identifiers for explicit retry, never invents another operation.

Initial existing-authority commands:

- create: `{action:"create",memoryId,receiptId,consentId,constraintKind,summary,saveLongTerm:true}`. UUID IDs, preference/hard_constraint, trimmed summary 1..500 chars. receiptId is the immutable create operation identity; identical retry reuses it. Existing owner consent must already be granted. Calls `create_explicit_memory_profile_v2`; does not silently create/grant consent. Response `{version:1,ownerId,memoryId,state:"explicit",revision,sourceReceiptId,reused,undoAvailable}`. Undo is available only at revision 1; same-owner current readback must match the request and receipt before returning success.
- createUndo: `{action:"createUndo",memoryId,sourceReceiptId,expectedRevision:1,operationId}`. Calls `undo_explicit_memory_create_v1`. Response `{version:1,ownerId,memoryId,state:"deleted",revision:2,reused,undoAvailable:false}`. Exact operation retry is supported; no restore/correction semantics are implied.

Errors: INVALID_INPUT 400; UNAUTHENTICATED 401 (including SESSION_REPLACED); FORBIDDEN 403; CONSENT_REQUIRED 409; MEMORY_CONFLICT / MEMORY_OPERATION_REUSE / MEMORY_ID_REUSE 409; unavailable/malformed dependency 503. Error responses carry no Memory content.

## Final command extension (Main approved code/local tests, 2026-10-03)

All POST commands use `native_memory_command_v1(p_input jsonb)` in migration `20261003130000_vpj81_native_memory_commands.sql`. No target apply/deployment permission is implied. The HTTP body equals p_input, with exact keys per action:

| action | Exact additional keys after action | Meaning |
| --- | --- | --- |
| consentCreate | operationId | Server-minted granted owner consent; exact operation retry returns its metadata, not a new consent |
| create | operationId, memoryId, receiptId, consentId, constraintKind, summary, saveLongTerm | saveLongTerm must true; expected new same-owner profile; existing v2 create authority |
| createUndo | operationId, memoryId, sourceReceiptId, expectedRevision | expectedRevision must 1 per actual existing Undo RPC; newer revisions conflict, never use this for update Undo |
| update | operationId, memoryId, sourceReceiptId, expectedRevision, summary, saveLongTerm | Explicit long-term correction of same profile; current granted consent and active explicit/confirmed state required |
| updateUndo | operationId, memoryId, sourceReceiptId, expectedRevision, updateOperationId | Only own update preimage; exact update resulting revision and last profile operation, 10-minute expiry, unchanged active state/granted consent |
| state | operationId, memoryId, sourceReceiptId, expectedRevision, state | Existing lifecycle RPC, including pause/delete; exact revision CAS; no state Undo |
| revoke | operationId, memoryId, sourceReceiptId, expectedRevision | Revoke this profile's linked consent using existing RPC; all profiles sharing consent become nonretrievable; no revoke Undo |

UUIDs must be canonical UUID strings. expectedRevision is a positive safe integer. summary trimmed 1..500 Unicode characters, constraintKind preference/hard_constraint. state follows the existing transition RPC union; invalid transitions remain rejected. Extra keys, null required values, unsupported actions and saveLongTerm other than true fail closed. No implicit consent grant/regrant, profile duplication or automatic save.

Command receipt: `{version:1,ownerId,action,operationId,memoryId,consentId,sourceReceiptId,revision,state,reused,undoAvailable}`. consentCreate has memoryId/sourceReceiptId/revision/state null. Receipt contains no summary, old value or model payload. create undoAvailable only revision 1; update undoAvailable only current eligible update for its bounded Undo window. All other actions false. A replay returns original receipt metadata with reused true, never a current permission grant. HTTP must read current same-owner state after every write, and return `{version:1,receipt,profiles}`; profiles uses the GET schema and masks revoked/deleted summary. Native adopts current profiles, not receipt revision as current truth. A replay whose profile/consent is now withdrawn or changed returns current profiles and undoAvailable false; Native clears pending Undo when revision, source receipt, state or consent differs from the original receipt. consentCreate response profiles empty. GET schema remains unchanged.

Errors: INVALID_INPUT 400; UNAUTHENTICATED 401 (SESSION_REPLACED maps here); FORBIDDEN 403; CONSENT_REQUIRED, MEMORY_CONFLICT, MEMORY_OPERATION_REUSE, MEMORY_ID_REUSE, MEMORY_UNDO_EXPIRED, TERMINAL_MEMORY, INVALID_MEMORY_TRANSITION 409; unavailable/malformed dependency 503. Errors include no Memory body. Stale revision and wrong Undo operation must never mutate any row. Replacing account/session clears Native profile/Undo state; unknown result preserves exactly the same immutable operation/input for explicit retry.

Private immutable receipts bind owner+operationId to a hash of canonical JSON input and original metadata. Private bounded preimages are separate, never exposed through owner management, model retrieval or existing exports; scrub on profile deletion or linked-consent revocation, cascade with profile/owner deletion. No caller GUC or REST write grants. Applied old migrations and old RPC behavior remain intact. Existing profile revision trigger always increments; Undo never restores an old revision, qualification or consent.

Temporary preference override belongs solely to current input. Context readers require current revision/consent/state and exact IDs; management lists never become model context.
