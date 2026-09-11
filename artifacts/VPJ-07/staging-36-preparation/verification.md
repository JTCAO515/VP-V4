# Staging33 to36 preparation evidence

Source SQL:4465915, integration PR325; no remote mutation or provider activation.

- Live official CLI read-only transaction observed33 exact migration version/name pairs,3 accounts,
  2 Trips,0 policies,0 enabled budget scopes,0 live work,0 pending budget attempts. New knowledge
  schema and scoped claim are absent. This is not proof of future writer quiescence.
- Frozen package tests3pass/0fail/0skip: exact36 hashes, future migration exclusion, no environment
  or linking files, private new directory, no overwrite, hash/earlier-migration drift rejection.
  A real exclusive unlinked package was also emitted in the local cache; no Supabase push was run.
- `VP_TURN_DB_TEST=1 node --experimental-strip-types --test tests/integration/turn/text-work.test.mjs`:
  18pass/0fail/0skip,213.7s. Disposable network-isolated real PostgreSQL applies baseline33, seeds
  policy/consent/Turn/text and an existing lease, then applies34–36. Those seeded records remain
  identical; new candidate settings are disabled with no members or source records. Existing
  dispatch/cancellation/deletion/lease/unknown-charge scenarios and service EXECUTE rollback pass.
  The owned test process exited0 and its database was cleaned. No actual Staging backup or data
  restore was performed; original-data comparison remains in the execution procedure.
- Independent package/migration review:Critical0/Important0, setSHA256
  `e71633204f08d3deabfa2b88d72960ddefe681b26a06e69c4cccf2eaa6a7b57c`.
  Independent runbook review:Critical0/Important0, fileSHA256
  `2fc968e13dcc9e41a13804dd54b6c770ae178d38723f6033b0d088fe543fba4d`.
- `pnpm docs:check` and `git diff --check` passed. Runtime SQL and worker source are unchanged
  from4465915; existing security/HTTP/SQL-advisor evidence is retained in scoped-worker/verification.md.

Execution requires a new confirmed direct-writer pause and the maintenance/backup procedure in
[the runbook](../../../docs/runbooks/staging-33-to-36.md). The old27–33 window does not establish
that writers are paused now. Account/recipient/actual tariff qualification is separate; Qwen
remained signed out at the browser recheck. No request for credentials in chat is needed.
#191/#192/#195 and the complete S1/S2 acceptance remain open; Production is excluded.
