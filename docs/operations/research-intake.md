# Research intake operations

Scope: VPJ-62 [#202](https://github.com/JTCAO515/VP-V4/issues/202). The migration is additive
and independent of the knowledge, identity and Trip tables. Scope expansion to
`supabase/migrations/` and `lib/server/intake/`, plus the home footer, is necessary for
durable intake, private storage and a discoverable entry. The old Jotform entry is retained.

## Enable in the selected development environment

1. Apply the new `vpj_62_research_intake` migration through the existing database workflow.
   Validate the private ACLs and anonymous apply/withdraw RPC with synthetic emails first.
2. Configure the server's existing public Supabase URL/key and
   `VISEPANDA_RESEARCH_INTAKE=true`; set `VISEPANDA_PUBLIC_ORIGIN` to the actual origin
   when a proxy uses an internal host (also for local production-build tests). Do not configure a service key for the public app.
3. In the protected database console, enable only research intake:
   `update research_intake_private.settings set enabled=true where singleton;`
4. Open `/research?lang=en` and `?lang=zh`, submit a synthetic email, save its code and
   withdraw. Verify the email is null, both consents false and a single withdrawal event.
5. Before collecting real applications, record the actual hosting region, designated
   research operators, organizer contact channel and backup expiry schedule in the
   deployment record. Existing data-policy decisions still apply. Do not infer real
   participant acceptance, email verification or permission to send marketing from a test.

A successful application acknowledges a request. Duplicate emails do not create a second
application or change the original consent; use the original exit code to withdraw it.
Lost-code cases use the participant's existing organizer conversation and identity checks;
never disclose whether an arbitrary email exists. Do not print submitted emails or tokens
in logs. Raw tokens must not be placed in query parameters or sent to an analytics service.

## Record actual research events

Use the existing secured database administration surface or service-role RPC in a trusted
operator environment. Select only the needed application, check its current research
consent and record the actual observation with `research_intake_record_event_v1`:

- `enrollment`: a participant actually joins; not a successful form submission.
- `first_value`: the participant actually obtains a first useful result after enrollment.
- `rejection`: the application is declined; no later enrollment without a new application.

Do not perform outreach from this implementation task. No mail integration or sending
capability is installed. Consent is separate from verified mailbox ownership; operators
must verify the contact before enrollment/outreach or transfer into any marketing system.
Any future sender must recheck current consent at dispatch; historical event rows are
never an authorization source.

## Stop, close and restore

To pause new intake, set `enabled=false`. Keep `VISEPANDA_RESEARCH_INTAKE=true` so valid
receipt holders can still withdraw. Do not disable the entire API as the routine rollback.
To close the research, use a reviewed transaction on this schema only: disable intake,
mark all outstanding receipt hashes withdrawn with their `input_hash=null`, append missing
withdrawal events, and set remaining application emails to null, both consent flags false,
status withdrawn and `withdrawn_at` to the closure timestamp. Preserve receipt fences;
otherwise delayed old requests could recreate consent.

Before restoring any backup, stop new intake and external contact, preserve the latest
withdrawal fences separately through the protected backup process, replay those fences
and clear corresponding emails/consents on the restored database, then verify withdrawal
and consent state. Do not reactivate a historical consent merely because a backup contains
it. This PR tests migration transaction rollback and durable process restart; it does not
claim a production backup restoration drill or a specific provider backup TTL.

## Reproduce local acceptance

Docker must already contain the exact images used by
`tests/integration/intake/environment.mjs` (PostgreSQL 17.6.1.167 and PostgREST v16.2).
No connection to an existing database is accepted by the runner. Each run creates its own
network/containers and destroys only those resources at completion.

```sh
VP_INTAKE_POSTGRES=1 node --experimental-strip-types --test tests/integration/intake/intake.test.mjs
node --experimental-strip-types tests/integration/intake/serve.mjs
```

The second command keeps the isolated DB running for browser testing. In another shell,
use the reported loopback REST URL (including `/rest/v1` proxy where noted), synthetic
publishable key and port with `VISEPANDA_RESEARCH_INTAKE=true` when starting Next.js.
Use only synthetic `example.test` emails and stop the runner after testing. Full local
quality commands and their outcomes belong in `artifacts/VPJ-62/verification.md`.
