# Domain documentation

VP-V4 has one active product context: VPJ-00 #187, ADR-0023 and the master report.
Use `development-workflow.md` / ADR-0024 for current execution rules.

Read root `AGENTS.md`, `CONTEXT.md`, the current Issue/PR and its execution row, then the
affected module's interface, code, tests and relevant accepted ADRs. Inspect the checkout,
local changes, base and relevant live blockers. Read the full master report on first entry or a
scope change; historical research and old AI/V4/LAUNCH rows are on-demand evidence.

Use established domain terms: TurnCoordinator, TripWorkspace, TripProposal, EvidenceReceipt,
GroundedClaim, KnowledgeSystem, Imported POI Candidate, Canonical POI, Fact and Explore
Projection. A term in a planning document does not prove implementation.

Resolve ordinary implementation choices within accepted contracts. A substantive product,
security, privacy or architecture conflict needs a scoped decision/new ADR; prepare options and
continue independent authorized work. Obsolete procedure is handled by ADR-0024's explicit
supersession, not by repeatedly stopping development.
