# Native Ask explicit Staging entry

Related to #195 and PR325, built on PR324 d196da1. This increment adds the missing native Ask
Staging configuration boundary; it does not activate a policy/provider/remote worker.

- `VISEPANDA_NATIVE_STAGING_TEXT=true` and one explicit `VISEPANDA_NATIVE_STAGING_TEXT_POLICY`
  require the existing exact Preview origin, native Staging flag, Trip-v2 flag and fixed Staging DB.
  The public-key-only Trip resolver supplies no password-proof key.
- Local text config now rejects every Vercel environment and path/query/fragment-bearing DB URLs.
  Ordinary bearer identity, live session epoch, immutable policy/consent RPCs and withdrawal remain.
- Ask title/sign-in copy describes the selected test environment in all five existing locales.

## Actual checks (2026-09-11)

- Directed HTTP/config/abort/unknown-ack tests:12/12 passed, zero skips. Full affected turn
  contract/security files:34/34 passed, zero skips. Remote-origin tests fully intercept fetch and
  prove denied configuration makes zero network calls; they are not remote deployment acceptance.
- Real newly owned local Supabase/Auth/PostgREST/Next API/consent/worker/final-answer reload:
  `node tests/integration/turn/run-native-http.mjs`,1 passed/0 failed/0 skipped (11.5s test process).
  Actual worker completion, duplicate submit, policy rejection, cancel, withdrawal, cross-owner
  isolation and mobile replacement checked. Provider HTTP is controlled synthetic transport.
  Runner removed its exact owned stack; subsequent `docker ps -a --filter name=vp-native-ask` empty.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `node --experimental-strip-types scripts/check-flags.mjs`
  passed. Generic iOS Simulator `xcodebuild build`, signing disabled, passed on installed Xcode.
  Complete signed native CI and real remote/physical-device evidence remain separate.
- Full contract suite:241 passed/0 failed/0 skipped. Full security suite:116 passed/0 failed/1
  explicit unrelated AI-14 disposable-environment skip; suite reports incomplete, not all-green.
- Independent permission review:Critical0/Important0. Base8c954853b39769b5f2eadf159f599aaf095802ae;
  runtime plus two security-file diff SHA25608e0f6f12ee7afe4ad3f3889e23e48b8b70dfacab3ded645217db4919f827e23.
  The review did not call remote services or approve a data recipient.

## Remaining execution

No remote variable, WAF, policy registry, model credential, database migration or account was changed.
The previously tested S1 remote remains backend f5db769/native c333d9b. Its scoped identity/same-Trip
result does not prove this newer Ask entry or later locale fix runs remotely. PR324 d196da1 Quality
34572089878 and Native34572089917 both passed; that evidence is retained for the S1 source baseline.

Before an actual S2 final-answer claim, bind a qualified single recipient and immutable bilingual
notice to the selected policy, configure the trusted durable worker and pricing, and run ordinary-user
consent/submit/reload against the exact reviewed Preview/app SHA. Preserve pending unknown charges,
withdrawal/hide barriers and all original data. Production release and full #191/#192/#195 stay open.
