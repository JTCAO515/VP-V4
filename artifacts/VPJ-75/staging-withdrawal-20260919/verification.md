# #359 real Staging withdrawn-source barriers — 2026-09-19

Target: `VP - V4` Supabase `dzqdzetcctkhbrhlxxgn`, migrated to the
11-file VPJ-75/76 package. This was a separately owned source revision from
the [official Chongqing China Three Gorges Museum notice](https://www.3gmuseum.cn/web/article/1430010139317059584/web/content_1430010139317059584.html),
with an original editorial synopsis submitted through the authenticated
`ops_review_workspace` RPC. Its pending source candidate was never published.
It is distinct from the source and Wiki proposal awaiting human review.

1. Authenticated Ops author submitted source revision
   `eb755017-37f7-4d72-824c-0caaa5e748c1`, then claimed Wiki job
   `88403243-a7a4-4fa3-b39a-0f9905843e93` while the source was active.
2. The real `runWikiGenerationJob` path called funded Qwen once. Its
   destination receipts reached configured → attempted → response_buffered;
   the provider reported **528 tokens**. The successful output was retained
   only in the encrypted local run journal at this point.
3. The authenticated source-withdrawal RPC committed a reasoned withdrawal
   **before** completion. A succeeding completion with the original claim
   token then returned `OPS_SOURCE_WITHDRAWN`; no Wiki revision was inserted.
4. The running job was explicitly settled as failed with that code. A new
   claim for the same page/input after withdrawal independently returned
   `OPS_SOURCE_WITHDRAWN`, so no second provider dispatch occurred.

An independent read-only remote query confirmed: source withdrawn; Wiki
page version **0**; **0** revisions; job terminal `failed` with
`error_code=OPS_SOURCE_WITHDRAWN`. The job has `cost_tokens=null` and
`cost_unknown=true` because the *persisted successful completion* was
correctly refused after the real provider call. The 528-token provider
usage is therefore not mislabeled as a settled database cost receipt.
The earlier two successful jobs separately hold known costs of 475 and
1783 tokens. Currency billing reconciliation remains UNRUN.

This proves both actual `ops_wiki_generation_v1` withdrawal barriers on
the named Staging database. It does not establish every other #359
criterion or publication rollback.
