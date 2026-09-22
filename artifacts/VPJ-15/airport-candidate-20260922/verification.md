# VPJ-15 Shanghai airport candidate and local submission preparation

Related to #205. S2 local development, observed 2026-09-22 Asia/Shanghai. Started from main `ce46abd`; #204 was CLOSED and #205 OPEN on live GitHub. Open #479 remains outside this work. Scope and independent preparation inputs were recorded in [Issue comment](https://github.com/JTCAO515/VP-V4/issues/205#issuecomment-5767144204) before editing.

## Delivered

- [One real-source editorial candidate](../../../docs/knowledge-base/batches/2026-09-22-airport-transport/README.md), SHA T2 / Metro Lines 2 and 10, with a language-neutral assertion and matching zh/en conditions/exclusions. Scope is Shanghai airport transport only. It is a local candidate, not reviewed/published/eligible content.
- Government source date, observation date, paragraph locator, proposed freshness check, use limitations and empty independent-review/publication receipts are recorded separately. [Research](../../../docs/knowledge-base/batches/2026-09-22-airport-transport/source-research.md) retains the newer guide's 404/TLS timeout, operator Metro 521, older readable government page and operator reuse restrictions. Current topology needs verification before publication; no live service guarantee.
- The existing matrix registers a candidate supplement without adding it to supportedCells or removing the airport gap. The prior 13 records and historical publication evidence remain intact.
- `scripts/knowledge-prepare-candidate.mjs` validates one selected record through the existing `isKnowledgeOperation`, exports only `submit_statement`, refuses ambiguous IDs/invalid bilingual content, and uses exclusive file creation to preserve retry IDs. No network, credentials, review/publication operations or remote writes. This adjacent script is necessary to reuse exact content without manual re-entry; no runtime contract/UI changes.
- Existing Web and native scene enumerations already support `airport_transport`; no consumer code change is needed to read a future properly published statement.

## Verification

| Check | Result |
| --- | --- |
| `node --experimental-strip-types --test tests/contract/knowledge/editorial-candidate.test.mjs tests/contract/knowledge/supported-journey-matrix.test.mjs` | PASS: 6/6, zero skips. Uses actual new candidate and prior batch, actual Ops validator and spawned CLI. Tests preserve exact content, reject condition mismatch/unknown statement fields/duplicate IDs, and keep an existing output byte-identical after refusal. |
| `node --check scripts/knowledge-prepare-candidate.mjs` | PASS |
| `pnpm lint` | PASS: 330 runtime source files; new CLI syntax separately checked above. |
| `pnpm docs:check` | PASS |
| `git diff --check` and implementation diff review | PASS |
| Independent source research | Completed as source research only, not an Ops reviewer identity or content approval. |
| Required PR CI | Pending at preparation of this evidence; follow the PR checks for the tested commit. |
| Real Staging submit / independent review / publish / read / revoke | UNRUN: no designated current write window or actual independent reviewer for this candidate. No membership/flag change attempted. Historical Staging evidence is not reused as proof for this new record. |
| Physical/native UI and complete Issue acceptance | UNRUN for the new candidate. No device matrix or #206 frozen regression was started. |

The first CLI test failed because the test passed URL.pathname containing `%20` to the filesystem in this space-containing worktree. Fixed the test to use fileURLToPath, then reran all six relevant tests successfully. This was a test-input path error; no source fact or runtime acceptance was relaxed.

No schema, permissions, source-material ingestion, model calls or production changes. No remote integration credentials were needed. Current source-use qualification and independent review remain separate from the local validation. #205 stays OPEN; no merge authority inferred. Rollback is reverting this isolated content/tool change; no remote data cleanup is required.
