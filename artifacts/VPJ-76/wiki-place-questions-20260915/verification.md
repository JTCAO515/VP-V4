# #360 (VPJ-76) verification — place question support

## The reasoning behind this slice

Slices 1-5 treated place questions (`place_address`, `place_opening_hours`,
`place_address_and_hours`) as `capability_unsupported`, reasoning
`questionDefinition()` needs a resolved `placeSubjectId` from place
disambiguation (VPJ-19), which nothing in this session's work performs.

Re-reading `lib/server/knowledge/claim/questions.ts`'s actual
`questionDefinition()` implementation found this reasoning was
incomplete: for every place question, it returns a **hardcoded**
`scene: "attraction"` regardless of `subjectId` -- the `subjectId`
requirement only exists to build the function's `claims` array (each
`{subjectId, predicate, objectId}` assertion `grounded-turn/1` needs for
its own strict per-subject claims-coverage checks). `runGroundedWikiSearch`
never uses `claims` at all -- it only ever read `definition.scene`.

So this module can support place questions without any place
disambiguation: `isPlaceQuestionId(intent)` routes directly to
`scene: "attraction"`, and the search loop -- which was always designed to
find relevant content from a corpus rather than require it be
pre-identified -- does the work a resolved subject ID would otherwise be
needed for.

## What was verified

`tests/contract/knowledge/wiki-grounded-search.test.mjs` — 14/14 pass (3
new, 1 rewritten from asserting unsupported to asserting supported):

| Test | Result |
| --- | --- |
| A place-question intent (`place_opening_hours`) now queries `knowledge_read_v1` with `scene: "attraction"` — no RPC call was skipped, no subjectId was required (rewritten from the old "capability_unsupported" assertion) | PASS |
| All three place question ids (`place_address`, `place_opening_hours`, `place_address_and_hours`) resolve to `scene: "attraction"` | PASS |
| A real published place statement flows through to a real `answered` result, identical treatment to any other supported intent | PASS |
| All 11 pre-existing tests in this file unaffected | PASS |

Also re-ran for regressions:
- `node scripts/run-ci-suite.mjs contract` — 431/431 pass, 0 skipped, 96 test files, no regressions
- `pnpm lint` / `pnpm typecheck` / `pnpm docs:check` — all clean

## What was NOT verified

- **No real model call for a place question.** All place-question tests
  use an injected fixture transport; whether a real model actually
  searches and answers place questions well (e.g. correctly picking the
  one relevant published attraction among several unrelated ones in a
  larger real corpus) is untested.
- **`grounded-turn/1`'s stricter claims-coverage path is untouched and
  still requires a resolved `placeSubjectId`.** This slice does not change
  or bypass that path -- it only gives `runGroundedWikiSearch` (a
  different, newer, less strict consumer) a way to answer place questions
  without needing what that older path needs. The two are not the same
  acceptance bar.
- **No real published attraction content was used** -- fixture statements
  only, same caveat as every other slice.
