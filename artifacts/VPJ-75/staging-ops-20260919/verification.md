# #359 real Staging Wiki worker and Ops draft readback — 2026-09-19

Target: `VP - V4` Supabase `dzqdzetcctkhbrhlxxgn` and Vercel Preview
`dpl_CNeJEWY6HkHbnQmAwr59jmpuDRQJ` at
`https://vp-v4-hoqbl7dj0-jtcao515s-projects.vercel.app`, built from
`fea2eb03ec817847f1a3ff47379f5906581b3def` on the dedicated
VPJ-75/76 acceptance branch.

## Deployment and access

- Branch-scoped Preview settings added: `OPS_STAGING_REVIEW=1`,
  `KNOWLEDGE_STAGING_READ=1`, Qwen provider/configuration and a secret
  `VISEPANDA_GROUNDED_AI_ASSIST_API_KEY`. The grounded generation flag and
  user-facing Web/Native grounded flags remain absent pending a valid C2
  policy and consent.
- Existing Vercel maintenance rule version 103 denied the new Preview host.
  After inspecting the active rule and empty draft, the only change was to
  append this exact generated host to the allowed-host array; version 104
  became active. The new host returned app HTML 200 and anonymous
  `/api/ops/wiki` returned `401 UNAUTHENTICATED`; the prior deployment host
  still returned Vercel `403` with `x-vercel-mitigated: deny`.
- Two owned, ordinary test identities were created through real Supabase
  Auth and both completed real password login. Their credentials and exact
  IDs live only in an age-encrypted local journal. Ops was activated only
  after those accounts existed: exactly two active members, publication
  still disabled, 9 Auth users and the original 3 Trips.

## Real worker

The input was the repository's previously reviewed original editorial
synopsis of China Railway 12306 Ticketing Q2, source key `n-s04`, revision
`20260912-ticketing-q2`. The worker checked the real database declaration and
snippet hash against that source before dispatch. It called
`ops_wiki_generation_v1` as the authenticated Ops author to **claim before
the provider request**, then used the actual `runWikiGenerationJob` path with
the funded Qwen API, and completed through
`completeWikiGenerationJob`/`ops_wiki_generation_v1` with the claim token.

| Field | Real value |
| --- | --- |
| Page key | `source_summary:vpj75-staging-20260919-rail-id` |
| Job ID | `1a485048-d35e-44bb-816c-60af686c6122` |
| Revision ID / version | `7c4d37b8-e7dc-473f-b806-dd85adab7c53` / 1 |
| Source revision ID | `6238fcb4-7eeb-4228-a8d2-0f748625b691` |
| Prompt version | `vp-wiki-generation-v1` |
| Config digest | `8db6b734ff8fb024541970c6661bcab17b6fab5e0317423de076921ca2d19001` |
| Input digest | `ee3a1382f75501f76b08bbccf282ddb1d3649f0c5c6e0b7fc2dc68dc2b976f7b` |
| Provider receipt phases | configured → attempted → response_buffered |
| Worker/completion | succeeded / succeeded |
| Remote job cost | `cost_tokens=475`, `cost_unknown=false` |

An independent read-only remote SQL query confirmed the same job ID,
source-revision array, digests, `status=succeeded`, complete draft body,
`validation_status=draft`, and known token count. Token usage is a measured
provider usage field, **not** a currency invoice. Qwen account billing
reconciliation remains UNRUN.

The official QwenAI pay-as-you-go billing page was opened for reconciliation,
but the available in-app browser displayed “您当前还未登录”; no authenticated
account bill was available. The platform's official billing help says its
itemized list can filter by model/API key and may update hourly, while free
allowance can produce no bill. No currency amount is inferred from token
usage or public list prices. The three real Qwen calls in this run reported
475, 1783 and 528 tokens; the last call's success completion was rejected
after source withdrawal and is intentionally `cost_unknown` in the job row.

The real browser signed in as the owned author on the deployed Preview,
listed the Wiki page, opened v1, and rendered the model summary, three
review gaps, source-detail disclosure, job status and 475-token label.
Screenshot: [real Preview viewport](wiki-draft-preview-viewport.png).

## Real source intake and structured proposals

The authenticated Ops author submitted a new pending editorial statement
based on the [Chongqing China Three Gorges Museum's official notice](https://www.3gmuseum.cn/web/article/1430010139317059584/web/content_1430010139317059584.html),
which was directly read again on 2026-09-19. Its original editorial synopsis
is source `cq-museum` / `20260919-entry-crowd-ops-v1`, revision
`d4dff478-f7cd-4fcb-8e00-2f4a2dd66306`. Real SQL readback confirmed that
the candidate `5ad5539b-73cc-4c64-ab47-adab3b79ddf3` is still `pending`,
version 1, and the source is not withdrawn. No source was inserted directly
around the Ops RPC.

The same authenticated claim-before-provider sequence then ran the real
`runWikiStatementProposalJob` path with this source. Qwen returned a valid
structured v2 draft with **3 statement proposals**, each carrying a quote
bound to this exact source revision. The remote job and revision readback:

| Field | Real value |
| --- | --- |
| Page key | `source_summary:vpj75-staging-20260919-museum-proposal` |
| Job ID | `b9ced479-8ea9-42ec-9db4-a2d72d175c45` |
| Revision ID / version | `8e534080-5d77-4950-acd2-3eb20a2c6b45` / 1 |
| Prompt version | `vp-wiki-statement-proposals-v1` |
| Config digest | `e58e4d6484b44fc1fc23eef2e2cb07987db4e1f96013e897c85698090680f434` |
| Input digest | `b2a9f1c1a2df03c3926b44d8ffef67ac8d2ddba5969d50a913b8eca86d6d5f95` |
| Remote job cost | `cost_tokens=1783`, `cost_unknown=false` |

The actual Preview Ops page rendered all 3 proposals, their cited spans,
per-proposal edit links, two explicit gaps and the 1783-token job label.
Screenshot: [real proposal viewport](museum-proposals-preview-viewport.png).
These are model proposals, not reviewed or published facts. One proposal
summarizes reservation waiver broadly and must be narrowed to the named
sites before any publication; no automatic publication has occurred.

## Ops editorial handoff

On the deployed `/ops/review` page, the authenticated author selected model
proposal index **1** and edited it to specify the Chongqing Song Qingling
Memorial Hall, the source notice date, unknown accepted document types,
and no current-entry guarantee in both languages. The source checkbox
remained bound to the single immutable revision above. The real UI returned
“操作已保存。”; an independent SQL readback found candidate
`e003cfcf-a071-48f1-b122-c44c81c41bf0` at `pending`/v1 with
`wiki_revision_id=8e534080-5d77-4950-acd2-3eb20a2c6b45`,
`proposal_index=1`, and the expected source-revision ID. The browser then
switched to a **different** authenticated member, and the candidate's
“审核通过”/“驳回” controls were actually visible. The user was asked to
personally inspect and decide in that UI; no review action was taken by the
agent at this stage.

Separately, the authenticated author submitted one clearly labelled,
temporary Staging rail candidate
`e85336d2-d83b-4454-bbc3-00e9e8f464d7` from the real Qwen Wiki summary
revision `7c4d37b8-e7dc-473f-b806-dd85adab7c53`. Its statement is the
repository's already reviewed 12306 Q2 `rail_eticket_boarding` claim,
with the same single source declaration. The live RPC readback showed
`pending`/v1, one source, and a Wiki-origin link. It deliberately duplicates
an existing supported claim only for later same-version Staging readback;
it has **not** been reviewed or published, and will not be used as product
knowledge without an independent review decision.

## Remaining boundary

Both pages remain unpublished drafts with no statement refs. A second human
reviewer has not yet accepted a proposed statement and no publication or
ordinary Ask readback has occurred. Withdrawal behavior and full #359
acceptance remain UNRUN.
