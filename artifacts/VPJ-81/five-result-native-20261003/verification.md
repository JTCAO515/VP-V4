# Native five-result lifecycle core — 2026-10-03

Related to #560. Native-only checkpoint for the original backend owner/Main to integrate as one result lifecycle batch; it does not claim the backend union has merged.

Implemented: one closed five-case decoder and safe SwiftUI renderer for comparison, proposal reference, immutable journey draft, explicit decision and saved translation. VP completed Task and Journeys owned Trip discover an exact artifact ID/revision then read that reference. Library v2 index preserves the same identity and rejects unknown schemas. Old v1 readers remain available. No generic editor, HTML/URL action or Trip write was introduced.

Decision choices require current decision and current referenced comparison/options. The first exact four-key request body and operation UUID are retained across explicit retries; concurrent submits are fenced. A valid immutable CAS receipt triggers only its exact next-revision GET, whose actual chosen content must match. Unavailable or actor denial clears state. Actor/scene/tab changes and generation/identity checks prevent late cache publication, including overlapping discovery requests. Historical readability remains separate from current eligibility. The v6 context decoder now uses the fixed 9700-unit preview limit.

PASS: final Xcode build and 4/4 NativeFiveResultTests, zero skipped, on owned Simulator 5DB8E4CE-76AA-48A7-8F9C-861AF1A25E6E with existing derived data /tmp/vpj81-native-task-activity-20261002. Bundle /tmp/vpj81-five-result-freeze.xcresult. Tests cover closed union/unknown schema/actions, exact identity/historical state, same-body owner CAS retry/exact next read and late selection/actor denial. The unchanged v6 tests also passed 4/4 after its preview cap change in /tmp/vpj81-five-result-unit3.xcresult. git diff --check PASS.

Initial FAIL retained: unit2 exposed JSONEncoder object-key ordering changing retry bytes; fixed by freezing Data on first explicit submission. Final source hashes identify the tested code; backend whole snapshot integration is separate.

UNRUN: native actual Auth against the final five-result backend union; physical device, VoiceOver/human flow, target/provider environment. These are evidence limits, not missing native core code. Backend final snapshot is still owned by the original #560 writer. No CI/merge/release/user-acceptance claim.
