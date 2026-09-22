# VPJ-21 readiness / SIM document check v1

Related to #211. This first vertical slice checks one mainland carrier SIM document scenario.
It does not establish complete connectivity, payment, admission, address or transport readiness.

## Producer and consumers

- `POST /api/trips/:tripId/readiness`: authenticated same-origin Web, read-only assessment.
- `POST /api/trips/native/v2/:tripId/readiness`: existing bearer/mobile-session fence.
- Native Trip detail opens `NativeReadinessView`; same-Trip Web uses
  `/visepanda/trips/:tripId/ready` and `ReadinessWorkspace`.
- Both call `knowledge_answer_v1` with the existing `connectivity_sim_documents/1`
  definition. No source publication, new RPC, migration, privilege or writer is introduced.
- Local/explicit Staging activation reuses current Trip and Knowledge environment gates.
  No Production activation is inferred.

## Request and result

The closed request carries `taskId`, `tripVersion`, city, locale, applicability,
`documentReady`, `conditionsChecked`, and `checkAt`. Answers are `unknown | yes | no`.
They are explicit request-local user declarations, not profile/memory reads or verified credentials.
No document number, image or free text is accepted; nothing is persisted or sent to a model.
Reload starts with unknown declarations. This is not cross-device persistence of readiness state.

`checkAt` is `now`, `unknown`, or an exact RFC3339 timestamp with explicit offset. It is the
user's chosen check time, not an inferred carrier opening, appointment window or reminder.
No time zone or future carrier rule is guessed from a relative Trip date.

The result separates `knowledgeAvailability`, `userReadiness` and `actionTiming`. Each next step
is bound by the enclosing receipt to task, Trip, head version, date-basis SHA-256, rule version,
question/relation ontology versions and the displayed fact/publication/assertion/source revisions.
The rule supports only the exact existing SIM-01 relation, conditions and exclusions. New or
ambiguous variants fail closed to unknown and require current evidence; strings are not parsed
into new obligations. Every displayed condition and exclusion is retained.

| Situation with current evidence | User readiness | Timing | Next step |
| --- | --- | --- | --- |
| Applicability unknown | unknown | user-selected | Ask whether outlet SIM application applies |
| Document unknown | unknown | now | Check document, no upload |
| Document absent | not_satisfied | now | Prepare document or verify acceptable options with carrier |
| Document and current conditions explicitly checked | satisfied | user-selected | No new task; label as user report, not activation |
| User says not applicable | not_applicable | not_applicable | No task |
| Outstanding check scheduled for later | unknown or not_satisfied | not_yet | Return at selected time and refresh; no reminder promised |
| Time unknown | unknown or not_satisfied | unknown | Choose a check time |
| Missing, expired, revoked, changed or unsupported evidence | unknown | user-selected | Refresh/verify evidence; no old fulfilled conclusion |

## Freshness, authority and Trip changes

The server reads the actor's current Trip using the existing RLS adapter, reads eligible knowledge
under the same actor, re-reads Trip and rechecks the active actor/session. Changed Trip/date basis
or lost access rejects the result. This detects Trip races; it is **not** an atomic transaction
across knowledge publication and Trip. Knowledge eligibility remains the existing RPC's authority.

Clients retain a result at most 30 seconds from the knowledge evaluation, bounded further by
source expiry and conservatively reduced by the full request duration. They clear it on changed
answers, background/navigation, failed refresh and identity change where exposed by the existing
client session. Revocation during that bounded lease is the existing projection limitation;
instant push invalidation is not claimed. No cached result feeds a later evaluation.

A new Trip version requires fresh evidence. Native rejects its old visible version until the Trip
is reloaded. Web discards old declarations when a subsequent check detects a changed version.
Relative-to-exact date changes therefore cannot carry a previous receipt forward.

This slice never proposes or changes Trip. Any future next step needing a Trip edit must use the
existing Proposal / visible diff / exact-version confirmation / atomic Patch path. Viewing a source,
a next-step label or a user declaration does not complete an external action.

## Verification and retained acceptance

Scoped commands and results: [verification](../../artifacts/VPJ-21/verification.md),
[unrun](../../artifacts/VPJ-21/unrun.md). Tests use editorial SIM-01 content as explicitly synthetic
publication responses; the editorial batch is not evidence of a live approved publication.

Full Issue acceptance remains open: other scenario categories, real approved SIM evidence and
controlled users in the permitted environment, native en/zh five-state behavior, same-Trip Web
reload, expiry/revocation/version conflict, accessibility, and any later Proposal consumer path.
Rollback is a normal code revert; no data/schema changes require reversal.
