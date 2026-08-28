# WEB-06 unrun checks and limits

- `artifacts/WEB-06/commands.jsonl` is intentionally untracked by the repository ignore policy. Actual command outcomes are recorded in this handoff and review evidence. `pnpm generate:design-tokens` runs before `dev` and `build`, so the checked-in CSS projection is regenerated from the brand manifest rather than hand-maintained.
- The ledger marks `brand/ip/*` Guide artwork as `internal-brand` with surfaces limited to `brand-reference` and `design-review`; owner-rights attestation remains pending. WEB-06 therefore does not put a graphical Guide derivative into the public runtime. The text VisePanda mark and neutral primitives do not claim that exception. This is a truthful unavailable asset state, not a substitute asset.
- No staging/production deployment or product-observation window was run. This is a local, reversible presentation foundation (D1); production release remains owned by WEB-11.

Rollback is a normal revert of the WEB-06 UI commit. It introduces no migration, credential, route, session-policy, capability, or data write.
