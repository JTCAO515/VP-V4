# VPJ-25 offline Trip read authority

GET `/api/trips/native/v2/{tripId}/offline-read?expectedHeadVersion={integer}`.
Native Bearer only; cookies, Origin, duplicate or unknown query fields are rejected.
No client owner, lease duration, cache rights or payload inputs.

Response is a closed union:

- `{kind:"unavailable",reason:"POLICY_UNCONFIGURED"|"NOT_ELIGIBLE"|"STALE_BASIS"}`.
- `{kind:"offline_trip_read/1",subject,sessionEpoch,tripId,headVersion,policyId,policyRevision,issuedAt,expiresAt,fieldAllowlist:["days.date","days.items.title"],snapshotDigest,payload:{days:[{id,date,items:[{id,title}]}]},proof:{algorithm,keyId,signature}}`.

A trusted server policy supplies explicit expiry and maximum lease duration; a trusted
signer signs the canonical whole response excluding proof. No default lease, generated
key or digest-as-signature. Missing policy or signer returns POLICY_UNCONFIGURED.
A digest is SHA-256 over canonical payload only, for integrity comparison.

Only provenance-proven user-authored, confirmed Trip date/text fields are eligible.
Unknown provenance, third-party locations/addresses/translations, images, orders,
OCR text and Memory are excluded. The production adapter currently has no provenance
policy/signer and therefore issues no offline packages. Tests inject these authorities;
they do not establish live caching rights.

Authenticate and read current owner Trip before policy evaluation, then authenticate
and read again after signing. Session epoch, owner, head, archive/delete eligibility,
payload and policy revision must still match; revoke/expiry during issuance fails closed.
No Trip writer, SQL migration, permissions change or remote configuration is introduced.
Native validates trusted proof, owner/session/head, expiry and field allowlist before
storing; logout, revoke, deletion and account changes remove local packages.

## Exact wire and signature bytes

All IDs are lowercase UUID strings except policyId/keyId (nonempty, <=128 UTF-16
code units). sessionEpoch/policyRevision/headVersion are positive safe integers
(1..9007199254740991). subject is the current authenticated actor. Missing epoch
binding is ineligible for success. head zero is an initial, unconfirmed Trip.
Dates are non-null valid `YYYY-MM-DD`. issuedAt/expiresAt are non-null UTC
`YYYY-MM-DDTHH:mm:ss.sssZ`. Times and maxLeaseMs come from trusted policy;
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
