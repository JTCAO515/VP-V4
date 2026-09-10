# VPJ-06 HTTP destination transport increment

Related to #193. Baseline main297eb23 (PR311); isolated provider-193 worktree.
Scope: a reusable explicit server HTTP transport, C2 exact-endpoint propagation, provider-protocol
contract/security/controlled-HTTP tests, and this Issue's benchmark/evidence documentation.
No policy, budget, flags, observability, native client, shared handoff or database changes.

The actual Node fetch stack talks only to exclusively owned ephemeral loopback servers through
an explicit test fetch bridge. Tests validate the logical approved endpoint before that bridge,
then observe real local HTTP headers/body,307 behavior, cancellation/deadline and body limits.
This is not actual supplier/TLS/DNS/region/account qualification or a paid-call result.

Credential and receipt callbacks that ignore abort cannot cause late sends. C2's policy endpoint
cannot diverge from the configured transport endpoint. Existing C0 policy and technical budget
checks remain in front of the transport. Post-response sink failure is exercised through the
existing durable wrapper with a controlled RPC seam and retains pending/unknown accounting;
this is contract evidence, not a fresh SQL or supplier billing test.

Receipts are closed non-content metadata: configured, attempted and response_buffered carry
different meanings. None grants C2 permission or proves processing location, SKU, contract,
semantic success or actual charge. Historical C0 artifacts are unchanged; unknown facts are not
backfilled. No real credentials, third-party model requests, DB actions or activation occurred.

Command outcomes are in http-transport-commands.jsonl. #193 remains open for actual permitted
provider/account/region execution and semantic/cost comparison. Remote worker, qualified C2
recipient and a deployed durable receipt sink remain outside this increment. No visible Web or
native changes: no browser/device reruns are applicable. Required PR CI and exact-HEAD independent
review remain merge gates; successful local checks alone do not establish release acceptance.

Before PR creation the branch was rebased onto main357551d (PR313). Provider source was
unchanged by that rebase. The combined contract suite212/212, typecheck and documentation
checks passed again. Earlier broader check counts above refer to the original main297 baseline;
required CI will verify the final combined HEAD. No local database test was invoked.
