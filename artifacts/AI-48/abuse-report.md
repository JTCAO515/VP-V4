# AI-48 synthetic abuse report

The deterministic security fixture covers per-task exhaustion, per-user exhaustion, raw-field
rejection, one-turn deadline, model-step ceiling and tool-step ceiling. Rejected attempts are not
charged, so a rejected replay cannot exhaust another quota slot. No live load or provider-budget
measurement was run.
