# Historical /3 workspace audit regression

Fixed reviewed source: Main 8c445913; owner base d2c2cf7e. Both relevant audit files
matched that Git object's content, so no dependency merge/reset was required.
The real finding is qa-agent/usage-audit.ts, not the shared jobs caller. Main corrected
that exact lease; shared jobs files remain unchanged in this repair.

Reproduced before fix: the historical workspace journal fails during validate([])
with Provider transport configuration unavailable. The only runtime change passes
config.provider.endpoint as qwenEndpoint to the historical createStagingTextJob
configuration validator, retaining all forbidden execution callbacks.

PASS: six targeted behavior checks (two new historical workspace cases plus four
existing hosted-usage audit cases), full repository TypeScript, lint 834 files and
diff whitespace. The valid cn-beijing.maas.aliyuncs.com workspace journal is audited
without any fetch, with ledgerState:not_checked and settlementAction:none. Wrong
endpoint and forged cost remain refused; original /3 execution and credential access
remain forbidden. Receipts/transport are synthetic; actual audit functions run.

No profile/4, S1, CLI, SQL, credential, target, provider or production operation changed.
No cloud access or provider spend. Independent delta review/CI remains Main-owned.
