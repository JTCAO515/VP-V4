# GOV-AFK-01 unrun and deviation record

## Unrun

- Desktop and 390x844 browser QA: not applicable. This Issue changes governance documents,
  validation scripts and a JSON queue only; it changes no rendered route, CSS, runtime behavior or
  user-facing copy.
- Preview/production smoke and deployment observation: not applicable. No runtime, environment,
  database, RLS policy, migration, provider, external account or public capability changed.
- First two-Issue Continuous AFK observation window: pending the policy PR merge and the next
  development session. This is follow-up observation, not evidence that can be fabricated inside the
  policy change.

## Deviation

The first isolated-worktree `pnpm check` exited before typecheck because `node_modules` was absent.
A temporary symlink to the primary worktree caused TypeScript to sleep without progress and was
removed. `pnpm install --frozen-lockfile --ignore-scripts` then restored isolated dependencies from
the existing pnpm store; the rerun passed lint, typecheck, production build and 13/13 tests. The
lockfile was unchanged. Command timestamps and exit codes are retained in the ignored local
`artifacts/GOV-AFK-01/commands.jsonl` evidence.
