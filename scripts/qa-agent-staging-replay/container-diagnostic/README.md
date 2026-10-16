# Synthetic container diagnostic adapter

This package runs the frozen `edec7a531824a11634851c7a64b2083c1bd27aa4`
owned PG helper in a new, isolated container. It is not connected to the restore
operator, any archive, window, credentials, or shared database.

## Runtime

The cached base is Supabase PostgreSQL 17.6 / Alpine 3.23.5 / arm64, pinned in
`Dockerfile`. Python 3.12.15-r0 and every changed APK package version are explicit;
`packages.lock.json` also fixes the complete installed package set. APK retains
its trusted signature verification and uses only the official Alpine v3.23/main
repository. Trust-key hashes and final image ID are in `runtime-pins.json`.

`build-runtime.py` sends only five named source files to the local Docker build,
checks the frozen helper against Git, verifies the installed package lock, and
compares the original and derived PostgreSQL executable hashes. It writes the
resulting runtime pins. Build downloads may use the official package repository;
all runtime probes and diagnostic containers have networking disabled. No host
packages are installed, no base/public image tag is changed, and nothing is pushed
to a registry. Derived tags are private local build outputs.

The helper's existing filesystem path is supported by image-local symlinks to the
original Nix bin/share/lib installation. No helper code or PostgreSQL executable
is rewritten. `--init` supplies orphan reaping for the resistant-backend fixture.

Run from the repository root:

```sh
python3 scripts/qa-agent-staging-replay/container-diagnostic/build-runtime.py
python3 scripts/qa-agent-staging-replay/container-diagnostic/test_adapter.py
```

`SyntheticContainer()` accepts no existing container, PID, DSN or image override.
Its internal receipt binds the create response's immutable container ID, image,
nonce, original attached Popen, local Docker endpoint and start epoch. Construction
checks runtime/helper/package identity; each request and destructive cleanup
rechecks provenance and isolation. The service pins the factory-created server
and returns an opaque session token. The original helper owns all PG cancellation,
backend confirmation and postmaster/PG-directory cleanup.

`request('run', sql=..., seconds=...)` is for synthetic SQL only (maximum five
seconds). Fixed test operations cover disconnection, resistant cancellation and
wrong backend lifetime. Results contain only safe typed statuses/tokens; SQL,
rows, error messages and cancel secrets are never emitted. Role and
application_name are unchanged. Host/container/nonce/epoch conflicts refuse
operations. An incomplete reply retains the request fence and prevents another
request; explicit `close()` can use only the independently verified container
removal fence and reports backend cleanup UNKNOWN in that case. A confirmed
container removal is distinct from a successful diagnostic response.

Call `close()` explicitly. There is no GC-driven deletion or foreign-PID signal.
If create acknowledgement or ownership cannot be established, do not blindly
retry or infer cleanup; this package does not recover an unacknowledged create.
It is a public capability contract, not an arbitrary-Python sandbox.

## Evidence limits

The container suite exercises PL/pgSQL and the typed observer on PG 17.6 with
fresh synthetic data. The original binary hash matching does not establish
managed Auth/Storage/vault roles, extension loading, ACL compatibility, or restore
acceptance. Other managed extensions have not been load-tested. Original shared
core, strict/parser/claim/window sources remain unchanged. The derived image is
not approved for any historical or new actual diagnostic window. Actual incident
root cause remains UNKNOWN.
