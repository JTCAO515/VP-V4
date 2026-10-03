# VPJ-36 / #228 D2 durable core export SQL fixed wire

Base main d93c5c2db604d2c5112b5b3b9b4d91f4d41423a2; sole D2 SQL branch. Default closed, no GRANT/roles/target activation. Original privacy request stays requested/not_started forever under this batch; the separate execution job reports actual partial/core-complete state, always allUserDataCompleted=false. No D3–D5/deletion execution/financial retention or215 metadata access.

## API signatures (all new EXECUTE revoked)

Native future minimal identity authenticated, not service_role:
- `public.enqueue_core_export_v1(p_request_id uuid,p_confirmed boolean) returns jsonb`
- `public.read_core_export_receipt_v1(p_request_id uuid) returns jsonb`
- `public.issue_core_export_download_ticket_v1(p_request_id uuid) returns jsonb`
- `public.consume_core_export_download_v1(p_request_id uuid,p_token text) returns jsonb`

Worker future minimal identity service_role, not ordinary owner:
- `public.claim_core_export_v1() returns jsonb`
- `public.validate_core_export_lease_v1(p_request_id uuid,p_lease_id uuid,p_generation integer) returns jsonb`
- `public.read_core_export_trip_v1(p_request_id uuid,p_lease_id uuid,p_generation integer,p_section text,p_after_id uuid default null,p_limit integer default 100) returns jsonb`
- `public.commit_core_export_artifact_v1(p_request_id uuid,p_lease_id uuid,p_generation integer,p_key_id text,p_nonce bytea,p_ciphertext bytea,p_plaintext_digest text,p_plaintext_bytes integer,p_modules jsonb) returns jsonb`
- `public.purge_core_export_v1(p_limit integer default 100) returns jsonb`

These are pending exact permission objects only, not authorised grants. Every private table/helper denies all API roles. No new caller-owner parameter to the Trip reader; owner is derived only from the durable lease. Existing assistant/result service-only allowlists and output schemas remain unchanged; TS revalidates this same lease before each existing module page. No215 metadata module is registered here.

## Admission / policy / locks

Only one operator-owned private enabled policy may exist; none is seeded. Policy immutable revision/environment/keyId/maxRunMs/artifactTtlMs/downloadTicketTtlMs/maxPages/pageSize/maxBytes/validUntil, explicit bounds; disabling invalidates new effects. Code ceilings maxRunMs300000, artifactTtlMs86400000, ticketTtlMs60000, maxPages1000/pageSize100/plaintext8MiB. No live default duration/key. TS trusted config must match this policy and supply a real approved key, otherwise no execution.

Admission requires current nonanonymous Native session, server Auth session created <=5 minutes ago (not JWT refresh), confirmed=true, UUID request. It calls existing request_privacy_action(request,'export') atomically if needed; existing delete/foreign request rejected. Job binds immutable request/owner/admission session+epoch/scopeVersion1 and closed nine-module manifest. Original scope cannot be changed by retry. Job TTL is bounded by admission time+artifactTtlMs and policy validity. Exact replay returns same job; no new request/lease/artifact or completion of old intent.

Uniform lock order: policy SHARE NOWAIT (operator updates in standalone transaction) -> auth.users KEY SHARE NOWAIT -> mobile account UPDATE -> stored admission auth.session KEY SHARE (worker) or current Native session (owner) -> privacy request/job UPDATE -> artifact -> ticket. Claim reads candidate metadata without a row lock, then uses this order and job CAS; no job-before-account blocking chain. Expired run can be reclaimed with new random lease and incremented generation, at most3 claims. Old lease/generation cannot read/commit. Worker currentness requires original admission session/epoch still active before every source page and commit. Ready owner metadata/download can use a newer current owner Native epoch; tickets bind that current epoch/session independently. Fresh ticket issuance requires <=5-minute server Auth session, so reauthentication after a long export is possible without rewriting the ready job's admission identity.

## Closed replies and ciphertext

Lease success `{kind:"leased",lease:{requestId,ownerId,leaseId,generation,expiresAt},policy:{id,revision,environment,keyId,maxRunMs,artifactTtlMs,downloadTicketTtlMs,maxPages,pageSize,maxBytes}}`; otherwise `{kind:"idle"|"blocked"}`. validate `{kind:"valid",lease,policy}` or blocked. Receipt `{kind:"core_export_receipt/1",requestId,state,generation,scopeVersion:1,coverage:null|partial|complete,allUserDataCompleted:false,moduleReceipts:null|array,artifact:null|{artifactId,plaintextDigest,plaintextBytes,keyId,expiresAt},expiresAt}`. State queued/running/ready_partial/ready_complete/expired. Missing job FORBIDDEN, never global/latest fallback.

Trip sections trips/proposals/events/snapshots. Explicit fixed existing source column allowlists, owned rows only, UUID cursor with exact same-owner/same-section anchor, page1..100 and lease policy limit. Reply `{schemaVersion:"core-trip-export/1",section,items,hasMore,nextCursor,sectionComplete}`. Each snapshot is immutable, traversal across changing Trips is LIVE_TRAVERSAL; no database-wide consistent snapshot claim. Other modules missing => unavailable/HANDLER_MISSING, not zero-row success.

Commit modules exact9 entries in fixed TS order trip/conversations/results/profile/memory/turn/user_artifact/brief/entitlements, keys module/status/reason/pages/rows/digest. status complete/partial/unavailable/failed; reason NONE/HANDLER_MISSING/BOUNDED_LIMIT/LIVE_TRAVERSAL/SOURCE_UNAVAILABLE. All counters nonnegative and bounded by policy. Complete requires reason NONE and nonnull64hex module digest; missing/unavailable requires HANDLER_MISSING and null digest. Coverage derives from every module, never caller flag.

AES-256-GCM protocol: random12-byte nonce, ciphertext bytea contains encrypted plaintext **plus appended16-byte authentication tag**. SQL requires ciphertext length=plaintextBytes+16; plaintext <=8388608, cipher<=8388624, total protected nonce+cipher<=8388636. RPC bytea serializes as `\\x` hex, so TS transport must explicitly bound encoded cipher at16777248 hex characters plus metadata (not an8MiB JSON limit). SQL never receives plaintext/key or attempts to assert ciphertext is decryptable. Trusted worker must encrypt canonical bundle and compute plaintext digest; SQL computes independent ciphertext digest. Nonce is unique per keyId. Associated-data bytes exactly UTF8(exportCanonical(["privacy-core-export-aad/1",requestId,ownerId,generation])). Owner/request/generation/key/digests/size/expiry and module receipt commit atomically. Lost ACK may replay only exactly identical artifact inputs/committed lease; return same receipt, never another artifact. Expired/crashed lease cannot make a new commit. No caller TTL or raw key in rows.

## Tickets / consume / purge

Issue returns `{kind:"core_export_ticket/1",requestId,artifactId,generation,plaintextDigest,expiresAt,downloadToken}`. Token is server-generated random32 bytes encoded lowercase64hex; only SHA256(decoded32bytes) is stored. Issuing another ticket revokes existing unused ticket for that owner/request/artifact. Lost issue ACK: issue again for a new secret, old unused ticket becomes invalid. No URL bearer token.

Consume exact current Native owner/session/epoch, request, ready artifact generation/digest/expiry and token hash, atomically mark consumed before returning `{kind:"core_export_download/1",requestId,ownerId,artifactId,generation,keyId,nonce,ciphertext,plaintextDigest,plaintextBytes,ciphertextDigest,aad,expiresAt}`. bytea nonce/ciphertext are `\\x` hex; aad is exact UTF8 string above. No raw token echoed. Same token replay/lost consume ACK is denied; current owner issues a new ticket for retry. TS decrypts, checks exact plaintext checksum/size, then revalidates current Native actor before serving private/no-store fixed JSON attachment. Consumed ticket remains consumed on decrypt/final-actor failure; no plaintext sent, no ticket reset. Downloaded files cannot be remotely recalled.

Expiry enforced at every read/claim/ticket/consume; bounded purge removes generated ciphertext and ticket hashes, sets expired state, leaves only execution metadata. Account deletion cascades job/artifact/tickets. Source records are never deleted by export or purge. purge reply `{kind:"purged",jobs:integer,tickets:integer}`. Errors INVALID_INPUT/FORBIDDEN/UNAUTHENTICATED/SESSION_REPLACED/REAUTHENTICATION_REQUIRED/EXPORT_CONFLICT/EXPORT_TICKET_UNAVAILABLE; blocked/unavailable never returns protected bytes. Module/receipt stage is core-only, not all-user-data completion.
