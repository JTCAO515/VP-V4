# Fixed c66 empty-PG API consumer proof

Stable test/proof commit: `4d5d6c6b` on `codex/db-rebuild-service-20261017`.
Unchanged application source/base: `7093ca0409e6cf00720df229231c1f6587ce8b8c`.
Fixed supplied DB source: `c66a58b8ba63f7107663a5b63fbcae66bdc4e6eb`.
Original supplier proof-only reference e225cc0e was provided by Main; its24 checks
were not rerun, and its initial failures/old records were not modified.

## Actual path and source custody

Actual existing Native route exports → original Supabase Bearer SDK/JWT verification
→ native-store/createQaService → original RPC names → new owned PostgreSQL fixture.
The test-only HTTP/SQL encoding bridge returns success values **only from actual
PostgreSQL results**; no successful policy/session/message RPC is mocked. Auth is
explicitly synthetic (in-memory signed JWT/JWKS + supplier platform.sql claims),
not real GoTrue, account access or production PostgREST acceptance.

The Python bridge reads only fixed public Git objects, extracts all11 scripts
into a new private read-only snapshot, and imports the original Fixture class.
It uses Fixture.start/sql/close without modifying its source or using Astra's
container/dirty. assemble.build was deliberately not called because it writes
baseline.sql/reuse-map.json; the **committed** fixed baseline SQL was consumed
directly and checked against the committed reuse-map hash. No migration history
was replayed. Actual snapshot hashes are verified unchanged after cleanup.

Each run created a fresh nonce-labelled container from the fixed cached image,
network none, no ports/mounts/privileged access, PostgreSQL Unix socket only,
bounded CPU/memory/processes. Existing image inspection is not another owner's
running resource. No daemon start/install/pull, target, archive, identity material,
key/credential, provider or account operation was performed.

## Final actual result

```sh
QA_DB_BASELINE_SERVICE=1 PYTHONDONTWRITEBYTECODE=1 node --experimental-strip-types --test tests/security/qa-agent-service/db-baseline-native-api.test.mjs
```

**1/1 PASS, zero skip**, seven named groups; final duration4.66s including cleanup.
Raw final proof: `consumer-c66-132fc248ccf34a4eadb0864f9435605d.json`.

| Verified scope | Actual evidence |
| --- | --- |
| Fresh fixture / synthetic identity | Empty public schema, original trusted prepare/login epoch1, ordinary role + profile owner RLS; two synthetic actors |
| Existing API/repository read slice | Actual HTTP policy/consent/create/list/read success values decoded by original SDK/service from PG |
| Uncovered submit | Actual SQL42883 from native wrapper's missing qa_submit_message_v1; HTTP503 PROVIDER_UNAVAILABLE/ack unknown; zero admitted Turns, one explicit submit, original text/request bytes unchanged |
| Persisted read/reopen | Explicit fixture-owner seeded result (NOT GENERATED) read across connections through same original Session/Task API; no first-answer claim |
| Unknown ACK projection | Fixture-seeded dispatch metadata yields reconciliation_required with exact UTF8 input, null output, no fake answer or automatic retry |
| Actor / epoch | Both actors explicitly accept the same policy; foreign Session still actual FORBIDDEN403; stale captured epoch refuses a create and does not change thread count |
| Missing stop / worker | Actual SQL42883 for cancellation and qa_claim_work_v1; no observed stop receipt, worker unavailable, zero provider/context/usage callbacks and zero model_budget_attempt rows |
| Real versus technical denial | Actual withdrawal maps policy403 and retains source rows; actual revoked Native session maps401; missing-function errors stay technical503 |

The test's retained original-byte buffer is a consumer assertion plus exact
server RPC input hash/payload equality; it does not instantiate Swift Keychain
or prove device/vault behavior. The existing iOS custody audit remains separate.

Final owned nonce: `132fc248ccf34a4eadb0864f9435605d`.
Immutable owned container ID:
`ccdf900ac7d903aed2644d28eed66434fa68c4afeb304338c17afc0f607bf9fe`.
Image: `sha256:3866d94d8426927e8db3f1c5d790752292bfbe27b5f1f46e199ae1b7d3c1710b`.
Actual consumed baseline SQL SHA256:
`b110c0f2ef5408d7c8a1a7331a8a0eb89112b223a66c3822ff8a6dd8cc1b48f7`.
Raw proof records all11 fixed source hashes, actual bridge/test/application file
hashes, roles through named checks, and **cleanup PASS/sourceUnchanged true**.
Cleanup inspected the owned nonce/label/image/immutable ID and confirmed removal.
Private read-only public-source snapshots remain as local source cache, not a DB.

All three incremental consumer run records are retained. The first established
the read/technical-failure flow; the second added same-policy foreign-actor
distinction; final adds explicit actual SQLSTATE assertions so a random503 cannot
masquerade as the required unimplemented-port result. All had cleanup PASS and
sourceUnchanged true. The default unset opt-in is an expected one-case SKIP, not
positive evidence. A preliminary py_compile setup probe failed on macOS cache
permissions before any DB started; read-only AST parsing then passed. No guard or
assertion was weakened, and no supplier test matrix was rerun.

## Closure and remaining work

No service/DB adapter or application change is required for the c66 declared
read slice. Only two dedicated test files and this task's artifacts changed.
Missing sending/admission, worker qualification/claim, original budget/dispatch/
settlement and qualified result completion remain with the original DB owner.
The Browser general adapter's auxiliary event/feedback/memory receipt projections
remain outside this Native increment; no shared adapter/registry was changed.

M1a declared read-slice API consumption PASS. Full first answer, actual admission
idempotency, write recovery, paid/provider result, real Auth, target transition,
device and release **UNRUN**. Same Go2China target/ref and original security/data
authority remain; no switch or destructive upgrade is authorized by this proof.
Main may pass the exact missing write closure to Astra and review this fixed test
head independently. This slice has no in-flight/planned/successor application edit.
