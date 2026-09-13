# Recorded Staging usage links — VPJ-67 preparation

`node --experimental-strip-types scripts/harness-recorded-usage.mjs <recording.json>`

This command validates and projects an operator-supplied historical recording. It has no
provider, database or settlement capability. Exit0 means the supplied task/owner/policy/attempt
and tariff/usage records link consistently; exit2 means required usage or relation records are
missing/unsettled; exit1 rejects invalid input without printing raw input or errors.

It is **recorded-staging**, not a newly executed live test. Source/configuration/prompt hashes
are labels from the recording, not signed provenance. The SHA256 identifies the input bytes;
it does not authenticate them. Current authorization, attempt-set completeness, factual support,
Trip invariance and native/Web consumers are explicitly unverified, and full acceptance stays
NOT_RUN. No original Harness case is promoted from fixture/NOT_RUN.

The closed input schema is `vpj67-recorded-usage-input/1`:

- `recordedAt`, `apiSha`, `workerSha`, `configurationDigest`, `prompt:{version,digest}`.
- `binding:{ownerId,serviceTaskId,turnId,policyId}` for the selected recorded Turn.
- `taskRecord:{id,ownerId,policyId}` from its ServiceTask, or null if missing.
- `turnLink:{turnId,taskId,ownerId}` from the persisted task-turn relation, or null.
- `budgetScopes:[{id,ownerId,currency}]` from the referenced budget scopes.
- `attempts:[{attemptId,scopeId,ledgerTaskId,status,actualMicros,provider,model,priceVersion,
  reservedMicros,usageReceipt}]`. `usageReceipt` is the existing closed
  `validated-model-usage/1` worker receipt, or null. No prompt, answer, endpoint credentials or
  arbitrary metadata fields are accepted. At most100 attempts and100 scopes per recording.

The producer receipt calls its Turn ID `attempt.taskId`; the durable ledger uses the parent
ServiceTask ID in `task_id`. Both must match their separate recorded association. Model, provider,
price version, reservation and settled amount must agree with the receipt. A settled row without
usage is incomplete. Unknown usage/cost stays unknown; `tariffMicros` is a recorded ledger value,
not a supplier invoice or user charge. The reporter does not independently recompute prices.

The remaining live collection, actual evidence grading, outcome semantics, complete named cases
and consumer checks belong to #264. It must use current permitted producers/consumers and the
existing bounded Staging workflow; this reporter grants no access and cannot close that Issue.
