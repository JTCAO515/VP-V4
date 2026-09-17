# VPJ-75/VPJ-76 (#359/#360): raw-response diagnostics on MODEL_OUTPUT_INVALID

## What this is

The third named follow-up from the 2026-09-16 real-model pass over the
frozen evaluation set, left explicitly unattempted at the shared-module
level through rounds 22–24: *"(c) log raw model responses on
`MODEL_OUTPUT_INVALID` for real diagnosability"*, specifically the part
`artifacts/VPJ-76/unrun.md`'s round-24 entry named as **not done**: making
this a property of `provider-protocol.ts` itself. This round was asked to
actually spend the time evaluating that shared module's blast radius
rather than deferring again, and to do the change only if it could be made
safe and bounded.

Full design writeup: `docs/contracts/wiki-raw-response-diagnostics.md`.

## What changed

- `lib/server/model-gateway/adapters/provider-protocol.ts`: opt-in
  `captureRawResponseOnInvalid?: boolean` on `ProtocolRequest`; an optional
  `rawResponseForDiagnostics?: string` on the `unavailable` outcome variant,
  populated only for `MODEL_OUTPUT_INVALID` and only when opted in, via a
  new allowlisted `summarizeInvalidOutput` (never `reasoning_content`,
  never the verbatim body). `validRequest` type-checks the new field.
- `lib/server/jobs/wiki-generation-job.ts`: opts in
  (`captureRawResponseOnInvalid: true`); `WikiGenerationJobOutcome`'s
  `"failed"` variant gains an optional `rawResponseForDiagnostics`; a
  `safeJsonPreview` fallback covers this job's own non-protocol
  `MODEL_OUTPUT_INVALID` branch (unexpected output shape).
- `lib/server/jobs/wiki-statement-proposal-job.ts`: same opt-in;
  `WikiProposalJobOutcome`'s `"failed"` variant gains the same optional
  field; `safeJsonPreview` also covers `resolveProposalOutput`'s own
  source-binding cross-check failure.
- `lib/server/jobs/wiki-search-job.ts`: **unchanged behavior**, deliberate
  — a code comment at the call site explains why (the prompt embeds the
  traveler's real question text).
- `lib/server/turn/text-worker.ts` / `lib/server/jobs/staging-text-job.ts`:
  **untouched** (the `c2_sensitive` path).
- No migration, no new table, no new logging call anywhere.

## Tests added/updated

- `tests/contract/model-gateway/provider-protocol/protocol.test.ts`: two
  new tests — default-off behavior is unchanged, and opt-in produces a
  bounded snapshot only on `MODEL_OUTPUT_INVALID` (never on success, never
  on `SAFETY_BLOCKED`), with an explicit `reasoning_content` leak check
  using a canary string (`PRIVATE_REASONING_SHOULD_NEVER_LEAK`).
- `tests/contract/knowledge/wiki-generation-job.test.mjs`: updated the one
  existing test that used `assert.deepEqual` against the exact outcome
  object (now carries the new optional field); added a provider-protocol-
  level MODEL_OUTPUT_INVALID case and a "success carries no diagnostic
  field" case.
- `tests/contract/knowledge/wiki-proposals.test.mjs`: extended the existing
  `resolveProposalOutput`-failure assertion with a diagnostic-field check;
  added a dedicated test for the provider-protocol-level failure path and
  the success-has-no-field case.

## Real verification run (this session)

All commands run against this branch's actual working tree (not a
simulated/paraphrased log):

```
pnpm typecheck   -> clean, no errors
pnpm lint        -> "Source policy lint passed (326 files checked)."
pnpm build       -> succeeded (full Next.js route manifest printed)
pnpm test        -> 22/22 pass
pnpm test:unit        -> 114/114 pass
pnpm test:contract    -> 579/579 pass, 0 skipped
pnpm test:integration -> 39/39 pass (77 skipped -- pre-existing, native
                          PostgreSQL/other real-infra gated, unrelated to
                          this change)
pnpm test:security    -> 149/149 pass (1 skipped, pre-existing)
pnpm evals             -> 35/35 pass
pnpm docs:check         -> "VPJ plan passed... AI Core and VPJ
                            documentation baseline passed."
pnpm check:flags        -> "Feature flag registry passed (2 R1 flags)."
pnpm check:assets       -> "Asset policy passed (49 ledger records; 9
                            blocked preview files; mode=preview)."
```

Targeted re-run of every provider-protocol/wiki-job/wiki-search/wiki-
proposal/wiki-grounded-search/wiki-draft test file directly via
`node --test` (before the full-suite run above) also passed 101/101 (1
skip), confirming no other consumer of these types broke silently.

## What this does not do (see the contract doc for the full list)

- Does not cover `wiki-search-job.ts` or any `c2_sensitive` call site.
- Does not persist or log the diagnostic anywhere; it is inert data on the
  outcome object until a future caller decides to consume it.
- Does not cover a response that fails to parse as JSON at all (a
  documented, deliberate boundary).
- Does not itself add a fresh real-provider run exercising this exact
  path; covered by scripted-transport tests only, in keeping with this
  session's earlier real-model-credential budget already spent in prior
  rounds and not separately re-authorized this round for this specific
  item.

#359 and #360 both remain OPEN, unchanged by this item alone — see each
issue's own remaining acceptance-criteria gaps in
`artifacts/VPJ-75/unrun.md` / `artifacts/VPJ-76/unrun.md`.
