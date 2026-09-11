# VPJ-07 durable text backend v1

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
Only a separately authorized operator migration/configuration may install the actual qualified
agreement. No placeholder row is seeded by application migrations. Policy definitions cannot be
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

Before remote activation, complete recipient/region/terms/notice qualification, configure trusted
RPC/transport and reviewed budget pricing, apply migrations under scoped environment authorization,
and verify the deployed clients including native final-answer reload. Local native evidence does not establish remote acceptance. Rollback disables the consumer and
policy, retaining content, receipts and applied migration history. Do not drop retained records or
restore revoked/deleted visibility. An applied migration is never edited or removed.


## Native text consumer v1 (local opt-in)

The native `api/chat/native/v1` routes require `VISEPANDA_NATIVE_LOCAL_TEXT=true`, one explicit
policy UUID and a loopback Supabase URL. Cookie/Origin ambiguity and query fields are rejected.
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
available while the local API is enabled, including for a previous selected policy.

The local native Ask view displays the complete stored notice before an explicit unchecked
agreement/accept action. It supports submit, same-request retry, cancel, withdrawal and history
reload. The existing preview stays disabled unless the local Native API argument is supplied.
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
