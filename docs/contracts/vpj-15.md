# VPJ-15 — Private source and candidate assertion producer

Related to #205; this bounded increment does not complete its 10–20 real contents, supported-city selection, source-rights, publication or product eligibility acceptance.

The existing protected `/ops/review` workflow accepts either the original text candidate or a `submit_assertion` input. The latter stores one user-supplied source declaration, one pending address assertion, and manually supplied zh/en expressions. It reuses the current controlled member identity, Cookie subject assertion, shared 8-second request lifetime, 24KB request-body cap, same-operation retry and independent review/audit. It does not add an Ops dashboard, retriever, source-fetcher or PolicyRegistry.

## Stored meaning

`source_revisions` is private immutable material provenance, not a licence registry. Its `sourceKey` and `revisionLabel` are operator declarations. Identical declarations reuse a revision ID; changing any field under the same key/label conflicts and requires a new revision label. The SHA256 covers exactly the UTF-8 **stored snippet**, including its supplied whitespace; it is not a hash or verification of the entire external document. Document URI and locator are not fetched or independently verified. The URI accepts a bounded ASCII HTTP(S) declaration without credentials/query/fragment, or the explicitly synthetic `urn:vpj15:synthetic:*` namespace.

`usageDeclaration` is pending material about intended uses/licensing. Output always marks both `usageStatus` and `locatorStatus` as `unverified`, including after candidate review. It creates no grant, PolicyReceipt, source licence approval or runtime permission. No UI can activate those states.

`candidate_assertions` binds exactly one immutable assertion revision to a source revision and a candidate. It reuses only the existing address value shape (`lines`, optional `locality`, `countryCode`) plus a declared `subjectId`; that identifier is not resolved to a verified Canonical POI. The row is a **pending candidate assertion**, not a GroundedClaim/EvidenceReceipt. The zh/en strings are manual expression projections bound to the same assertion ID/revision. Their semantic equivalence and external truth are not automatically verified. Review changes the candidate's workflow version, not the immutable source/assertion revisions. All results remain private, `published:false`, `retrievalEligible:false`.

## Transaction and compatibility

Migration35 moves the existing public Ops RPC into the private schema and explicitly revokes its execution from PUBLIC, anon, authenticated and service_role. The new public RPC retains the original name/signature and grants only authenticated execution. Legacy actions delegate to the original implementation. The candidate JSON function keeps its original OID and preserves the legacy no-structure shape.

Structured submission first checks current session/membership, acquires the original actor/operation advisory lock and compares any receipt against the complete input. It then records/reuses the source, calls the original submit transaction, adds the assertion/projections, and replaces the receipt with the full structured input/result in the same database transaction. A source conflict, assertion failure or receipt update failure rolls back all new rows, including the original submit's candidate/audit/receipt. Exact receipt replay revalidates identity first. Legacy and structured operations cannot reuse an operation ID with different payloads.

Inputs are closed and bounded: source snippet2000, zh/en1000 each, usage declaration500, locator240, URI1000, title/publisher/address line160, revision/locality120 and identifiers128 characters maximum; one to three address lines; two uppercase country-code letters. The HTTP layer still caps the complete UTF-8 payload at24KB, and SQL also bounds the serialized structured payload. SQL limits the original string codepoint count, using trim only to reject empty content; the Web validator uses the more conservative UTF-16 length. These limits allow the tested full-length Chinese snippet and expression fields, while a direct RPC padded beyond the original-text limit is rejected. Unknown keys, injected grant/hash/publication fields and malformed references are rejected.

## Verification and rollout

Use the existing uniquely owned disposable runner:

```sh
VP_OPS_TEST_FILE=tests/integration/knowledge/private-source.test.mjs \
VP_OPS_BEFORE_MIGRATION=20260910213151_vpj_15_private_source_assertion.sql \
node tests/integration/ops/run-local.mjs
```

The runner starts the dedicated pre35 baseline. The test records a legacy receipt, applies35 using `supabase migration up --local` only in that new disposable target, and verifies old/new operations, grants, concurrent immutable source handling, actual fault rollback, independent review, PostgreSQL/Next restart and revocation. Set `VP_OPS_BROWSER_EXECUTABLE` to an installed headless-shell executable to additionally exercise the existing form at desktop/390px/RTL. Running the runner without test selectors retains the original VPJ-14 regression suite.

No real travel material or city selection is inferred. No remote migration, real member activation, external URL retrieval, licence activation, Fact publication or customer product read is performed. #205 remains open. Disable the existing local Ops opt-in to stop use; do not rewrite applied migrations or remove retained audit history as a rollback shortcut.
