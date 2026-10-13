# QAWEB-005 offline activation review kit

Owned scope: #680/#682/#683; base e51cd9b9bec94afebed06ef6cf695224c3d24492.
No installer, apply command, database connection, provider transport, credential lookup or worker runner exists here. Node >=22.18 with native TypeScript stripping is required. Run from the repository root:

```sh
node scripts/qa-agent-activation/cli.mjs generate /absolute/operator-input.json /absolute/new-review-package.json
node scripts/qa-agent-activation/cli.mjs preflight /absolute/new-review-package.json /absolute/new-report.json /absolute/observation.json
node --test tests/contract/qa-agent-activation/toolkit.test.mjs
```

Output paths must not exist (exclusive creation, mode 0600). Exit 0 means generation or offline review checks succeeded; preflight exit 2 means blocked, exit 1 means invalid input. None means activation. Do not put secrets in input. Errors never echo values. The secret field/pattern filter is defense in depth, not a general-purpose secret detector.

## Operator input and trustworthy evidence

Start with `input.template.json`; nulls intentionally fail validation. Supply actual owner and existing configuration identity, actual Qwen recipient and endpoint, current terms/source/processing/storage/retention disclosures. Unsupported providers or endpoints fail closed; the server model is pinned by the accepted `PROTOCOL_MODELS` import. The browser cannot choose it. GLM and older current_input/task_history/knowledge_intent policies cannot be upgraded by this kit.

Unknown terms, regions and supplier retention may be explicitly `unknown` or `not disclosed`, per the accepted development integration policy. Do not claim zero retention or infer processing location from hostname. Recipient and exact endpoint must be known for a real destination binding. Notices include the accepted bilingual template, limits, retention/hiding semantics and terms version. Fresh policy UUID and noticeVersion are generated on every invocation. SHA-256 covers canonical sorted-key JSON of the complete `notice` object, including source evidence. Preserve those exact bytes/fields, not a translated or reconstructed hash. Changing any disclosure requires a new policy/version/hash and new QA UI consent; never copy historical consent.

Each supplier, pricing and budget evidence record needs an HTTPS source URL without auth/query/fragment, observation timestamp, explicit recheck expiry and SHA-256 of the reviewed secret-free source. Public documentation, console metadata or current configuration records suffice; no supplier ticket, contract receipt or exact retention TTL is required. For budget caps use the actual authorized operator cap record, not the supplier tariff. For a source behind login, record a safe URL and digest of a redacted excerpt, never its tokenized URL or credentials.

The kit checks evidence shape, freshness (at most seven days), expiry, exact model/currency and safe positive integer rates. It cannot authenticate source truth or fetch prices. Main must inspect the source and approve the exact package hash; synthetic tests are not source verification. September observations cannot be made current by relabeling their version. The price must conservatively cover all billable components and tiers in the official range through 1,000,000 input tokens and the configured output cap (<=4096), in the scope currency, including any applicable surcharges. Currency conversion or discounts are not inferred. Unsupported tariff forms must be conservatively converted by the operator with recorded evidence, or stay blocked.

Reservation = ceil((1,048,576 × max(input,cached input rate) + output cap × output rate)/1,000,000), using BigInt arithmetic. All values are currency micros; no free retry or text-byte token estimate. Attempts <=8, concurrency=1, and attempt/task/provider/scope limits are bounded and consistent. Scope can exhaust before eight turns; eight is a maximum, not a promise. Validity is capped to seven days and evidence expiries. Output embeds the existing v3 hosted profile and runs its accepted offline validator. It never invokes the worker.

## Review package and policy publication semantics

The output contains exact column parameter maps for:

- `turn_private.text_policies` (`policyInsertParameters`), **not inserted**;
- `public.model_budget_scopes` (`scopeInsertParameters`, enabled=false);
- `public.model_budget_provider_limits` (`providerLimitInsertParameters`, enabled=false).

This is the reviewable change package; no executable write SQL is emitted. Main can bind the explicit values to parameterized INSERTs after target readiness and the applicable activation authorization. No UPSERT/UPDATE of existing policy/scope is supported. Unique collisions fail, never overwrite. Original RLS/grants remain unchanged. There is no `enabled` column on text policies, and their only allowed update is terminal revocation. Therefore “disabled policy” here means unpublished: inserting the supplied policy with its effective timestamp **is a separate publication action**. Inserting a revoked policy and later clearing revocation is forbidden. Do not insert it as a staging workaround.

All outer switches remain disabled; extracting a hosted profile does not install or start it. The package is not itself a runtime config or activation permission. No consent is generated. End user must authenticate in QA UI, read the exact policy notice, and submit the exact policyId + noticeHash through `qa_accept_policy_v1`. Owner/session/RLS and original service task identity remain enforced by the existing RPCs. `checkBinding` is an offline diagnostic only and must never replace those checks.

## Readiness input

Run `metadata.sql` using the official Go2China account link `link_6acdbe0471c081919ff47de24ca53b0f` and project `dzqdzetcctkhbrhlxxgn`. It only reads metadata/IDs/hash inventories; no session text. Map its results into an observation JSON (empty SQL arrays -> []). Add Main's separately verified evidence:

```json
{
  "projectId": "dzqdzetcctkhbrhlxxgn",
  "linkId": "link_6acdbe0471c081919ff47de24ca53b0f",
  "observedAt": "ACTUAL_ISO_TIMESTAMP",
  "migrations": [],
  "reviewedMigrations": [],
  "migrationManifestHash": "f0e96cbcbdf4941f36c522e7faf6b7a22d24974412c1c91dc29076cfd91a9f1c",
  "qaRpcPresent": false,
  "qaReadyGroupsAcl": {"signature":"public.qa_ready_groups_v1(integer)","serviceRoleExecute":false,"publicExecute":false,"anonExecute":false,"authenticatedExecute":false},
  "turnDataPrivatePresent": false,
  "qaSchemaFingerprintMatches": false,
  "restorePoint": {"ready": false, "evidenceHash": null},
  "workerStopped": false,
  "webDisabled": false,
  "ownerId": "ACTUAL_OWNER_UUID",
  "existingPolicyIds": [],
  "existingNoticeVersions": [],
  "existingNoticeHashes": [],
  "existingScopeIds": [],
  "reviewedPackageHash": null
}
```

`reviewedMigrations` must be Main's reviewed **exact missing 80 version set**, not an invented list, remote count or a copied remote list claimed as reviewed. `migrations` must contain the complete 155 applied versions, in ascending order. Both lists must exactly match the immutable `migration-manifest.json` pinned by SHA-256 in code; counts, duplicates, extra/missing versions or reordered lists fail. The manifest combines the official plugin read of the actual 75 baseline versions with the 80 missing versions cross-checked against the existing staging replay evidence. It pins all 155 source file hashes, including QA version 20261013050429; source drift also blocks readiness and requires a new Main-reviewed manifest/code revision. QA RPC presence means the complete reviewed signature set, not merely a prefix match; `qaSchemaFingerprintMatches` means Main's staging replay/fingerprint comparison succeeded, including grants/lifecycle guards. The read-only metadata inventory alone cannot prove those fields. Restore point must refer to a verified recovery artifact and its digest, not backup initiation. Host stopped and Web disabled require actual host/deployment evidence. Observations expire after one hour. Evidence booleans are operator assertions, not attestations; offline `reviewReady=true` is never runtime readiness/permission. Live authorization, provider, auth and deployment remain UNRUN.

## Minimal Main integration and stop order

1. Verify fixed account/project, exact baseline 75 + reviewed missing 80 = 155 migrations and QA schema/grants fingerprint; verify recovery point. Reuse existing staging replay/deployment owners. Keep original hosted worker stopped and Web disabled.
2. Inspect current supplier/tariff/cap sources. Generate a fresh package, review its exact hash, run preflight against fresh target metadata. Old 8 policies and 3 scopes are not selected or modified.
3. After authorized publication, insert only the reviewed new policy and disabled scope/provider parameters through the existing protected operator path; read back exact fields/hash. Bind the existing dedicated hosted worker v3 profile/endpoint/configuration identity. Never create another Vercel/edge/in-process worker or credentials.
4. Perform authenticated QA UI exact consent; verify actor and Session isolation and server-side scope selection. Actual budget enablement and host/Web activation belong to Main's separately authorized bounded target test. Each physical send must follow original reserve -> QA dispatch authorization -> usage receipt -> settlement; attempt_id is leaseToken, task_id is the leased turnId in the accepted executor. Unknown dispatch/usage/settlement remains reserved/pending, never manually reset to zero or retried for free.
5. To stop: disable admission/Web, disable the new budget scope/provider limits so reservation/dispatch fail closed, stop polling and drain the original hosted worker under its existing timeout/lease rules, terminally revoke the new policy to block further use, reconcile in-flight/pending attempts with actual usage. Keep ledger/consents/content and recovery evidence. Do not delete rows, clear frozen, erase pending spend, reopen a revoked policy or revive old policies. Runtime dispatch already sent cannot be undone by disabling switches.

No target write, budget enablement, provider call, deployment or restore was executed by this kit. Main owns integration and exact-head review; no shared source or HANDOFF edits are included.

## Current public-source candidate

`artifacts/QAWEB/activation/supplier-price-candidate.json` is an explicitly disabled review wrapper with an incomplete `inputCandidate`, supported by `provider-source-review.md` and `official-source-digests.json`. It records the fixed Qwen snapshot/legacy endpoint and current public upper-tier rates. It cannot generate until actual account/budget/configuration gaps are resolved. Do not remove its wrapper and fill gaps with synthetic test values.


## Stable Main migration repin

The manifest records Main revision `a8f00e8a` and QA migration SHA-256 `df5565ae49363dc83d4e0db9686653d43dc79cb2b011e4d56e343f45d654afa9`; version sets stay 75/80/155. The new v3-only discovery signature `public.qa_ready_groups_v1(integer)` must exist and permit EXECUTE to service_role only (PUBLIC/anon/authenticated false). Map `qa_ready_groups_acl` from the read-only metadata query into `qaReadyGroupsAcl`; absent/legacy signature or grants fail closed. No query invokes the discovery RPC.

This owned branch deliberately does not import Main's shared source. Before integration its default preflight correctly reports SOURCE_MIGRATION_DRIFT. To read a separate approved checkout without altering either tree, the CLI accepts a final optional absolute repository root after observation.json. All 155 source hashes are still verified; this parameter never changes expected hashes or the database target. After Main cherry-picks this kit onto its matching source, omit the option. Contract tests read matching checkout bytes, or the pinned Main Git object into their own disposable temporary fixture; an integrated CI checkout uses its matching local bytes and needs no historical Git object. Tests never modify repository migrations.


## Tariff coverage versus reservation basis

`pricing.coverage.inputTokens=1000000` describes the documented tariff range. For the fixed snapshot, [official specifications](https://help.aliyun.com/zh/model-studio/qwen3-7-plus) list maximum non-thinking input 991808 and total context 1000000 tokens. Legal model inputs are therefore within the quoted range. `allBillableComponentsIncluded=true` in the public candidate only confirms coverage for this current QA text-only request shape; it does not verify the account or authorize any spend.

The current QA consumer separately enforces content <=16384 UTF-8 bytes and the complete messages JSON, including system prompt, <=32768 bytes. That is not the complete HTTP body and bytes are not token counts. Do not use the internal `tokenUpperBound` field as an independently verified tokenizer measurement. The official model bound supplies the tariff argument; consumer/real PostgreSQL byte-boundary evidence adds a tighter application constraint.

The original 1048576 input multiplier remains unchanged as a monetary safety margin. With 4096 output tokens and 6/24 upper-tier rates, the documented maximum input costs at most 6049152 micros under this conservative calculation, below the unchanged reservation of 6389760 micros. No budget cap is lowered, no invoice amount inferred, and unknown usage remains pending.

[Official cache rules](https://help.aliyun.com/zh/model-studio/context-cache) distinguish opt-in explicit cache creation (surcharge) from automatic implicit caching (creation at standard input price; hits discounted). The current serializer sends plain string messages, no explicit cache_control, tools, search or multimodal inputs, and the QA profile does not enable thinking. Flat 6/24 pricing counts all reported input without cache savings and covers output; it makes no free-reasoning or free-cache assumption. A request-shape/model/endpoint change requires revisiting this coverage evidence. Missing or false coverage still rejects generation.
