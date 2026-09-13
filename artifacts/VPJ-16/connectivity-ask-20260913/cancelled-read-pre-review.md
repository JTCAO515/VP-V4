# Cancelled-work read projection: independent pre-review

Reviewer cancelled_read_review,2026-09-13. Plan only; no patch/test approval.

A read_grounded_turn status-only fix is insufficient: read_grounded_events still returns accepted-only history, and groundedEventFrames rejects a terminal projection without a terminal event.

Bounded proposal: only unfinished grounded results with a nonterminal public Turn may project same-owner cancelled work as cancelled, failed/quarantined work as failed. Keep projection pending and null result fields; never override public terminal states or infer success from completed work. Preserve persistent events/cursors; narrowly allow the corresponding id-less terminal projection in SSE and end heartbeats. Do not synthesize terminal history.

Required validation: actual session replacement followed by expired lease/normal claim; single/list/SSE initial and acknowledged cursor; queued/live lease and completed controls; foreign owner/old session/wrong policy/revoked consent/hidden result denials; unchanged Turn/events/grounded/budgets before and after reads; malformed terminal/cursor rejection; actual Native/Web cancelled rendering.

Implementation remains pending after SIM slice.
