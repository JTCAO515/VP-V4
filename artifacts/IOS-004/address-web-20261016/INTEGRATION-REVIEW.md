# Read-only integration review

Reviewed Main actual commit `2273925f125ca2f7d3f4e96585545315b80427af`, parent `d1199893`, in `trip-address-main-20261015`. Main Canvas/Editor files were not edited. Existing AGENTS/online-address contract and the supplied exact integration scope govern this narrow review; no subagents were spawned under the task's explicit prohibition.

Standards: no additional actionable shared-hunk violation identified in this narrow integration diff. Stable editor observer, independent external block prop and real Section mount preserve sole-writer boundaries. Fieldset disable semantics and the complete event flow are for Main's actual browser check, not claimed by source reading.

Spec findings in owned Section, fixed locally:

1. **P1: generic settlement-epoch change could clear a later handed intent without its terminal receipt.** After rejection/applied P1, new P2 recorded the previous epoch; `addressPrepared(P2)` clears the old marker to `unsettled`. If a subsequent pending GET failed to null, the former `record.settledEpoch !== props.settledEpoch` check deleted P2. The new predicate requires exactly `applied:P2` or `rejected:P2`, a handed phase, a known receipt id and P2 no longer pending. Unknown intents never clear via an epoch.
2. **P1: hidden address diff did not prevent original Confirm while claims/review root was unavailable.** A handed intent released parentLock even when auth invalidation removed the only address diff; the old editor's general snapshot does not display address fields. A current server Cookie could still permit confirmation during a local claims-read failure. Section now requests the existing parent fieldset lock whenever pending has an address op and the review root is unavailable, including restored pending with no local ledger. Once requalified, original Confirm/Reject resume. No original handler or shared component modification is needed.

Main integration compatibility: existing epoch values already use the exact accepted tokens; existing `onAddressBlockChange` fieldsets consume the additional hidden-review lock, and that boolean remains excluded from Section's own external blocked prop. No new Main API/prop or source hunk is required for these fixes.

Added two regression cases against production predicates for both failures, retaining original contract/SSR/claims/HTTP evidence. Parent browser interaction, actual Cookie/DB and full same-version terminal readback remain Main-owned and UNRUN here.
