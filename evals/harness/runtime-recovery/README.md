# H09/H10 runtime recovery adapter

Related to AGENT-013 / #264. This directory supplies an invokable driver and
JSON/Markdown report producer, without changing the existing Harness registry,
cases, seeds, grader, holdout, CLI, package, CI or production authorities.

`runRuntimeRecovery(input, transport, signal)` consumes an exact `RecoveryRun`
from `contract.ts`. `createNativeRecoveryTransport` connects two **already
authorized ordinary-user fetch functions** to existing RPC and Native Trip GET
paths. It discovers no credentials, enables no environment, and has no default
fetch. Neither the driver nor its reports grant authorization. The caller retains
target validation, authentication and permission responsibility. Do not supply
a service-role transport; existing RPC/RLS/session guards remain authoritative.

```ts
import { runRuntimeRecovery, recoveryReportArtifacts } from './index.ts';
import { createNativeRecoveryTransport } from './transport.ts';

// All variables below come from the current permitted runtime, not this module.
const transport = createNativeRecoveryTransport({
  databaseOrigin, appOrigin, rpcFetch: authorizedRpcFetch,
  nativeFetch: authorizedNativeFetch,
});
const report = await runRuntimeRecovery(currentRecoveryRun, transport, signal);
const { json, markdown } = recoveryReportArtifacts(report);
```

No executable automatically invokes this example. Importing these files performs
no network or data action. Omitting transport returns NOT_RUN.

## Existing interfaces reused

| Port | Existing producer/schema | Adapter use |
| --- | --- | --- |
| `native_session_v2('session')` | Current Native session, version 2 | Before every operation, match subject/session/mobile epoch |
| `read_assistant_events_v1` | `assistant-events/1`, limit 50 | Production `decodeAssistantEvents`, contiguous cursor, exact task/turn membership, terminal fence |
| `cancel_chat_turn` | Existing owner-authorized cancellation, `sequence/state` rows | H10 cancellation only; ACK alone cannot prove terminal state |
| `read_local_recovery_operation_v1` | `local_recovery_operation/1` | Production `readLocalRecoveryOperation`, exact operation/selection/context/receipt binding |
| `read_trip_proposal_v2` | Existing proposal row and `trip-v2:` digest | Pin owner/Trip/proposal/revision/base/digest and pre-confirm expiry |
| `confirm_and_apply_trip_proposal` | Existing atomic immutable confirmation | H09 explicit `confirm_once`, original key/digest; never repeated by this invocation |
| `read_trip_confirmation_receipt_v1` | Existing owner-readable current-version receipt | Require exact original proposal/Trip/resulting version to classify applied |
| Native `/api/trips/native/v2/{tripId}` GET | Version 2 Trip reload | Existing `assertTripSnapshot`, head version and content comparison |

H09 requires an already-created local recovery operation and original proposal;
it does not create or replace either. `confirm_once` may be invoked **only after
the existing visible diff and explicit user confirmation**. `reconcile` is the
restart/lost-ACK path and never calls confirm. Unknown ACKs invoke only reads.
Auth/conflict/input errors stop immediately rather than authorizing retries.

H10 supports either an existing proposal/operation or all five nullable proposal
fields set to null when cancellation occurs before proposal creation. It cancels
only a currently observed nonterminal task. Replay after cancel and after readback
detects conflicting late terminal events; no replay/artifact output is applied.
A previously committed Trip reports applied when receipts agree, never undone.
Cancelled classification requires observed cancelled state plus unchanged Trip
version/content across the bounded window and no observed application receipt.
This is a finite observation, not proof against all future events or other writers.

## Bounds and evidence

Caller bounds are 1–64 requests, 1–60,000 ms for the complete run, and 1–8 pages
per replay. Default context is **not** created; every field is supplied. Responses
are limited before JSON parsing to 262,144 bytes each and 1 MiB total, with a
bounded UTF-8 decoder, closed error codes and validated status/content type.
Request bytes are at most 8 KiB; generated JSON is at most 32 KiB. The timeout
races transport and stream reads even when a transport ignores AbortSignal.
Late responses are cancelled and cannot resume the driver. No retry, refresh,
provider attempt, budget/journal/Trip writer or settlement is added.

Reports retain content-free request names, status, size and actual response-byte
SHA256. Response bodies, SQL details, credentials, prompts and Trip content are
not emitted. Requested API/worker/config revisions are explicitly caller-bound,
not runtime-attested; hashes identify observed bytes, not trusted provenance.
An applied outcome is scoped to the original **Trip proposal**, not whole Task
completion. Task-to-Trip causal linkage and original idempotency-key readback
remain unknown: neither replay nor these recovery/confirmation receipts supplies
that complete association. Commit count, quota debit, provider usage and vendor
invoice remain unknown because these ports do not establish them. No invented
zero, one, receipt or ledger substitutes for that missing evidence.

`controlled` identifies tests against injected transport; `staging` labels a
separately authorized invocation, not an authorization flag. Full acceptance is
always NOT_RUN in this slice. Actual Staging/provider, persistence/restart,
fees, Native/Web consumers and #264's other AC remain unrun.

## Checks and Main integration candidates

Run `node --test tests/contract/harness-runtime-recovery/runtime.test.ts`,
`pnpm typecheck`, `pnpm lint`, `pnpm docs:check`, `git diff --check`.
Tests drive this adapter and its concrete endpoint bridge with controlled
responses; the late-result test imports existing `runDurableTurnWork`. They do
not implement a second worker or fabricate a passing Harness trace.

Main may add the module import and explicit authorized invocation to the existing
Harness entry after obtaining its exact lease. Pass `action: 'reconcile'` for
reconnect; H09 `confirm_once` must consume the accepted immutable confirmation.
Map output as scoped runtime observations, never replace seed/grader reports or
promote H09/H10 to required-mode PASS. Existing registry/CLI/package/CI files were
not edited here. Missing task-to-Trip/key/accounting/source-attestation ports
require their original owners; this module must not create a parallel authority.
