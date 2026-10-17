# Same-copy typed post-data restoration

This is an explicit library mode. The ordinary restore path and the original
window/approval/claim engine remain in place. It does not enable any real window,
recover an old attempt, or read protected material by default.

## Entry and authority

A qualified operator may use `reviewed_entry.run(core, original_args, config)`
only after the existing direct-human/source qualification has been completed for
a new window. `config` must contain exactly `mode`, `sourceLockSha256`, and
`windowBindingSha256`. The mode is `same-copy-typed-postdata/1`; the source lock
is this package's fixed `source-lock.json`. The window binding is a separately
reviewed digest for the new context, not a synthetic test value or authority by
itself. `reviewed_entry.reviewed_code_hash(core, config)` binds the opt-in and
configuration into the code hash checked by the unchanged original window gate.
The original gate creates and passes the Budget and consumes the original claim.
No environment switch, public CLI, record writer, extra slot, or reset is added.
Unconfigured/historical entry still rejects before private reads.

`restore_bundle(..., window_budget=original_budget, typed_diagnostic=config)` is
the internal seam used by that entry and by the self-generated fixtures. A direct
library call is not operator authorization. Missing/fake/expired Budget or
missing/changed source/image capability fails before archive processing. The
mode creates one copy; it cannot attach a container/PID/DSN or start a second copy.

## Factory, routing and completion

The optional factory retains the original bootstrap role, validated locale,
base-image qualification, isolation flags and initdb/restore semantics. Its new
runtime image is separately pinned. Launch is performed by the adapter itself;
no caller-supplied callback can manufacture a launch ID. The receipt records the
actual Docker response, Unix endpoint, immutable ID, nonce, start epoch, image,
server token, role and Budget identity. Copy fields are checked for conflicts.

All SQL commands, archive consumers and control calls are rebuilt from that
receipt's endpoint and immutable ID, not the copy's mutable command/context/name.
The original pg_restore options are preserved. Only post-data's Unix socket is
routed through the observer; pre-data, data, ledger, post-data and later checks
remain on the same factory server. The observer captures BackendKeyData and the
first ErrorResponse.C allowlisted code; SQL, object names, rows, error text and
cancel secret are not emitted. It does not infer a SECURITY DEFINER effective
role from a bootstrap metadata connection. Synthetic restore functions explicitly
check the real pg_restore session user and application_name.

The parent keeps the original Budget object, UTC/monotonic bounds and reserve.
The child receives a nonce/window/session-bound immutable deadline snapshot.
Remote sampling precedes parent receipt, so the offset uses the conservative
lower bound: remote deadline = remote sample + original host deadline - host
receipt time. RPC delay shortens that deadline. The parent's original process
watchdog remains authoritative; no now-plus-remaining replacement window exists.
Repeated initialization/open/finish or changed/expired snapshots are refused.
Cleanup uses the original parent's cleanup deadline; it cannot start another
session. Client/relay exit alone is never treated as backend termination.

Normal completion and timeout invoke the original helper's bound CancelRequest,
metadata exit readback, and where necessary its original factory-owned postmaster
fence. Acknowledged copy initialization is closed through that helper before
immutable-ID container removal and successful absence readback. A lost initial
factory ACK permits only the separately verified empty owned-container fence;
no archive phase has been admitted. Unknown identity/backend state retains the
resource/result and fails cleanup. No default/legacy cleanup fallback can erase
that unknown state or release a consumed claim.

## Runtime and tests

The image retains the exact original PostgreSQL binary. Its fixed locale launcher
sets the base image's existing LOCALE_ARCHIVE path, then execs the original Nix
initdb/postgres with unchanged arguments. This supports the frozen helper's
minimal environment without a C-locale fallback. The helper source remains pinned
to `4a3879517d26d86126a1ce45076e090060fcc691`. Python/APK package pins, trust keys,
source hashes and derived image ID are recorded in `runtime-pins.json`.

From the repository root:

```sh
python3 scripts/qa-agent-staging-replay/container-diagnostic/restore/build-runtime.py
python3 scripts/qa-agent-staging-replay/container-diagnostic/restore/lock-sources.py
python3 scripts/qa-agent-staging-replay/container-diagnostic/restore/test_core.py
python3 scripts/qa-agent-staging-replay/container-diagnostic/restore/test_contracts.py
```

Building/locking creates a candidate, not an approved source or window. Tests use
new offline copies, a held synthetic export snapshot, three genuine pg_dump
archives plus roles, temporary synthetic age identity/ciphertexts and the full
strict restoration engine. Tests cover normal/typed-failure/timeout/resistant
post-data and the unchanged ordinary path. Contract tests cover identity and
route conflicts, clock domains, replay, expiry and the original authority entry.

These results do not prove actual managed Auth/Storage/vault ACL equivalence or
real restoration. The ICU test proves creation/readback of the explicit profile,
not an ICU archive restoration. The actual incident cause remains UNKNOWN. The
next actual source/image/material/window package must be reviewed independently;
old window795's two attempts remain exhausted and are never reused.
