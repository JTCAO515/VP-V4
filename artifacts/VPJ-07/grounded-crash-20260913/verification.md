# S2 real worker crash before dispatch — 2026-09-13

Related to #195 and #196. This adds real Staging recovery evidence with unchanged runtime source; it does not complete either Issue or full S2.

The unmodified bounded worker CLI was started with its existing controlled owner/policy/budget. A short transaction locked only that test budget scope row. PostgreSQL then showed the task leased at attempt1 and exactly one `reserve_model_budget` RPC waiting behind that lock. The recorded worker child was killed with SIGKILL while provider invocation and budget-attempt counts were both0. The server transaction drained without persisting a reservation, and the test lock was rolled back. Neither lease expiry nor work state was edited.

A normal service restarted using the identical configuration. It returned empty polls before the original120-second lease expired, then acquired lease2 and completed the original Turn. The native App was terminated/relaunched during the wait; its question remained waiting without a Send action. It later read the answered result. Both native and Web owner sessions read the same original Turn/task, language and current12306 sources; the other controlled owner's result was absent from Web.

| Locale | Task | Original and recovered Turn |
| --- | --- | --- |
| en | bc0bce26-1fc1-46fe-9a30-d67a318b1578 | a322cdb9-f559-49fc-90bf-ae1a0de278f7 |
| zh | 334d4e50-5c15-46be-a46e-6f6b7c11e002 | 41d903b1-7bbc-4f85-ad96-ba78929125f5 |

## Results and version boundary

- Both checkpoint/recovery audits PASS. Each has two worker leases, one actual Qwen invocation, one settled model attempt and exactly one `worker-terminal-2` completed event. Database-time samples before/after the original expiry prove natural expiry timing. No request resubmission, manual budget refund or terminal override.
- Combined2 model attempts settled,0 unresolved,8124micros CNY (¥0.008124) using the existing conservative tariff; not a supplier invoice or user charge. Controlled totals69→71 Turns/attempts and321414→329538micros; Web added no model work.
- Main21b2086 at start; frozen worker1a539e1 has byte-identical affected runtime. Installed native318f83d on owned iPhone17/iOS26.5 Simulator, backend8022b5a (`dpl_8awNVN79DS1JdHVXY6VJE3UMhdg6`). No implementation or migration change.
- Web3278ed8 dedicated Preview `dpl_CZCsEXPfTzJtys7BpiBsPkaVaSVi` read current results. Do not relabel these receipts as latest-head Web deployment tests. PR344 exact3a6ee6f CI and PR345 exact333bc85 Quality34722358738/Preview are reused for unchanged behavior; no new local native/Web build needed for this evidence-only change.
- Native and browser logout observed; both normal recovery services stopped, both crashed children have actual SIGKILL receipts, lock-holder connections closed. read/Opsfalse,members0; migration41/users6/Trips3 and11published/1revoked preserved. WAF30→31→32 native, then32→33→34 Web restored the original host set. PR345's actual Production cancellation and preserved aliases are included; this slice grants no production activation.
- Local repository validation: docs check and diff check. Required PR checks remain a delivery gate. Native result observations here are bounded AX rows; prior visual/source-lifetime evidence is reused without a new broad visual-pass claim.

## Limits and next acceptance

This checkpoint is after a real lease claim but before supplier dispatch. It does not prove recovery after an actual supplier request, unknown-cost reconciliation, cancellation races, real OS background/freeze, stream tail usage, complete native streaming, physical/VoiceOver or Store acceptance. Current Qwen classifier/rail-document scope is unchanged; broader Ask knowledge/semantic coverage remains incomplete.

One initial3-second Web heading wait timed out while login navigation continued. A fresh read of the same live tab showed the authenticated workspace and14 articles; no service or request was restarted. Do not claim instantaneous login navigation. All actual fault/recovery assertions passed; no failed scenario was rerolled.

Reviewable copies of the executed orchestration scripts are under `observed-scripts/`; they retain explicit private-cache paths and must not be rerun as deployment scripts. Raw helpers/receipts remain `/Users/jtcao/Library/Caches/visepanda/grounded-crash-20260913`. Complete #195/#196 and S1–S6 remain open. The next integration should inspect and implement the native event-stream/reconnect gap using these now-observed stable Turn/task/terminal interfaces, while retaining the listed fault and knowledge gaps.
