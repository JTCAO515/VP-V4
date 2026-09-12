# Ops Staging route — 2026-09-12

Related to #204; baseline bc082fb. Started 11:48 CST. Current result is implemented
and locally verified; remote activation and browser workflow remain pending.

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
  zero candidates; authenticated RPC granted and anon denied. No remote writes yet.

Supabase [changelog](https://supabase.com/changelog) and
[API security guidance](https://supabase.com/docs/guides/api/securing-your-api)
were checked. No client, CLI, API or schema version change is required for this gate.
Existing explicit database privileges/session checks remain authoritative.

Remote plan: two existing synthetic accounts, one synthetic text candidate,
separate reviewer, preserved audits/receipts, then member deactivation and switch
restored false. Preview configuration is scoped to that deployment. Production,
real-user data, source licence activation, publication and retrieval remain outside
this test. Full #204–#206/S2 acceptance remains open until its evidence exists.
