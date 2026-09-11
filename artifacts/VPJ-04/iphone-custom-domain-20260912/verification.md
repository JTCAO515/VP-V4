# iPhone staging domain connection

Related to #191/#192/#195 and PR325. Runtime source `75b4ded56a94285ac4b53c998291507ae0c4ca49`.

JT authorized installing the Staging development app on the connected iPhone and using
`go2china.space`. The exact owned `staging.go2china.space` was assigned to the S2 Preview
branch. Root and www remain assigned to Production; no Production app was deployed.

## Observed

- Physical iPhone access to the prior `vercel.app` host timed out with URLSession code
  `-1001`; Safari also failed to finish loading that host. Safari reached `go2china.space`
  and received native `UNAVAILABLE`, consistent with the root Production route being disabled.
  These observations identify a host connectivity difference, not its network-provider cause.
- The signed development build with compiled origin `https://staging.go2china.space` built
  successfully and was installed as an update to `space.go2china.VisePanda`. The app launched.
- Preview `dpl_HjFxz1cER3WJfU8g8LUiyMQ9mLB3`, host
  `vp-v4-7rftlyb4r-jtcao515s-projects.vercel.app`, is READY on the runtime source above.
  The selected branch has native Staging, Trip v2, the existing Staging proof key and exact
  custom-origin opt-in. No new database, provider key or model request was introduced.
- WAF version 6 adds only this deployment host and `staging.go2china.space` to the existing
  maintenance rule's allowed hosts. Existing rules/hosts were preserved and no draft remains.
- Anonymous session access to the new deployment returns 401; the owned experience account's
  credentials request returns 200. Response credentials remained in process memory.
- JT added the Spaceship CNAME. Vercel reports CNAME configured and misconfigured=false;
  custom-domain HTTPS returns application JSON/401 for anonymous access. iPhone native credentials,
  login and profile each returned 200 after re-entering the owned experience credentials.
- On the iPhone, created `Guangzhou Weekend`, edited a day/item, reviewed the proposal and
  confirmed it through the explicit confirmation dialog. The app reloaded confirmed version 1
  with `Morning walk in Guangzhou`. After process termination/relaunch, Keychain refresh/profile
  returned 200 and selecting the same Trip showed the same version, ID and item.
- JT subsequently requested skipping further phone verification and continuing later Issues.
  No additional phone acceptance is implied by this bounded result.

## Verification and limits

- Lint, typecheck, docs check and diff check PASS.
- Identity security suite: 14/14 PASS, including six native Staging cases.
- Actual Simulator endpoint validation test: 1/1 PASS, zero skips. The owned test Simulator
  was deleted after completion; other devices were untouched.
- Independent credential-destination/logging review: Critical 0 / Important 0.
- Exact-runtime Quality run 34636262417 and Budget PostgreSQL run 34636266652 PASS.
  Native iOS run 34636314077 FAILED: maximum-text audit reported invalid target app (-902),
  and Chinese dark-mode Ask reported partially unsupported Dynamic Type at the availability notice.
  Builds/signatures and the endpoint test passed; these UI failures remain to diagnose/fix.
- The physical Trip slice above passed; real AI and full S1/S2 acceptance remain open.
  One scoped experience account/Trip is retained for JT. After successful Keychain restore,
  the private password file and the temporary UI credential variable were removed.
  Earlier disposable test accounts remain cleaned.

Rollback removes this test domain's branch mapping and exact Preview custom-origin setting,
stops access through the two new WAF hosts if needed, and reinstalls an explicitly selected
Staging build. Preserve existing user data, prior host permissions and consent/budget history.
