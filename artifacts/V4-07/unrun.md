# V4-07 unrun checks

- `pnpm check`, `pnpm test:e2e`, and `pnpm docs:check` passed locally; exact timestamps and results are in `commands.jsonl`. Browser viewport evidence at desktop, mobile and Arabic RTL remains unrun because no browser automation target is connected. The source-contract E2E suite does not substitute for that observation.
- Preview/production observation is not run locally. This shell deliberately has no map provider, AI call, persistence, booking, or Trip-write path.
- The visual Guide asset remains excluded: the current rights record permits design review/reference only, not runtime use.
