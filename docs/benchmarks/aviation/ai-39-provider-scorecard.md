# AI-39 aviation provider scorecard — no-selection baseline

Issue: AI-39/#41. Audit target: `main@72eba13`.

This is a preparation record, not a provider benchmark result. No provider account, trial, paid API,
flight query, contract, user record, raw response, cache entry or key was accessed. The decision
line is intentionally empty because choosing a provider and accepting its commercial/data terms is
operator-owned.

## Candidate and evidence matrix

The candidate set and capability prompts come from the frozen planning baseline in
`docs/external-data-chatbot-plan.md`; they are not current coverage or rights claims.

| Candidate | By-flight schedule/status capability to test | China coverage/identity/codeshare/exception sample | latency/cost | display/cache/persist/prompt/combine/backfill rights | R5 result |
| --- | --- | --- | --- | --- | --- |
| OAG Flight Info | schedules, status and alerts | unrun | unrun | unrun: evaluation terms are not a production grant | unavailable |
| Cirium Sky / FlightStats | by-flight schedule/status, terminal/gate/cancel | unrun | unrun | unrun: no accepted contract/policy record | unavailable |
| FlightAware AeroAPI | scheduled/estimated/actual status and terminal/gate | unrun | unrun | unrun: public material does not create the required VisePanda policy record | unavailable |
| Amadeus On-Demand Flight Status | carrier + flight + date status | unrun | unrun | unrun: production terms, China coverage and retention/display rights not accepted | unavailable |

**Operator decision: _unfilled_.** No candidate may enter display, prompt, Canvas, cache or
production adapter code from this scorecard. AI-40 remains fail-closed until an operator records a
single approved provider and its field/purpose/region/retention policy through the appropriate
authority.

## Required operator benchmark

Use an isolated internal evaluation only after the operator has accepted a provider account/trial
and its terms. Sample at least 200 known or imminent flights stratified by airline, airport, time
window, codeshare and disruption. Compare each response to an airline or airport official record;
record only approved metadata: provider/dataset/policy version, coarse sample class, observed and
expiry times, latency bucket, coverage/error category, permitted cost bucket, and attribution/
official-recheck outcome. Do not retain raw provider payloads, full trip/query text, ticket/PNR,
precise location, account data or keys.

A candidate can be recommended only when one provider passes all of: China by-flight coverage and
identity/codeshare correctness; known freshness/latency/cost; approved per-field display, cache,
retention, derivation, prompt and combination rights; a region/purpose policy; and a purge/revocation
procedure. A tie or missing field/right yields `unavailable`, not multi-provider fusion.

## Trial isolation, purge and rollback

No trial data exists in this repository, so this commit has no provider payload/cache/key to purge.
If a future trial is authorized, keep it isolated from user/display/prompt/Canvas paths, record a
redacted deletion receipt at trial end, and remove trial data/credentials under the accepted terms.
If rights expire, contract changes, or the selected source fails, turn the flight capability off,
purge permitted ephemeral provider data and return to user-confirmed artifacts plus an official
recheck action. This document is reversible by a normal Git revert.

## Status

`operator decision required / no runtime provider`. This scorecard deliberately does not claim a
benchmark, contract, China coverage, latency, cost, or production right.
