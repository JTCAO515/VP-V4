# Native source navigation — actual Staging, 2026-09-13

PASS: a fresh ad-hoc signed Simulator build from main
`bddeaf34bb596fe89de4ae7b5f90ecec36e9838e` showed the English historical payment
answer’s date as `Reviewed: Sep 13, 2026` on the Chinese-system Simulator. The inspected
`en-source-open.png` also shows the publisher and printed/PDF page locator. This verifies
the PR #355 date fix in the actual Staging consumer, beyond its previous Foundation probe.

PASS: tapping that visible publisher in the native app opened Safari and rendered the
People’s Bank of China-hosted payment-guide PDF. `pdf-destination.png` shows the PDF cover,
pbc.gov.cn and system return link; Safari’s first-use tooltip remains visible. The address
field was inspected through normal UI and exactly matches
`https://www.pbc.gov.cn/goutongjiaoliu/attachDir/2025/12/2025123019292710592.pdf`
(`pdf-address.json`). The card’s locator is informational; automatic navigation to page 5
was not observed or claimed. The PDF is an external source, not a VisePanda asset or grant
of reuse rights. This screenshot is test evidence only.

PASS: the system return-to-VisePanda link returned to the app; the saved partial answer
was present after its normal evidence recheck. Normal Profile logout showed `Signed out`.
The owned Simulator was shut down and retained. One earlier attempt to locate the source
button encountered the normal evidence-recheck placeholder; no link tap occurred then.
The successful attempt used a fresh hierarchy and actual button tap.

API runtime remained the existing scoped Preview
`dpl_3vnNKwFgfzZhcUzPjZxN6KQpjREo` /
`d15baf7a94a4740e6c2a801bb5bd2d58e3fd3059`; no server deployment or product code changed
for this evidence slice. The native historical Turn remains
`f96139fd-98f7-4f2a-8ff7-e2a917bc7e6e`, ServiceTask
`d57d7a0e-b80e-41c0-bc2c-42af166e6e41`, associated by exact synthetic question and prior
recording in `artifacts/VPJ-16/payment-ask-20260913/staging/scoped-audit.json`.

The bounded window exited 0: WAF54→55→56 changed only the owned Preview host and preserved
the production target. Reader/Ops are off and active review members zero. Actual SQL
pre/post counts match: 43 migrations, 118 attempts, zero unresolved, 650346 CNY micros,
3 Trips. No new question, model call, consent change or Trip write was submitted. Counts
do not independently establish full-row invariance.

Validation: signed native build and signature verification PASS; actual UI observations
above PASS; docs and diff checks PASS. Existing product tests are reused from PR #355.
Physical-device behavior and full #206/#264/S2 remain UNRUN/incomplete.
