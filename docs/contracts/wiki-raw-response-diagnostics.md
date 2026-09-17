# VPJ-75/VPJ-76 — opt-in raw-response diagnostics on MODEL_OUTPUT_INVALID

Status: implemented for the shared `provider-protocol.ts` module and wired
on for `wiki-generation-job.ts`/`wiki-statement-proposal-job.ts` only. See
`artifacts/VPJ-76/wiki-raw-response-diagnostics-20260917/verification.md`.

## The gap

`artifacts/VPJ-76/unrun.md`'s round-24 write-up named this explicitly as
**not done**: "making this logging a property of `provider-protocol.ts`
itself (the shared module every production/eval caller goes through) --
unrun.md's own original phrasing flagged that as needing separate, careful
review before touching a module this many call sites share, and this round
did not attempt it." Every prior round (22, 23, 24) deliberately deferred
this, citing the module's blast radius (it is the sole entry point for
`wiki-generation-job.ts`, `wiki-search-job.ts`, `wiki-statement-proposal-job.ts`
and, indirectly through `text-worker.ts`, `staging-text-job.ts`).

## What was actually evaluated this round

1. **Read the full consumer graph.** All four production call sites go
   through exactly one shared HTTP transport factory,
   `createProviderHttpTransport` (`lib/server/model-gateway/adapters/http-transport.ts`),
   which already buffers the entire response into memory before discarding
   it — the raw bytes never reach the job layer today, and reconstructing
   them at the job layer (by wrapping `dependencies.fetch`, the pattern the
   round-22/24 eval scripts already use) would mean **reading the response
   body twice on every call, including every successful one** — a real
   success-path cost this round's brief explicitly ruled out.
2. **Chose the interception point that costs nothing on success.**
   `provider-protocol.ts`'s own `normalizeResponse` already holds the fully
   parsed response object in memory at the exact point it decides
   `MODEL_OUTPUT_INVALID` — no extra read, no extra byte, and (critically)
   the change only executes inside the already-failing branch, never on the
   `protocol_validated` return path.
3. **Found a real, codebase-established invariant this design had to
   respect:** this module never lets `reasoning_content` (Qwen/DeepSeek
   "thinking" text) leave `normalizeResponse`, enforced today by
   `tests/contract/model-gateway/provider-protocol/protocol.test.ts`'s own
   "GLM preserves its native thinking default" / "bounded Qwen task
   thinking" tests (`assert.doesNotMatch(JSON.stringify(result), ...)`). A
   naive "dump the whole raw response" diagnostic would violate that
   invariant the moment a MODEL_OUTPUT_INVALID response happened to also
   carry `reasoning_content` (a real, reachable case -- see the added test
   "captureRawResponseOnInvalid: true attaches a bounded, allowlisted
   snapshot..."). The design below is an **allowlist**, not a raw dump,
   specifically to keep that invariant true on the failure path too, not
   only the success path.
4. **Found that even "safe" fields can carry real user content for one
   specific task.** `wiki-search-job.ts`'s prompt embeds the traveler's own
   natural-language question (`input.question`) even though the task's
   `dataClass` is tagged `c0_synthetic`; a model completion that echoes
   part of that question back would appear in this diagnostic's
   `contentPreview` field. `wiki-generation-job.ts` and
   `wiki-statement-proposal-job.ts` operate only on already-ingested,
   approved source text (VPJ-75's "获准来源"), not an individual
   traveler's private input -- a materially different risk profile.

## The design

`lib/server/model-gateway/adapters/provider-protocol.ts`:

- `ProtocolRequest` gains `captureRawResponseOnInvalid?: boolean`. Default
  (`undefined`) is byte-for-byte identical to every prior behavior --
  confirmed by `"captureRawResponseOnInvalid defaults to off: ..."` in
  `protocol.test.ts` and by every pre-existing test in this file and
  `tests/security/model-gateway/provider-protocol/boundaries.test.ts`
  passing unmodified.
- `ProtocolOutcome`'s `unavailable` variant gains an optional
  `rawResponseForDiagnostics?: string`, present **only** when the code is
  `MODEL_OUTPUT_INVALID` **and** the caller opted in. Every other code
  (`SAFETY_BLOCKED`, `PROVIDER_UNAVAILABLE`, `TIMEOUT_BEFORE_OUTPUT`,
  `DATA_POLICY_BLOCKED`, `INVALID_INPUT`, `BUDGET_EXHAUSTED`, ...) never
  carries this field, opted in or not.
- `summarizeInvalidOutput(value)` builds the snapshot from an **explicit
  allowlist**: `model`, `hasError`, `choiceCount`, `finishReason`,
  `messageRole`, `toolCallCount`, and a `contentPreview` (the assistant
  message's `content` string, truncated to 4000 chars, plus a
  `contentTruncated` boolean). `reasoning_content` and every other field
  are never read into the snapshot.
- This module **never logs, persists, or writes the snapshot anywhere
  itself** -- it is returned as ordinary typed data on the outcome, exactly
  like `usage`. The caller decides whether to keep it, and where; today, no
  caller persists it to any table or file, so this round adds zero new
  durable storage and zero new logging destination.
- One known, deliberate gap: the module's own outer `catch` in
  `invokeProtocol` (a response that was not valid JSON at all, e.g. wrong
  content-type or a `JSON.parse` failure) still returns a bare
  `MODEL_OUTPUT_INVALID` with no diagnostic, even when opted in -- by that
  point no parsed `value` exists to summarize, and reconstructing one would
  mean restructuring `readBoundedJson` to survive a parse failure, which
  this round judged as expanding blast radius for a rarer failure mode than
  the schema-shape-mismatch case this round targets.

Wiring (opt-in per call site, not a module-wide default):

- `wiki-generation-job.ts` and `wiki-statement-proposal-job.ts` both pass
  `captureRawResponseOnInvalid: true` -- their inputs are approved,
  ingested source text, not a traveler's own free-text input. Each job's
  own `"failed"` outcome gains an optional `rawResponseForDiagnostics`
  passthrough, plus a job-level `safeJsonPreview` fallback for the one
  `MODEL_OUTPUT_INVALID` each job can raise itself, outside
  `provider-protocol.ts` (an unexpected output shape in
  `wiki-generation-job.ts`; `resolveProposalOutput`'s own source-binding
  cross-check in `wiki-statement-proposal-job.ts`) -- both already hold the
  schema-valid parsed object in hand, so no protocol change was needed for
  those two branches.
- `wiki-search-job.ts` **deliberately does not** set the flag -- see point
  4 above. A comment at the call site documents why, so a future round
  does not read the omission as an oversight.
- `text-worker.ts` / `staging-text-job.ts` (the `c2_sensitive` path behind
  `invokeTextProviderProtocol`/`invokeKnowledgeIntentProtocol`, carrying a
  traveler's actual turn text) are **untouched**. That path's raw response
  risk is materially higher than any `c0_synthetic` wiki job's, and this
  round's brief was explicit that a sensitive-data-bearing path needs its
  own redaction design, not a default-on flag. Left as a named, still-open
  follow-up, not attempted here.

## What this does not do

- **No persistence.** No new table, column, or migration. Nothing is
  written to disk or a database by this change.
- **No logging.** No `console.*`/structured-logger call was added anywhere
  in this change. The field is inert until some future caller reads and
  persists it -- that caller's own change would need its own review of
  where/how, matching this round's own brief.
- **No coverage for `wiki-search-job.ts` or any `c2_sensitive` path.**
  Deliberately excluded; see above.
- **No coverage for a response that fails to parse as JSON at all** (the
  module's outer catch). Only the schema-shape-mismatch case inside
  `normalizeResponse` is covered.
- **Does not itself prove anything about real production
  `MODEL_OUTPUT_INVALID` diagnosability** -- this round's real-model runs
  (both current and the round-22/24 history) have not hit this exact code
  path with `captureRawResponseOnInvalid: true` set; the mechanism is
  covered by new unit/contract tests with a scripted transport, not by a
  fresh real-provider run.
