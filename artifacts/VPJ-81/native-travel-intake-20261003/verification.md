# Native explicit travel intake consumer — local checkpoint

Base: main80fa7862 (#621 merged). Branch codex/vpj81-explicit-travel-intake-native-20261003, same isolated worktree; old #621 branch/evidence retained. Related to #562/#559; no whole-ticket acceptance.

## Implemented boundary

Current-goal-bound Ask entry and complete user-editable full projection, explicit unknown/null versus selected-empty arrays, full review and explicit submit, receipt followed by qualified GET/current state. No prose parsing, inferred Memory adoption, Trip write, Task/Turn admission, provider request or capability claim. Unknown budget does not invalidate a transport projection. Unrecorded adoption requires separate explicit current goal/policy reread; unrecorded response itself is not a write grant. Stale basis clears projection/qualification and keeps the draft for review; its correction CAS revision source still requires Main/backend closure. No guessed revision, automatic merge or write retry.

Fixed NativeSession GET/POST only; own AC8103 app/unit/UI refs. A983/A77D/B979/AC71 references preserved. Other product modules and all backend/SQL/worker files unchanged. GET/readiness/receipt decoders fail closed on extra/private keys, unsupported enum values and inconsistent qualification. Top-level unavailable has no content; internal capability-unavailable retains a qualified editable projection. current=false receipts cannot include digest and cannot grant current authority. Success requires exact request ID, source sequence/revision, full projection/Memory/digest readback. Actor/goal/policy changes, background, exit and explicit 401/403 invalidate old authority; blocked writes discard draft. CAS failure retains draft without repeating writes.

## Actual checks and limits

- PASS local affected native build-for-testing (app/unit/UI targets), final log /tmp/vpj81-intake-checkpoint-build.log. Includes current-state wording, retained stale-draft display and prepared UI target.
- PASS native unit12/12, zero skip, /tmp/vpj81-intake-unit5.xcresult: all-null full encoding, preserved corrections/explicit clear, closed negative wire, unknown budget, late actor read, unrecorded explicit review, CAS draft retention/no automatic retry, receipt-versus-basis, blocked draft discard, mandatory GET, exact successful readback and dismissed late POST.
- Historical test compile failures retained: unit1 fixture mistakenly supplied sessionID; unit2 argument ordering. No product runtime failure or PASS inference from these failed builds. Both corrected using actual NativeDataScope signature; unit3 seven tests passed, unit4 ten, unit5 twelve.
- PASS project plist, preserved main reference subset, own runner node syntax and diff whitespace checks.
- Registered existing5DB8E4CE Simulator/DD/tmp/vpj81-native-task-activity-20261002/base63220. Whole owned port tuple bind preflight PASS; no intake Auth server started.
- UNRUN real Auth/HTTP/SQL/native editor test: backend owner has not frozen/integrated yet. Dedicated runner requires an exact Main-frozen backend commit ancestor and real route before startup; prepared test is not runtime evidence.
- UNRUN physical iPhone, VoiceOver/large text/zh rendered UX, Staging/Production, provider, user acceptance and full #562/#559. Parent remains OPEN; no new partial PR.
