# Native CI continuity diagnosis — UNKNOWN root cause

Original PR626 head `f5edb4de` native job111037774117/run37067161292 failed the third Web/native continuity case with AggregateError `Review failed and response cleanup also failed` after32225ms. Original failure excerpt is saved here as `original-native-fail.log.gz`; TAP hides the two inner causes. The two separate postgres clock fixtures were not assumed to explain this failure.

Main approved one writer and owned local harness diagnostic. Preflight found the64640/41/42/43/44/47/49/51 loopback ports free, installed Next/Playwright/Supabase CLI available. No real target/user/provider was used. Original assertions, timeouts, proposal/confirmation semantics and AggregateError cleanup remain unchanged.

Three narrowly scoped local outcomes are separate:

1. `local-continuity.log.gz`: barrier POST201/canonicalGET200/base3/current proof reached, then later recovery confirm500!==200 atline179. This is a different phase from old Aggregate; root cause not identified.
2. `local-confirm-classification.log.gz`: local-only request instrumentation added for safe classification; the original Aggregate shape reproduced. canonical GETstatus500; phase json; primary and cleanup SyntaxError/decode, safe server output only generic Error. Thus non-JSON500 caused decode/rejected cleanup, but actual server500 origin remains UNKNOWN.
3. `local-safe-stack.log.gz`: same local-only instrumented request environment plus safe stack filters;3/3PASS. It did not trigger a500 and does NOT locate or erase prior failures. This environment is not treated as equivalent to the uninstrumented PR.

The local-only runner diff is archived solely as forensic evidence and removed from the formal candidate. Formal runner is byte-identical to e6. No global fetch override, NODE_OPTIONS override, hardcoded transport interception or server stderr forwarder is proposed for the PR. No cookie/header/body/token/full sensitive URL is printed. Own stacks/processes were torn down; exact owned ports are free. Next auto-generated AGENTS/next-env and overwritten baseline artifact summary/image were restored after teardown, with local generated evidence copied separately.

Formal minimal candidate: canonicalBarrier stage/started/status/failure-phase getters and fixed inner error-class categories; no raw message, response body, credentials or arbitrary SAFE-prefix forwarding. Diagnostic helper verification3/3 (`formal-diagnostic-unit.log.gz`) checks fetch/json/fulfill cleanup semantics and that an injected synthetic cookie-token string is absent from emitted categories. `node --check` formal runner and diff checks PASS. No repeated broad local run after this freeze.

One read-only product-helper review: both proposalGET and confirmationPOST call createUserDataAdapter per request; pendingCookies is a local array and createServerClient is newly constructed; both create a fresh NextResponse for success/failure before applying cookies. No singleton Response/headers/cookie-collector reuse was found in these inspected paths. Existing safe logs provide no compilation/loading timing evidence correlated with500. This is not proof that all dependency/session paths are fault-free; cause remains UNKNOWN. No Trip runtime/SQL/return assertion was changed.

Remote e6 head `e6f66d703d730c7858412079fb5295cc49d37284` subsequently has15SUCCESS/CLEAN, but Main holds merge while deciding this local diagnostic boundary. That green does not erase original native FAIL or local confirm/canonical failures. This candidate is a diagnostic improvement, NOT a product500 fix or full native/producer acceptance. Main must decide whether to include it and how to disposition the unresolved root cause.
