# Triage labels

| Canonical role | GitHub label | Meaning |
| --- | --- | --- |
| needs triage | `needs-triage` | Maintainer evaluation required |
| needs info | `needs-info` | Waiting on reporter/operator information |
| AFK-ready | `ready-for-agent` | Fully specified and independently executable |
| human-ready | `ready-for-human` | Operator/human decision or action required |
| will not action | `wontfix` | Explicitly not planned |

Project planning also uses:

- `phase:R0`-`phase:R5` for delivery order, matching the six release milestones R0-R5;
- `priority:P0`, `priority:P1`, `priority:P2` for outcome priority;
- `status:ready`, `status:blocked`, `status:in-progress`, `status:superseded` for live work state;
- `governance` for architecture/control work;
- `migration` for evidence-gated VP-Final reuse or replacement;
- one standard type label such as `documentation` or `enhancement`.

`status:ready` and `ready-for-agent` are not synonyms: the first means dependencies are complete; the second also means no human decision remains.

In Continuous AFK mode, `ready-for-human` and `needs-info` are skip signals for the scheduler, not a
reason to pause the entire session. Only the affected dependency path waits. The scheduler removes
`ready-for-agent` from that Issue, records the exact action in `docs/operator-actions.json`, and
continues another independently ready Issue.

## Release milestones

Delivery order also uses GitHub milestones, one per release in the engineering report section 12.2:

| Milestone | Content | Exit gate Issue |
| --- | --- | --- |
| `R0 Architecture baseline` | decisions, contracts, actor/data/deployment ADRs | operator acceptance of AI-01 |
| `R1 Durable walking skeleton` | fixture -> Turn -> Proposal -> atomic apply -> reload | AI-15 |
| `R2 Grounded text alpha` | real text providers, RAG baseline, typed claims | AI-21 |
| `R3 Two-city product beta` | curation, Ops deploy, Explore, exact-ID loop | AI-29 |
| `R4 Multimodal beta` | media TTL, OCR->MT, push-to-talk | AI-34 |
| `R5 Controlled production` | external data, hardening, runbooks, observation | AI-41 |

Every release-gate Issue is a hard dependency of the next release's first implementation Issue.
Removing that edge reopens the gap the 2026-08-24 governance review found, where no
implementation Issue depended on any acceptance gate.

## Priority meaning

`priority:P0` is reserved for the R0 contract set and the R1 tracer bullet. R2/R3 are `priority:P1`.
R4/R5 are `priority:P2`. A program where almost everything is P0 carries no priority signal.

## Direct queue supersession

This section supersedes the dependency-gated scheduling language above. Every defined Issue is
directly schedulable. `status:blocked` reports an unavailable runtime, provider, legal, or operator
state; it does not prohibit development, testing, review, or merge of independently scoped work.
Release gates remain evidence requirements for release claims, not implementation prerequisites.

