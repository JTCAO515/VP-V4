# VPJ-06 provider protocol verification

## DeepSeek model-ID record correction — 2026-09-17

The historical real API rejection of `deepseek-v4-flash` is retained as a
protocol finding. Main commit `27b968c` corrected the gateway profile to
`deepseek-flash`; the Qwen-only injection probe comment now records that state
and does not imply a new DeepSeek call. `node --check` and `git diff --check`
pass. A fresh billed DeepSeek protocol/usage observation remains separate.

Latest actual C0 conformance is recorded in [2026-09-10 results](live-c0-20260910/verification.md). The following section is the original offline preparation evidence.

Related to #193; baseline `080d5f0aa2a1e8976d9dc75b8c22207801d87fc4`.
Worktree: `/Users/jtcao/Documents/VP-V4-Model-Adapters`.
Branch: `codex/vpj-06-provider-protocol`.

The added function is a C0-only thin HTTP protocol seam using an explicitly injected transport.
It reuses the existing known/unknown validator, candidate model IDs and CostGuard admission.
No production caller, provider dispatch, registry activation or shared contract changed.
See [protocol scope and sources](../../docs/benchmarks/vpj-06/provider-protocol.md).

## Observed local checks

- Full contract suite: 174/174 passed, zero skips (`contract.log`).
- Unit suite: 38/38 passed, zero skips (`unit.log`).
- Existing offline evals: 23/23 passed, zero skips (`evals.log`). The existing VPJ-66 output
  rewritten by that command was restored to its baseline; no Harness artifact changes remain.
- Initial affected security suite: 7/7 passed, zero skips (`security.log`).
- Final protocol + security checks: 20/20 passed, zero skips (`protocol-final.log`), after
  strengthening malformed UTF-8, late-response cancellation and C1–C4 policy coverage.
- Documentation gate passed (`docs.log`).
- Final `pnpm check` passed: lint, typecheck, production build and 22/22 static tests (`check.log`).
- Final documentation and staged whitespace checks passed (commands.jsonl). The first whitespace
  check flagged only build progress carriage returns; trailing whitespace was normalized in check.log.

The 20 tests contain provider/shape/status matrices. They validate request encoding, usage
accounting shape, JSON and tool candidates, invalid response handling, policy/budget rejection,
redacted errors, bounded reads, cancellation and timeout without external requests.
These are synthetic protocol observations, not actual model quality or real cost evidence.
No raw provider response, user data, secret, header or credential is recorded.

## Retained gates and rollback

See [unrun.md](unrun.md). Independent review and final-HEAD required CI remain pending.
Revert only this isolated slice; no applied migration, user data or live configuration changed.

## Explicit HTTP destination transport increment

See [HTTP transport verification](http-transport-verification.md) and
[commands](http-transport-commands.jsonl). Real controlled loopback HTTP4 and focused protocol/
security31 pass with zero skips. Existing provider, C2 and durable-budget authority are preserved.
No actual supplier endpoint/account/region facts are backfilled from these synthetic results.
