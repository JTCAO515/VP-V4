# Bounded QA acceptance dispatch control

Base: `575941ae37b6ff0c6b3c74ea485ceedbe40cf52b` (QA #754).
Core checkpoint: `728eafbea44f242010d860293048caa2402a8f16`.
This independent #680 increment adds no migration, model selector or provider fee
authorization. Historical c2 source/log hashes are in `wired-proof.json`; the root-stop repair
and current runtime qualification are separately pinned in `root-stop-proof.json`.

## Behavior

An optional closed acceptance grant travels inside the original canonical /4
profile. The canonical target validator retains profile SHA256, exact target,
disabled startup, restart:no and baked-build validation. Acceptance additionally
requires the full 40-character source SHA, exact actor/policy/scope/notice,
configuration/version and canonical job digest. Tariff6/24 CNY per million,
reserve6303744 micros, max_tokens512, timeout15s, concurrency1/groupLimit1 are
closed for this acceptance mode; old profiles keep their existing behavior.
The existing three emitted runtime lines already carry the profile, so the
installer shell and its non-QA branches did not need changing.

The real CLI verifies the existing canonical private run journal before reading
credentials. It cannot initialize, truncate, replace or rearm a run. The original
journal owner can explicitly provision its metadata once, only after separate
authorization/activation gates, using initializeQaAcceptanceJournal. The grant
JSON is configuration, never self-issued money/identity authorization.

The root supplies the independently bound controller to the original worker and
executor. An exclusive no-follow filesystem lock covers claim through dispatch,
usage, settlement and completion. Before physical transport, a durable intent
records only original Turn/attempt IDs and request digest. At most two intents
can send; retrying a Turn under another lease refuses. Unknown or failed usage,
ACK, output bound, settlement or completion stops the run and preserves original
pending budget. Expiry refuses new sends. Existing ordinary auth/consent/budget
and default-disabled gates remain in place; no second monetary ledger is added.

Every restarted/concurrent instance must share the original sole host persistent
journal directory and immutable canonical grant. Missing, truncated, mismatched,
unresolved, stopped or exhausted records fail closed. Abandoned locks have no
automatic expiry/steal/reset operation. Deleting the journal, reinitializing it,
switching directories/hosts or issuing a new run is not an authorized recovery
path. This is not a distributed cross-host or privileged filesystem-tamper proof.

## Verification

- Core seam:19/19 PASS, zero skip (checkpoint evidence, not added to later totals).
- Wired QA/service/profile/discovery and original hosted CLI:98 PASS/0 FAIL,
  three existing opt-in DB consumer SKIP (no target/PG matrix requested).
- Canonical package and actual installer parsing:2/2 PASS, zero skip.
- After independent P2 correction:16/16 PASS, zero skip, including actual child
  processes, concurrent lock contention, crash lock retention and four injected
  filesystem durability faults; original hosted root/context/transport exercised.
- TypeScript, source policy lint (902 files), docs and diff checks PASS.

Actual local Node is26.8.2. Real CLI file execution is tested with Node preload
module mocks: exact ready journal reaches a deliberate mock secret-stage stop;
missing/expired/stopped/foreign tuple/build refuses before that stage, with zero
real secret read or network. The later qualification below separately executes Node22. Final same-source
baked-image identity, file-secret installation, hosted startup, target Auth,
provider billing and device acceptance remain UNRUN.

## Retained failures

The first CLI test used node-e and hit the existing argv guard; the test was
corrected to execute the actual entry file, without weakening production checks.
Two old loopback health tests failed under sandbox EPERM; the minimal local bind
probe confirmed it, and the unchanged tests passed with local socket permission.

Independent review found a real P2: terminal success could be fsynced, the lock
unlinked, then directory fsync fail, reporting unavailable while permitting a
successor send. Initial lock fsync failure had the same cleanup problem. Fault
injection reproduced2 PASS/2 FAIL. The fix keeps the lock during all fallible
durability/close operations, poisons initial sync failure, and makes unlink the
last release operation. Fault injection now passes, including unknown terminal
file-fsync ACK and unlink refusal. A crash may resurrect an un-fsynced lock
deletion, which only refuses further work conservatively.

All failed logs remain. Public logs replace only absolute worktree prefixes;
original raw digests are recorded. No real profile, secret or customer text is
included. Real target/provider/fee/deployment actions were zero. Source completion
does not permit activation: current exact actor/consent/configuration/price/budget
receipts, separate fee approval, independent review and protected delivery remain
required.

## Root pre-lease busy-stop correction

Independent c2 review found one more P2: B could lose its pre-lease stop while A
held the attempt mutex. The real-root test reproduced C completing a second send
after B failed and A succeeded. A canonical .stop veto now persists independently
of the attempt mutex; heartbeat/discovery/journal failures do not silently drop
it. Existing and future permits consult the veto, and completed in-flight work
retains its original result/usage/hold semantics. No lock is stolen or stop marker
automatically removed. A later instance and an actual child process both have
zero claim/send. Local affected tests:17/17 PASS, zero skip.

The same17 tests also PASS on actual Node22.23.3 from the already-cached pinned
linux/amd64 image, with fixed6048 source exported from Git and mounted read-only.
Network none, no keys/credentials or runtime profiles mounted, nonroot, readonly
filesystem and private temporary storage; owned container removed and verified
absent. This qualifies the affected Node22 entry/guard code, including deliberate
mock stop before real secrets. It does not make the older image a new same-source
baked image or prove actual host/provider acceptance.

The entire candidate diff from728 now passes whitespace checking; only trailing
whitespace in public failure logs was normalized. Raw copies/digests and all FAIL
facts remain. No test matrix was rerun for whitespace. Remote branch remainsc2
while its separate rejected PR publication is unresolved; this repair is local.
