# VPJ-46 preparation — 2026-09-22

Base: `ce46abd`. Scope: an executable two-week customer-discovery work package.
This is preparation for #246; no participant outcomes or S1 completion are claimed.

- Read live #246 acceptance and the existing operations/intake contracts.
- Added `docs/operations/customer-discovery-pilot.md`: two weekly work packages,
  the existing 35-hour total budget, bilingual interview prompts, private evidence
  template, three journey queues, separate assistance modes and next-owner handoff.
- Retained current research consent, separate marketing consent, withdrawal, no
  unsolicited outreach and no personally identifiable material in Git.
- Linked the package from the existing intake runbook; no runtime, database or
  deployment configuration changes.
- PASS: `pnpm docs:check`; `git diff --check`; manual link and acceptance mapping review.

Real interviews, deliveries, minutes and two weekly retrospectives remain UNRUN.
The operator must provide existing private materials or conduct the work before
#246 can close. No contacts, community posts, invitations or provider calls were made.
Rollback: revert the work-package/link/evidence commit; no retained data changes.

# VPJ-46 executable kit — 2026-09-23

Base: `a90ce61`. Scope: complete the existing work package with recruiting, interview
and write-back material. Preparation only; no participant outcome is claimed.

- Read live #246 (0 comments, all six criteria open), #202 (closed) and PR #480 files.
- Added `docs/operations/customer-discovery-outreach.md`: three-queue target and
  exclusion rules, minimal screener, the four permitted channel types and zh/en drafts
  for JT to send manually (own contacts, referral, one community, one partner,
  scheduling, thank-you/follow-up permission).
- Added `docs/operations/customer-discovery-interview-kit.md`: hypotheses H1–H5 with
  Issue mapping, a 30-minute zh/en guide on planning, payment/network/transport,
  AI assistance and Journey Pass willingness to pay, a coding table, weekly hypothesis
  scoring and rules for proposing Issue-priority changes (JT changes labels).
- Extended `docs/operations/customer-discovery-pilot.md` with D0 checks, a data
  class/storage/retention table aligned with `docs/policy/data-classes.md`, VPJ-03
  and the `/research` notice, daily cadence, success/stop criteria, JT's first week
  and pending JT decisions. No new data recipient is introduced.

Production funnel, read-only GET only (no application submitted):

| URL | Result |
| --- | --- |
| `https://go2china.space/research?lang=en` | HTTP 200, English research notice rendered |
| `https://go2china.space/research?lang=zh` | HTTP 200, Chinese notice incl. retention wording |
| `https://go2china.space/` | HTTP 200, links to `/research` |
| `https://go2china.space/api/intake` | HTTP 405 (route is POST-only) |

Whether production intake accepts applications (server flag, migration, `enabled`
setting) is UNRUN: it cannot be observed by GET, and a test application was out of
scope. Recorded as a D0 check for JT.

- PASS: `node scripts/docs-check.mjs`; `git diff --check`; manual link review.
No outreach, posts, form submissions, Issue edits or database access occurred.
Rollback: revert this documentation commit.
