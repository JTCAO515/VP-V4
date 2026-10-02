# Native HTTP port release diagnosis (2026-10-02)

Base: `03e9627ee753ccc19a447e9edd8c55794b635368`. This is diagnostic preparation,
not a root-cause fix for the reported #600/#616 incidents.

The exact original #616 job is
[110695478738 / run 36961336792](https://github.com/JTCAO515/VP-V4/actions/runs/36961336792/job/110695478738).
Fetch that job's logs directly; `gh run view --job ... --log` can return the later successful
attempt after a rerun. The original job records Hosted Compute Agent / Ubuntu 24.04.5,
not evidence of different hosted jobs sharing a machine. Its native HTTP steps run serially
inside one job (workflow matrix jobs themselves are separate scheduled jobs).

Observed original sequence:

- 03:45:11Z: change-proposal reference base **63420**, own cleanup PASS.
- Native local session **1/1 PASS**, same-Trip **2/2 PASS**. The identity runner uses base
  **58500** and awaits its server exit followed by its own Supabase stop command.
- 03:47:45.538Z onward: five default native HTTP modes each fail preflight at **59640**,
  before provisioning or a node:test summary (0 tests). That is default base 59620 + shadow
  offset 20. No default native HTTP stack was reported started earlier in this job.
- Independent base **63820** goals step **11/11 PASS** and cleanup PASS.

No original port-state/PID/socket-owner snapshot exists. The later exact rerun PASS is
reproducibility evidence only. #600's earlier incident is coordinator-reported context;
this document does not claim independent original-log verification of that incident.

## Controlled falsification

Host base **64420** was checked free before the investigation. No other host range, Simulator,
shared DB, or global Docker cleanup was used. An owned `--network none` Node 22 Linux container
listens only on private loopback 64451; its own Bash client connects using a kernel-selected
outbound ephemeral port. After that client process exit **and close**, and after the listener
close callback, the source port still has TIME_WAIT, with no LISTEN row. Node bind fails with
EADDRINUSE. This disproves the universal claim that child exit/close implies port bindability;
it does not identify which socket caused the original CI incident.

Observed with the final port-observation helper:

```json
{"source":"linux-proc","tcpTablesRead":2,"ephemeralRange":[32768,60999],"inEphemeralRange":true,"tcpStates":{"TIME_WAIT":1}}
```

The controlled source port was 55290, client exit code 0, TCP state `06`, bind EADDRINUSE,
LISTEN rows 0. The interval contains 59640; this supports a testable ephemeral-port hypothesis,
not a root-cause verdict about #616. The private namespace was removed, so no host TIME_WAIT
or listener was left by that reproduction.

Repeat on an owned local Docker context with the image already present (no pull):

```sh
probe_repo="$PWD"
probe_name="vp-port-release-$(uuidgen | tr '[:upper:]' '[:lower:]')"
docker run --pull=never --rm --network none --name "$probe_name" \
  --label "vp-port-release.owner=$probe_name" \
  --mount "type=bind,source=$probe_repo/tests/integration/turn/native-http-ports.mjs,target=/probe/tests/integration/turn/native-http-ports.mjs,readonly" \
  --mount "type=bind,source=$probe_repo/tests/unit/governance/fixtures/native-http-timewait-probe.mjs,target=/probe/tests/unit/governance/fixtures/native-http-timewait-probe.mjs,readonly" \
  node:22-bookworm-slim node /probe/tests/unit/governance/fixtures/native-http-timewait-probe.mjs
```

## Minimal shipped observation

Only failed port preflight gains bounded, port-scoped kernel metadata: phase, port, errno,
Linux ephemeral range/overlap, readable TCP-table count and local-port TCP-state counts.
It reads `/proc/net/tcp`, `/proc/net/tcp6` and the ephemeral-range sysctl read-only. No PID,
command line, remote address, raw table row, credential or filesystem error text is logged.
macOS or unavailable proc files explicitly report unavailable/unknown; that never makes bind
failure pass. Snapshot counts are not owner identity or proof that a particular row caused
bind failure. The error remains fatal; no retry, delay, port reassignment or cleanup is added.

The original Net preflight already awaits its close callback. Although some child wrappers
resolve on exit instead of close, the controlled mechanism persists even after both events;
there is no evidence to change those shared wrappers in this slice. Existing default/base
selection, startup classifier (#612), workflow/registry and all product files are untouched.

Validation: new observation governance **3/3 PASS**, existing port governance **5/5 PASS**,
no skips; final-helper owned Linux reproduction **PASS**; exact own container absent afterward;
syntax, docs, classification and diff checks **PASS**. No full app/Auth/UI stack was rerun.
Required current-head CI is reported on the PR. Real #600/#616 socket ownership and actual
cleanup-to-range-release timing remain **UNKNOWN/UNRUN** until a recurrence captures the new
failure observation (or an explicitly coordinated post-cleanup hook). No change to machine
port ranges, preflight hard FAIL or zero-test policy is made. Rollback removes the extra
observation and new tests/probe; it restores the original failing error text only.
