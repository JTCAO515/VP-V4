# VPJ-07 durable text backend v1

Development integration follows [the 2026-09-12 policy](../agents/development-integration-policy.md): agents may configure versioned development policies within existing environment authority without supplier, legal or product approval. Unknown supplier details must be represented honestly; authenticated user consent and server enforcement remain required.

Status: local backend and native consumer preparation for #195. No real policy rows, recipient
configuration, remote migration, production scheduler or customer traffic are activated.
The SQL/controlled HTTP tests prove execution of the backend, not real-user/provider acceptance.

## Authority and scope

This is the executable successor to the LAUNCH-05 `not_persisted` default **only for new records
admitted under a current text policy and the authenticated owner's matching consent**. Existing
LAUNCH-05 callers remain unchanged. JT's VPJ03-JT-20260911-v1 decision in
[the owning record](../policy/vpj-03-text-decisions.md) authorizes long-term content retention after
chat/account deletion. This migration implements that direction without activating any policy.

A private immutable policy version contains provider, exact endpoint, recipient, source/processing/
storage regions, terms version, bilingual notice and its hash, effective/expiry/recheck timestamps,
and `retain_after_hide_v1`. The fixed atomic agreement is **user-message text / persist + inference**
and **validated final-response text / persist + owner display**, for the single purpose of answering
that owner's text Ask. It permits no Trip context, material upload, embeddings, training, third-party
redistribution or new fallback. A future agreement for those actions needs a separate version.
C2 is the default classification; no C3/C4 field envelope is accepted. Free text has no automatic
PII/secret detection guarantee; real activation still needs the approved field/notice safeguards.

The empty registry is private, has no public management RPC and is not writable by service_role.
An agent may install the development agreement through the scoped migration/configuration path
within existing environment authority; no separate supplier/legal/product sign-off is required. No placeholder row is seeded by application migrations. Policy definitions cannot be
updated/deleted; the only allowed update is terminal revocation. Expired/revoked versions require
a new reviewed policy ID and new consent. Caller-supplied booleans cannot enable the C0 protocol.

`accept_text_policy` binds the caller's authenticated owner and live session to the exact notice
hash of a current policy. `withdraw_text_policy` terminally revokes that owner's agreement.
Repeated acceptance reuses the receipt; a revoked receipt cannot be re-enabled. Browser/Native
notice UI and actual notice presentation are not delivered here; the RPC does not prove someone
read a notice. Owner/session enforcement uses existing mobile authority plus live auth.sessions.

## Input, execution and output

`start_text_turn` takes thread/Turn/idempotency UUIDs, policy ID, legacy-compatible locale and
nonblank text ≤4,000 UTF-16 code units. It atomically creates the existing accepted Turn/event,
private input record and durable work. Matching idempotency reuses the same Turn; changed text,
locale, policy or an existing metadata-only Turn is rejected. Body hashes never enter events.

`runTextWorker` performs one bounded queue poll. `read_text_work` requires a current lease,
originating live session, active thread, current policy and unwithdrawn consent. Deployment
bindings must match the stored provider **and exact endpoint**. `invokeTextProviderProtocol` owns
another input read and the final `authorize_text_dispatch` SQL call internally, building its prompt
from that durable row. One lease may authorize one dispatch. C0's four-argument compatibility
entry still denies C2. Server-only RPC and transport dependencies are trusted; they are not user
request parameters. Production transport/RPC identity wiring remains an activation prerequisite.

### Scoped worker binding

`createScopedTextWorker` binds one operator-selected owner, immutable policy and budget scope to
the existing text worker. Its server RPC adapter has a10-second lifetime per request, a128KiB
response limit, no redirect/retry, and generic failures without upstream bodies or credentials.
Local databases must be root loopback origins; Staging is the fixed Staging Supabase origin.
It rejects every Vercel execution environment: invocation belongs to a dedicated trusted process,
not a public Next route. It obtains only an explicitly supplied server worker credential and
provider binding; no environment secret, timer, policy or network job is automatically installed.

The additive `claim_text_work(owner,policy)` capability is executable only by the existing service
role. It filters before claiming, then repeats policy/consent checks under the established lock
order. Other owners, other policies, hidden/revoked text and metadata-only work remain unclaimed.
The legacy global claimer and scoped claimer share the same advisory lock and lease protocol;
parallel processes and upgrades cannot lease one item twice. Token expiry, cancellation and
terminal-once remain authoritative in SQL. No queue payload, owner scope or grant comes from a
user request. Source, real SQL/HTTP checks and rollback evidence are in
[scoped-worker verification](../../artifacts/VPJ-07/scoped-worker/verification.md).

The dedicated `run-staging-text-worker.mjs` CLI composes the allowlisted HTTP transport with
this scoped worker for one explicit poll. It requires an operator-owned closed JSON configuration,
two explicit worker/provider environment credentials and a new private receipt file. It has no
cron or automatic key discovery. Metadata receipts are fsynced; existing files are not overwritten.
The job currently permits only pinned Qwen `qwen3.7-plus-2026-05-26`. Before claim or credential
access, reservation must cover 1,048,576 input tokens at the greater input/cache rate plus the
configured maximum output at its rate, rounded upward once using integer arithmetic. This
conservative full-context bound avoids text/token guesses; operator-reviewed actual tariff in the
budget currency remains mandatory. Other provider profiles require their own verified bounds
before this entry can admit them; general protocol adapters remain available separately.

This wiring still requires an approved runtime provider transport, actual price/configuration
binding, durable scheduling and a qualified policy before remote activation. It is not evidence
that a remote worker or provider has answered a user. Rollback stops the owned worker process;
revoking service execution of the new scoped-claim capability additionally stops new scoped claims.
Retain its migration, existing leases, content, receipts and pending charges. Do not use the legacy
global claimer as a fallback or release unknown reservations during rollback.

Each lease receives a distinct budget attempt through the existing durable reserve/dispatch/finish
ledger. Unknown charges remain pending and consume reservation capacity; a provider failure or
lost acknowledgment does not become free. Revocation between budget dispatch and text authorization
may conservatively leave a pending reservation despite no external call. No supplier refund or
exactly-once supplier charging is promised. Technical queue/timeout/step bounds are not a newly
chosen daily user spending limit. Existing ledger foreign keys still restrict account deletion.

Worker pricing requires `protocol_validated` or the protocol's `SAFETY_BLOCKED` path, which
is reached only after the exact configured model and normalized usage are checked. Diagnostic
usage attached to `MODEL_OUTPUT_INVALID` is not pricing evidence: a mismatched/missing model,
error envelope or other invalid protocol response retains its full pending reservation and
concurrency slot. This is intentionally conservative even for invalid responses that may have
used the expected model; their generic outcome does not provide a separately validated price basis.
The trusted price function and approved price version remain required; this is a budget debit,
not supplier-invoice verification. No existing settlement is rewritten by the worker change.

Business outcomes are separate from provider costs. A validated protocol response can still
incur cost when its business outcome is `blocked` or `technical_failure`, or its business JSON
fails the final mapping. A verified provider safety refusal can also incur cost. None of these
states grants a zero charge or changes customer Ask/ServiceTask/Credit consumption semantics.

The versioned provider task requests a closed JSON `{outcome,text}`. Only `answered`, `partial`,
`clarification`, `blocked`, `technical_failure` with nonblank text ≤8,000 UTF-16 units are accepted.
Unknown fields/raw reasoning are rejected; no cards, Proposal, tools or Trip writes are emitted.
This is schema validation, not verification of factual quality, evidence or bilingual equivalence.
`complete_text_work` rechecks lease/identity/policy/consent and atomically stores the final message
with one terminal event: the first three outcomes map to technical `completed`, `blocked` maps to
`unavailable`, and `technical_failure` to `failed`. Business outcome remains separately readable.
A callback returning `persisted` means that atomic transaction succeeded; metadata finish is skipped.
Cancellation, expired lease and withdrawal reject late writes. Owner reads use the same authority.

## Concurrency, withdrawal and retention

Authorization linearizes at its committed SQL decision. Withdrawal prevents later authorizations;
it cannot recall an already-authorized/in-flight network request. Output persistence and reads are
independently rechecked. This contract does not claim zero-race egress after withdrawal.

Worker mutations lock the owner root row, account/session, Turn, thread and work before policy/
consent checks. Root/thread locks use NOWAIT to avoid inversions with privileged cascading deletes;
contention rolls back the RPC for retry, never misclassifies a busy work item as cancelled. Hiding
triggers execute after deletion, within the deleting transaction, so content locks do not precede
session/Turn cascade locks. Cancellation still shares the existing Turn lock. The lease clock is
rechecked after policy locks as well as before them.

For newly consented text only, deleting Turn/thread/account permanently sets `hidden_at` on retained
input/output. Content is not cascade-deleted. Recreating IDs cannot restore visibility. This does
not resurrect previously deleted data, remove existing budget deletion restrictions, implement the
privacy request executor, or claim body deletion. Archived threads are unreadable while archived;
archive is not deletion. Team access remains disabled until its controlled identity/capability/audit
implementation is verified. Operator/backup retention disclosure and supplier TTL are separate
qualification requirements; this contract grants no backup restoration or public retention promise.

## Verification and rollback

See [verification](../../artifacts/VPJ-07/text-backend-verification.md). Tests use disposable UTF-8
PostgreSQL with all application migrations, minimal SQL auth fixtures, ordinary roles, controlled
HTTP, cancellation/deletion barriers, and existing worker crash recovery. They do not prove GoTrue,
remote Auth, an actual supplier, a deployed worker or native UI acceptance. #195 remains open.

Before remote development activation, record actual recipient/endpoint configuration and user notice,
represent undisclosed supplier details honestly under the development policy, and configure trusted
RPC/transport and reviewed budget pricing, apply migrations under scoped environment authorization,
and verify the deployed clients including native final-answer reload. Local native evidence does not establish remote acceptance. Rollback disables the consumer and
policy, retaining content, receipts and applied migration history. Do not drop retained records or
restore revoked/deleted visibility. An applied migration is never edited or removed.


## Native text consumer v1 (explicit test environment)

The native `api/chat/native/v1` routes require an operator-selected environment and policy UUID.
Local execution requires `VISEPANDA_NATIVE_LOCAL_TEXT=true`, `VISEPANDA_NATIVE_LOCAL_TEXT_POLICY`
and a root loopback Supabase URL; any `VERCEL_ENV` prevents local activation. Staging requires
`VISEPANDA_NATIVE_STAGING_TEXT=true`, `VISEPANDA_NATIVE_STAGING_TEXT_POLICY` and the existing
native Staging identity/Trip configuration: exact generated Preview request origin, explicit
Staging and Trip-v2 flags, and the fixed Staging database. Production, aliases and arbitrary
hosts/databases cannot activate it. The shared Trip resolver supplies only the public key,
never the password-proof key. Cookie/Origin ambiguity and query fields are rejected.
The bearer credential is verified through the existing native session epoch authority; every
sensitive SQL operation independently checks the live owner/session. Bodies are bounded to
32KiB/5 seconds and closed request shapes; credential verification, session checks, body reads and
RPCs share one 10-second request lifetime. Cancellation/deadline/transport failure returns503,
including a lost submit acknowledgment, without an automatic retry or a credential-clear signal.
Only explicit credential/session rejection returns401. Late upstream replies cannot dispatch a
later RPC. Malformed/oversize bodies remain400; policy denial remains403. No service key enters
the native app. The migration installs no policy, and flags do not grant third-party permission.

`read_text_policy` exposes the current immutable bilingual notice and the caller's consent state.
`submit_text_turn` atomically creates a standalone thread and performs existing text admission;
rejection rolls back an otherwise orphaned thread. `list_text_turns` returns the owner's latest
20 visible requests under the selected current policy and unwithdrawn consent. It includes the
technical lifecycle separately from the five business outcomes. A changed deployment policy
never inherits the previous recipient's permission. Existing withdrawal by policy UUID remains
available while the selected test API is enabled, including for a previous selected policy.

The native Ask view displays the complete stored notice before an explicit unchecked
agreement/accept action. It supports submit, same-request retry, cancel, withdrawal and history
reload. Its API uses the existing NativeSession endpoint: a local argument or the explicitly
packaged Staging build configuration. No request can choose a different endpoint or policy.
Controls and outcome labels are translated in all five existing native locales; notices are the
approved Chinese/English texts. The result is plain text; no new Trip write or action execution.

Native requests share the existing credential/session fencing, with a separate fixed Ask path
allowlist. Asynchronous store operations additionally bind an operation UUID and identity scope.
Late responses cannot publish after account changes or operation invalidation. The View observes
both active and retained identity and the end of session restoration: cold login/restore reloads
without a manual button; permanent clear removes draft/pending state even if active scope was
already nil. Temporary authentication loss hides reads and keeps only the same-owner unsent
in-memory draft/request for recovery. No new on-device content file or outbox is created.

During a running app session, an uncertain submit retains its original IDs/body for retry.
After app restart, the consumer reloads server-accepted requests; it never automatically
resubmits an unacknowledged prompt. Unsent drafts and local retry state do not survive process
termination. Polling is bounded to 60 iterations and stops with view/task or identity changes;
the manual Reload action remains available. This is not a streaming or background execution SLA.

Local evidence uses a separate disposable Supabase instance with real GoTrue, native JWTs,
PostgREST and all31 migrations, plus the existing worker and a controlled loopback HTTP model.
The complete signed Simulator runner can receive a strict synthetic-only local text profile;
it still executes both full test targets, never filters tests, and removes its owned Simulator
and temporary xctestrun. Its default CI mode remains unchanged. See
[native evidence](../../artifacts/VPJ-07/native-text-verification.md). Physical-device, remote,
real-recipient and provider-semantic acceptance remain separate; #195 stays open.

The Staging entry gate adds no policy, worker, model credential or migration. Before activation,
qualify the actual recipient/account/region/terms and install the immutable bilingual notice through
the existing authorized policy path; a UUID alone cannot satisfy that registry or user consent.
Bind the trusted worker and reviewed budget pricing, then verify ordinary-user final-answer reload
against the exact deployed SHA. Disable only the owned branch's text activation to roll back;
preserve consent history, retained content and receipts. S1 Staging identity evidence and synthetic
local worker results do not establish remote S2 acceptance.

### Versioned text response policy (2026-09-12 implementation)

The existing protocol's `text_turn_v1` system message uses the server-owned
`prompt/text-turn.ts` policy `vp-text-response-v2`. It defines the five business
outcomes, useful low-risk answers, partial coverage, necessary clarification and
actual text-only capability limits. Current user input remains a separate untrusted
message; no Trip, history, memory, evidence fetch or extra model call is added.

The gateway's existing `VersionRef` shape records its version and SHA-256 digest in
one-shot `vpj07-worker-run/2` journal entries. This is execution metadata, not model
output or proof of semantic correctness. Consumers of these private journals must
recognize v2; old v1 journals remain valid historical evidence without inferred
prompt metadata. Destination receipts and `vpj07-worker-result/1` are unchanged.
The native API, durable text columns, five outcome values, legacy protocol callers
and native result mapping retain their existing wire formats. This increment does
not claim durable per-Turn prompt-version storage or ServiceTask attribution.

Synthetic regression cases and criteria are fixed before the candidate run in
`artifacts/VPJ-07/response-policy-20260912/cases.json`. The courtesy sample was used
to identify an earlier defect and is a regression, not blind quality calibration.
Actual responses require semantic inspection; system-prompt separation tests alone
cannot prove resistance to arbitrary model prompt injection or factual correctness.

2026-09-12：PR328 的 native v2 ServiceTask 接纳/历史与共享成本已在真实 Staging 两语言四次 Qwen 调用验证，见[记录](../../artifacts/VPJ-07/service-task-staging-20260912/verification.md)。当前仍只外发本次输入；完整多轮上下文、SwiftUI v2 和持续 worker 运行另行完成。

### Bounded same-task context (native v3, 2026-09-12)

This #195 increment lets a short clarification use its original goal. Adjacent
model-gateway prompt/protocol files change because they own the single C2 exit;
job configuration and its tests change to bind the worker and audit prompt version.
No separate conversation service, queue, recipient, billing policy or Trip access is introduced.

- New immutable `text_policies.context_mode=task_history_v1` requires a new policy,
  bilingual notice/hash and owner consent. Existing rows default to `current_input_v1`;
  their notice and consent never acquire history permission. No policy is installed by migration.
- `/api/chat/native/v3/policy`, `/consent` and `/turns` select only the separately
  configured `VISEPANDA_NATIVE_{LOCAL,STAGING}_TASK_POLICY`. v1/v2 retain their
  existing policy, response version and record-only behavior. v3 response version is 3;
  the ServiceTask envelope, scopeVersion 1 and terminal outcome vocabulary stay unchanged.
- At most four Turns belong to this bounded context mode. Input is the current
  user text plus up to three ordered user/assistant pairs from the same goal chain.
  Existing user/answer limits are 4000/8000 UTF-16 units. Admission beyond four fails
  with `SERVICE_TASK_CONFLICT`; exact replay still works. It does not start another
  task, reset cost or imply that a new user goal is required.
- The database validates the entire chain's owner, thread, task, original policy,
  original consent, visibility and ancestor terminal output. Missing/hidden ancestors
  invalidate the whole context. `read_text_work` returns new `task_input` plus a
  SHA-256 context digest. Fresh `authorize_text_task_dispatch` reconstructs that
  payload and matches its digest before issuing the lease-bound dispatch receipt.
  Withdrawal/deletion after that authorization retains the existing in-flight boundary;
  it cannot recall data already sent, and late output remains subject to completion checks.
- Global and old scoped claimers exclude context tasks. `claim_text_task_work`
  selects only this mode, so a mixed-version worker cannot consume a context task
  and terminalize it as a protocol error. No legacy unassociated admission or old
  dispatch authorization can send a context-policy Turn.
- `vpj07-staging-text-job/2` requires `inputMode=task_history_v1`; job/1 remains
  current-input only. The existing worker journal records `vp-task-response-v1`
  instead of the legacy prompt reference for job/2. The provider uses `text_task_v2`
  with fixed user/assistant history roles and a server-owned system prompt. Complete
  serialized RPC/provider payloads are bounded at 262144 bytes. C2 still requires
  the trusted SQL authorization entry and the existing durable cost reservation.

Rollback disables v3 and its context worker. Retain applied migration, new consent,
task links, budget pins and cost receipts. Do not change an accepted policy's mode,
return context work to a legacy claimer, replay it as a fresh task or erase retained
records. This API slice requires target Staging and a SwiftUI consumer before it can
establish native multi-turn acceptance. It does not resolve earlier semantic failures.


The real Staging task-context candidates v1 and v2 both failed the fixed bilingual
facing-direction case. Neither entered clarification, so no continuation was
admitted. Candidate v2's added prompt rule did not establish the required behavior
and was withdrawn; the runtime remains v1. Both results and settled cost evidence
are retained in `artifacts/VPJ-07/task-context-staging-20260912/verification.md`.
Native context integration and semantic acceptance remain separate open work.

## Native task-context consumer (implementation under verification)

The installed `VisePandaNativeTaskContext=task_history_v1` value, supplied through
`VP_NATIVE_TASK_CONTEXT`, selects the v3 policy/consent/history/submission API.
Empty defaults keep v1; unknown values fail closed. A launch flag selects v3 only
for an already validated loopback API. Remote launch arguments cannot activate it.
Cancellation remains the exact POST v1 Turn cancellation route and v1 response.

Each root has a fresh ServiceTask and each clarification/repair keeps that task,
thread and locale, referencing the confirmed parent. Acknowledgement moves the
composer to awaiting before refreshing history. During a running app session, unknown POST results retain the
exact pending request; recovery matches thread, input, locale and task relation
under the same notice/policy, not only Turn ID. An explicit new-question action
cannot discard an uncertain pending request.

A complete chain has one root, no missing parent, no fork/cycle, consistent task
and thread, legal predecessor outcomes and at most four Turns. A20-row history
window is not proof of completeness. The latest incomplete task blocks restoration
instead of selecting an older complete chain. A fourth clarification is displayed
but cannot automatically create another Turn or reset the budget.

The consent review binds mode, policy ID, notice version and hash. Temporary refresh
failure hides read bodies while preserving recovery intent. On a changed notice,
an old uncertain request cannot be resent under the new policy. The UI offers an
explicit action to withdraw sharing under the old policy; only a confirmed response
releases that pending request. Completed results remain retained. Logout/account
changes clear local state and late responses remain fenced by NativeDataScope.

This consumer does not fix the retained real-provider semantic failures. Local
controlled-provider integration proves transport/SQL/UI behavior only; remote
semantic acceptance, persistent worker operation and full #195/S2 remain open.

The existing process-lifetime boundary above still applies to v3: local pending
requests are not persisted across termination. Restart restores server-accepted,
visible history without automatically resending an unacknowledged request. An empty
history response is not proof that a prior in-flight POST cannot still commit;
cross-process uncertain-submit deduplication is not established by this slice.
Closing that window requires a separate persistence/consent and crash-recovery
increment, not a claim inferred from ordinary relaunch tests.

## Explicit bounded-thinking experiment (2026-09-12)

`vpj07-staging-text-job/3` adds a required `thinkingBudgetTokens` integer to the
job/2 task-history configuration. It is Qwen-only, between1 and2048, and strictly
below `budget.maxOutputTokens` (at most4096). Job/1 and job/2 keep their existing
non-thinking Qwen requests. No HTTP/native input can select this deployment option.

For job/3 only, the provider request sets `enable_thinking=true`,
`thinking_budget=thinkingBudgetTokens`, and
`max_completion_tokens=budget.maxOutputTokens`; it does not send `max_tokens`.
The [provider's documentation](https://help.aliyun.com/en/model-studio/deep-thinking)
distinguishes the combined reasoning/answer limit from the final-answer-only limit.
The existing reservation therefore covers the complete output cap plus the full
input context at the configured conservative tariffs. Reasoning tokens are already
part of completion usage and are not charged a second time by the calculator.

The same recipient policy, fresh context authorization, task budget, timeout,
response-byte cap and strict JSON validator remain authoritative. A truncated or
above-cap completion is invalid and retains unknown-cost treatment; reasoning
content is never returned, persisted as an answer or placed in history. There is
no automatic JSON repair or semantic reroll.

Worker-run/3 journals retain the configuration hash, unchanged task prompt reference
and explicit generation mode/limits. They contain no input, output or reasoning
text. Disabling the option uses the existing job/2 configuration; retained task,
consent and cost records are not reset. This code is experiment preparation, not
proof that the provider honors the parameters or that the retained failed semantic
cases now pass. Live evaluation must keep those cases and record a distinct result.

## Bounded continuous Staging worker

`run-staging-text-service.mjs` continuously invokes the existing scoped job for one
immutable owner, policy and budget configuration. It accepts only
`vpj07-staging-text-service/1` with exactly `schemaVersion`, `job`,
`pollIntervalMs` (5000–60000) and canonical ISO `expiresAt` (future, at most 24 hours).
The nested job retains the existing job/1, job/2 or job/3 contract. Each poll
rechecks SQL authority; a service configuration cannot grant consent or budget.

Activation requires `VISEPANDA_STAGING_TEXT_SERVICE=true`, no `VERCEL_ENV`, and the
existing worker/provider credential environment variables. Invoke with
`node --experimental-strip-types lib/server/jobs/run-staging-text-service.mjs --config <private-json> --receipts <new-private-jsonl>`.
No route, scheduler, launch agent or account is installed. The journal is created
exclusively with mode0600 and records configuration digest, prompt/generation
reference, absolute expiry, poll outcomes and existing destination metadata; it
never records input, answer, reasoning or credentials. Journal failure stops work.

Polling is sequential. Empty, finished and queued results permit the next poll;
`unavailable` stops with exit1, including an in-flight cancellation reported by the
underlying worker. The operator must inspect the journal and ledger before an
explicit restart. No automatic restart or semantic reroll is provided. SIGTERM
and SIGINT propagate abort; absolute expiry and a 150-second per-poll deadline
also abort work. Filesystem writes and remote settlement are not hard realtime.
Restarting with the same file cannot extend expiry or reset database budgets.
After a crash, SQL leases and unresolved cost holds remain authoritative; killing
the process is not evidence that the supplier request was never sent or charged.

The disposable integration command
`node tests/integration/turn/run-native-http.mjs --service` uses actual CLI child
processes, real local Auth/SQL/native HTTP, and an explicitly mapped synthetic
provider. It checks later input consumption, process restart without rebilling,
task clarification/repair and cancellation stopping the processor. This local
controlled-provider result does not establish real Staging operation, native UI
submission, the retained bilingual semantic criteria, or full #195/S2 acceptance.
