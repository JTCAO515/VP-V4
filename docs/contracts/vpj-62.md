# VPJ-62 research intake v1

Issue [#202](https://github.com/JTCAO515/VP-V4/issues/202), S1. `/research?lang=en|zh`
provides research scope, email-only application, independent unchecked research/marketing
choices, a durable on-screen receipt and self-service withdrawal. The existing approved
Early Access questionnaire stays unchanged; the home footer adds this first-party research
entry. The two systems are explicitly separate. This flow does not send email, verify email
ownership, enroll a participant automatically or promise a complete downloadable app.

## Runtime and data

`POST /api/intake` accepts the closed `research-intake/2026-09-17` apply/withdraw union.
It rejects cross-origin mutations, unexpected fields, missing research consent, invalid
email/locale/token and bodies over 2048 bytes. The eight-second request deadline includes
body reading and Supabase RPC. Errors never echo input or backend diagnostics. Responses
are no-store; exit codes never enter URLs, analytics or server logs.

`VISEPANDA_PUBLIC_ORIGIN` sets the trusted public origin when the deployment proxies requests.
`VISEPANDA_RESEARCH_INTAKE=true` plus the existing `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` select the backend. Only an HTTPS Supabase project,
or an undeployed loopback test instance, is accepted. `research_intake_private.settings`
is separately disabled by default. No service-role credential is used by the public app.
The database validates inputs independently of Next.js and exposes only the capability RPC.
Private tables have RLS, no direct client grants and a fixed empty definer search path.
No changes to account, Trip or knowledge permissions are made.

A browser generates a 256-bit random exit code; PostgreSQL stores only its SHA-256 hash.
The immutable receipt and editable withdrawal field are separate. The code is shown and
can be downloaded locally. A repeated request with the same code and normalized input
returns the existing outcome; changing input conflicts. With a fresh code, an existing
email receives the same public acknowledgement as a new application, without receiving
access to the original application. The receipt says that a prior application and its
original exit code remain unchanged. Follow-up/replay/withdrawal also cannot distinguish
these cases through different response kinds. The email is case-normalized and unique
among active records. No claim of mailbox verification is made.

A locked singleton imposes a development limit of 100 new application attempts per hour
across all instances, without storing or trusting forwarded IP addresses. A honeypot
rejects filled bot fields. It is a bounded research pilot, not a general anti-bot service.
Unknown exit codes have a separate 100/hour write budget; known receipts can always exit,
even when recruitment is disabled or either budget is exhausted. Unknown-code revocations
persist a hash-only fence, preventing a delayed first submission from resurrecting consent.
All apply/withdraw paths use the same lock order. Database statement/lock timeouts and
hosting request limits remain applicable.

Withdrawal clears the application email, both current consents and receipt input hash,
and appends one withdrawal event. Historical consent events remain as minimal pseudonymous
audit records, not current permission. A fresh application requires fresh explicit consent
and a new code. No email, raw code, IP or free text is stored in event records. Backups
are not claimed to be instantly erased; see the operator restore procedure below.

## Funnel schema

`application`, `research_consent` and optional `marketing_consent` are distinct atomic
events. `enrollment`, `first_value`, `rejection` and `withdrawal` are separate events.
`research_intake_record_event_v1(id,event)` is service-role-only, not granted to users
or automatically to generic Ops membership. It records observed staff actions:
`applied → enrolled → first_value` or `applied/enrolled → rejected`. Replay is idempotent;
skipping enrollment, resurrecting rejected/withdrawn applicants and unsupported event
names fail. No public read/export endpoint is introduced. An authorized database operator
can use the existing protected SQL administration surface; there is no implied staff UI.

## Acceptance and operations

Runbook: [research intake operations](../operations/research-intake.md).
Actual test evidence: [VPJ-62 verification](../../artifacts/VPJ-62/verification.md).
The local integration exercises real PostgreSQL and PostgREST, plus the production HTTP
handler; browser acceptance additionally exercises the actual Next.js API and Supabase
client. Synthetic email inputs do not represent real recruited customers.

Roll back by stopping new intake in the database, keeping the code and withdrawal route
available, and reverting only the homepage research link if needed. Do not drop the schema,
rewrite applied migrations or restore old consent. No production deployment or live
participant collection is implied by local acceptance.
