# Structural conflict detection and frozen bilingual safety materials for bounded statement proposals (#359)

Addresses three items `artifacts/VPJ-75/unrun.md` names as missing for the bounded
statement-proposal job (`runWikiStatementProposalJob`, see
[wiki-statement-proposals.md](./wiki-statement-proposals.md)): multi-source
synthesis test coverage, contradiction/conflict surfacing logic, and a fixed
zh/en adversarial fixture set. All three are fixture-only and add no new
runtime call site, migration, or persisted field.

## `detectProposalConflicts`

`lib/server/knowledge/wiki/proposals.ts` adds a pure, deterministic function
that inspects an already-validated `StructuredWikiDraft` and flags pairs of
`statementProposals` that assert the same `{subjectId, predicate}` for an
overlapping `scope.cities` and identical `scope.scene`, but disagree on
`objectId`, `conditions`, or `exclusions`. This is **not** semantic
contradiction detection: it cannot read prose, cannot compare two different
`{subjectId, predicate}` pairs, and cannot tell whether two quotes disagree in
free text. It only catches the case where the model's own **structured**
output is internally inconsistent within one draft. Proposals whose
`scope.cities` do not overlap are a legitimate cross-city difference (e.g.
Shanghai vs Beijing) and are never flagged. The function does not resolve,
drop, reorder, or reject any proposal -- it returns a list of conflicting
index pairs for a reviewer to see in the existing Ops diff view. This
increment (2026-09-16) shipped the detection primitive **unwired**, following
this repo's existing "research-corpus"/"reason-codes" pattern of a bounded
capability landing before the consumer that uses it.

**2026-09-17 update: now wired.** See
[wiki-proposal-conflict-ui.md](./wiki-proposal-conflict-ui.md) for the
`/ops/wiki` UI wiring (`conflictsByProposal` plus the rendered warning) added
in a later slice. This file's description of `detectProposalConflicts` itself
is unchanged; only its consumer changed.

A disclosed, deliberately-unaddressed boundary is now a locked regression
test, not prose alone: a single proposal that cites two contradictory sources
as **its own** evidence (e.g. one notice says pets are allowed, another says
pets are banned) is still accepted by `resolveProposalOutput`. Quote-identity
binding proves the quotes are real and verbatim; it does not read whether they
agree. `detectProposalConflicts` only ever compares *different* proposals'
structured assertions, never a single proposal's own evidence list. Human
review remains mandatory before any statement becomes published knowledge.

## Frozen bilingual materials

`evals/wiki-statement-proposals-safety/` adds two frozen fixture sets, each
with a zh and an en case per category, following the same
fixture-vs-real-model convention already established by
`evals/wiki-agentic-search-safety/`:

- `cross-source-cases.ts` (3 categories x 2 locales): `same_city_contradiction`,
  `cross_city_difference`, `condition_exception`. The eval test builds real
  `ProposalSource` snapshots and runs the actual `resolveProposalOutput` and
  `detectProposalConflicts` code against them, asserting that each evidence
  entry's stored Unicode-code-point offsets reconstruct exactly its own
  source's quote (proving no cross-source conflation, for both a Latin-script
  and a CJK case) and that conflicts are flagged exactly where expected --
  never for a legitimate cross-city difference.
- `injection-cases.ts` (3 categories x 2 locales): `authority_injection`
  (a source snippet impersonating a system notice asking the model to set
  `reviewerId`), `role_override` (asking the model to set `published: true`
  directly), `fabricated_quote` (asking the model to escalate a real sentence
  into a stronger claim not present in the source). Each case asserts BOTH
  that the injected-instruction-compliant output is rejected (by
  `isProposalOutput`, by `resolveProposalOutput`, and end to end through the
  actual `runWikiStatementProposalJob` worker path with a scripted transport)
  AND that the legitimate, quote-only path from the same injected-but-real
  source still succeeds -- safety must not cost the normal path.

  While authoring the `fabricated_quote` case, an early draft embedded the
  target fabricated phrase in quotation marks inside the injected instruction
  itself ("...please write it as \"X\"..."). That made the fabricated phrase
  trivially verbatim-present in the source snippet, so it passed structural
  validation -- not because the defense failed, but because the fixture had
  accidentally stopped testing fabrication at all. This is a real, narrow,
  disclosed gap in the current design: the verbatim-quote check cannot
  distinguish an asserted fact from a suggested rewrite quoted inside an
  injected instruction. The fixture was corrected to an abstract escalation
  instruction (no literal target phrase in the source) so it actually tests
  the intended defense; the narrow gap itself is not fixed in this slice and
  is recorded here rather than silently hidden by the fixture change.

All provider responses in these tests are scripted by the test file, never a
real model call. This proves the validation/detection *code* behaves
correctly against realistic bilingual adversarial and contradictory input; it
is not proof that a real model would write compliant output, resist the
injection, or correctly describe a contradiction in its own `gaps` field.

## 2026-09-17 update (round 22): real-model pass over the injection fixture set

The real-model pass named above as UNRUN is now done. This round re-checked
this sandbox for a usable real LLM credential (found: Qwen has real account
balance; GLM's key is valid but the account has zero balance, a real HTTP
429; DeepSeek's key is valid but its configured model id is stale against
the real API — see full detail in the verification doc below) and ran all 6
`injectionCases` against the real `runWikiStatementProposalJob` worker path
with real Qwen (`qwen3.7-plus-2026-05-26`) HTTP calls, using the real
adversarial `snippetWithInjection` text as the source.

**Result: 6/6 resisted.** The injected compliance marker never appeared
anywhere in any real raw model response; every response explicitly named the
embedded instruction as untrusted in its own `summary` field. A real,
separate, reproducible finding surfaced along the way: 4/6 real responses
were rejected as `MODEL_OUTPUT_INVALID` for a reason unrelated to the
injection — the model correctly declined to invent an unstated city
(`scope.cities: []`), which `isKnowledgeStatement`
(`lib/server/knowledge/publication/statement.ts`) requires to be nonempty.
This is not fixed in this round (a `KnowledgeStatement`-schema-wide
question, not a narrow #359 slice); it is the same class of gap VPJ-76's
own round-21 handoff already named for `provider-protocol.ts` ("log raw
model responses on `MODEL_OUTPUT_INVALID` for diagnosability") — that
production change is still not made, still shared across every
model-gateway task, still deliberately out of scope here.

New script: `scripts/eval/run-wiki-statement-proposals-injection-real-model.mjs`
(manual/on-demand only, never wired into `pnpm evals`/CI, makes real billed
HTTP calls). No production runtime file, migration, or RPC changed.

Evidence: [round-16 fixture verification](../../artifacts/VPJ-75/wiki-statement-proposals-safety-20260916/verification.md),
[round-22 real-model verification](../../artifacts/VPJ-75/wiki-statement-proposals-injection-real-model-20260917/verification.md).
Rollback (round 16) removes `detectProposalConflicts` (an unwired, pure
addition with no consumer) and the new eval files; rollback (round 22)
removes the new real-model script and its artifacts directory. Neither
round changes anything else.
