# VPJ-16 — scoped first-party knowledge consumption

This incremental contract implements a native reader for the published `knowledge-read/1`
interface introduced by PR337. It does not complete #206's Ask grounding/claim coverage.

## Native reader

In a configured native Staging build, Explore reads the fixed `api/knowledge/native/v1`
endpoint through `NativeSession`; credentials remain inside that service. The request is GET,
with typed city/scene/zh-or-en scope, no cookies, redirects or new model recipient. Unconfigured
builds retain the existing explicitly labelled Explore preview.

Results must match schema, selection, first-party recipient, trip-planning purpose and
CN-mainland content territory. Displayed text retains every condition/exclusion and source
locator. Empty eligible results and unavailable identity/service remain distinct. This does
not claim all cities/scenarios or guarantee the described physical service.

Every response is fenced by account scope and load generation. Selection/account changes,
leaving Explore or backgrounding make the previous result ineligible for display. A generation
check rejects late responses. Only the visible Explore tab loads. Session busy is excluded
from cancellation identity because a request may itself refresh its credentials.

Snapshots remain memory-only. Server evaluatedAt and each expiresAt determine a monotonic
lifetime after subtracting request duration, capped at30 seconds; the reader then clears and
rechecks. Failed refresh never retains old text. Revocation is observed on the next refresh,
return to foreground or selection change, with at most30 seconds of snapshot lifetime; this is
not an instantaneous push subscription. Source links open only explicit HTTP(S) URLs without
embedded credentials. Other source locators remain plain text.

## Remaining integration

Ask still needs request-scoped evidence retrieval and claim coverage, required/background and
conflict handling, reliable partial answers and concrete gap taxonomy. First-party publication
does not itself authorize arbitrary model recipient use. Real native/Staging and synthetic
UI evidence are recorded separately in `artifacts/VPJ-16/native-knowledge-20260913/verification.md`.
Complete Issue and release acceptance remains separate from this consumer slice.

## Explicit first-party question in Ask

The next incremental consumer is a read-only question entry in native Ask. It accepts
only `rail_boarding_documents`, questionVersion1, one of the four cities and zh/en.
It covers booking identification and itinerary/receipt ticket proof for adult foreign-passport,
domestic mainland railway e-ticket journeys. It does not interpret arbitrary free-form questions,
cover children/cross-border travel/check-in deadlines, create a ServiceTask or save an answer.
No model classification call is needed when the user has already selected this question.

`GET /api/knowledge/native/v1/answer` uses the existing native v2 credential/session checks,
rejects Cookie/Origin and extra query parameters, and invokes authenticated-only
`knowledge_answer_v1`. It shares the default-off first-party read switch. The new migration
adds one read-only RPC; it changes no policies, budgets, tables, model recipients or old readers.

The server owns both required assertion relations. Actual publication IDs are resolved per
request. The answer locks and freezes its own matching publication set before checking time,
coverage and variants; publication after the earlier identity/base check cannot evade that
revocation barrier. Identical assertions and both-language expressions may have multiple
corroborating publications. Differing reviewed expressions or qualifiers remain unresolved
variants, never ranked away. More than50 matching publications is a technical capacity failure,
not a truncated complete answer.

`knowledge-answer/1` carries the original reviewed text, every condition/exclusion and each
source locator, plus two required-claim bindings. Both covered yields answered; one covered
yields partial with that reliable content; neither yields no_answer. Missing means no matching
publication in the frozen snapshot, not no unpublished research. Expired, revoked and a
publication lacking current review have explicit observed reasons. Unresolved variants are
distinct; provider/identity/disabled/capacity failure never becomes a knowledge gap. No source
snippets, private editorial notes, model prose or fabricated citations enter the answer.

Native checks the question/version, both obligations, fact ID bindings, assertion relations,
outcome and the existing source/qualifier/lifetime envelope. The question must be explicitly
opened and its Ask tab visible. Account/selection/navigation/background changes fence results;
the same monotonic <=30-second snapshot expiry applies. The page states that it is not saved.
There is consequently no historical factual text to pass into the model. General Ask grounding,
durable ServiceTask integration and historical evidence revalidation remain incomplete.

Rollback: remove the new UI/endpoint entry or keep the first-party read switch disabled.
Existing knowledge-read/1 and text Ask remain compatible. If the additive RPC is later removed,
use a new migration after removing its consumer; do not rewrite applied migration history.
