# PR669 actual CI failure markers, exact1229795b

Run37616091792, head1229795bcf308517d41719698d632836533f0634.
Read completed job112774749778(postgres) and112774749848(nativeHTTP shard2)
through normal gh job logs. No retry, timeout/fixture/assertion/matrix changes.
Local source clean1229795b; Main merge remains HOLD. Root causes initially
UNKNOWN, with distinct concrete failures below. Original Auth green does not
waive either failure. No parallel SQL migration writer introduced.

## PG job112774749778

11:53:53.498Z not ok268:
`export exact 30s lease, reference-only projection, invalidation after
source/audit/data change, complete bounds`.
Location tests/integration/service-cases/brief-postgres.test.mjs:258.
Actual stderr:
```
ERROR: canceling statement due to statement timeout
CONTEXT: SQL expression "tg_op='DELETE' and new_n->>'owner_id' is not null
and not exists(select 1 from auth.users where id=(new_n->>'owner_id')::uuid)"
PL/pgSQL function result_data_private.guard_source_v1() line7 at IF
```
Actual fixture command at258 inserts9800 source-free `service_brief_private.audit`
rows from generate_series, with `field_keys=[]`, after201 existing rows; the
original oracle then requires BRIEF_LIMIT. Guard installed by new07010000 on
all audited relations, source946-959; each row JSON materialization, original
account cascade condition and OLD/NEW parents walk run before the original writer.
The log proves new guard involvement and statement timeout, not whether the
ultimate cost was CPU, another wait or a host-load amplifier. Do not simply
raise timeout or reduce original9800-row bound. Sole original SQL owner should
reproduce/narrow the ordinary source-free writer cost while preserving all actual
reverse references, account cascade, OLD/NEW and permanent identity fences.
Job final marker12:00:13.344Z isolated-postgres files75/tests666/pass665/fail1/
skip0/cancel0; lane failed. Earlier image pull `toomanyrequests` occurred but
actual test executed; it does not explain or waive this assertion failure.

## NativeHTTP shard2 job112774749848

11:56:38.825Z not ok1:
`Guide actual native owner HTTP reads, replays, scopes fresh grounded submission
and revokes source`.
Location tests/integration/guide/guide-http.test.mjs:73; rpc helper25.
Actual RPC error body:
```
{code:'55P03',details:null,hint:null,
 message:'could not obtain lock on row in relation "service_tasks"'}
```
Exact operation: ordinary `ops_source_revision_withdraw_v1` after actual Guide
follow_up to a fresh Task/Turn and original async grounded HOLD worker, Guide
export/bindings read and repeated explicit-operation checks. No Result RPC in
this failing call. New result guard uses advisory shared identity checks; no
service_tasks row lock appears in its guard_source_v1 body. Existing Conversation
entity guard has service_tasks FOR KEY SHARE NOWAIT at060000:799. Actual origin/
lock chain is UNKNOWN until narrow reproduction/DB diagnostic; do not conclude
same Brief cost root cause or label it infrastructure/flaky from this one log.
Shard2 result marker12:00:53.676Z place-guide-http tests1/pass0/fail1/skip0.

## Own actual consumer in same failed shard

12:00:48.085Z Result signed Auth test ok1,18.323817699s; pass1/fail0/skip0.
12:00:53.666Z owned projectvp-native-ask-f13856af/base63080 cleanupPASS.
This is actual same-head remote consumer evidence, not a green lane/aggregate.
Other own module checks and source/copy proofs are retained by scope only.

Next: Main dispatch current original ResultSQL same-task narrow guard/runtime
repair if confirmed; sole TS does not write migration. Keep oldFAIL evidence and
all existing original oracles/timeout/shards/strict lane gates. Fixed source ->
only affected behavioral verification -> newhead formal/allCI/protected merge.
Whole239 remains Open; owned runtime compatibility is still under repair.
