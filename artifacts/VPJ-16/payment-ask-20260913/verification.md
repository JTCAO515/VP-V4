# S2 payment Ask — scoped Staging acceptance

Related to #195 / #206; PR352, base c53392220e04c98028fa565812bf29893d96e358.
Runtime d15baf7a94a4740e6c2a801bb5bd2d58e3fd3059; matching API, worker, Web and native.
Preview dpl_3vnNKwFgfzZhcUzPjZxN6KQpjREo; private original logs retained in
`/Users/jtcao/Library/Caches/visepanda/payment-ask-20260913/`.

## Result and contract

Current-input classification now supports general mainland-China card acceptance checks,
mobile merchant setup, obtaining RMB cash, their three exact pairs and an all-options overview.
Fees, rates, specific acceptance, transfers, failed transactions and payment execution are not
inferred from these procedures. A separately requested unsupported need remains unanswered.
Existing railway-document classifications remain supported. The model receives no knowledge,
source, history or Trip content; facts resolve only from eligible reviewed publications.

The new private question definition binds exact subject/predicate/object relations. Resolver,
completion and readback retain locked original publications, immutable historical missing claims,
owner/consent/dispatch checks and post-lock lease expiry checks. The card-acceptance publication
remains revoked. Mobile+cash does not inherit an unrequested card obligation. Web retains the
question identity; native cards and labels describe the actual payment scope.

## Observed verification

- Local PostgreSQL question10/10 and grounded12/12; contracts12/12; native model12/12.
  Corrected migration ordering was separately verified with both PostgreSQL suites22/22.
  Lint, typecheck, Web build and native builds passed. Local model tests are not runtime UI tests.
- Independent shared-contract review initially found2 important issues (rail-specific payment
  copy and unnecessary card obligation for mobile+cash); both fixed, re-review0 critical/0 important.
  Staging migration and immutable-policy execution received separate0/0 source reviews.
- Real Staging backup encrypted with existing Keychain storage; full isolated restore passed.
  Append-only migration42→43 preserved78 original table digests and checked260 schema entries,
  with only4 declared functions changed and1 private helper added. RLS/ACL/private helper denial,
  publications, users6 and Trips3 preserved. No applied migration was rewritten.
- New immutable policy `6e1c3992-053e-434c-978b-8dca62f08f66`, notice
  `development-payment-intent-v3`, exact24-hour development window. Existing rail policy,
  consents and budget scopes were preserved. New consent occurred through normal owner APIs;
  operator installation created no user consent. Recipient and existing provider price unchanged.
- Frozen42-case bilingual semantic set:26 payment/boundary cases plus16 unchanged rail regressions,
  PASS42/42, exactly one worker launch per case, no re-roll or post-result threshold change.
  Admission replay reused the same Turn; foreign-owner history excluded each Turn. Real outcomes
  include mobile/cash, exact pairs, overview, revoked card, fees/transfer/specific-ATM refusals,
  partial extra needs, clarification and instruction-injection boundaries.
- Actual signed native iOS26.5 Simulator: normal en/zh login, current notice and existing consent
  readback; each owner submitted one new card+mobile question through the UI. Real worker1/1 per
  locale completed; exact input, intent, single scope and original partial outcome matched SQL.
  Both rendered the payment interpretation, withdrawn card gap, appropriate next step, supported
  mobile procedure and qualifiers. Sources disclosure controls were present; the final native
  source-expansion screenshot did not establish expanded links and is not claimed as such.
  Both owners normally logged out; owned Simulator shutdown/deletion completed.
- Actual authenticated Web en/zh: saved payment outcomes, partial/generic/payment-specific blocked
  copy, conditions, exclusions and expanded PBOC source context verified. Desktop1280×900 and
  mobile390×844 screenshots inspected; no horizontal overflow and no warning/error console logs.
  Normal logout verified for both owners, owned tab closed and viewport reset.
- Final live SQL:118 controlled Turns/118 attempts/650346 CNY micros total; delta44/44/308118.
  The new policy has44 distinct Tasks, each exactly1 settled attempt,0 unresolved. These are
  conservative frozen-tariff ledger values, not an invoice or a user payment.
- Cleanup completed04:06:36Z: readerfalse, Opsfalse, active members0; WAF46→47→48 changed only
  this Preview host, production target unchanged. Workers exited, users6/Trips3 preserved.
- Runtime-head CI passed: Native34735053264, Quality34735053282, Budget34735053276, Vercel
  4BgJsLK317kNLyysZQMZQj2UV52f. Documentation/evidence delivery checks are tracked on PR352.

Sanitized receipts, frozen cases, evaluated outputs and screenshots are under `staging/` with
SHA256 manifest. Detailed local logs and xcresults remain in the private directory above.

## Retained failures and limits

The first filename sorted before already-applied migration42; caught before Staging apply and
renamed to `20260913090000_vpj_16_payment_questions.sql`, with ordered SQL suites rerun.
The first unexposed Preview used the old rail-only policy; a new immutable policy and correctly
bound Preview were created before any real case. An initial process-list probe hit invalid UTF8;
replacement-decoding inspection then completed. No-active-lease is not proof of an empty queue.

The initial unsigned Simulator login reached credentials HTTP200 but Keychain failed -34018.
Retry-session/relaunch did not restore a saved credential. Signing only the outer bundle did
not resolve the observation. Rebuilding the same source with Xcode
`CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-` passed credentials/login/profile HTTP200 and
normal Keychain operation. No Apple account/certificate/profile change or storage bypass occurred.
The AX typing tool cannot enter Chinese keycodes; after confirming an empty draft, the synthetic
question was pasted through the normal UI and sent once. Screenshots captured during rechecking
or before viewport settling were not used as final answer/layout passes.

Physical-device payment acceptance, native expanded-source links in this window, full #195/#206,
S2 and S1–S6 product acceptance remain open. No production release is claimed.

Rollback keeps scoped reader/worker integration disabled before reverting consumers. Preserve
publications, revocation, saved answers and budget records; do not turn payment history into rail.
Database reversal requires a reviewed forward migration. Older clients reject unknown intents;
only matching consumers were exposed during this bounded window.
