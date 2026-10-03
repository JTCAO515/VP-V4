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

## Exact missing domain capability — extension pending Main review

`transition_memory_profile(uuid,text)` supports only lifecycle states, with no expected revision or operation ID; `revoke_memory_retrieval_consent(uuid)` similarly lacks operation/CAS. No summary-update or update-Undo RPC exists on this base. Native must not render these as callable versioned correction operations yet; creating a second profile is not correction.

Proposed append extension: one closed `native_memory_command_v1(jsonb)` wrapper, transaction-bound active mobile session, owner profile/consent locks, exact revision CAS, private immutable operation receipt binding the full canonical input. Existing create/createUndo/transition/revoke delegates retain their old contracts. New update changes only the same profile's bounded summary after `saveLongTerm:true`; updateUndo references that operation and the exact resulting current revision, restores only that profile, and requires still-granted consent/nonterminal state. No stored raw conversation or inferred auto-save. Bounded prior summary for Undo must be private, unavailable after revocation/deletion, and covered by account deletion. Main reviews migration slot/role execution scope before implementation.

Temporary preference override belongs solely to current input; this endpoint accepts only explicitly requested long-term saving. Existing context readers continue to require current revision/consent/state and exact Memory IDs; management lists must not be injected as context.
