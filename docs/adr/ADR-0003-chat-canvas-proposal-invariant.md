# ADR-0003: One Chatbot, one Canvas, confirmed Proposal writes

Status: accepted on 2026-08-24 through explicit operator delegation.

## Decision

VisePanda has one visible Chatbot and one visible Trip Canvas. AI may produce only a typed Answer, deterministic card, or immutable `TripProposal`. Every Trip change follows visible diff, explicit user confirmation, base-version revalidation, deterministic `TripPatch(expectedVersion)`, and append-only audit/event write.

## Consequences

- No model, client, provider, or tool directly mutates Trip state.
- Pending proposals are immutable revisions; edits and partial selections create a new valid revision.
- Until AI-03/AI-10 freeze and implement the contract, the UI remains preview-only.

## Rollback

Disable the proposal/write path and return to read-only Canvas plus truthful unavailable behavior. Existing audit history is never rewritten.
