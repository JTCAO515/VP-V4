# Original QA request cancellation — integrated source complete

Accepted QA base: f60c024441ec87e2dfe910c925a10119d99f62b4 (#710).
Fixed integrated source: a0554d52a41b592208ea77297cbc95f46b922d5d.
Scope: Related to #680 / #681, not completion of either parent Issue.

## Behavior and authority

- The browser explicitly confirms Stop. It rereads the original Session/request IDs
  and sends one closed-body POST under a reliable same-origin lock. Without that
  capability it keeps original-ID GET and does not send a stop POST.
- Only exact qa-cancellation/1 cancelled + observed shows Stopped. Pending,
  not_observed and unknown ACK do not prove non-admission, free usage or a refund.
  Recovery uses GET only; a definite rejection permits another human confirmation
  of this cancellation intent, without clearing original message identity.
- Cookie/Origin/CSRF and current actor/session/epoch/membership remain required.
  The new authenticated-only public.qa_cancellation_v1(text,uuid,uuid) resolves
  original QA lineage and delegates canonical Turn/event cancellation. No new table,
  queue, private helper, provider invocation or cost-ledger mutation was added.
- GET cannot register an account. Disabled generation consent/policy/budget does
  not grant generation or prevent metadata-only stopping of an owned request.
  Terminal results and existing Trip data remain intact; unknown costs stay unknown.
- Tab storage and hints contain only scoped opaque IDs/intent, never content,
  credentials or an authoritative result. Hints require canonical readback.
  HTTP401 invalidates old requests and clears private projection/journals.

## Source integration and review

Backend 05bdfaca + 67ae8a89; catalog proof156bb33f; UUID/portable delta ce780136;
native-PG harness111e1826. Web source2d6ca000 and four-P2 fix2f537fb6.
Main retained the final backend DTO; its only difference from the approved Web
copy is the explanatory not_submitted comment. Shared function ACL adds only the
new signature and its existing exact-role vector: anon/authenticated/service f|t|f.

Original review found one backend UUID defect and four unique Web boundary defects.
All were returned to their original owners and fixed. Fixed backend/UUID, Web and
final CI deltas each received independent Standards/Spec reviews with zero findings.
Reports retain the original findings beside the fixed reviews; no old FAIL is relabeled.

## Actual validation

- Main combined protocol/identity + real loopback route/SSR SDK: 24/24 PASS, 0 skip.
- Main final CI/governance/CLI-output checks: 33/33 PASS, 0 skip.
- Actual registered native17 driver: 17/17 node:test PASS, 0 skip/fail/todo/cancel.
  This is 16 subject tests plus one cancellation proof containing 14 original-role
  assertion cases, not 31 independent test cases. It replays the current complete
  Git SQL snapshot, checks catalog/ACL/RLS and uses only private0700 Unix-socket PG.
  Each owned PostgreSQL was stopped; the result file is private0600.
- Web original production component: 14 distinct controlled browser scenarios;
  after review, 8 affected scenarios passed (overlap is not summed), plus18 unit.
  Owners' type/lint/production build/docs pass evidence is retained in their artifacts.
- Main production build at958e4a9a PASS, then the changed Web fix at2f537fb6 built
  successfully in its owner branch. Main final combined typecheck at a0554d52 PASS.
- Required PG17 lane sets both explicit switches and rejects any skip/failure.
  Default integration's documented incomplete/skip convention and run-ci-suite.mjs
  are byte-identical to accepted QA; no new EXCLUDED reason or weaker gate was added.

Real GoTrue/PostgREST, target/shared DB application, provider/fees, device and target
end-to-end acceptance are UNRUN. Local synthetic claims and intercepted Auth/RPC
are not those proofs. Final exact-head GitHub CI and protected merge remain required.
