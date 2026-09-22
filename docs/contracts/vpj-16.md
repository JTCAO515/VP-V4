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

## Bounded natural-language Ask and durable results

The opt-in `knowledge_intent_v1` policy adds native `/api/chat/native/v4` policy,
consent and turns endpoints. This is a separate recipient notice/consent from the
current-input and task-history policies. A request includes a canonical city,
zh/en locale and existing ServiceTask link; city and locale stay fixed throughout
at most four turns. Exact retries reuse the original turn, while a changed city
under the same idempotency key is a conflict. Existing modes remain compatible.

The existing scoped worker, leases, provider gateway and task budget process the
request. Only the current user message goes to the classifier. The server owns a
versioned prompt. Current v5 output has exactly three fields: `intent`,
`requestScope` and `unansweredNeeds`. The last field contains at most six distinct,
nonblank excerpts of at most240 Unicode scalars each, copied exactly from the
current input. It is nonempty only for `additional_needs`; all other scopes use
an empty array. These are quoted requests, never factual prose or evidence.
The v5 worker rejects missing excerpts rather than treating new output as legacy.
The older two-field parser/completion remains available to older workers.
`rail_boarding_documents` permits `single` or `additional_needs`; `clarification`
and `unsupported` require `unknown`. No evidence ID, citation, factual prose,
previous input/output, Trip or source snippet is accepted from or sent to this
model exit. Parsing failure is a technical failure; it does not trigger repair or
another model call. Verified usage still settles the original attempt.

The classifier's interpretation is displayed explicitly. It supports only the
current reviewed-question catalogue (ordinary railway, payment and SIM scopes). Additional
needs remain visibly unanswered and cannot yield a complete task outcome. A
vague follow-up requires a restatement because this mode does not send history.
Classifier semantic accuracy requires separate real-provider evidence; a closed
JSON schema alone cannot establish that the interpretation is correct.

An additive private `unanswered_needs` column is written through
`complete_grounded_work_with_needs` in the same transaction as the existing
completion. The service-only wrapper rechecks each excerpt against stored current
input; it cannot supply new facts or overwrite a finished answer. The original
RPC remains compatible. Read replies carry optional/null `unansweredNeeds` for
old records; new native/Web consumers validate bounds, scope and input binding,
then render literal quotations with the unsupported-scope reason and official or
service-provider next step. Legacy records keep an explicit generic notice.

A private first-party resolver runs after lease/owner/consent checks, then those
checks run again after any publication lock wait and before completion. Saved
`grounded_turns` bind the original claims and actual publication/revision/hash
references. Generic output contains only `reviewed-answer-v1`, never factual text.
Legacy completion, reads, history and claimers cannot consume this mode. Private
resolver/results are inaccessible to ordinary database roles or direct worker
queries; service-role RPCs retain scoped lease authorization.

History returns `grounded_history` and a structured `reviewed_answer` result.
The immutable original outcome is separate from the current factual projection.
Reads recheck original support and all current matching variants. Withdrawal,
expiry or a new conflict suppresses the affected text. Newly published support
cannot silently replace an original fact, and removing an old conflict cannot
upgrade an originally uncovered claim. Read-disabled/capacity/technical failure
returns an unavailable projection with no factual content, not a knowledge gap.

Native v4 validates the structured projection and reuses the reviewed knowledge
cards with all qualifiers and source locators. Full read duration is subtracted
from the monotonic lifetime, capped at30 seconds. Hidden/background tabs cannot
display the cached facts; they recheck on return. Pending request IDs, policy,
city and task binding survive in the existing endpoint/owner/epoch Keychain
record before sending. Acknowledged requests remain non-sendable until their
history restores. Factual answers are not saved in Keychain.

Activation is separate from migration: no policy, account membership or reader
switch is enabled by migration41. Native local/Staging configuration requires
`VISEPANDA_NATIVE_{LOCAL|STAGING}_GROUNDED=true` and the corresponding
`..._GROUNDED_POLICY`; the installed native mode is `knowledge_intent_v1`.
Rollback disables this entry/worker and the first-party read switch, retaining
consented history and budget records. An applied migration is not rewritten.
Full #206/S2, physical-device and production acceptance remain separate.

## Payment Ask extension (candidate, not yet Staging accepted)

`vp-knowledge-intent-v3` adds general card-acceptance checking, mobile merchant setup and RMB
cash access, their exact pairs and an all-options overview. Server-owned question definitions
bind each request to its scene and required assertion relations; the model supplies no facts.
A revoked card-acceptance publication remains a required gap for card/overview requests and is
not an obligation for mobile+cash. Exact fee/rate, individual acceptance, transfers and execution
are unsupported unless separately asked alongside an independently supported general procedure,
in which case that extra need remains unanswered.

Payment uses the existing first-party snapshots, saved-result invariants and <=30-second
client lifetime. The appended migration and matching native/Web consumers are one rollout;
old clients cannot consume unknown payment intents. Keep the scoped integration disabled until
that candidate combination is verified. No migration or source publication is implied by this
contract. Current implementation, local evidence and pending real acceptance are recorded in
`artifacts/VPJ-16/payment-ask-20260913/verification.md`.

## Bounded SIM questions (implementation; Staging integration pending)

`connectivity_sim_documents`, `connectivity_plan_allowances` and
`connectivity_getting_started` use the existing `knowledge-answer/1` and grounded task
interfaces with scene `connectivity`. Their obligations match SIM-01/02 relations, never
publication IDs. They do not answer eSIM availability, device compatibility, specific plan
prices/allowances, live branches, substitute-ID exceptions or execute purchases/activation.

The classifier is version `vp-knowledge-intent-v4`; only the current question is sent. An
independently requested second domain or unsupported need remains `additional_needs`. The
existing publication, consent, authorization, budget, immutable history and owner boundaries
apply unchanged. Old rail/payment definitions remain exact. Native and Web use SIM-specific
missing-information guidance while retaining their existing scope and interfaces.

Validation and remaining real checks: [SIM evidence](../../artifacts/VPJ-16/connectivity-ask-20260913/verification.md).

## Unfinished work terminal read projection

When the original mobile session is replaced, normal worker claiming can cancel
its expired lease while the public Turn and accepted event remain unchanged.
An authorized grounded read projects `cancelled` (or `failed` for failed or
quarantined work) only for same-owner work whose grounded result is unfinished
and public Turn is still processing. Existing public terminal states and completed
answers win; work marked completed never implies a successful answer.

The result remains `projection=pending` with null completion, intent, scope,
original outcome, knowledge and output. SSE sends the existing events and an
id-less current projection, stops heartbeat and preserves the replay cursor.
It never manufactures a terminal history event or changes consent, budget or
answer records. This is a read repair, not a recovery or refund operation.
Staging migration and actual client acceptance are tracked separately.


## Named-attraction address and today's hours (local implementation)

`knowledge-statement/2` adds reviewed bilingual place names plus a typed CN address
or an explicit UTC opening window with `Asia/Shanghai` timezone (at most24 hours).
Admission is limited to one city and attraction scope. v1 statements remain valid;
existing pending address candidates are not promoted automatically.

Classifier `vp-knowledge-intent-v6` may return `place_address`, `place_opening_hours`
or `place_address_and_hours`, with a literal current-question `placeName` excerpt.
The server resolves exact reviewed names within the selected city, normalizing only
ASCII case/spacing. It supplies the subject and required claims; the model supplies
no facts or identifiers. Unknown names are unavailable; names shared by different
subjects require clarification. Multi-place, unnamed and unsupported requests retain
explicit limits. The legacy unbound question GET does not accept these new intents.

The service-only place completion RPC retains lease, dispatch, consent and policy
checks. A shared transaction barrier covers name selection and completion; normal
publication/revocation takes the corresponding exclusive barrier before row locks.
The saved subject, evidence basis and original gaps remain immutable. Historical
reads recheck original evidence without rematching names or filling old gaps.
Conflicts compare typed values as well as assertion/text. Hours must start on the
current Shanghai date; other dates yield `not_current_date`, independently of expiry.
Native/Web validate the saved identity and typed projection, preserve sources and
qualifiers, and cap hours-cache lifetime at Shanghai midnight and publication expiry.

Migrations20260914040000/20260914041000 add no content, membership or activation.
They and compatible consumers require one verified scoped rollout; older clients
fail closed on unknown intents. Rollback disables the scoped worker/read entry and
retains history and usage; applied migrations are append-only. Local rollback tests
do not establish Staging recovery. Current evidence and remaining integration:
[place verification](../../artifacts/VPJ-16/place-grounding-20260914/verification.md).

## Saved Web answers: explicit current claim gaps (2026-09-22)

The browser projection now retains each validated non-covered claim's ID and observed
reasons as optional `claimGaps`. Saved answers render those obligations and reasons in the
answer's original zh/en language, alongside the reliable facts, qualifiers, sources and
existing domain-specific next step. Withdrawn, expired, currently unreviewed, missing and
unresolved-variant evidence remain distinct; attraction hours also retain `not_current_date`.
The original saved outcome remains immutable when current coverage changes.

Only the existing validated `knowledge-answer/1` projection supplies these gaps. An unavailable
projection, provider failure, policy denial, missing user input or unsupported capability is
not converted into a missing-publication claim. Full coverage produces an empty list. Existing
place-specific notices and unanswered user excerpts remain compatible. This changes no upstream
wire schema, eligibility, publication, worker, AI-assist behavior, persistence or native DTO.

Evidence: `artifacts/VPJ-16/web-claim-gaps-20260922/verification.md`. Component fixtures and
local checks do not establish authenticated Staging, real-source or whole-#206 acceptance.
