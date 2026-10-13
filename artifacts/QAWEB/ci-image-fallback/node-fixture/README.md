# Offline security Node fixture preparation

PR #684 head `96767520`, run `38363795803`, job `115183989737` failed test 168,
`Linux QA installer passes the workspace endpoint to its sole mocked Docker create`.
Read-back of the real GitHub log confirmed `No such image: node:22-bookworm-slim`
and Docker exit 125 before the QA wrapper ran. The test correctly requires
`--pull=never`; this repair supplies its fixture before the security suite.

The existing planning fixture and `deploy/hosted-worker/Dockerfile` also declare
`node:22-bookworm-slim`. No test/product runtime declarations are changed. The
three existing Quality workflows now pull the official Docker Library Node
linux/amd64 manifest by digest and tag it under that existing local name. PR
preparation has the same security selector predicate as the immediately following
suite; nightly and release candidate already run that suite unconditionally.
No matrix, selector, test assertion, timeout or offline flag is weakened. The
successful DB/GHCR workflow is unchanged. Pull/digest/tag failure stops the job.

Supply-chain evidence: `registry-digest.json` records the live official tag,
linux/amd64 manifest digest, upstream docker-node source revision annotations,
and successful raw-manifest SHA-256 readback. This pins only the CI fixture;
it neither changes the production Dockerfile nor authorizes an activation.

Validation, 2026-10-13:

- PASS: governance 22/22, zero skips/todos/cancellations; exact fixed digest pull,
  legacy local tag, ordering/selector predicates, and pull/tag failures covered.
- PASS: actionlint 1.7.12 for all three edited workflows; ShellCheck unavailable
  and disabled. Bash `-n` on their actual preparation bodies passed in governance.
- PASS: docs check and diff check.
- PASS: actual pull of the pinned linux/amd64 image and offline Node runtime:
  `v22.23.3`, `x64`. See `cold-runtime.log`.
- PASS: QA installer and legacy planning deployment tests, 4/4, on the immutable
  PR `96767520` source snapshot, using that actual image with network isolation.
  To avoid overwriting the pre-existing shared arm64 `node:22-bookworm-slim` tag,
  the temporary snapshot changes ONLY each test's image string to the isolated
  alias `qaw005-node-cold:20261013`. Before preparation that alias failed with
  exit 125; after pull/tag it passed. Assertions and all Docker isolation flags
  are unchanged. Context is in `cold-proof-context.json`. This is a cold local
  alias proof on Docker Desktop amd64 emulation, not a fresh GitHub runner proof.
- UNRUN: full security suite/new exact-head GitHub CI; Main owns integration and
  that run. The successful prior DB lanes do not need a diagnostic rerun here.

Tool/network facts: authenticated GitHub log read and anonymous official Docker
registry manifest/pull operations succeeded. No credential or permission edits.
No Main-owned test changes or product-source writes; no additional threads.
Rollback: revert this scoped preparation commit (the missing-image failure then
returns on cold runners). Initial local evidence script used a Python tar API
unsupported by the installed version; extraction of the trusted git archive was
corrected before the reported runtime proof, without repository source changes.
