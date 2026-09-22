# H04 recorded evidence adapter

Related to #264. `evals/harness/recorded/h04-readonly.ts` consumes existing
`grounded_history`/`grounded-turn/1` RPC recordings through the unchanged Web
`parseGroundedHistory` consumer and composes `recordedUsageTrace`. No new dispatcher,
retriever, ledger, model or Trip writer is introduced.

## Scope and fixed oracle

H04 requires **clarification**, not blocked. PR #420, commit `91ac437e`, merged into
`testing-chat-vpv4` as `a9a1bfc5`, exercises `prepareGroundedExecution` with empty
claims and reports blocked. That is a useful no-guessing primitive check, but is
not the scenario's clarification result. The adapter retains the no-actionable-fact
and unchanged-Trip assertions and deliberately fails that blocked outcome. It does
not merge that branch or invalidate the pairing/response-quality seed hashes.

The current grounded-history consumer requires a city in its result. H04's original
prerequisite specifies no selected city. A recorded result containing Shanghai does
not establish how that city was obtained. The adapter therefore always reports
`ambiguityPrerequisite: NOT_VERIFIED` and `acceptanceEvidence: EVIDENCE_INSUFFICIENT`.
Do not silently supply a city and call the original scenario accepted.

## Inputs and evidence boundaries

The exported `recordedH04(unknown)` accepts the closed `vpj67-h04-recording/1`
envelope shown in the contract test. `usage` uses the existing recorded usage input
schema. `policyReply` and `historyReply` are existing RPC projections; they are
parsed in memory and never copied to the report. `elapsedMs` is the existing
consumer request duration, not a claim of end-to-end task latency.

`before` and `after` contain `{ownerId, complete, trips: [{id, content}]}`. Each
content must include the full persisted Trip representation relevant to the run,
including items and versions. Reordering Trips is ignored; item/content changes,
creation, deletion and duplicate IDs are detected. Both snapshots must belong to
the usage owner. An incomplete/unknown `complete` (false/null) yields
EVIDENCE_INSUFFICIENT, even if both arrays are empty. A true flag is only an operator
declaration, never proof of complete pagination or authenticated origin. Before a
live claim, capture all pages plus authoritative totals under the same actor and
retain acquisition evidence in the approved secure evidence location. Missing
pages or collection coverage cannot pass acceptance. A before/after equality check
also cannot exclude transient writes followed by reversion; write audit is separate.

`recordingConsistency: PASS` means only supplied records are internally consistent.
Mode is explicitly fixture or recorded-staging; neither triggers any network call.
The report includes task/turn/attempt linkage and validated usage, preserves unknown
vendor costs, and omits questions, facts, Trip payloads and arbitrary exception text.
Snapshot authenticity, current authorization, attempt-set completeness, actual
clarification wording, native UI and original no-city prerequisite remain unverified.
The Web result is a parser observation, not rendered browser acceptance.

## Bounded live plan — not executed or authorized by this document

One fixed H04 task in en and one in zh, one attempt each, no automatic retries.
First resolve the no-city input contract with the owning upstream task; if it cannot
represent that precondition, record a blocked scenario rather than substituting it.
Use an approved isolated Staging test actor with no Trips, the same first-party
policy, identified API/worker SHAs and an already authorized provider binding.
Overall must identify the existing account/recipient authorization and provider
window before execution. Proposed batch ceiling: CNY 0.10 tariff total, at most
512 output tokens per attempt; execute only if the bound can be enforced and the
existing authorization covers it. Unknown cost stops the second call. No fixture
facts are published and no Trip is created. Read complete before/after snapshots,
record the two task chains, inspect bilingual native/Web clarification, and retain
only allowlisted evidence. Cleanup is limited to local temporary recordings; task
or account deletion is a separate authorized action. All live checks remain UNRUN.
