# VPJ-21 retained acceptance / UNRUN

- Local Web build, full suites and browser desktop/390×844: UNRUN under Overall's overloaded-host restriction; eligible Linux CI is the next engineering environment.
- Native build/tests, en/zh rendered five-state behavior, device/accessibility observations: UNRUN locally; no simulator or manual native dispatch was started. Existing self-hosted Native CI queue is the authorized next build path.
- Authenticated owner/other-user/replaced-session HTTP results against a real permitted database: UNRUN. The new paths reuse existing identity, Trip RLS and knowledge RPCs; source/fixture checks do not prove runtime access behavior.
- Real eligible SIM publication, expiry/revocation during display, relative-to-exact Trip date transition and retry on same-Trip native/Web: UNRUN on this code version. Prior knowledge artifacts and the editorial batch do not establish current publication eligibility.
- Accepted provider/branch/document conditions: UNRUN. Explicit user declarations are not independent validation.
- Other Issue categories (payment, admission/reservation, address, transport) and applicable rule coverage remain unimplemented in this slice. Unsupported evidence/rules return unknown.
- Cross-device persistence of preparation answers: not implemented; both clients clearly state answers are request-local and reload defaults to unknown. Full Issue reload consistency needs actual same-Trip observation, not a fixture claim.
- A preparation action requiring Trip changes is not implemented here. This slice has no writer and adds no proposal. Any later consumer must use existing exact-version Proposal confirmation and atomic Patch, including reject/revoke/stale/retry evidence.
- Full #211 acceptance and closure: UNRUN; do not close from this PR or CI alone.

Next permissible acceptance: use the eventual Preview/head and an already authorized controlled
identity + eligible published SIM evidence to exercise both read-only endpoints and both clients.
Coordinate any shared Staging setup/write, account or publication action with Overall; do not derive
a new grant from this implementation. Do not resume place-v7.
