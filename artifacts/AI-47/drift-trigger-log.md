# AI-47 C0 drift trigger log

Synthetic contract coverage records two drift cases: a returned-model mismatch and an observed-version
mismatch. Each produces `drift_detected`, returns the fixed `conformance` and `eval` check labels, and
leaves promotion at `hold`. This is a deterministic metadata result, not a provider observation, queue
dispatch, job schedule, or routing change.
