# Native reviewed-date language fix

Observed defect: the actual English native source screenshot in PR #354 showed
`Reviewed: 2026年9月13日` because the shared card used the device default locale.

The card now uses the same explicit zh/en selection as its text. Ask historical answers,
reviewed questions and Travel notes share this renderer. No API, knowledge eligibility,
source date, time zone or data permission changed.

PASS: native generic Simulator build, Xcode at `/Applications/Xcode.app`; unsigned local
build only. PASS: the exact date expression extracted from the changed source yields
`Sep 13, 2026` for English and `2026年9月13日` for Chinese under both zh_CN and en_US
system locales. Evidence includes the executable probe and actual logs. This is local
Foundation behavior, not a new Staging/device UI acceptance claim.

PASS: docs and diff checks. Local full product tests not repeated for a one-expression
formatting change; required PR CI remains applicable. Updated Staging UI and physical
device checks are UNRUN; full #206/S2 remains open. Rollback: revert the format expression.
