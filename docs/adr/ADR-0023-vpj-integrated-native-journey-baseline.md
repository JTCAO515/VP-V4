# ADR-0023: Integrated native Journey Agent and replacement delivery program

Status: accepted for product planning and repository governance on 2026-09-05 by JT's explicit delegation to optimize positioning, pricing, usage, overall delivery and to close all open Issues and create a replacement program. Actual accounts, data-retention values, supplier contracts, payments and production execution are not approved by this ADR.

## Decision

Use VPJ-00 #187 as the single active delivery Program. The master report and `docs/program/2026-09-05/issue-plan.json` define the new scope, dependency graph, executable task contracts and customer delivery. Old open Issues are closed as superseded/not planned with replacements, never as runtime acceptance.

Native SwiftUI iOS supplies the complete trip lifecycle; Web remains a lightweight same-Trip Planning Studio with basic reading/editing/Chat/diff confirmation. Keep one VP identity and shared Trip with bounded skills. Plan/Ready/Travel are capability/acceptance groups, not three isolated products or a restriction on start/end stages. Navigation is Trip/Explore/Ask/Tools/Profile, default Ask; Today stays inside Trip.

Current release languages are zh/en. Existing es/ru/ar assets and legacy wire payloads remain compatible until VPJ-01 completes explicit migration; there is no authority to delete unrelated user work. Source/UI/output/operations languages remain distinct.

Hotel V1 is accommodation/room-requirement fit plus verified affiliate handoff. No inventory/price guarantees, external payment handling or travel fulfillment. Future live observations and transactions require new evidence and scoped authorization.

Use Free plus a 30-day non-renewing Journey Pass as the new commercial experiment. Reference price $19.99 with $14.99 as an alternative single-variable test; exact store products/local prices and unit economics are VPJ-33/34/35 responsibilities. No private payment, unlimited human support or hidden quote/booking promise.

Preserve TripProposal/diff/confirm/atomic Patch, verified actor+RLS, append-only migrations, knowledge licence/expiry/review, and privacy boundaries. Changes to actual retained data, AI/media recipients, Ops raw-data access and deletion use VPJ-03 and corresponding runtime tasks before activation.

## Supersession

This ADR supersedes the older Web-first/five-language/text-only launch **scope and direct-queue scheduling rule**, not the valid code/security contracts. Open native blockers and unmerged upstream interfaces gate implementation; fixture preparation only proceeds when its own Issue explicitly allows it. Dependencies and operator work cannot be silently ignored.

Historical ADRs stay immutable. The duplicate thin-HTTP ADR-0019 is renumbered ADR-0022 consistently with the already-open PR #185 proposal; Trip snapshot/rollback retains ADR-0019. PR #185/#186 remain open for independent review; this program records overlapping governance changes and historical product observations.

## Acceptance and rollback

Verify new DAG has no cycle/missing node, every replaced Issue has a successor, every task has scope/checks/evidence/rollback/owner, archived files are recoverable and no runtime consumer depends on retired code. Native dependencies/labels must match the published plan. Reopen old Issues and restore labels from snapshot if rollback is requested; a repository revert restores archived source/governance. Never resurrect deleted user data or old provider authority as part of planning rollback.
