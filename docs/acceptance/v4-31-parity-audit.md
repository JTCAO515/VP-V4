# V4-31 product parity audit

Audit target: `main@3a5171d`. This is an evidence audit, not a release approval.
The Early Access Demo remains an interaction reference; its prepared data is not production evidence.

## Demo action matrix

`not accepted` means the named action has no complete production path. `unavailable` means the
route truthfully withholds the capability and has a static route contract; it is not feature parity.

| Action | Current state | Evidence at audit | Release result |
| --- | --- | --- | --- |
| SHELL-01 | partial | Product Shell source contract | not accepted |
| SHELL-02 | hidden | [registry](../architecture/v4-01-demo-parity-registry.md) | not accepted |
| SHELL-03 | partial | WEB-10 viewport evidence | not accepted |
| SHELL-04 | partial | locale/RTL static tests | not accepted |
| TODAY-01 | partial | V4-18 NextAction plus V4-19 timestamped observation contracts; route stays unavailable without owner data | not accepted |
| TODAY-02 | partial | V4-20 delay recovery contract: pending proposal, stale recheck, accept/reject and version conflict; no Trip write | not accepted |
| TODAY-03 | partial | V4-20 closure recovery contract: pending proposal, stale recheck, accept/reject and version conflict; no Trip write | not accepted |
| TODAY-04 | hidden | registry recovery row | not accepted |
| TODAY-05 | hidden | registry safety row | not accepted |
| TODAY-06 | partial | V4-04 feasibility plus V4-18 nine-check registry contracts | not accepted |
| CHAT-01 | partial | V4-08 owner-scoped state-only Turn tests | not accepted |
| CHAT-02 | hidden | registry chat UX row | not accepted |
| CHAT-03 | contract-only | claim failure-code tests | not accepted |
| CHAT-04 | partial | V4-09 feedback contracts | not accepted |
| IMPORT-01 | unavailable | V4-28 static import route test | not accepted |
| IMPORT-02 | hidden | V4-28 unavailable contract | not accepted |
| IMPORT-03 | unavailable | V4-29 static conflict route test | not accepted |
| CANVAS-01 | partial | V4-10 canonical version contracts | not accepted |
| CANVAS-02 | partial | V4-11 exact/user place identity contracts | not accepted |
| CANVAS-03 | partial | V4-12 action projection contracts | not accepted |
| CANVAS-04 | partial | immutable Proposal/RPC contract tests | not accepted |
| CANVAS-05 | partial | V4-10 append-only rollback tests | not accepted |
| CANVAS-06 | partial | V4-12 read-only action tests | not accepted |
| MEMORY-01 | partial | V4-14 owner-scoped profile/source/impact static route test; local runtime unrun | not accepted |
| MEMORY-02 | partial | V4-14 durable action/reload static route contract; local runtime unrun | not accepted |
| MEMORY-03 | partial | V4-15 durable receipt contract exists, but no current Turn/Proposal writer creates an impact | not accepted |
| TOOL-01 | unavailable | V4-22 static Tool route test | not accepted |
| TOOL-02 | unavailable | V4-23 static Safe Phrase route test | not accepted |
| TOOL-03 | unavailable | V4-24 static Ride Assist route test | not accepted |
| TOOL-04 | unavailable | V4-25 static Visa route test | not accepted |
| TOOL-05 | unavailable | V4-26 static Network route test | not accepted |
| TOOL-06 | unavailable | V4-27 static Handoff route test | not accepted |
| EXPLORE-01 | hidden | registry Explore row | not accepted |
| EXPLORE-02 | hidden | registry Explore row | not accepted |
| EXPLORE-03 | hidden | registry Explore row | not accepted |
| EXPLORE-04 | hidden | registry Explore row | not accepted |
| USER-01 | partial | V4-16 owner Profile route/UI contract | not accepted |
| USER-02 | partial | V4-16 explicit Profile/locale/unit and Memory-separation tests | not accepted |
| USER-03 | hidden | V4-17 privacy lifecycle absent | not accepted |
| OFFLINE-01 | unavailable | V4-30 static Offline route test | not accepted |

## Functional

The matrix records 40 Demo actions. No prepared Demo data is used as a product result. The only
implemented paths are bounded contracts and truthful unavailable routes; this does not satisfy full
functional parity.

## Interface

`pnpm check` builds all product routes. Static E2E contracts verify the new unavailable routes and
central locale/RTL switching. No browser proof covers each action's live interactive path.

## Data

Trip, Place, action and owner-scoped Memory governance projections have bounded contracts. Memory
impact writers, privacy, external observations, private artifacts and offline storage still lack the
runtime/durable contracts needed for full parity.

## Security

`pnpm test:security` passes its static tests. The local Supabase RLS fixture is skipped because
local Supabase is not running; this is not runtime acceptance evidence.

## Performance

No performance environment, p50/p95/p99 sample, provider latency or mobile runtime observation
exists. This dimension is unrun.

## UX

Five locale and RTL source boundaries are covered by static tests. WEB-10 records viewport and
keyboard evidence for Homepage, Login and Product Shell, not the entire action matrix. Physical
device, screen reader and 390x844 Offline checks are unrun.

## Observable

No accepted release trace, metric, alert, provider health observation or observation window exists.
This dimension is unrun.

## Compliance

Source rights are controlled by WEB-04. No approved policy/Fact, provider, media, artifact or
offline retention record establishes the remaining product capabilities.

## L1-L7 acceptance

| Level | Evidence | Result |
| --- | --- | --- |
| L1 source policy | `pnpm lint` | pass |
| L2 type/build | `pnpm typecheck`, `pnpm build` | pass |
| L3 bounded contracts | `pnpm test:contract` | pass |
| L4 static journey contracts | `pnpm test:e2e` | pass |
| L5 security source checks | `pnpm test:security` | degraded: local RLS unrun |
| L6 local integration | `pnpm test:integration` | unrun: local Supabase is not running |
| L7 release observation | production/browser/provider window | unrun |

## Unrun checks and observation window

- Local Supabase is not running: owner/RLS integration, migration and rollback runtime evidence.
- No provider, Policy Fact, reviewed Safe Phrase, private artifact or encrypted offline cache exists.
- No physical-device, assistive-technology, end-to-end fault, performance or production observation
  window exists.
- Unblock condition: implement and independently verify the missing V4-13, V4-15, V4-17 and
  V4-21 contracts, then rerun this complete matrix in a release environment.

## Rollback

Revert this audit record if the evidence becomes inaccurate. Do not change unavailable routes into
fixture-backed capabilities as a substitute for the missing contracts.

## Verdict

`blocked` — L1-L4 source evidence passes, but every Demo action lacks full accepted production
evidence and L5-L7 contain unrun or missing required evidence. No release or parity claim is made.
