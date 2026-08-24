# AI-03 Unified Turn, Evidence, Claim, and Proposal Contract

Status: accepted domain-contract baseline for [AI-03](https://github.com/JTCAO515/VP-V4/issues/5). This document freezes a pure TypeScript domain boundary. It does not introduce a database, API route, model call, provider SDK, persistence, or live VisePanda AI capability.

## Ownership and version

- Schema version: `2026-08-24.1`.
- Source contract: `lib/server/contracts/index.ts`.
- Contract consumers: `TurnCoordinator`, `TripWorkspace`, `KnowledgeSystem`, `ExternalEvidenceResolver`, Chat UI, Trip Canvas, and Explore.
- Provider adapters, database clients, HTTP/SSE transport, and UI-specific shapes are forbidden from defining these types.
- Detailed failure codes and HTTP/SSE mapping remain owned by AI-44; stream lifecycle remains owned by AI-06; `TripPatch` operation shape remains owned by AI-09.

## Evidence and context

`EvidenceReceipt` is a discriminated union of:

- `fact`: a reviewed Fact identifier, immutable version, review timestamp, and freshness boundary;
- `observation`: an external observation identifier with provider, policy receipt, and expiry;
- `user_artifact`: an explicitly confirmed user artifact identifier and version.

Only `EvidenceReceipt` can support `GroundedClaim`. `ExternalEntityRef` may join `ContextRef` to resolve or refresh an entity, but cannot prove a claim by itself. Candidate, draft, expired, licence-blocked, and plain provider payloads are not receipts and therefore cannot be promoted by this contract.

## Typed claims and cards

Every executable value is a `GroundedClaim` with non-empty receipts and a discriminated value shape. AI-03 supports address, time window, money in integer minor units, payment method, admission action, transport status, and Safe Phrase. Critical values are not strings paired with Fact IDs.

`ExecutionCard` repeats each receipt used by its claims. A renderer must consume the typed value; an LLM can explain a result but cannot replace the typed execution value. An unavailable turn may not contain executable claims or a proposal.

## Proposal lifecycle

```text
ProposalDraft (building; not confirmable)
  -> TripProposal (pending; deeply immutable)
  -> later owner resolves applied | rejected | expired | conflicted | superseded
```

`ProposalChange` is a closed union: create/update Trip title, upsert/delete day, and upsert/delete block. It cannot carry arbitrary JSON Patch paths, URLs, HTML, or tool payloads. Each change has its own evidence, assumptions, and explicit dependencies. Proposal-level evidence is exactly the deduplicated index of every change receipt.

Partial selection, edit, and rebase use `deriveProposalRevision`. It rejects a missing dependency, creates a child revision with `revision + 1`, and never changes the parent object. Confirmation and persistent application are outside this issue and stay unavailable until AI-09/AI-10.

## Consumer obligations

| Consumer | Must do | Must not do |
| --- | --- | --- |
| TurnCoordinator | validate and persist only an accepted `AssistantTurn` later | emit unvalidated model output as a proposal |
| TripWorkspace | derive deterministic patch only from a confirmed pending revision later | mutate a pending proposal or accept arbitrary patch paths |
| KnowledgeSystem | issue reviewed/current Fact receipts later | treat candidate/draft as evidence |
| ExternalEvidenceResolver | issue policy-stamped, unexpired observation receipts later | let an entity reference prove a claim |
| Chat UI / Trip Canvas / Explore | render typed evidence and visible proposal diff | write a Trip directly or infer eligibility |

## Verification and rollback

- Consumer contract tests: `pnpm test:contract`.
- Broader static/build checks: `pnpm check`.
- Documentation consistency: `pnpm docs:check`.
- Runtime maturity: fixture-only. There is no model/provider/database invocation and no durable turn or Trip write.
- Rollback: revert the AI-03 commit; later consumers remain unavailable rather than falling back to untyped values.

## AI-03 acceptance record

Deviation classification: D2 — a reversible cross-module contract boundary. The contract is intentionally released before its database, transport, provider, and UI adapters.

| Dimension | Status | Evidence or boundary |
| --- | --- | --- |
| Functional | applicable | six consumer tests cover immutable publication, revision derivation, closed change kinds, typed claims, and card receipt propagation |
| Interface | applicable | TypeScript contract plus checked-in JSON snapshot and `CONTRACT_CONSUMERS` ownership map |
| Data | applicable | only typed receipts support claims; candidate/draft/provider payload shapes have no receipt variant |
| Security / permissions | applicable | no direct write type exists; unconfirmed proposal and external entity reference cannot enter executable claim flow |
| Performance | not applicable | pure in-memory validation; no runtime latency or throughput path is introduced |
| UX | not applicable | no rendered UI changes; Canvas rendering remains a later owning issue |
| Observability | deferred | later Turn/Trip persistence owns traces and metrics; AI-03 records command evidence only |
| Compliance | applicable | no provider, raw media, account, or user data is accessed; unsupported evidence fails closed |

L1–L4 are run through the listed commands. L5 browser/device, L6 staging, and L7 production observation are explicitly unrun in `artifacts/AI-03/unrun.md`; no release or product-completion claim follows from this contract.
