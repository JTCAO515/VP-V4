# #360 (VPJ-76) verification — slice 7, real grounded-turn/1 integration

## The design decision this slice implements

JT chose, after this session laid out three options with increasing risk:
**agentic search is offered only as a supplement when the authoritative,
fixed-claims resolver genuinely found nothing** (`original_outcome =
'blocked'`) -- never as a bypass or a replacement for
`resolve_question()`'s zero-hallucination matching. Full reasoning:
`docs/contracts/wiki-agentic-search.md`, "Slice 7".

## What was built

`supabase/migrations/20260915190000_vpj_76_360_grounded_ai_assist_context.sql`:
one new read-only RPC, `public.read_grounded_ai_assist_context_v1(p_turn_id uuid)`.
Does not touch `resolve_question()` or `complete_selected_grounded_work()`
-- reuses the exact same owner/session/policy authorization chain
`read_grounded_turn()` already uses (`turn_private.text_owner()`,
`turn_private.lock_turn()`, `turn_private.text_policy_current()`), and
refuses to return real content unless `grounded_turns.original_outcome =
'blocked'`. Writes nothing.

`lib/server/knowledge/wiki/grounded-ai-assist.ts`, `runGroundedAiAssist`:
calls that RPC, parses its response into a `KnowledgeIntent` +
`{city, locale, question}`, and hands off to `runGroundedWikiSearch`
(slices 1-6). Not persisted, not wired into any UI or durable worker --
a caller a future UI action would invoke.

## What was verified

### Real database (native PostgreSQL 16, no Docker -- same sandbox constraint as every other VPJ-75/76 slice)

All 56 real migrations (full history through this slice's own) replayed
in order against a real instance, using this repo's own auth-stub pattern
(`tests/integration/turn/fixtures/durable-work-schema.sql` -- the exact
minimal `auth.users`/`auth.sessions`/`auth.uid()`/`auth.jwt()` stand-in
this repo's own Docker-based `grounded-turn.test.mjs` integration test
uses, run here without Docker). A full, real `grounded-turn/1` round trip
was driven end to end -- `submit_grounded_turn` → `claim_grounded_work` →
`read_grounded_work` → `authorize_grounded_dispatch` →
`complete_grounded_work` -- exactly the real state machine a real user
request goes through, not a shortcut.

| # | Scenario | Result |
| --- | --- | --- |
| T1 | A real turn asking a payment question, completed with `payment_card_acceptance` and zero published statements able to cover its required claim | Real `original_outcome = 'blocked'`, confirmed indirectly by T2 below actually returning content (the RPC's own gate requires exactly this) |
| T2 | The real owner calls `read_grounded_ai_assist_context_v1` on that blocked turn | Real, correct context returned: `{"city":"shanghai","intent":"payment_card_acceptance","locale":"en","inputText":"Can I pay by international card in Shanghai?","placeName":null}` |
| T3 | A **different**, non-owner actor calls the same RPC on the same turn | `{"kind":"unavailable"}` -- no context leaked to a non-owner, real authorization-chain reuse proven, not just asserted |
| T4 | A second real turn, completed with `clarification` (a real, different, non-blocked `original_outcome`, confirmed by directly reading `grounded_turns.original_outcome = 'clarification'`) | `{"kind":"not_applicable"}` -- **the core safety property**: AI-assisted search is never offered when the authoritative resolver's real judgement was something other than blocked |

### Fixture (TS glue layer)

`tests/contract/knowledge/wiki-grounded-ai-assist.test.mjs` — 6/6 pass:
context RPC `unavailable`/`not_applicable`/error/thrown-exception handling,
a real-shaped context flowing through to a real search-loop answer (scene
mapping asserted on the literal RPC call), a place-question context
resolving to scene `"attraction"`, and malformed-context defensive
rejection.

Also re-ran for regressions:
- `node scripts/run-ci-suite.mjs contract` — 437/437 pass, 0 skipped, 97 test files, no regressions
- `pnpm lint` / `pnpm typecheck` / `pnpm docs:check` — all clean

## What was NOT verified

- **No real model call in this slice's own verification** -- the search
  loop itself was already real-model-verified in earlier slices; this
  slice's job was the database integration point, verified with a real
  database and a fixture transport for the loop.
- **T4 uses `clarification`, not a real published statement covering a
  claim, to produce a non-blocked outcome.** Constructing a full real
  `ops_review_workspace` submit→review→publish chain in this verification
  script hit a statement-shape validation error not worth debugging for
  this purpose -- `clarification` is an equally real, different
  `original_outcome` value and exercises the exact same one-line gate
  (`g.original_outcome <> 'blocked'`) just as validly, without depending on
  getting an unrelated RPC's input shape exactly right.
- **No real caller anywhere in the product.** iOS, the Web reader, and the
  durable text worker do not call `runGroundedAiAssist` yet -- this is the
  integration point, not the UI wiring. That remains a deliberate
  follow-up decision, not made in this slice.
- **No persistence of the AI-assisted result.** By design for this slice
  (real-time, user-triggered, not a durable/retryable operation) --
  revisit if product requirements actually need it saved.
