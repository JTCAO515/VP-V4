# H1 Native Ask runtime observations

Related to AGENT-013 / #264. `runRuntimeAsk` is an invokable acquisition driver,
not another recorded-trace consumer. It uses existing ordinary Native v4 Ask
ports and the production grounded replay/browser projection parsers. No model,
Trip, consent, session, budget, worker or grading authority is created.

```ts
import { runRuntimeAsk, askReportArtifacts } from './index.ts';
import { createNativeAskTransport } from './transport.ts';

// suppliedRun and fetch are already bound to the current permitted actor/session/target.
const transport = createNativeAskTransport({ appOrigin, authorizedFetch });
const report = await runRuntimeAsk(suppliedRun, transport, signal);
const { json, markdown } = askReportArtifacts(report);
```

Import has no network effect; there is no default fetch or runtime credential
discovery. Omitting transport returns NOT_RUN. The supplied fetch must preserve
ordinary-user Native credentials, exact actor/session and target allowlist,
and must not refresh credentials or retry mutation requests. The bridge captures
that fetch and uses `redirect: error`. Mode is an observation label, not a grant.
Live Staging/provider/DB/fees/ECS/production are NOT_RUN in this delivery.

## Invocation and existing ports

`AskRun` supplies an explicit current owner/session/mobile epoch/policy/notice and
caller context digest, original Native submission DTO, optional exact current
Trip ID, predeclared development expectation and technical bounds. New IDs are
never generated here. H01/H04/H07 are the only accepted case IDs; no holdout
input, thresholds, prompts or scenarios are read for tuning. Arrays/boxed enums,
accessors, Symbols and hidden required fields fail closed before dispatch.

| Request | Existing endpoint | Observation |
| --- | --- | --- |
| GET session | `/api/auth/native/v2/session` | Match current subject/session/epoch before each operation |
| GET policy | `/api/chat/native/v4/policy` | Existing accepted consent, exact current notice/policy and expiry |
| GET history | `/api/chat/native/v4/turns` | `parseGroundedHistory`, exact Turn/ServiceTask/thread/input/locale/city/relationship |
| GET Trip | `/api/trips/native/v2/{exactTripId}` | Version/content of the explicit selected Trip only |
| POST submit | `/api/chat/native/v4/turns` | At most once; original turn/idempotency/ServiceTask DTO |
| GET events | `/api/chat/native/v4/turns/{originalTurnId}/events` | Finite SSE with original cursor, `groundedEventFrames` and grounded history parser |

Order is current policy/history/Trip → current notice check → explicit single
submit → finite original events/history reads → current policy/history/Trip →
final notice/session fence. An original Turn already present in current history
is reconciled without another POST. Missing ACKs lead to reads only, never a
replacement Turn/task or blind POST retry. No consent/login/registration/session
creation/Trip creation/provider switch or token refresh endpoint is reachable.

Only current final history supplies the reported outcome/fact/source/gap IDs.
Stream output never authorizes publication or Trip application. Revoked/changed
policy, foreign identity/Turn/task, unavailable source projection or late response
clears factual output. Answered, partial, clarification, blocked and technical
failure retain the existing parser semantics; pending/cancelled work stays unknown.

The expectation is cloned/frozen and included in a plan digest before requests;
actual outcomes and evidence IDs are reported alongside it, without a new scorer.
The existing `gradeReadOnlyResult` only grades complete H01 fixture assertions.
Because these ports cannot prove the full Trip collection, it receives incomplete
evidence and remains NOT_RUN. H04/H07 have no new grading implementation.
No seeds/cases/holdout/grader/registry/CLI/package/CI are changed or invoked for
prompt tuning. The existing integration tests create their own database/runtime;
they are not an equivalent reusable current-context Harness driver and are not
reimplemented here.

## Resource, privacy and evidence bounds

Technical ceilings: 64 requests, 20 seconds and the supplied absolute deadline,
8 poll rounds, 262,144 bytes per response, 1 MiB total, 4,096 reads and 64 empty
chunks per response; request serialization ≤16 KiB, report JSON ≤32 KiB,
SSE frames ≤256. Caller values may only tighten these limits. All stream reads
and returns check a monotonic deadline; timer/abort races also stop a transport
that ignores AbortSignal. Empty chunks are not retained. UTF-8/JSON/MIME/status,
cursor, stream terminal and source relationships are validated before use.

JSON and Markdown derive from one sanitized report. It retains request port,
HTTP status, actual response byte hash/size, original identity IDs, expectation
and current typed fact/source/gap IDs. It emits no original request/answer,
Trip body, source URL/locator/publisher, notice or credentials. Requested context
digest is caller-bound, not runtime-attested. Native HTTP supplies current scope
checks; controlled transport observations do not authenticate a real origin.

Selected Trip comparison can be true/false only when both exact snapshots have
valid versions/content. Missing Trip ID, version, transport or completeness stays
unknown. Native Trip list/current pointer does not prove a complete collection;
there is no claim of zero Trips or whole-collection invariance. Original
idempotency-key readback, usage, provider cost and quota debit remain unknown.
Required-mode verdict, Web consumer and complete #264 acceptance remain NOT_RUN.

## Main integration candidates

No shared hookup is needed to call this exported driver. Main may import it into
the existing Harness entry after obtaining that file's exact lease and pass the
existing permitted actor-bound transport and fixed development invocation.
Consume `askReportArtifacts(report)` as scoped observations, without promoting
controlled runs or incomplete grader evidence to required-mode PASS. Native/Web
target acceptance and missing authoritative collection/usage/context ports remain
with their current owners. Original runtime-recovery/PR704 is unchanged.
