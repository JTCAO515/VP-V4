# W2 Server/Ops UI stable private source

Current Main: 01a12dad-d333-70c3-9bf9-58cc26f1803d. Sole Server/UI/integrator retained.
Base fast-forwarded to 4f3c7b322316f3c6be3d505bdeb86b300a1596f4 with every private dirty preserved.
No shared worker/request/adapter/flags/SQL/migration/CI file has been changed.

## Implemented private source

Cookie-only POST /api/ops/controls through existing opsRuntimeConfig/createWebRpc, default off.
Frozen ops_control_operations_v1 name and all five closed actions. 4096 actual streaming bytes,
fatal UTF-8, duplicate decoded keys/depth/BOM rejection, single 8s lifetime, strict same Origin,
no Authorization/query, no raw error/body logs, private no-store. Current Ops workspace and actor
rechecked before/after; sessionId and epoch fence all response types. Mutation transport loss,
changed receipt or identity cannot report success; original operation UUID supports readback.

Closed workspace/receipt/budget projections preserve decimal money/epoch and reject excess fields,
invalid effects, unregistered/duplicate scopes, missing registry members and inconsistent versions.
Main's fourth actual paid mode scoped_trip_edit_v1 added; controls maximum 12. Registry is a closed
code allowlist intersected by SQL; this code does not activate a mode/provider/city.

/ops/controls is responsive zh/en with friendly names, explicit stop/resume, separate qualified
budget recovery, unknown-operation lock and original receipt read. Late responses are discarded
on identity/page invalidation; no durable config or fake local success is stored in browser state.

API/DTO freeze: sole SQL CONTRACT hash e032f7c3652a33d9a1660229d1f48a4159840413be323480f612bbadea6f9922,
Main review W2-API-DTO-REVIEW-20261012.md; later Main accepted fourth existing mode/max12 delta.
WIRE is the same source contract plus that coverage delta. SQL remains an uninstalled backend.

## Actual checks and limits

PASS latest TypeScript; source policy lint (820 files); docs-check; final optimized Next16.3.6 build.
PASS focused HTTP/projection 5 tests and strict JSON1; client unknown-ACK/session/late-response3.
PASS envelope3/input2 rerun ONLY after duplicate parsing/fourth-mode/revision-cap source changes;
previous first-run records stay historical. No count of invocations is a test count.
Initial client strip-types run FAIL (parameter-property syntax); explicit class fields fixed it,
same affected three tests PASS. Initial pnpm sandbox hung, own processes stopped; approved local
install/build succeeded. Initial Playwright import failed, corrected to installed @playwright/test.
Sandbox Chromium MachPort launch denied; normal tool escalation permitted the same local QA.

Final browser QA: own localhost:63437, desktop1280x900 zh and mobile390x844 en. Actual default-off
HTTP503/no-store observed. Synthetic intercepted registered fourth-mode response exercises stop,
unknown resume, original receipt read and separate budget resume. No relevant framework/page
errors or horizontal clipping. Expected HTTP503 console resource errors remain reported.
Screenshots: /private/tmp/vpj37-w2-default-off-desktop.png and
/private/tmp/vpj37-w2-fixture-mobile.png, visually inspected. Browser plugin/skill absent; existing
Playwright fallback used. This is UI/HTTP evidence, not live SQL/Ops/provider/target acceptance.

Own local Next process only on63437, noDB/provider/hosted worker/Simulator or other resource.
Server shut down after QA; no other task's resource touched.

## Remaining whole W2

SQL fullbody/canonical catalog/private lifecycle/export/delete/restore and exact shared hunk
leases remain external integration inputs. Original request admission and final model/tool
authorization must consume the additional SQL gate in the same current authority transaction.
Existing transport hooks already reauthorize text/grounded/scoped editing and V2 destination
records; V2 model_dispatch specifically requires ledger reserved and cannot blindly be called
again after durable dispatch. Add its final denial in the existing destination/checkpoint source,
not by widening effect state or inventing an RPC. Qualify actual final catalog before binding.

User read-existing-owned Trip/artifact/manual paths must remain usable; do not change native or
shared reply DTOs without the precise candidate lease. No unsupported replacement provider/city.
All core SQL/request/worker/real-user fallback integration is still incomplete; #229 stays OPEN.
Staging stop/resume/fault rollback, deployed Auth/database and real provider/device: UNRUN.
Whole bundle normal PR, all applicable CI, exact final formal review and protected merge are Main's
next integration stage. This private commit is a stable handoff, not complete W2/229 or a release.

Post-handoff DTO alignment: canonical lowercase UUID validation accepts the full SQL uuid
lexical form (including v7); removed the uncontracted v1-v5 restriction. Focused input2 and
TypeScript rerun for this parser-only change. Prior browser/build source evidence remains tied
to b1c01dca UI/runtime source; no affected layout or module integration change.
