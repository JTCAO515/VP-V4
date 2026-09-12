# Ops Staging route — 2026-09-12

Related to #204; baseline bc082fb. Started 11:48 CST. Runtime source337550e is implemented and observed on the isolated Staging Preview
`dpl_BfFfopqkxLxH5cULkDKbwoPUoWFH`. Required PR CI remains pending.

The existing local-only gate prevented the already implemented candidate/review
transaction from being exercised on Staging. A separate default-off mode now
binds that transaction to the existing Staging database and exact project Preview
origin. The RPC, members, independent review and atomic audit are unchanged.

- PASS: lint/typecheck; environment/input/navigation contract5/5.
- PASS: full contract246/246, zero skip.
- PASS: security142, zero fail; one existing dedicated database case skipped,
  so aggregate security is INCOMPLETE rather than full RLS acceptance.
- PASS: actual disposable GoTrue/Cookie/PostgreSQL Ops regression7/7, zero skip:
  nonmember/author/reviewer isolation, replay/conflict, audit rollback,
  restart and revocation. Owned stack cleanup passed.
- PASS: independent permission review0Critical/0Important at runtime snapshot
  e649ed7ba6519952d22b864e49548594d1466316dcfc2d0808857f2da97ceaaa.
- Read-only Staging preflight:38 migrations, disabled switch, zero member rows,
  zero candidates; authenticated RPC granted and anon denied. This was the recorded pre-activation baseline.

Supabase [changelog](https://supabase.com/changelog) and
[API security guidance](https://supabase.com/docs/guides/api/securing-your-api)
were checked. No client, CLI, API or schema version change is required for this gate.
Existing explicit database privileges/session checks remain authoritative.

## Actual Staging result

PASS: ordinary GoTrue Cookie → deployed Next.js route → authenticated SQL RPC.
Two existing synthetic actors submitted and independently reviewed one fixed
synthetic candidate. Anonymous401, cross-origin403, expected-actor mismatch403,
self-review403, changed receipt409 and conflicting terminal review409 were observed.
Exact submit/review retries returned the same result, retaining one candidate,
two audits and two receipts. A fresh HTTP request read the identical reviewed
candidate with `published:false` and `retrievalEligible:false`.

PASS: actual browser password sign-in, Chinese desktop1280px and English390×844
workspace; refresh displayed the reviewed candidate and both audit actors/actions.
Mobile document width390 matched viewport390. Browser forms were inspected but
submission/review mutations in this slice used ordinary HTTP, not browser buttons.
The separate disposable regression covers those transaction paths. Browser console
collection was not run; no UI implementation changed in this increment.

PASS: reviewer membership revocation denied existing Cookie reads and successful
receipt replays403. Final cleanup retained two inactive members, restored the
workflow switch false, and denied old Cookie reads/replays503. Browser refresh
cleared the candidate and forms. No secrets are included in committed evidence.

PASS: temporary exact Preview host was removed after validation; WAF version8
retains all original host conditions and browser requests again receive403. The
first draft comparison stopped before activation because Vercel uses `#draft`
in its project key; an obsolete direct activation call also failed. After read-only
comparison, official CLI publication applied only the verified own-host draft.
Independent permission/cleanup review found0Critical/0Important. Existing Production
target/aliases and shared Staging alias were preserved; no product release occurred.

No new accounts, migrations, real-user rows, provider calls or Fact publication.
The synthetic candidate/audits/receipts remain as private evidence. Real sourced
content review, rights/eligibility and retrieval (#205/#206), full #204 and S2
acceptance remain open. This is real Staging infrastructure with synthetic content,
not approved travel knowledge or production acceptance.
