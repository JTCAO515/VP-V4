# VPJ-25 offline Trip read authority

GET `/api/trips/native/v2/{tripId}/offline-read?expectedHeadVersion={integer}&requestNonce={uuid}`.
Native Bearer only; cookies, Origin, duplicate or unknown query fields are rejected.
No client owner, lease duration, cache rights or payload inputs.

Response is a closed union:

- `{kind:"unavailable",reason:"POLICY_UNCONFIGURED"|"NOT_ELIGIBLE"|"STALE_BASIS"}`.
- `{kind:"offline_trip_read/1",subject,sessionEpoch,tripId,headVersion,policyId,policyRevision,issuedAt,expiresAt,serverTime,requestNonce,coverage:"partial"|"full",sourceSemantics:"controlled_user_text_submission",generation,fieldAllowlist:["days.date","days.items.title"],snapshotDigest,payload:{days:[{id,date,items:[{id,title}]}]},proof:{algorithm,keyId,signature}}`.

A trusted server policy supplies explicit expiry and maximum lease duration; a trusted
signer signs the canonical whole response excluding proof. No default lease, generated
key or digest-as-signature. Missing policy or signer returns POLICY_UNCONFIGURED.
A digest is SHA-256 over canonical payload only, for integrity comparison.

Only confirmed date/text values submitted through the controlled user-text path
with explicit offline_cache purpose and valid current receipts are eligible. This
proves a submission path, not actual keyboard use, original authorship or copyright.
Unknown provenance, third-party locations/addresses/translations, images, orders,
OCR text and Memory are excluded. The production composition reads strict policy/signer
providers and consumes the exact provenance RPC. The new RPCs currently revoke
EXECUTE from every API role; no permission is activated by this implementation. The readonly authority adapter
uses the existing JWT-bound `native_session_v2` RPC with `p_action:"session"`, whose
version-2 response binds subject/sessionId/mobileEpoch. It validates the verified
credential subject/sessionId and a positive safe-integer mobileEpoch, and checks
this actor/epoch before and after snapshot reads. Missing/malformed epoch authority
is unavailable; no epoch is synthesized or incremented. Tests inject these authorities;
they do not establish live caching rights.

Authenticate and read current owner Trip before policy evaluation, then authenticate
and read again after signing. Session epoch, owner, head, archive/delete eligibility,
payload and policy revision must still match; revoke/expiry during issuance fails closed.
No Trip writer, SQL migration, permissions change or remote configuration is introduced.
Native validates trusted proof, owner/session/head, expiry and field allowlist before
storing; logout, revoke, deletion and account changes remove local packages.

## Exact wire and signature bytes

subject/tripId/requestNonce are lowercase UUID strings. Payload day/item IDs use
the existing Trip domain opaque ID grammar `^[A-Za-z0-9_-]{1,64}$`, are case-sensitive
and retain their exact original value and order. Provenance ID membership is exact
and case-sensitive; never normalize these IDs. policyId/keyId are nonempty strings
<=128 UTF-16 code units. sessionEpoch/policyRevision/headVersion are positive safe integers
(1..9007199254740991). subject is the current authenticated actor. Missing epoch
binding is ineligible for success. head zero is an initial, unconfirmed Trip.
Dates are non-null valid `YYYY-MM-DD`. issuedAt/expiresAt/serverTime are non-null UTC
`YYYY-MM-DDTHH:mm:ss.sssZ`. Policy times and maxLeaseMs come from trusted policy; serverTime is the trusted server clock captured before signing;
issuedAt <= server now < expiresAt, and expiry-issued <= policy maxLeaseMs.
Day/item IDs are globally unique within their respective arrays; 1..60 days,
0..100 items/day, nonempty item title <=2000 UTF-16 code units. Lone UTF-16
surrogates are rejected. No additional payload/day/item fields are permitted.
Canonical entire signed response <=128000 UTF-8 bytes including proof.

Canonical JSON recursively orders object keys by ASCII code point (all keys are
ASCII), retains array order, has no whitespace and is encoded as UTF-8 without BOM.
Strings use JSON.stringify escaping: quote/backslash escaped; BS/FF/LF/CR/TAB use
`\b/\f/\n/\r/\t`; other U+0000..001F use lowercase `\u00xx`. Slash and all other
Unicode scalar values (including U+2028/U+2029) remain unescaped. Integers use plain
base-ten digits. There are no floating-point numbers, undefined or nullable fields.
Payload digest is lowercase SHA-256 hex of canonical payload. Sign canonical
success object with exactly the declared fields, omitting `proof` entirely;
algorithm is exactly `Ed25519`, signature is unpadded canonical base64url of 64 bytes.
keyId selects a pretrusted verifier key; unknown key/algorithm or extra/missing
success/proof/payload fields must be rejected by Native. No key is provisioned here.
HTTP errors retain existing `{error:{code}}` taxonomy for invalid request, expired
credentials, unavailable upstream and inaccessible Trip. Domain unavailable uses HTTP 200.


## Freshness and bounded remaining time

requestNonce is a required client-generated random UUID challenge, canonically lowercase.
It grants no actor, duration or cache rights. Include exactly one nonce in the request;
sign and echo it in success. Native must match the outstanding request's nonce before
accepting a response, and must reject reused/unsolicited responses. `serverTime` is
captured from the trusted server clock immediately before asynchronous signing,
within `[issuedAt, expiresAt)`. Preserve signed bytes after signing; never refresh
serverTime to response-send time. After all final authority checks, server now must
remain >= serverTime and < expiresAt, or return STALE_BASIS.

Native records monotonic request start before transport. After trusted signature,
nonce, actor/session/head/policy/allowlist validation, its remaining duration is at
most `expiresAt - serverTime - full monotonic request elapsed`. Nonpositive remaining
time fails closed. Also require local wall time >= serverTime (plausibility check)
and < expiresAt. Wall-clock rollback or reboot without reconstructable trusted time
fails closed and requires an online revalidation. Reopening a cached package must
not restart a deadline. Policy issuedAt retains its original policy meaning and
is never the basis of a fresh lease beginning at response receipt. Slow signing,
transport or validation can only shorten the effective remaining validity.

## Server configuration composition

The HTTP route installs `productionOfflinePorts`, using the environment selected by
the existing validated Native runtime configuration. Requests cannot select an
environment, provider, key, policy, duration or provenance. There is no activation
default. The following named variables are server-only providers; no target variable
or key is installed by this change.

`VISEPANDA_OFFLINE_READ_POLICY` is JSON (<=8192 UTF-8 bytes), with exactly:

```json
{"version":"offline_read_policy/1","environment":"local|staging|production","enabled":true,"revoked":false,"policyId":"ASCII_identifier","policyRevision":1,"fieldAllowlist":["days.date","days.items.title"],"issuedAt":"YYYY-MM-DDTHH:mm:ss.sssZ","expiresAt":"YYYY-MM-DDTHH:mm:ss.sssZ","maxLeaseMs":60000}
```

The duration above illustrates a shape, not a default or approved live duration.
Policy ID uses `[A-Za-z0-9_.:-]{1,128}`. Revision and duration must be positive safe
integers; enabled/revoked are strict booleans. Environment must match the validated
server target. UTC times are strict and issued <= now < expiry; expiry-issued <=
maxLeaseMs. Unknown fields, unknown target, wrong allowlist, missing/disabled/revoked
policy or invalid interval returns unavailable. A configuration cannot assert
user authorship: that requires the separate trusted provenance authority below.
Policy is re-read after provenance lookup and again during final issuance checks.

`VISEPANDA_OFFLINE_READ_SIGNER` is JSON (<=12288 UTF-8 bytes), with exactly:

```json
{"version":"offline_read_signer/1","environment":"local|staging|production","algorithm":"Ed25519","keyId":"ed25519:<lowercase_SHA256_of_derived_public_SPKI>","publicKeySpki":"unpadded_canonical_base64url_DER_SPKI","privateKeyPkcs8Pem":"bounded_unencrypted_PKCS8_PEM"}
```

PEM is <=4096 UTF-8 bytes with a single PRIVATE KEY block; decoded public SPKI
is <=128 bytes. Both keys must be Ed25519. Declared public DER must exactly match
public DER derived from the private key, and keyId must match its SHA-256 fingerprint.
Wrong key type, mismatched pair/fingerprint, malformed, oversized or unknown fields
are rejected. Crypto exceptions/provider values are never logged or returned.
The signer reads the named private provider only after independent provenance
qualification; it re-reads and validates the provider before signing. Key rotation
or withdrawal is detected during final policy/provenance requalification. Native
trusts only its independently configured public-key registry, never a package key.
No JWT secrets, public env variables, generated production keys or request keys are used.

The composition consumes the strict provenance reader response, bound to current
subject/sessionEpoch/tripId/headVersion, sourceSemantics and generation. It verifies
qualifiedPayloadDigest and every exact field locator/valueDigest, then signs the
reader-qualified payload. Without callable authority or eligible receipts it stays
unavailable even with configured policy/signer. Local tests inject a scoped synthetic
receipt and ephemeral in-memory keys to verify composition, not real keyboard authorship or
live offline rights. No fake source is installed in the production route.


## Partial coverage

The signed `coverage` is exactly `partial` or `full`. The read authority returns a
qualified subset of the current exact head: include only days with valid date
receipts, and within those days include only items with valid title receipts.
Preserve original IDs, values and order. Older unqualified fields remain online
and are omitted from offline payload. No qualified date means no offline package.
An eligible date may appear with zero eligible item titles. `full` means every
field in the current date/title payload is qualified; it never implies all Trip
resources, images, orders or addresses are cached. Native must disclose partial
coverage and must not describe a partial package as the whole Trip.

Payload digest and signature cover only the permitted projection. The full current
snapshot digest belongs to source/currentness binding and is never reused as the
subset's snapshotDigest. Initial/final checks still compare the complete online
basis, including omitted fields, actor, epoch and exact head. Removing qualification
or changing an omitted online field during issuance prevents publishing. Package
limits apply to the subset; online-only history does not consume its capacity.
The producer signs the reader-qualified payload directly after matching its exact
values to the current snapshot; it does not apply a receipt ID list to the full
Trip as a substitute for the reader projection. Policy configuration does not
grant source or purpose to old fields.


## Controlled text commands and exact source RPC

POST `/api/trips/native/v2/{tripId}/offline-text/proposal` accepts only
`{operationId,expectedHeadVersion,date,title,saveOffline:true}`. Operation UUID is
lowercase. Base head is an integer in 0..999999999. Title is trimmed once and then
validated as 1..160 UTF-16 units; raw input is bounded to 2048 units. No source,
author, owner, licence, receipt, patch or field IDs are accepted from clients.
The SQL command derives `ofd_`/`ofi_` IDs from the operation UUID and creates only
new-day+item candidates. An existing date conflicts (OFFLINE_DATE_EXISTS/409)
without overwriting its content or granting its date. The exact pending Proposal
GET, visible diff and original explicit confirm remain required. Success maps to
`{version:2,proposalId,revision,baseTripVersion,reused}` from the fixed SQL receipt.
A candidate is neither a Trip write nor an offline permit.

POST `/api/trips/native/v2/{tripId}/offline-text/revoke` accepts only `{operationId}`;
epoch comes from current Native authority. Response is the exact
`offline_text_revoked/1` receipt with tripId/sessionEpoch/generation/operationId/reused.

RPCs and receipts are fixed by SQL owner's `vpj25-offline-text-provenance-sql.md`:
submit_offline_trip_text_proposal_v1, read_offline_trip_text_provenance_v1 and
revoke_offline_trip_text_provenance_v1. All calls use ordinary JWT-bound clients,
within the same bounded request/cancellation scope. No fallback, service-role key,
new grant or direct Trip writer is introduced. Missing EXECUTE/RPC remains503.

Reader `qualifiedPayload` maps to signed payload; canonical digest is locally
recomputed and must equal qualifiedPayloadDigest before becoming snapshotDigest.
Exact coverage object `{kind,excludedDays,excludedItems}` is validated against the
current basis; nonnegative counts, full implies zero counts, partial implies at
least one positive count. Only its kind reaches the signed Native package, with
sourceSemantics `controlled_user_text_submission` and nonnegative safe generation.
Receipt generation and complete reader authority (fields, values, coverage) must
match initial/final requalification. Generation is not a Trip snapshot version.
Field hashes are SHA256 UTF-8 canonical JSON of the exact 4-tuple
`[field,dayId,itemId|null,exactScalarValue]`. Dates have itemId=null. Preserve string
bytes using the existing canonical escaping, without normalization or PG jsonb::text
whitespace. Source receipt IDs are unique lowercase UUIDs; every included field
requires one matching locator and hash. Historical/ordinary/OCR paths cannot qualify
through client flags, and reader responses containing unknown fields fail closed.


## Joint source evidence

TS runtime source checkpoint `1378721d` was checked against immutable SQL source
`0511b706683a2bbcb03565f52b50e8a13d204bb0` using
`VP_TURN_DB_TEST=1 VP_OFFLINE_SQL_SOURCE=<SQL commit> node --experimental-strip-types --test tests/integration/trip/offline-source-consumer.test.mjs`.
Two affected checks pass: actual isolated SQL candidate→original explicit confirm→
partial reader receipt→strict TS field hash/coverage decoder→Ed25519 signed subset;
and actual authenticated EXECUTE denial on all three RPCs mapped to unavailable.
Positive SQL calls are administrator-only Unix-socket fixtures with simulated
ordinary claims; no real Auth, role grant, live private key, policy activation or
provider deployment is established. The independent HTTP/RPC contract simulations
pass separately. Full real-account HTTP authorization is UNRUN while API execution
remains revoked. SQL owner's existing lifecycle matrix is reused separately.
