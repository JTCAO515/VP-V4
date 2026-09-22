# VPJ-09 explicit duration and interest boundaries

Related to #197. Initial base: `186c61ca05ba0180f9219a11c78b08b67924e66b`.
This follows merged #509; its historical evidence is unchanged.

## Source-confirmed defects and intended correction

- `4 or 7 days` previously selected **7**, because only the last number was
  immediately followed by `days`. `4 days or 7 days` selected **4** from an
  ascending search. Both now refuse to choose an unconfirmed duration.
- `十四天`/`二十四天` previously matched the substring `四天`. Complete quantity
  recognition refuses unsupported whole counts. `14 days` already failed in
  the old implementation; its rejection is retained as a regression boundary.
- `food but no walks` previously enabled both interests. The explicit exclusion
  now removes walking; English keyword boundaries exclude `walkman`, `sidewalk`
  and `seafood`. Conflicting or ambiguous negation refuses an outline.

Only `NativeRelativeOutline` and its existing native state test file change at
runtime/test level. There is no new parser dependency, NLP system, constraints
framework, UI, endpoint, DTO, persistence, preference consumer or writer change.
Nil results retain the source request and reuse the current editable-input path.

## Verification status

- PASS: source/diff review of the bounded match rules and call sites.
- PASS: `git diff --check`.
- Local Swift syntax, model execution, XCTest and docs checks: **UNRUN** under
  Overall's shared-host resource freeze. No local test, build, install, database
  or Simulator was started. Source review is not an executed regression result.
- Added XCTest coverage for both alternative forms; numeric, Chinese and spelled
  whole quantities; explicit supported four-day input; food-only exclusions;
  reverse exclusion; ambiguous/double/shared negation; unrelated word fragments.
- Normal PR Linux and single-runner Native CI results will be recorded on the PR
  for its actual head. Do not reuse #509's green checks for this new implementation.
- #509's four real planning UI cases remain **UNRUN** pending their exclusive
  environment window. Existing local synthetic model evidence is not UI acceptance.
- Saved preference consumption still awaits K/#199's merged contract and a real
  planner consumer. Full time/budget/fixed-item and both-client target acceptance
  remain open; this correction does not close #197.

Rollback: revert this increment to restore the previous input recognizer. No data,
schema, provider, account, spending, production or shared-Staging operation occurs.
No global handoff or issue-plan files are changed; Overall owns those updates.

## Overall daily-review follow-up

Independent review found two exclusion gaps: bare `don't`/`don’t`, and Chinese modifiers between negation and an interest. The explicit vocabulary now covers bare English contractions; unhandled Han qualifiers such as 不要长时间步行 reject the outline instead of adding walks. Existing direct exclusions, duration ambiguity and keyword boundaries remain. Six focused cases were added to the existing XCTest method.

PASS: actual NativeRelativeOutline source extracted into a Swift 6 Foundation probe; 26 cases show 5 failures on `30a40915` and 0 after the correction. The first probe itself failed Swift 6 global actor checking; its helper was correctly annotated MainActor before comparing identical baseline/candidate vectors. This is a probe-input fix, not a product change or an iOS runtime pass. Swift source syntax, docs and diff checks PASS. Full native CI remains required on the updated PR.
