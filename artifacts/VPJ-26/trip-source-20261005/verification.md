# #216 P2: explicitly selected confirmed Trip text

The native Translation tool and the confirmed Trip entry now allow the traveler to explicitly select one stored title/date field, preview its exact text, translate it through the original current-input lane, and return to that same Trip. Only the selected text enters the translation prompt. No address field is invented, and Trip title/item text is not evidence that an address is verified or that a service is available.

## Fixed source and contract

- Fresh base: `85e7ec6b7969a9a5796d07c58c8b8880bada1d73`.
- TS runtime: `17dfcd424bd6de6fbea64d4ed44f841642f8c5dc`.
- Native original writer: `1c57333de02518d0568e17b3be40a5aaf39731e5`; source-equivalent integration commit `35de763281c242cf72a375ddbfd488f2c15ef6a3`.
- TS actual first product write: `lib/server/media-translation/text/trip-source.ts:5` (reference/catalog behavior). Preparation and tests were not counted as product writes.
- `GET /api/translate/trip-sources` returns owner-bound recent-20 candidates with nonzero heads. The list is not confirmation proof; exact detail requires existing owner/session/RLS and canonical `confirmationState=confirmed` authority.
- `GET /api/translate/trip-sources/{tripId}` returns the current confirmed field catalog, bounded to 512 fields. Fields are only Trip title (`dayId=null,itemId=null,field=title`), day date (`dayId, itemId=null,field=date`), and item title (`dayId,itemId,field=title`). No inferred address, Memory or pending proposal is returned.
- Optional POST `tripSource` has exactly `ownerId,tripId,headVersion,dayId,itemId,field`. Owner/Trip are UUIDs; day/item retain opaque ASCII IDs of 1–64 characters. Native explicitly encodes both nulls. Text must match the selected canonical field exactly; owner loss and source/head/path/text drift fail closed before admission.
- The previewed text is frozen user-confirmed current input. IDs/source metadata never enter the provider prompt. This does not create an atomic, continuously current Trip dependency or a new provider task. Later Trip changes never rewrite accepted original text; saved history retains its original permission lifecycle. Native recovers the original receipt before retrying and preserves a pending identity on source drift. Return revalidates the actor and selected Trip source.
- No SQL, GRANT, original worker, new queue/domain, shared Session/pbx, notifications or registry changes. The sole Native writer's Main-approved Trip entry hunk is included. Original source-checkout dirty files are untouched.

## Actual verification

| Evidence | Result | Scope |
| --- | --- | --- |
| `node --experimental-strip-types --test tests/contract/translate/*.test.ts` | PASS 23, zero skipped | 8 new source cases plus unchanged translation/history contracts; strict ownership/path/bytes, consent/budget error passthrough, opaque IDs and no metadata in current-input prompt |
| `node tests/integration/translate/run-trip-source-http.mjs --port-base 60300` | PASS 1, zero skipped | New disposable ordinary Auth/RLS/HTTP, original Trip create/proposal/confirm, initial/foreign/anonymous denial, source catalog, consent, exact original admission, idempotent receipt replay, source drift denial, original text readback, consent withdrawal and replaced session denial |
| Local HTTP provider/model exchanges and budget attempts | 0 / 0 | Test actors have no worker; fixture service workers own a different idle synthetic actor |
| Owned local stack cleanup | PASS | `vp-native-ask-5a712028`, new unique stack only |
| Native original writer's affected Simulator `NativeTranslationTests` | PASS 20 / 1 suite, zero skipped | New selector/scope/source-byte/reference/submission cases plus existing saved/current-input behavior. Same Native source is integrated unchanged; `/tmp/vpj26-native-tests.log`, `/tmp/vpj26-native-tests.xcresult` |
| Native generic build / signed build-for-testing | PASS / PASS | Reused unchanged Native-source evidence: `/tmp/vpj26-native-build.log`, `/tmp/vpj26-native-test-build.log`. Owned simulator was shut down and deleted |
| `pnpm lint`, `pnpm typecheck`, `pnpm build`, diff check | PASS | Integrated TS/native-source package; build output `/tmp/vpj26-build.log` |

The first local HTTP run failed only because the test expected HTTP 403 after consent withdrawal. The existing history API correctly returns HTTP 200 with an empty phrase list. The test now asserts that original behavior; no runtime/permission change was made. Initial failure and successful rerun logs are retained here. A first typecheck using a reused dependency directory failed for a missing Apple server library; a fresh lockfile installation in this isolated worktree resolved it. The subsequent test declaration type error was corrected before the fixed TS commit.

## Unrun boundaries

Real provider/translation semantics, independent bilingual semantic verification, physical device/VoiceOver/maximum-text/human field acceptance, target authenticated deployment and Production remain **UNRUN**. Back-translation remains model-generated comparison, not independent verification. Existing saved history is reused; no new offline cache capability is claimed. This package completes the scoped P2 selection integration, not the whole #216 P1/AC1/AC2 outcome. #216 stays OPEN.
