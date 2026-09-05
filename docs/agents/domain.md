# Domain documentation

VP-V4 is a single-context repository.

The active entry is `docs/program/2026-09-05/README.md`, ADR-0023 and the VPJ master report.
Historical AI/V4/LAUNCH documents and archived interview records are evidence, not a second active
product scope. Follow the current VPJ execution row and its actual dependencies before implementation.

Before planning or implementation, read:

1. root `CONTEXT.md` and its mandatory reading order;
2. the current GitHub Issue and blocking Issues;
3. relevant accepted ADRs under `docs/adr/`;
4. `docs/agents/issue-execution-contract.md` for this Issue's reading order, allowed paths, commands and artifacts;
5. the owning module's contract and tests once they exist;
6. current git status, branch, and `origin/main`.

Use canonical terms from the integrated research and engineering reports, including `TurnCoordinator`, `TripWorkspace`, `TripProposal`, `EvidenceReceipt`, `GroundedClaim`, `KnowledgeSystem`, `Imported POI Candidate`, `Canonical POI`, `Fact`, and `Explore Projection`.

If an Issue would contradict an accepted ADR, stop and surface the conflict. Planning documents remain proposals until an operator decision and ADR accept them.
