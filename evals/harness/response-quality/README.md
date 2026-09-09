# VPJ-72 local response-quality and blind-review workflow

Related to #287. This is a complete **offline artifact workflow**, built on the existing
`evals/harness/pairing` schema, basis/version hashes and report rows. It does not run a model,
route requests, change assistant-output-v1, write Trips or provide another evaluation platform.
The normative content/tone rules remain `docs/contracts/vp-response-policy.md`.

## Generate the local package

From the repository root, consume the existing mainline pairing artifact and owned examples:

```sh
node --experimental-strip-types evals/harness/response-quality/cli.ts prepare \
  artifacts/VPJ-70/results.json artifacts/VPJ-72/owned-samples.json \
  artifacts/VPJ-72/local-review unchanged
```

The final argument selects `reports.unchanged` in the existing pairing file. A standalone paired
report also works. Baseline-only, unknown versions, mismatched basis hashes and wrong row references
are rejected: this A/B workflow needs both lanes. It does not replace baseline-only collection.
Every parent row must retain the frozen basis case/mode/risk and development group. Current
paired-v1 has 12 row slots (one H01 case × two lanes × en/zh × three repeats), with unique
1–3 repeat tuples, a single distinct configuration per lane, unique nonempty English run IDs
and unrun Chinese slots. Run IDs remain opaque, as allowed by the existing pairing contract;
their text is not treated as an encoded case ID. This row count is separate from the canonical
12 independent scenarios.

The generated files are:

- `review.md` / `review.json`: identity-blind A/B presentations and bilingual rubric anchors.
- `feedback-template.json`: editable feedback with no default scores or preference.
- `state.json`: **maintainer-only** source/mapping/exposure/feedback state. Do not give this file
  or `results.json` to blinded reviewers; they contain the lane mapping.
- `results.json` / `summary.md`: deterministic failures and unreviewed semantic dimensions,
  then source-labelled observations after import.

A local random seed counterbalances the first A/B assignment; the second presentation reverses it.
No provider/configuration names, fixture contrast labels, trace scores or mapping appear in the
reviewer projection. Exact response text and task/evidence context are shown. Markdown quotes
escape HTML and link/image brackets; sample content is never executed. This hides A/B identities,
not the fact that examples are authored and exposed development fixtures.

## Score and import

Use the seven dimensions in `rubric.ts`: current goal, evidence/qualifications, next step,
applicable preferences, density, English naturalness and situational tone. Each has English and
Chinese 0/1/2 anchors from the VP response contract. These are descriptive labels, not frozen
adoption tolerances. Use null with an empty reason/quote for NOT_RUN. N/A is allowed only when
specified by context/language, with a reason and no quote; it never contributes a full score.

Each numeric observation needs a reason **and an exact excerpt from that displayed answer**.
Excerpt membership only anchors the review; it does not judge truth, usefulness or naturalness.
Hard semantic failures have explicit categories and must also have an anchored observation.
Humans may choose A, B, tie or both_fail. Swapped votes are mapped back to the same response;
inconsistent preferences across the two orders are retained as disagreements, never averaged away.

For an actual local manual review, replace every placeholder; use a pseudonymous reviewer ID
and a `human:` record reference with `method: manual-local` / `attribution: operator-declared`.
The importer cannot authenticate a person: source is an explicit local operator attestation,
not identity verification or judge calibration. Fixture provenance uses `fixture:` references
and the fixture mode. Merely relabelling fixture source as human is rejected.

```sh
node --experimental-strip-types evals/harness/response-quality/cli.ts import \
  artifacts/VPJ-72/local-review/state.json /path/to/completed-feedback.json \
  artifacts/VPJ-72/local-review human
```

Prepare refuses an existing review directory; import cannot replace a newer state with one
that drops existing feedback. Each generated file is replaced atomically.
Every JSON input file and the accumulated serialized `state.json` must fit **2,000,000 UTF-8
bytes**, including JSON formatting. Individual 8,000-character field and 200-feedback limits
still apply; satisfying them does not waive the total state limit. Before creating/replacing
any file, the CLI serializes the prospective state and returns `STATE_FILE_LIMIT` if it is too
large. Existing state, results, reviewer files and feedback remain unchanged, and a later small
import can continue. No reasons are truncated or old records dropped to make the import fit.
Further reviews can be kept in a separate explicitly prepared artifact; originals remain intact.

Repeated identical feedback is deduplicated by source/reviewer/presentation, including a resubmission
with another record ID. Conflicting content is rejected rather than overwriting history. Wrong
case/language, bundle hash, rubric version, source, score applicability or quote is rejected before
any result is replaced. Update a correction through a new explicitly prepared review/version;
this tool does not silently amend existing reviewer decisions.

## Deterministic versus semantic evidence

The fixture trace checks actor scope, allowed/revoked context IDs, typed fact values against an
eligible unexpired receipt, and actual action receipts. A queued human request is not accepted;
Trip claims require the matching confirmed proposal revision; cancellation/refund claims need
receipts. A structured unavailable outcome on a known-answerable task fails that task.
A hard failure is never compensated by a high soft score or a preferred A/B vote.

These are **declared typed fixture traces**, not a production trace adapter. They are not inferred
from the response text. A wrong sentence with a valid trace stays semantic NOT_RUN until reviewed;
no keyword scanner pretends to prove arbitrary prose. Fixture labels produce
`fixture_annotations_only`, preserve their source and leave human-unreviewed dimensions visible.
Human imports remain `human_declared_review`. Real provider pairing, human calibration, adoption,
usage and costs are not established by either type of import.

## Sources, languages and exposure

Only self-authored `owned_synthetic` responses with VP-V4 ownership, revision/original ID and
`offline-evaluation` permission are accepted. Existing `assistant-output-v1` validation is reused;
this text-only package disallows cards/Proposal and unknown output fields. No third-party code,
weights, tutorial text, model judge or external dataset was added. Node standard libraries and
already-pinned project code are sufficient; no package or lockfile changes.

External examples are currently rejected. A future approved import must separately establish
repository/resource ID, immutable revision, original row/source, transformation and data licence;
NC material or unknown rights cannot enter through an owned-synthetic tag.

The canonical suite is read through **case ID/group metadata only**. Its 12 cases, 8 development
and 4 holdout remain unchanged; no holdout task/input/oracle content is read or tuned against.
All 20 authored response variants are exposed development material linked to H01, not 20 new
independent cases. The original pairing's Chinese/staging NOT_RUN fields remain unchanged.
Chinese fixture text exercises this tool's Chinese review path; it is not a new live Chinese
producer or completed #267/#268 acceptance. Per-language failure and human-unreviewed counts stay
visible; no averages hide a failed sample.

## Reproduce the complete owned-fixture flow

```sh
node --experimental-strip-types --test \
  tests/unit/response-quality/quality.test.ts \
  tests/contract/response-quality/entrypoint.test.ts \
  evals/harness/response-quality/response-quality.evals.test.ts
```

The eval uses the mainline pairing producer to create its input JSON, invokes the same CLI to
prepare a package, and imports **fixture** feedback. It regenerates only its owned fixture artifacts in `artifacts/VPJ-72` (and refuses to overwrite
human feedback there), with English and
Chinese positive/negative contrasts, order swaps, ties and both-fail results. Separate adversarial
checks cover wrong owner, withdrawn context, expired/wrong evidence, missing action receipts,
source relabelling, duplicate/conflicting feedback and version/hash/case mismatches. Tests use
no network/provider/Auth/DB or real user text. The simulated human-source parser test does not
write human-scored evidence. #287's offline scope may be reviewed independently; #267/#268's
real provider, human calibration and adoption gates remain UNRUN.

Rollback only this new derivative package/entrypoint; preserve existing pairing and stored feedback
and do not change live configuration. Shared HF README/manifest/handoff remain owned by root.
