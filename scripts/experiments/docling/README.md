# VPJ-73: bounded Docling correction-candidate experiment

Related to #288. This directory is an isolated experiment, not an upload endpoint, a new
service, or a Trip writer. The [result](../../../artifacts/VPJ-73/verification.md) is **REJECT
this particular pipeline/configuration** under its frozen adoption criteria. Quality and
safety can pass while incremental value fails. #201/#236 can use another qualified route.

## Frozen scope

`plan.json` and `fixtures.json` were committed before the first conversion at `e777ade`.
`artifacts/VPJ-73/preflight-freeze.json` records their byte hashes, the seven source files and
oracles, package lock, selected licences and weights. A setup-only supplement at `64d0d7c`
corrected the annotated Tesseract source tag, added its required TSV config, and corrected
the model architecture label **before any conversion**. No sample, oracle or threshold
changed. The first actual conversion is recorded under `20260909T203855607034Z`.

Six authored 1000×1400 screenshots cover English, Chinese, small/wrapped bilingual text,
missing fields, deliberate blur/compression, and instructions embedded as document content.
One single-page searchable English PDF is a control. All are synthetic, not tickets or
reservations. The stress image is intentionally degraded; its raw OCR is preserved.

Model: Docling 2.126.0 (`docling-slim` selected local extras), Docling Parse 7.18.0, Heron
`8f39ad3c…`, and Tesseract 5.5.3 with `eng`/`chi_sim` at `87416418…`. Full revisions and separate
code/model/font licences are in `artifacts/VPJ-73/license-registry.json`; actual package and
asset hashes accompany them. SmolDocling, remote services, external plugins, VLM, table,
picture and formula enrichment are not used. All model files are local safetensors/config
or traineddata; no remote Python model code is enabled.

## Reproduce on the measured platform

The measured host is macOS arm64, Python 3.12.14, with Tesseract installed at the frozen
Homebrew 5.5.3 Cellar path. Other platforms/binaries require their own validation; the runner
fails closed if `/usr/bin/sandbox-exec` or the pinned components are unavailable. It does not
fall back to network-enabled execution.

Use an isolated Python environment outside the repository. Install `requirements.lock`
with `uv pip sync --python /absolute/venv/bin/python ...`; install the fixed Tesseract binary.
The public download stage is separate:

```sh
python scripts/experiments/docling/prepare_assets.py /absolute/local/assets
python scripts/experiments/docling/run_experiment.py --assets /absolute/local/assets
python scripts/experiments/docling/run_guards.py --assets /absolute/local/assets
python scripts/experiments/docling/evaluate.py --summary /absolute/run/summary.json --guards /absolute/guards/results.json
python -m unittest discover -s tests/unit/docling -v
```

Use the environment's Python for all commands. `prepare_assets.py` writes observations in
the destination, retaining committed preflight files. `run_experiment.py` validates frozen
samples/assets/components before use. Original exact commands and paths are recorded in
`artifacts/VPJ-73/commands.jsonl`. The input spec and generator are provided for inspecting
provenance; benchmark runs consume the committed fixture bytes, not regenerated test inputs.

Every conversion child is launched under OS `deny network*`, with a new HF cache, offline
flags, no inherited credentials and two CPU threads. A socket probe must get EPERM in the
same sandbox. The parent supervises wall time and sampled aggregate RSS of its process
group. A timeout, cancellation or memory excess kills only that group and removes candidate
output. Limits are 2MiB input, 2M image pixels, one PDF page, 120s and 4GiB sampled RSS;
the stricter adoption RSS threshold is 3GiB. RSS monitoring is not an instantaneous kernel
allocation cap. Partial/failed parser output is not a completed candidate result.

## Provenance adapter, not a second parser

The initial adapter read high-level DocItems, which combine multiple labelled rows into
paragraphs and sometimes separate a value from its label. Those complete runs are retained.
Adapter revision 2 retains the pipeline's `Page.cells` with `generate_parsed_pages=True`
instead of letting cleanup discard them. It groups actual word cells by line and preserves
every source reference/bounding box. This changes output metadata retention, not model,
OCR recognition options, sources or adoption thresholds. The full frozen set was rerun
twice. The direct Tesseract baseline uses its actual TSV line positions and the same field
parser/scorer.

This retention behavior is visible in the pinned upstream [Page.cells accessor](https://github.com/docling-project/docling/blob/8071466f2c9f844d630dac879b3988dfb66e4277/docling/datamodel/base_models.py#L495)
and [standard-pipeline cleanup](https://github.com/docling-project/docling/blob/8071466f2c9f844d630dac879b3988dfb66e4277/docling/pipeline/standard_pdf_pipeline.py#L708).

The field mapper is deliberately closed to eight labels in this test envelope. It validates
date syntax/calendar values, decimal amount text and required provenance; it does not infer
missing time zones or repair `O` into `0`. Missing/invalid/conflicting data remain explicit.
Every value, even a correct-looking one, has `confirmed:false` and `requires_user_review:true`.
Document notes remain plain text. No commands, URLs or domain actions are constructed from
them. Conversion completion is not business success or a verified travel fact.

Timing includes a fresh process, Python imports, model construction, conversion and output.
The second repetition is a later cache-warm **process**, not a persistent in-process model.
The raw worker `conversion_seconds` field also includes function-local imports; scoring uses
the supervisor's complete `elapsed_seconds`. No throughput claim for a persistent service
is inferred from this experiment.

## Existing contract and future integration

The existing `lib/server/artifacts/user-artifact.ts`/`docs/contracts/user-artifact-c0.md`
accept already user-corrected, redaction-declared segments and reject raw media/OCR payloads.
These experimental candidates **cannot be passed directly** to that confirmation store.

Before #201 integration: establish the real actor/data-retention policy; display original
source and field boxes; let the user correct values; validate IANA zone/offset and convert
local times to the contract's UTC instants; map service identifiers deliberately; obtain the
existing redaction/confirmation evidence; then use the authorized proposal path. Origin,
destination, amount and currency are not fields of the current closed segment contract.
Any extension is owned by that task, not this experiment. Do not invent Trip IDs or receipts.
#236 still owns actual multipage/share input, page limits, missing pages, cleanup and runtime
acceptance. A rejected Docling route adds no blocker to either parent.
