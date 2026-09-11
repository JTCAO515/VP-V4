# ServiceTask Staging result — 2026-09-12

PR328 merged as `06fabb54529547720c9b09167633654d1b29e700` after Quality34643832176, Budget34643832167 and Vercel passed. Existing Preview branch was merged to tree-identical main at `a44823ec2bb76b6cbb68936ac6199ac9cebc9947`; its deployment `dpl_94YS5YM5tVCjQWxdtF3AkbNhVd64` is READY in iad1. The established Staging domain, six branch-scoped variables, firewall and production target ID were unchanged by this deployment.

## Applied and observed

- Encrypted AES-GCM Staging backup was recovered from Keychain and restored in a network-none container with zero published ports. All 70 table digests and 225 schema/permission entries matched; the owned restore container was removed. Backup now explicitly includes knowledge_review_private.
- CLI dry-run admitted only append-only migration37. Staging36→37 preserved all 70 original table digests, six accounts and three Trips. Existing schema entries matched except the three reviewed function changes. No new policy, recipient or budget scope was installed.
- Live post-security: private task tables deny anon/authenticated/service_role direct access; RLS enabled; old internal budget callable by none of these roles; public reserve only service_role; v2 owner RPCs only authenticated; no PUBLIC execution grant.
- Two existing synthetic owners authenticated through the ordinary native credential/login API and retained their prior accepted text policy. Each created an ambiguous route goal, received actual Qwen clarification, then submitted a self-contained synthetic geometry clarification and received an actual answer. All four results persisted with the correct task/parent; opposite-owner history excluded them. Exact replay, including the original request after continuation, reused the original Turn.
- Four actual Qwen calls settled as two attempts per ServiceTask, all in their pinned scope, with zero unresolved attempts. Conservative tariff debit: CNY0.018462 total, not a supplier invoice or user charge. Body/locale results and ledger aggregates are in the adjacent JSON artifacts.

The initial live checker incorrectly expected worker.result.kind rather than the CLI's finished string. The first provider request had already completed. Its saved result was read without another admission or provider call, then only the remaining three calls ran. The original failed checker and checkpoint are retained privately; no failed provider result was erased or rerolled.

## Acceptance boundary

Independent acceptance review found all four #194 technical criteria covered, with no unresolved Critical/Important finding. This completes the first-model durable-cost/record-only integration evidence for #194 together with [local concurrency, kill and crash tests](../../VPJ-59/verification.md), [trusted stop tests](../../VPJ-59/stop-runtime-verification.md), [Staging budget/RPC checks](../../VPJ-59/staging-20260910.md), and [current SQL/HTTP/rollback tests](../service-task-records-20260912/verification.md).

#195 remains incomplete: this is an explicit server-validated task/parent chain, not natural-language scope classification. The current model still receives only the current input; the follow-up deliberately repeats sufficient context. No new SwiftUI v2 consumer, general unattended worker service, streaming or phone acceptance is claimed. Existing response-policy courtesy/live-channel semantic failures remain FAIL; these four synthetic route results do not replace that regression. Production, IAP and user consumption remain unactivated by this work.

Rollback retains migration, task relationships and budget pins; withdraw v2 admission/worker exposure without deleting ledger evidence or converting continuation into a fresh budget. Unknown costs must remain held. Existing accounts/Trips were retained; no new physical phone operation occurred.
