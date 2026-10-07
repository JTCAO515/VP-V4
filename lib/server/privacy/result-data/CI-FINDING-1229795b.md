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

## Guide actual causal lock diagnosis (same runtime, original test unchanged)

Direct original fixture runs project79fa7080 and6275a791/base64500 both1 PASS,
cleanupPASS. First observer used an unsupported execFile `input` option and
collected0 samples; that is NOT lock evidence. Corrected read-only observer
collected150 samples/one Guide-request snapshot but no blocked pair. These
passing runs do not classify the remote55P03 as flaky or harmless.

Controlled overlap projectd8b1db7f/base64500 reproduces EXACT original test73
failure, same code55P03/service_tasks, no source/test/assertion/migration edits.
The only scheduling control is a fixture-owned3s budget-scope row lock. The actual
original service worker's reserve_model_budget request/headers/body still execute
unchanged; after confirming its real lock wait, the original signed source
withdrawal request executes. No retry/oracle/timeout extension or target action.
Original Guide test file hash90660e7eed3640873c70af6f1975fc2395857197e5ecaa79585fd6d2586061d1
remains unchanged before/after.1 FAIL/0 SKIP, cleanupPASS; scope holder exit0.

Actual PG activity and lock chain:
- real PostgREST worker pid494 reserve_model_budget waits transactionid1467,
  blocked by fixture budget-holder pid1216. Holder owns the budget scope row;
  worker already owns its original canonical Task FOR UPDATE.
- matching actual Guide binding Task2675627f-fe0c-47d3-bdcd-7103ac1d6b15,
  Turnfcef04db-9cfd-443f-9312-7b32161a1103, budgetScope2a29e3a8-2be1-4114-a3c2-04766b99fb75.
- original withdrawal returnsHTTP500/code55P03/message could not obtain lock on
  row in relation service_tasks. Database context explicitly identifies
  conversation_data_private.guard_source_v1() line33 →
  guide_private.invalidate_v1() line16 →
  public.ops_source_revision_withdraw_v1(jsonb) line29.
- Source correspondence is therefore PROVEN for this reproduced mechanism:
  original reserve_model_budget (20260911200339:163) selects canonical service_tasks
  FOR UPDATE before budget scope reservation; original Source withdrawal updates
  source_revisions, Guide's after-trigger invalidates bindings; C's guard at
  20261006060000:799 asks for the same Task FOR KEY SHARE NOWAIT and raises55P03.
  It fails before the later Result guard can repair/decide anything.

This demonstrates a concrete ordinary worker/withdrawal concurrency defect with
identical signature to CI. It does not prove the exact historical CI blocker PID
or its budget wait, which were not captured by that job. No claim that new Result
logic introduced the original C row-lock rule; new per-row timing may expose it.
Main must coordinate the ORIGINAL ConversationSQL writer/precise060000 guard
lease for any repair. Sole ResultTS has not changed either migration. Preserve
old/new entity fences, original budget integrity, worker/writer semantics and
strict original Guide assertion; do not swallow55P03 or accept cancelled withdrawal.

Sanitized actual lock/context evidence is GUIDE-LOCK-EVIDENCE.json. Diagnostic
helpers remain under this own namespace and never print or persist query text,
headers, JWT/passwords, raw DB logs or application row bodies. Their environment
hook is opt-in only for the owned original Guide fixture, not an API/runtime edit.

## Fixed original Conversation append and full actual Guide HTTP after

Original sole ConversationSQL3cb6d9e8 normally integrated7e4fbdc1. Only append
07030000 replaces that original function; merged060000/Result/Profile untouched.
Append SHA708d01f0f57c8347b122139ec214691712dff2345d7df2dc9ceb0c48405dfc25
matches approved exact candidate and original actualPG proof. Exception only a
Guide binding UPDATE where invalidated=true,completed_ids=[], and EVERY other
old/new field identical; plain Task read replaces the additional row KEY SHARE
NOWAIT. Original entity shared TRY/OLDNEW/permanentfence/xidproof, other parents,
eraserexclusive/D4/account/budget locks and ACL retained. OriginalPG proof1 PASS
includes before55P03/afterdirect binding mutation, real parent/reopen/progress
negative cases, old/new taskfences, erase lock and real accountcascade. Both
Result/Profile strict guards tested true by original owner, not a blind hash edit.

Full SAME controlled original Guide HTTP project8e23c22f/base64500 on integrated
7e4fbdc1: actual original reserve worker again waits on the3s fixture-owned budget
scope while holding its Task row; actual signed Source withdrawal returns200,
then original replay unavailable/forget/Triphead0 assertions all PASS. Original
Guide test SHA90660e7e... unchanged.1 PASS,0 FAIL/SKIP/CANCEL/TODO,9378.163583ms;
owned cleanupPASS,scope holderexit0. Observer214 actual samples/59 retained,
blocking relation is still observed (not avoided); sanitized structured after
proof in GUIDE-LOCK-AFTER-EVIDENCE.json. DirectPG proof and full HTTP after remain
separate. Old remote55P03 and controlled-beforeFAIL remain above/in old JSON.

Original ResultSQL Brief cost repair094cd237+proof5154724 also normally integrated,
whole ResultSQL tree matches515; original beforelocal2PASS and observed CPU cost
then original after2PASS/6parent equivalence/account/3negatives are separate scoped
proofs. Both remote findings now have fixed source and affected behavior evidence;
new exacthead formal/all original CI/protected merge is still required. No retry/
timeout/oracle/matrix or original Guide test alteration.

CI-GUIDE-REGISTRATION.patch is pending exact lease: ONE actual new PG file
conversation-data-sql/guide-invalidation-compat.test.mjs alongside originalsource
audit. Existing VP_CONVERSATION_SOURCE_AUDIT already enables it. No new env/native
step/shard/helper/timeout change. Apply-check PASS, shared registry NOT applied.
Original Context/Profile precise ownership needs Main release/grant; no wholefile.

Main962014 granted the ONE guide PG registration line after current Profile
registry owner0f114 explicit clean/no-inflight/planned/queued/successor release.
Applied actualfile alongside source-audit using its existing env; candidate retired.
Classifier zero problems; new filepostgres; existing32 Native steps/indexes and
all env/lane/shard/helper/timeout/strict gates remain unchanged. Original required
registration governance11PASS0FAIL/SKIP after this additive line. No already-green
behavioral matrix rerun. Same PR669 receives one new combined head for renewed
exact formal/all applicableCI/protectedmatchmerge; old122 CI FAIL remains factual.
