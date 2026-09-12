# Grounded native service continuity — real Staging

Related to #195/#206, S2. Worker main2aa489d, native318f83d, unchanged backend8022b5a
on dedicated Preview dpl_8awNVN79DS1JdHVXY6VJE3UMhdg6 and Supabase Staging41.
Uses the two existing controlled owners, v2 development notice/consent, reviewed
rail facts and existing Qwen budget limits. Runtime code/configuration policy was
not changed; this completes additional observations of the merged implementation.

English and Chinese each passed the same actual native sequence:

1. Start the existing20minute/5second-poll service, observe empty polls, then send
   one ambiguous question from the installed app. The service automatically
   produces clarification; the app offers continuation of that same task.
2. After one finished poll and at least two further empty polls, gracefully stop
   the service. Send one complete restatement as clarification, without choosing
   New question. SQL observes a queued second Turn on the original ServiceTask.
3. Terminate/relaunch the native app while the service is stopped. The same Turn,
   parent and task remain queued; model attempts remain exactly1, with no resend.
4. Restart the service using the identical immutable configuration and expiry.
   Its first poll processes the existing Turn into an answered result with the
   reviewed railway document facts. The app displays that exact restatement's
   answer; the task has exactly2 settled attempts. Stop after two idle polls.

Totals: two tasks, four intended Turns and four distinct real Qwen invocations;
all4 attempts settled,0 unresolved,15876micros CNY using validated provider usage
and the existing conservative tariff (not an invoice). Journals preserve prompt
v2, configuration digests, destination receipts, repeated empty/finished polls
and all four normal service-stop receipts. App UI/SQL evidence is retained at
queued, restarted and completed checkpoints. Current-input-only egress is covered
by the unchanged protocol/worker code and previously retained envelope tests;
provider journals record destinations, not an inspection of provider internals.

All services are stopped. Native logout removed factual access; read/Ops are off,
active members0, users6/Trips3 and publications11/revoked1 preserved. WAF version22
removed only this Preview host. No new deployment, schema/policy/consent definition,
budget limit, launch agent or production alias change was made by this test.

This demonstrates graceful idle stop and queued-work recovery, not a provider
crash-in-flight or a promise that supplier attempts can never duplicate billing.
The existing fault/isolation tests retain their own scope. Full five-outcome native
acceptance, broader knowledge, Web same-chain integration, physical/VoiceOver and
complete S1–S6 remain open. JT's earlier phone-verification deferral remains in force.
