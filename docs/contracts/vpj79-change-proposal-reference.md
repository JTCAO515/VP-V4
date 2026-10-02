# VPJ-79 change Proposal reference / 1

Related to #560. This backend slice references the existing Proposal authority. It does not create a Proposal, copy its intent, render a diff, confirm a change or write Trip data.

## Closed content

`{schemaVersion:"change-proposal-reference/1",proposalId:UUID,proposalRevision:positiveInt32,actions:[]}`

No title, summary, patch, digest, URL, confirm payload or executable action is accepted. Trip ID/base version remain in the existing result `source` receipt. Proposal ID/revision resolve the actual `public.trip_proposals` row. Existing revision RPCs create a new ID with a higher revision and supersede the parent; a replacement requires a new artifact rather than retargeting an existing artifact's canonical identity.

The result's Task/input/goal origin is separate from the Proposal's origin. Their owned Trip/base must agree through the existing explicitly confirmed goal-to-Trip link. This association does not prove that the Task generated the Proposal or that Memory influenced its contents.

## Authority and storage

Append-only migration `20261002110000` adds a nullable canonical Proposal FK to existing result artifacts, with cascade deletion and a partial FK index. Immutable result revisions, service-only CAS/idempotent publication, outbox and existing Task/text/Memory/goal-to-Trip checks are reused. The existing comparison publisher delegates to the same private implementation but still accepts only `comparison/1`.

`publish_change_proposal_reference_v1` is callable only by the existing service role. No authenticated/anonymous/model writer or canonical Proposal/confirmation permission is added. The publisher checks a real same-owner pending Proposal, matching ID/revision/Trip/base, future expiry and existing read projection. It stores only the closed reference. After holding the established Trip share lock, its Proposal share lock uses NOWAIT, so it aborts with `STALE_BASIS` rather than waiting in a cycle with the existing Proposal-then-Trip confirm/revise transactions.

Publication receipts, including exact idempotent replays, describe the recorded publication operation; they do not establish current read eligibility. A caller must read the exact saved reference again.

## Exact current read

Authenticated RPC: `read_change_proposal_reference_v1(artifactId,revision)`.

Native GET: `/api/results/native/v1/change-proposal-reference?artifactId=UUID&revision=N`, with both parameters mandatory. It reuses the existing native credential/session/request deadline checks and returns `Cache-Control: private, no-store`. POST is unsupported. Cookie/Origin mixing, duplicate/unknown parameters and unknown/extra content fields are rejected.

The standard result receipt pins the same source Task Turn/input sequence/goal/Trip/Memory revisions and contains this reference content. Only the current artifact head is returned. `historicalReadable:true` describes the selected stored revision's eligibility at this read, not a promise of future validity or access to earlier revisions. There is no historical/latest Proposal fallback.

Pending/expiry/revision/owner changes, revision supersession, rejection/application, Trip head/archive/deletion, changed goal/Task/source/Memory, revoked consent or withdrawn artifact remove read eligibility. Source-message and canonical Proposal deletion cascade the dependent artifact/revisions/events. Missing/foreign artifacts return `{version:1,data:{kind:"empty"}}`; an existing ineligible reference returns `unavailable`. Missing native authority returns 401; unsupported input returns 400; transport/schema failures return 503 without content.

The reference contains no confirmation material. Opening it in a future consumer must use the original exact Proposal reader and explicit diff/review/confirmation workflow. This endpoint never invokes that workflow.

## Comparison compatibility

The existing comparison parser stays unchanged and rejects this schema. Legacy latest/exact comparison, Trip and Task readers exclude canonical reference artifacts before bounded candidate selection. New references cannot hide an older eligible comparison or consume its 64-candidate window. Existing Library comparison search already validates `comparison/1`; its API and consumers are untouched. Unknown content still fails closed; no result-type coercion is introduced.

## Evidence boundary

Local Auth/Next/Postgres and contract evidence: [verification](../../artifacts/VPJ-79/change-proposal-reference-20261002/verification.md). Real producer, consumer UI, Staging/provider/device/production and whole #560 acceptance remain UNRUN. This slice performs no target migration, deployment or paid operation.
