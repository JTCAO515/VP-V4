# Versioned text response regression — 2026-09-12

Related to #195 and PR #327. Criteria were committed in `3644d22` before any candidate call; see [cases.json](cases.json).

## Candidate v1

Eight actual Qwen responses used worker source `3644d22` and deployed native API source `ed2508e`. Every expected outcome matched; semantic verdict **FAIL**. See [v1-results.json](v1-results.json) for all synthetic outputs and version-bound receipts.

The English courtesy response still reversed the word-position explanation. Both partial responses correctly admitted the current airport queue time was unknown, but then recommended or described unverified update channels. These defects are retained and cannot be cancelled out by the eight correct outcome labels.

The evaluation driver initially required status `completed` for every outcome. Existing SQL correctly maps `blocked` to `unavailable`; the driver stopped after reading that legitimate result. After inspecting the stored Turn and SQL mapping, it resumed the read without another model request and ran only the remaining case. This checker correction did not change semantic criteria, reroll an answer or alter product code. The original checker failure is recorded in the results.

## Candidate v2

The same response policy now excludes speculative word-insertion advice for phrase examples and distinguishes a possible verification contact from a source known to publish a particular live fact. Version increments to `vp-text-response-v2`; the worker journal records its new digest. The original eight-case criteria remain unchanged. Candidate calls are pending.

Scope limits: this is a targeted synthetic development regression, including a previously observed sample. It is not blind evaluation, human calibration, arbitrary factual correctness or general prompt-injection proof. Native answer presentation, durable per-Turn prompt metadata, ServiceTask and actual technical-failure/recovery acceptance remain incomplete.
