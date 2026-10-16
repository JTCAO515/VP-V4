# Fixed JT directive scope v1

This explicit profile binds only the two supplied JT messages (9fd/e4ac), their
actual report/acknowledgement contexts, known room, exact parent API return and
actual BestJ-to-Mac-to-Main transports. It does not reinterpret a report as an
approval question, require an approval keyword, or invent an explicit reply for
the final message. All five returned messages remain bound by the full raw pin.
The private actor identity is bound by that exact raw response and is not emitted.
Raw source records are private inputs and are not committed with this package.

`evidence-pins.json` is the fixed source descriptor, covered by the profile source
lock. The first native name remains `cloud_threads.send_message`; second hops
remain `codex_app.send_message_to_thread`, with their distinct actual record
kinds. `semanticProjection` is only a declared semantic label, never a renamed
native tool. Missing native call/result fields are not invented. The parent raw
read is explicitly parent-reported, not a Mac/owner independent upstream read.

The original legacy profile, fixed90d checks and ordinary/async schemas remain
available unchanged. `reviewed-diagnostic-window.py` takes an optional explicit
`source_profile`; only v1 is implemented. Its shared validation, preservation,
window, second-attempt, active/used marker and cleanup algorithms still run.
There is no mutation of legacy globals, runtime monkeypatch, fallback from an
invalid v1 configuration, new CLI/environment switch, or low-level restore entry.

## Qualified entry

Use `entry.run(core, args, typed_configuration, source_profile, start_budget=budget)` only after a fixed commit/clean execution checkout, independent fixed-source
safety review, complete relevant local checks and all original execution/record
gates hold. Repository CI/protected merge governs engineering delivery; it is not
an extra prerequisite for the newly authorized reversible local offline use. The
profile requires its source-lock digest, the base typed source-lock digest,
original capture/manifest/identity reference, exact original image, localOnly and
the unchanged60-minute/max2 scope. New human/start metadata filenames must have
the explicit directive-v1 prefixes directly under the original gate ROOT; old
records cannot be repurposed. A missing/changed field rejects before operator
reads. The entry and gate both verify the source/profile/configuration-bound code
hash; the original unsalted core hash cannot admit this profile.

The v1 qualification record contains `sourceEvidence = verify_sources()` (the
truthful hash-bound projection), version/status, fileDoesNotSelfAuthorize,
windowId/windowBindingSha256, target/capture/manifest/identity, scope/localOnly and
image. It is a technical qualification record, not a fabricated human signature.
Actual record paths/hashes and the seven preserved historical pins are explicit
configuration inputs. No source function creates actual qualification/START
records. Only the ordinary claim path writes a claim after all original gates.

At authorized START, derive the original actual window frame and
`window_binding(packet)`. This binds the fixed directive authorization, window
UUID/start/end, original material and identity, fixed image and max2/localOnly.
It intentionally excludes per-attempt repair/source hashes: those are separately
bound by `qualified_hash`, the packet and Main START. Then finalize the genuine
qualification record SHA, source-profile configuration and scoped code hash.
There is no now-plus-remaining replacement window or synthesized START time.

An additional `diagnostic-authority-<digest>.used.json` binds this authorization
to one window. Its key depends on actual directive IDs/room/source/capture, not
profile version, source revision, relay hash or chosen window. It is never deleted.
Attempt1 checks absence before acquiring the original capture-wide active guard,
then exclusively binds authority and consumes the original attempt marker.
Attempt2 must match that same window/human record/binding, and still satisfy every
original failure, cleanup, causal repair and independent-review gate. Existing
795/used records are never reset; UNKNOWN cleanup retains the original active
guard. A source repair cannot obtain a new window from the same directives.

## Validation boundaries

`test_profile.py` validates the actual supplied non-secret records when available
and mutates their in-memory copies for rejection tests. It uses the unchanged
legacy fixture builder for synthetic state/START records and isolated claim roots.
One synthetic identity reference is explicitly stubbed because the real identity
path/key is intentionally not read; wrong references still reject. This is not
actual material/identity acceptance. Missing private evidence is explicitly
SKIPPED on other hosts, never replaced with invented source data. No raw actor
identifier or original source bodies are printed in test output.

The base runtime image and all its inputs are unchanged. No PG/image matrix needs
rebuilding for this admission-only change. Actual execution remains NOT_STARTED
until a clean fixed candidate is independently safety-reviewed and locally
validated, with qualified operator configuration, actual START and every original
preflight condition. If used before merge, label it a local candidate, not delivered
or deployed code. No actual START is derived from human-message/model/old795 time.

## Mandatory run preflight

The public gate itself performs the single v1 preflight; an entry/facade cannot
assert that raw verification has already happened. It checks the real pinned
source chain before reading any operator record. Next it reads only the bounded,
non-secret `<packet-stem>.execution-header.json` next to a new
`directive-v1-packet-*.json` packet. `execution_header(packet, packet_sha,
identity_reference_sha)` defines the exact fields. It is metadata, not START or
consumption. No manifest/identity locator or secret content belongs in the header.

Before packet/human/START/history/material reads, the gate checks that header's
source/window/expiry/binding, capture-wide active state, permanent authorization,
used slot, and (for attempt2) the first failure/cleanup/consumption guard records.
Successful closed windows, replayed slots and another UUID for the same grant are
rejected here. The original full causal-repair checks still follow for an eligible
attempt2. The actual packet must immediately match the header's exact byte hash
and complete field projection before further operator reads.

A nonblocking capture-wide file lock serializes v1 run preflight through the
original atomic claim. Its empty inode persists; it is never START/used authority,
never deletes a marker, and failure merely releases the OS lock. An opaque
registered lease binds the checked args/profile/code/header; a fabricated verified
flag is not accepted by the internal continuation. The lock is released just
after claim, before restore. Original O_EXCL active/used/grant checks remain final
authority and protect races; early reads never replace consumption. Legacy run
behavior is unchanged. Positive run tests stub the data plane/manifest; they prove
ordering and Budget handoff, not actual material acceptance.

## START hard monotonic cap

At the real START event, sample monotonic before UTC, set the one-hour UTC end,
and create the original canonical Budget with `from_window(..., anchor=start_mono)`.
The driver must do this before record finalization. Pass that same object through
entry/gate; the directive path never reconstructs a Budget from later wall time.
Legacy paths retain their original construction.

Execution header v2 and packet carry `windowStartMonotonic`; window binding and
the permanent authorization record include it, and the Main START receipt must
match. Entry preflight checks the exact Budget class/clock functions, wall end,
original reserve/cleanup constants and `mono_end == windowStartMonotonic +3600`.
The run lease retains the original object and rechecks it before handoff. Missing,
replaced or enlarged budgets fail closed. Finalization delay or UTC rollback can
therefore only reduce available time; it cannot create a later monotonic end.
A second attempt retains the original window anchor, never a fresh one-hour clock.
No runtime monkeypatch or caller-provided relative duration is used in execution.

### Process-local clock continuity

The v1 preflight retains weak ownership of the first Budget, keyed by window,
with the creating process PID. A second attempt must present that same live
object in that process; serialized `windowStartMonotonic` is not proof of a
shared clock origin. A missing owner, reconstructed Budget, forked process,
or reloaded profile without the registry fails closed. This does not replace
source review, causal-repair, prior consumption, or remaining-budget checks.
There is no resume/import API and no backfill of old START records. In
particular, this change cannot resume the exited operator of window bda80610.
Future cross-process support requires a separately reviewed prospective clock
contract; changing Python versions cannot make an old scalar comparable.


START construction now uses `diagnostic_deadline.new_start_budget()` with no
imported clock values. It samples monotonic then UTC, binds weak object identity
and creator PID before returning, and retains the original deadline/clocks.
Entry and direct preflight verify this provenance before qualification metadata
reads. Fork before first preflight, reconstructed attempt 1, and a fresh factory
object paired with an old header are rejected. The older `from_window` remains
available only for unchanged legacy paths; it does not qualify a directive START.
This corrects the fc45 preflight-only registration gap; fc45 is not review-cleared.
