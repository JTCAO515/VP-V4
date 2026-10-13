# Source verification

PASS: 78 initially unblocked affected tests plus the three initially sandbox-blocked
Docker/loopback tests after scoped official approval (81 total), then one additional
independent-target SSR cookie test (82 distinct). Full repository TypeScript PASS;
source lint 834 files PASS; diff checks PASS. Reuse the initial passing checks; no
entire matrix rerun after the three environmental failures.

Coverage: missing/invalid/shared/ref-URL mismatch; exact URL normalization negatives;
Production refusal; cookie belongs to another project; same-origin boundary; missing
binding before identity/network; profile /4/root/job /2 cross-project mismatch before
secret/network access; actual CLI source ordering/files-only/no env-key fallback;
original S1 /1 and planning /2 discovery/disabled health/secret handling; /3 historical
parse with actual execution refusal; original context/budget/receipt/unknown-ACK
protections and read-only usage audit. Provider/Auth/PostgREST payloads are synthetic.

Initial failures were permission denied to Docker and sandbox-blocked loopback listen,
not waived assertions. Only those three cases were retried under scoped approval.
The Linux fixture used the existing cached Node22 image
sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c,
network none, readonly repository/synthetic-fixture binds and private container tmpfs.
No real credential or target data mount; existing fixture cleanup retained.

UNRUN: new-project provisioning, actual new reference or credentials, fresh target SQL,
real Auth/Session/provider/multi-turn, actual ECS package/2 mount/activation, production
acceptance. No cloud, role, provider spend, secret lookup/copy/overwrite, target DB or
Production configuration/alias change was performed. Fast/tier is not runtime-verified.

Package and activation owners should consume INTERFACE.md plus source helpers. A
syntactically accepted synthetic reference in tests is not an existing or ready project.
