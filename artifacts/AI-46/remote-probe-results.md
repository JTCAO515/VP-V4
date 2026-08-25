# Remote new-project PLAT-CONF-00 results — 2026-08-25

- Target project: `dzqdzetcctkhbrhlxxgn` (`ap-southeast-1`).
- Dry-run and remote push applied exactly four V4 baseline/probe migrations; no seed, vault, or roles file was pushed.
- User JWT RLS: insert `201`, owner visible count `1`, other-user visible count `0`.
- Ops app-metadata JWT RPC: visible count `1`.
- Worker private function: linked SQL executed it as `service_role`; after cleanup visible count was `0`.
- Transaction pooler: tenant-qualified remote `PREPARE` and subsequent `EXECUTE` returned `1`; ADR-0016 freezes client-side disablement rather than assuming a server rejection.
- Test users and probe row were deleted before command completion.

No API key, token, connection string, database password, user ID, or email address is retained here.
