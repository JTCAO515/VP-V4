# WEB-11 frontend IP, map, store, and production cutover gate

Issue: WEB-11/#145. Audit target: `main@ea9a74c`.

This is a release-gate audit and rehearsal runbook, not Preview, Production, map, store, or legal
approval. The verdict is `blocked`: the repository proves a deny-by-default preview boundary, but
does not establish a releasable frontend product or operator-authorized cutover.

## Evidence matrix

| Gate | Current repository evidence | Release result |
| --- | --- | --- |
| Rights ledger / SBOM / NOTICE | `asset-rights-ledger.json`, `sbom.json`, and `NOTICE.md` are present and hash-checked by `pnpm check:assets`; owner-master attestation remains pending | blocked |
| Public media / source denylist | WEB-04 quarantines retired source paths and nine preview photos; release-mode asset validation must reject those photos | blocked |
| Map | ADR-0018 requires map-off by default; homepage and Explore static contracts reject map presentation | pass for no-map preview; no map-on approval exists |
| Page / capability maturity | ADR-0018 records `/` and `/visepanda` as stop-ship; V4-31 records every Demo action as not accepted or unavailable/partial | blocked |
| Store claims / screenshots | no operator-reviewed claim matrix, physical-device capture, or store assets tied to implemented maturity exists | blocked |
| Preview and production cutover | local WEB-10 browser coverage exists; no release-preview smoke, production alias, cutover, rollback rehearsal, or observation window exists | blocked |
| Dependencies | #116 and #43 remain open; #145 has no authority to waive their runtime/release evidence | blocked |

## Claim and maturity boundary

No store or public claim may say that AI, current travel data, maps, booking, payment, Human Help,
voice translation, durable anonymous state, or full Demo parity is available. A screenshot may only
show a real page and must label its bounded maturity (`implemented`, `contract-only`, `partial`,
`fixture-only`, or `planned`) as governed by the V4-01 registry. A concept/Demo image is not
store proof.

The valid current public posture is an unreleased, map-off preview with truthful unavailable and
manual/local fallbacks. This is not a production/store release recommendation.

## Map decision

Map-off is complete for the release gate: no map provider, geocoding, route, ETA, or inferred
geography may be enabled. Map-on remains denied until an operator has separately accepted the
source, representation, allowed use, provider terms, privacy, region, rights, and release evidence.
No future map approval can be inferred from map-pin artwork or a schematic place view.

## Required operator-owned release evidence

Before a future `accepted` verdict, the operator must provide all of the following:

1. Rights attestation for owner masters and public/store derivatives, with release-surface records;
2. a release asset tree with no `blocked-release` media, proven by `pnpm check:assets:release`;
3. an approved store claim/screenshot matrix mapping every capture to a real route and explicit
   maturity; physical-device accessibility evidence accompanies it;
4. a named Preview and Production target, cutover owner, last compliant alias, rollback rehearsal,
   and post-release observation window; and
5. closed #116/#43 gates or their separately accepted replacements, without weakening their
   runtime, privacy, parity, or observation requirements.

## Rollback and verdict

No cutover was performed. If a future rehearsal fails, retain the last evidence-backed production
alias; otherwise retain truthful unavailable/Early Access rather than publishing a stop-ship route.
Keep map off and do not restore retired source media, Fig Grotesk, duplicate source shapes, or
blocked preview photos. Frontend rollback never rewrites Trip, Proposal, Fact, Memory, Auth, RLS,
or audit data.

**Verdict: `blocked`.** The local asset/claim safeguards work, but no Production/store/IP/map
approval, complete product parity, or release observation evidence exists.
