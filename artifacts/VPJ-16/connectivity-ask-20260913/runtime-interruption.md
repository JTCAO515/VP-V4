# Evaluation session interruption

Initial frozen run: 70 completed cases matched, including all 44 SIM cases. The next
English mobile-and-cash case received a provider response and a validated usage receipt,
but completion was refused after the evaluator mobile session was replaced by a native
App login for the same synthetic owner. The native login was started by this acceptance
run before the evaluator finished; this was an execution-order error.

Evidence: original mobile epoch 32 was replaced by 33; the new session was created at
2026-09-13T09:06:03.939369Z, between provider dispatch and completion. The old session no
longer exists. The attempt is settled at 10,314 CNY micros, with zero unresolved attempts.
The expired lease was cancelled through the existing scoped claim RPC; that cleanup made
zero provider calls. No authorization or session invariant was bypassed.

The interrupted process no longer existed after user interruption. Docker was stopped;
after restarting it, the reader was verified disabled and only the owned preview host was
removed from the WAF allowlist (version 58). All earlier raw run evidence is retained.

The continuation reuses the 70 passing results, explicitly retries the interrupted case
as a new task, and runs the 15 remaining cases. It uses the same frozen source and prompt.
Native login and submission must wait until this continuation finishes and signs out.
A future combined result must account for the interrupted paid attempt separately; it is
not an 86-call uninterrupted pass.

Continuation completed:16/16 matched, yielding86 unique matched cases and87 actual provider attempts.
The interrupted attempt remains separate; new native UI evidence adds two completed/settled attempts.
No stale-state defect is waived by semantic matches.
