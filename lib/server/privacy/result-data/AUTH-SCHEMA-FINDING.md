# Actual signed Auth integration failure, 2026-10-07

Combined fixed source6afe785e (SQL exact705c6a88; Native exactf5f8c6f7;
TS d059 semantics+9982 actual registration+1ad pendingCIpatch). SQL migration hash
80f35348e9911fb0f193a33261b308bd4434ff3dea6cf695da5a0d73a5f2ac71 MATCH.
All4 checkpoint wire file hashes match current producer: WIRE.md points to1ad86370
factual closeout version; contract/protocol actual d059 and SOURCE-AUDIT unchanged.
Initial assumption that all4 pointed to d059 failed only WIRE provenance check;
normal Git hash audit resolved the pointer, no semantic source mismatch.

Actual isolated signed GoTrue/JWT/native login, fixture-only RPC grant, ordinary
original owner Conversation/Task/Turn/Trip/Memory producers and original service
publisher completed before the failure. Selected actual artifact has2 revisions,
3 events and is withdrawn; unselected sibling and retained whole sources seeded.
Synthetic fixture only, no provider/external/target grant/fee/deploy.

r1 projectvp-native-ask-aa77bb10/base63080: one test FAIL0 PASS0 SKIP at actual
owner list HTTP503. Cleanup PASS. Added ONLY closed diagnostic to own Auth test,
no runtime/schema/assertion/authority relaxation; recent source/epoch untouched.
r2 projectvp-native-ask-bef19d38/base63080: same actual list FAIL, cleanup PASS.
Observed signed directRPC codeP0001/messageRESULT_SOURCE_UNAVAILABLE; HTTP same.
Read-only admin source diagnosis: conflicts=[SOURCE_UNSUPPORTED],
schemaSupported=false. No raw bodies, tokens, passwords or arbitrary SQL error
messages are printed; diagnostic contains only closed status and schema counts.

Concrete source cause: result_data_private.schema_supported_v1 at migration
20261007010000_result_data.sql:308-310 hashes EVERY row table outside pg_catalog,
information_schema,extensions,auth,result_data_private against the standalone
bootstrap whole-catalog hash6c2371cd4338f681af77de8fe888a4ae3692bd0abcf1736c14eaf0935314020d.
Real Supabase additional operational schemas therefore invalidate the source
before metadata can return. Observed r2 system schema counts include storage10,
realtime7,_realtime4,vault1,supabase_functions2,supabase_migrations1.
private1 already exists in the original251-table catalog and MUST remain audited.
Public34/turn_private43 and other original application tables are also present.
This is an actual product compatibility failure, not a target policy/credential
or infrastructure wait and not fixed by accepting the fixture as complete.

Required same-task sole SQL repair: qualify the real supported application
schema/cascade/reference surface without conflating unrelated Supabase operational
system tables with source dependencies. Retain full original application shape,
unknown incoming FK/reference drift rejection, every actual reverse mixed-copy
blocker and immutable old/new identity guards. Do NOT replace the hard check with
true, accept an arbitrary environment hash, mutate actual sources, exclude an
unexpected application dependency, or weaken an oracle. Original SQL owner owns
migration repair/fixed PG source evidence; sole TS owns the actual signed consumer.
Affected real Auth reruns after fixed repair; unchanged Native evidence reused.
Whole ResultData package is not complete and whole239 remains Open.
