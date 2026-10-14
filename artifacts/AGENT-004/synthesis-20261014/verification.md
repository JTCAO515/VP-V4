# AGENT-004 current-source Wiki synthesis assembler

Initial stable source commit: `0161fe3e`; resource-boundary hardening follows in this PR.
Base: `fcbac274d06ee9fd916ee06f74bb90464bcbd04d`.
PR: [703](https://github.com/JTCAO515/VP-V4/pull/703), targeting the existing QA branch.
Only the assigned new synthesis source/tests/artifacts directories are authored.
Main explicitly authorized importing adjacent CI dependency `ec29bdf9e998c69090c22d3c119ac05f9e0fe422` unchanged.
No shared product integration, prompt, worker, schema, Ops, source-authority or configuration files are authored here.

## Callable interface

`produceWikiSynthesis(input, generationOutcome, dependencies, signal)` consumes an
existing `WikiProposalJobOutcome`; it does not invoke a model. Input reuses the
existing job configuration, replacing source declarations with two or three
explicit revision/hash/code-point spans. Dependencies contain the authenticated
author and a current authorized canonical-source reader. The helper
`createOpsSynthesisSourceReader(rpc, pageKey, expectedVersion)` consumes only the
current revision's source rows from `ops_wiki_read_v1`, never `draftContent` or
previous revisions, and preserves the existing Ops RPC's actor check.

```ts
const readSources = createOpsSynthesisSourceReader(authenticatedOpsRpc, pageKey, expectedVersion);
const assembled = await produceWikiSynthesis(
  invocationWithPinnedSourceSpans,
  existingAuthorizedGenerationOutcome,
  { authorId: authenticatedActorId, readSources },
  signal,
);
// assembled.kind === "draft": present outcome.output + conflicts + uncited IDs
// to review. This call does not save, submit, review, publish or retry anything.
```

Canonical tracked source rows must exist, remain unwithdrawn, match exact IDs and
SHA256 snippet bytes, and contain the requested spans. The existing proposal
resolver recomputes exact unique quotes, Unicode code-point offsets and source
declarations. Every evidence quote must be inside its requested span. The
existing generation input digest must match the same declarations/config/prompt.
The second read must still match the pinned page/version and source declarations.
Request/source/output byte caps, two-to-three-source bounds, existing proposal
limits, finite integer usage, output-token cap and a single 1–60000ms deadline
are enforced. A monotonic clock is checked after reads and before returning a
draft, so synchronous/microtask-starved late results reject even before the timer
can run. Complete own-key checks reject Symbol/hidden/accessor authority before
JSON cloning. Caller/generation snapshots are frozen; cancelled/timed-out reads
cannot return a late draft. No implicit retries or diagnostics logging.

The returned envelope contains the unchanged `wiki-draft/2` outcome, authenticated
author context, source spans, existing structural conflicts and uncited source
IDs. Gaps, opposing proposals, conditions/exclusions and cross-city differences
remain intact. No reviewer/rights/TTL/publication receipt is created. Cost unknown
from the existing protocol is preserved. Source binding is not semantic entailment.

## Verification

- PASS: `node --experimental-strip-types --test tests/contract/wiki-synthesis/producer.test.mjs tests/contract/knowledge/wiki-proposals.test.mjs tests/contract/knowledge/wiki-complete.test.mjs` — initial 30 tests, then 32 resource-boundary tests, 36 accessor regressions, 39 snapshot redesign tests, and 40 tests after remaining-budget timer correction.
- PASS: 22 synthesis tests including remaining-budget deadlines, hidden/Symbol fields, ordinary accessors, reflection exceptions and descriptor-passing Proxy get traps.
- PASS: final source `pnpm typecheck`; `pnpm lint`; `pnpm docs:check`; `git diff --check`.
- Actual scripted invocation: the first synthesis test invokes the existing
  production `runWikiStatementProposalJob` and provider protocol with an explicitly
  injected synthetic HTTP response, then passes its real output to this production
  assembler using the current Ops reader helper. Injection tests inspect actual
  request messages. This proves the scripted boundary, not real-model compliance.
- Negative checks: caller/model authority fields, prior output as source input,
  missing/withdrawn/legacy/hash-changed rows, Ops denial, wrong current page/version,
  previous-only sources, forged IDs/quotes/declarations/offsets/digest, excessive
  sources/output, nonfinite usage, unauthorized spans, cancellation, deadline and
  read-only sources without a generation dispatch capability.
- PASS: Main CI dependency's 24 selector/DB-governance tests. Source reading is
  exactly two bounded calls with no byte/chunk stream loop.
- Dependency setup: frozen-lockfile offline install with ignored `node_modules`;
  no tracked package/lock changes. Node 26.8.2. GitHub read/push/PR operations succeeded.
  Effective model/service tier not exposed by tools; no claim of verification.

Initial test/typecheck failures exposed protocol usage's extra cost fields,
the statement v1 type narrowing and nonfinite optional usage being JSON-normalized
to null. These were fixed; final checks above pass. Historical failures are not
target/provider evidence.

Remote first source head `0161fe3e23b0e32cb8be6c41ace1355b58522fa2`
failed `deterministic-pr-gates` in [run 38590901315](https://github.com/JTCAO515/VP-V4/actions/runs/38590901315):
the existing selector ran `pnpm test` without its required `pnpm build`, leaving
`.next/server/app/journey.html` absent. Main supplied the exact adjacent CI commit
above and explicitly authorized its unchanged cherry-pick. Original failure
remains recorded; no assertions or required checks are skipped. Final-head CI
must be read separately from local verification.

Main's formal standards/spec reviews of `0c83e17a` both found the same P2:
generation kind/usage and input source array elements could be read before
descriptor rejection. Original review FAIL is retained. The repair validates
the complete plain-JSON descriptor graph before those reads; input preflight
and generation snapshot exceptions close as INVALID_INPUT/MODEL_OUTPUT_INVALID.
Canonical source inspection exceptions close as SOURCE_UNAVAILABLE. The Ops
reader checks data descriptors before accessing response/page/source fields or
traversing arrays. Four new test groups exercise ordinary and throwing getters
on outcome fields, proposal elements/quotes, input arrays/spans, dependencies,
canonical source rows/declarations/snippets via both direct and Ops readers.
Every getter call count stays zero. Throwing descriptor inspection proxies also
return the defined input/outcome/source error outcomes rather than rejecting the
producer Promise. Main must review the resulting delta; prior P2 is not erased.

Main's delta review of `8232ccbd` retained P2 with new evidence: a Proxy could
pass descriptor checks and still execute `get` traps during array length reads,
subsequent field reads or JSON serialization of the original graph. The solution
was redesigned: the synthesis-local `descriptorSnapshot` decoder constructs an
independent plain graph exclusively from data descriptors. Array length comes
from its own data descriptor; strings/keys/containers charge a bounded JSON-byte
budget; depth (12), nodes (4096), fields (257) and array length (256, or 3 for
selected sources) have fixed caps. The assembler decodes request/outcome/source
graphs before reading fields, and captures author/read port from dependency data
descriptors. The Ops reader decodes IDs and its bounded response before reading
page/source arrays. Subsequent validation, traversal, freezing and serialization
use only snapshots. Decoder time counts toward the monotonic request deadline.

New tests directly invoke the production decoder with Object/Array Proxies whose
descriptors pass but whose `get` traps count or throw, then verify the actual
producer and Ops reader with proxied input/outcome/dependencies and nested
page/source/declaration graphs. Get counts remain zero. Original accessor tests
remain zero as well. Decoder snapshots do not alias originals; byte/depth/array
limits reject. Reflection traps may execute as part of inspecting descriptors and
may throw; their exceptions remain closed at input/outcome/source boundaries.
The test RPC/Promise envelope is ordinary, separating JS Promise assimilation
from reads performed by the decoder. No claim is made that arbitrary reflection
or runtime Promise-resolution traps never run. Both previous P2 FAILs remain
recorded; final delta review and CI belong to Main.

Final snapshot review of `5ca95d11`: standards zero findings; spec retained one
new P2 because the timer still received the complete request timeout after
snapshot work. A stalled first read could therefore outlive the monotonic
deadline. Timer now uses `Math.max(0, deadline - performance.now())`. A targeted
test spends 80ms in allowed snapshot reflection under a 200ms request budget,
captures the actual timer's remaining delay (at most 121ms), enters the real
producer's stalled source read, and fires that timer to prove TIMEOUT. Timer
scheduling is scripted to avoid a wall-clock-jitter assertion; no claim of
live target timing is made. Synchronous/microtask deadlines and cancellation
regressions still pass. Original spec P2 remains recorded pending Main's review.

## Remaining boundaries / Main integration

The Ops reader proves current authorized readability, **not egress or source
rights**. C0 labels and synthetic URIs grant no dispatch authority. There is no
`generate`/`fetch` dependency in the production assembler, so it cannot accidentally
dispatch a real readable source through the C0 worker. The original worker remains
C0-only; this module adds no external-source/C2 admission or source-origin authority.
Canonical source provenance remains the existing source owner's responsibility.

Main may import these new functions at an existing caller after obtaining its
exact lease. No old-file patch is required to invoke this module independently.
Before any future worker integration, Main needs the source owner's trusted
egress qualification and existing authenticated claim/fencing/budget context;
absent authority must fail closed. The original completion transaction must
continue verifying withdrawal, exact source bindings, expectedVersion and claim
token atomically. Fresh assembler reads cannot close that transaction's race.
Independent human review/publication retains its original author/reviewer rules.

UNRUN: live provider/spend, target Ops/RPC access, worker restart/real cancellation,
durable budget/receipt recovery, data persistence, human review, publication and
ordinary reader readback. Browser/device and full build do not apply to this
isolated non-UI callable slice. #359's broader core and real acceptance remain open.
Rollback stops consuming these new modules; no migration or persisted data rollback.
