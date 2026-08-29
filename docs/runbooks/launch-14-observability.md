# LAUNCH-14 observability runbook preparation

## Current state

No exporter, dashboard, alert destination, Staging runtime, worker/API consumer, or Provider is
configured by this repository change. Do not treat the local alert decision as an incident page or a
completed kill-switch drill.

## Required later rehearsal

After LAUNCH-07/08 own a runtime consumer and LAUNCH-02 establishes redacted Staging access, the
designated operator must perform the following in Staging only:

1. Enable the reviewed runtime feature configuration for a controlled test identity.
2. Inject one documented, non-content provider failure through the accepted test seam.
3. Verify the same server-minted correlation ID spans API, Turn, worker and Provider records and
   that no content, user identifier, key, raw payload or arbitrary label is present.
4. Verify the approved alert destination receives the expected alert, then acknowledge and clear it.
5. Set the approved chat kill switch off and verify a new call is rejected before Provider dispatch;
   verify that no budget reservation is made for the denied attempt.
6. Restore the prior Staging-only configuration, preserve only redacted evidence, and record the
   observation owner/window and any incident follow-up.

Never run this against Production, copy a credential into evidence, use real user content, or treat a
Preview deployment as proof. The operator must select alert routing, retention, access and Provider
terms before this runbook can become executable.

## Immediate rollback

If a future exporter leaks content or creates unbounded labels, disable that exporter and the chat
runtime flag using the approved Staging control, retain only bounded local metrics, and open an
incident. Repository rollback is a normal revert; no migration or data deletion belongs to this
preparation work.
