# Web500 resumed root diagnosis — UNKNOWN

Independent branch from main `b9309495e5ea3f0184b4ef54aa2d40b7fecff144`. #627 exact6e080612/run37074946142 native third continuity case failed: canonical_arrival→GET500→json SyntaxError and same cleanup Aggregate,4tests3PASS1FAIL/zero skip (`original-627-native-fail.log.gz`). No 559/560 SQL/TS or shared registry edits.

Observer-only runner change: stdout/stderr piped into a bounded in-memory parser, not a request interception. Retained per-stream pending≤4096 characters, line parsing≤4096, output≤96 fixed structured records. Only whitelisted error/cause/category, known code, safe relative source frame, proposal/confirm endpoint class/method/status and compile enum are emitted. No raw arbitrary SAFE-prefix line, raw body/headers/cookies/token/full URL, fetch override or NODE_OPTIONS. Unit1/1PASS confirms synthetic secret/header/URL text absent and bounded retention. This is diagnostic infrastructure, not a product fix.

Controlled warm/cold comparison approved by Main:

- Warm current `.next`: owned loopback ports64640/41/42/43/44/47/49/51 preflight empty; owned network/local Supabase unique project only. Existing actual harness4/4PASS, third10678.78ms; canonicalGET200 and recoveryConfirm200, no error cause captured (`uninjected-safe-server.log.gz`).
- Cold: same source/assertions/timeouts/observer and resources, only worktree's non-symlink `.next` renamed to unique preserved backup. No next process/file user or owned port active beforehand. Fresh cache harness4/4PASS, third24112.09ms; canonicalGET200/recoveryConfirm200, no error (`cold-cache-safe-server.log.gz`). Cache inode/device/mtime and originalRestored=true in `cache-identity.json`; cold-generated cache isolated in an owned `/tmp` path, original directory restored. No deletion/kill of other worktrees/resources. Harness-owned processes/stacks cleaned, ports free; Next-generated AGENTS/next-env and overwritten prior fixture baseline artifacts restored after teardown.

Neither pass reproduces the official500; cold cache is NOT established as cause. Safe records show only successful controlled endpoints/compile events here, not a causal error chain. Prior read-only response/cookie helper review found per-request client/collector and fresh NextResponse paths; no shared one-shot response reuse was demonstrated. No product hunk proposed without evidence. Root cause remains UNKNOWN; official FAIL retained, these passes do not erase it or establish provider/target/native/user acceptance.

Stop further repeats without a new testable hypothesis. Main may review observer-only diff for inclusion in #627's original owner batch to capture an actual CI cause; do not create a separate micro PR or call this a Web500 fix. Current conclusion/observer is local diagnostic candidate only.

## Observer evidence-budget review repair

Main identified that normal compile/status chatter could consume the total96 and hide a later500. Split fixed output budgets: ordinary compile/request records≤24; error/cause/code/safe stack≤72; total≤96. Frame capture now requires an actual stack `at ...` line (ANSI SGR removed before matching), not an arbitrary log path substring. No raw prefix/message/URL forwarding added.

Necessary helper2/2PASS, exit0/40.52ms (`observer-review-repair.log.gz`): a thousand ordinary messages followed by a late pipe/stream error still yields cause/code/safe frame; arbitrary path text is not a frame, synthetic header token absent, retained buffer bounded, flooded errors capped72. Formal runner syntax/diff PASS. No complete harness rerun for this pure observer delta. Product server500 cause remains UNKNOWN and the observer remains output-only.
