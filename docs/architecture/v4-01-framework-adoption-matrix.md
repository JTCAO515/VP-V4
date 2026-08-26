# V4-01 framework adoption matrix

Status: frozen adoption gates; no dependency or runtime adoption in V4-01.

Issue: [#87 V4-01](https://github.com/JTCAO515/VP-V4/issues/87)

## 1. Invariants for every candidate

A framework is rejected unless it preserves all of the following:

1. VP-V4 domain types remain independent of framework/provider types.
2. Trip, Turn, Fact and Memory retain one authoritative store each.
3. Verified JWT, server authorization, RLS, PolicyReceipt and user confirmation remain external hard gates.
4. Replay cannot repeat a model charge, external side effect or Trip write.
5. Approval binds an exact Proposal/tool revision and idempotency digest.
6. Abort, provider metadata, usage, error, latency and privacy-safe traces remain observable.
7. Package version, Next.js/Vercel compatibility, bundle/latency/cost and rollback are reproducible.
8. The candidate beats an explicit thin TypeScript baseline on the same task/eval.

## 2. Paired decision register

| Candidate | Current disposition | Paired baseline | Adoption trigger and required evidence | Owner / earliest consumer | Rollback |
| --- | --- | --- | --- | --- | --- |
| Thin TypeScript modules | `adopted baseline` | Current TurnCoordinator/TripWorkspace/direct typed interfaces | Remains default while focused modules satisfy contracts, tests and operability | Architecture / all V4 Issues | Revert the local module PR; no framework state migration |
| Vercel AI SDK Core | `spike` | Thin HTTP/provider adapter with frozen `ModelTask` result | #47 proves provider protocol, structured output, abort, usage, metadata, streaming, bundle, latency and error parity without type leakage | AI-43/#47; ModelGateway only | Return to thin HTTP adapter; keep domain fixtures/tests |
| AI SDK bounded ToolLoop/Agent abstraction | `defer; spike subset only` | Explicit TurnCoordinator calls with a fixed max-step state machine | A real task needs bounded dynamic tool selection and paired final-state eval is equal/better with no auth/receipt/replay regression | #47 then #88; adapter layer only | Restore explicit coordinator calls and same ToolGateway |
| AI SDK WorkflowAgent | `defer` | Queue + durable events + explicit worker | A real task crosses requests or waits for human input/independent retry; crash/replay/cost evidence passes | Future long-running Issue, not online Chat | Queue/durable event implementation |
| Vercel Workflow | `defer` | Existing queue/worker contract | Guide import, OCR, embedding, polling or approval exceeds one request and step-level retries measurably help | #113/media/jobs owner | Existing queue/worker; retained idempotency receipts |
| LangChain | `reject as production baseline` | Thin TypeScript + direct provider adapter | Only a provider capability unavailable otherwise, isolated behind a spike, with no LangChain types above adapter | Separate operator-approved spike | Remove adapter/dependency; thin provider client |
| LangGraph | `reject for R1–R3 baseline` | Frozen Turn/Trip/Event state machines | At least one: 3+ dynamic loops become unmaintainable, cross-day interrupt is materially cheaper, reusable subgraph has a second consumer, or paired recovery eval wins | Separate ADR/spike after trigger | Existing state machine; checkpoint never becomes truth |
| Temporal | `defer` | Vercel Workflow or current queue | Portability, multi-year audit or workflow reliability exceeds accepted Vercel/queue capability and justifies worker/ops cost | Operator + platform ADR | Vercel Workflow/queue |
| MCP for internal Tools | `reject for first-party baseline` | Direct typed ToolGateway interface | A real external tool ecosystem or second client needs interoperability; remote MCP still sits behind VP policy/auth/receipt gates | #88 plus separate ADR | Direct typed interface |
| GraphRAG | `reject as baseline` | Postgres exact/alias/FTS/vector/RRF hybrid RAG | Global corpus questions reproducibly defeat hybrid baseline and rights/eligibility/freshness are preserved | Route/Knowledge research Issue | Postgres hybrid RAG |
| RAPTOR or hierarchical retrieval | `offline challenger` | Normal chunks + reviewed summaries | Long Guide/Policy corpus shows paired quality gain without source/expiry drift | Knowledge eval Issue | Normal chunk/summary retrieval |
| RoutePattern retrieval | `spike after R3` | POI/Fact/Guide retrieval plus deterministic constraints | Licensed route corpus exists and stratified spatial/temporal eval improves final feasible state | #90 V4-05 | Reject spike; retain base retrieval |
| Multi-agent online planning | `reject` | One TurnCoordinator + deterministic modules/read-only fan-out | No current trigger. A future proposal requires operator ADR, independent evidence and zero state-write voting | Operator only | Single coordinator |
| Multi-agent offline research/eval | `conditional` | Single finder + static/runtime/manual verification | Only read-only candidate discovery or adversarial eval; outputs remain private hypotheses until verified | Research/eval owners | Disable fan-out; retain evidence ledger |

## 3. Decision protocol

Every adoption spike records:

- task and fixed eval corpus;
- baseline and candidate at pinned versions;
- functionality, contract, data, security, performance, UX, observability and compliance applicability;
- latency, bundle, cost, quality, replay and failure evidence;
- framework state ownership and deletion/migration plan;
- `adopt`, `defer` or `reject` with dissent and unknowns;
- executable rollback tested before promotion.

Framework popularity, model recommendation, a successful toy request or agreement between agents is not
adoption evidence. V4-01 only freezes these gates; #47 and later owning Issues perform current-version
spikes when their native dependencies are closed.
