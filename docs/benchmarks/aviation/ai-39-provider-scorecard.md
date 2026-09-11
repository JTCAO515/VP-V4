# AI-39 aviation provider scorecard — no-selection baseline

2026-09-12开发修订：本文涉及供应商、法务或产品许可的历史前置条件已由[开发接入规则](../../agents/development-integration-policy.md)取消；技术实现与实际验收继续按当前任务推进。

Issue: AI-39/#41. Audit target: `main@72eba13`.

This is a preparation record, not a provider benchmark result. No provider account, trial, paid API,
flight query, contract, user record, raw response, cache entry or key was accessed. The decision line records the historical unselected state. Development provider selection
is now delegated to the agent under the current integration policy.

## Candidate and evidence matrix

The candidate set and capability prompts come from the frozen planning baseline in
`docs/external-data-chatbot-plan.md`; they are not current coverage or rights claims.

| Candidate | By-flight schedule/status capability to test | China coverage/identity/codeshare/exception sample | latency/cost | display/cache/persist/prompt/combine/backfill rights | R5 result |
| --- | --- | --- | --- | --- | --- |
| OAG Flight Info | schedules, status and alerts | unrun | unrun | unrun: evaluation terms are not a production grant | unavailable |
| Cirium Sky / FlightStats | by-flight schedule/status, terminal/gate/cancel | unrun | unrun | unrun: no accepted contract/policy record | unavailable |
| FlightAware AeroAPI | scheduled/estimated/actual status and terminal/gate | unrun | unrun | unrun: public material does not create the required VisePanda policy record | unavailable |
| Amadeus On-Demand Flight Status | carrier + flight + date status | unrun | unrun | unrun: production terms, China coverage and retention/display rights not accepted | unavailable |

**Development decision: agent-owned.** Use an available account/API to implement and measure one
provider; record actual configuration and unknown supplier details without waiting for paperwork.
This historical scorecard is not measured flight evidence; user-visible claims require actual results.

## Required operator benchmark

Use an isolated internal evaluation with an existing available account/trial, within existing
funding authority; no extra supplier or product approval is required. Sample at least 200 known or imminent flights stratified by airline, airport, time
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

`historical runtime unrun / development selection delegated to agent`. This scorecard deliberately does not claim a
benchmark, contract, China coverage, latency, cost, or production right.
