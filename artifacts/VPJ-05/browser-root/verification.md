# VPJ-05 local Web / native same-Trip browser acceptance

Date: 2026-09-10. Root-operated Codex in-app browser against the isolated local API on port59931, using only the provisioned synthetic owner. No provider call, production data, staging migration or real-user retention setting was involved. Credentials were read from the protected local fixture and entered into the visible login form; no credentials are included here.

## Verified behavior

- Web created Trip `07457177-9827-4a30-8d49-8169083f2cea`, added the date2026-09-15 and a synthetic museum item, and generated a proposal. The authoritative Trip remained v0 with no day/item before explicit confirmation. Confirmation produced v1; full reload retained the title/date/item. The native operator subsequently read this exact Trip and v1 through the real Swift UI (companion iOS evidence).
- Native-created Trip `570b2d6a-67cc-4764-8afe-1ab313503906` was read in Web with the same v1/date/item. Web proposed and explicitly confirmed the title `iOS 与 Web 已互证 570b`, producing v2 while preserving day/item. The native operator subsequently read that exact v2 title (companion iOS evidence).
- Inspected1440×900 desktop and390×844 mobile viewports. Mobile document width was390px; the draft controls, proposal diff and explicit actions were usable. English and Chinese were inspected. Editing an item left authoritative v1 unchanged; explicit discard restored the server item and disabled proposal generation.
- Controlled stale-write check on separate synthetic Trip `1df2ddeb-b851-4a36-ba06-97a573fd0659`: with runtime source frozen, a second browser tab confirmed v2 while the first held a v1 draft. Reading latest in the first tab displayed head2 and a conflict notice while preserving its v1 draft. Proposing that stale draft failed without exposing confirmation or changing head2. Only explicit discard rebuilt the draft on base2. See `stale-*.txt`.
- Rejection check on source3d8a492: a new title proposal was explicitly rejected. Head2 and its confirmed title remained unchanged; pending confirmation disappeared; the unsubmitted draft remained editable and the status correctly said the proposal was rejected. See `reject-status-fixed.txt`.
- Final rollback regression after the two-component fix, with source frozen: restored v1 content through a reviewed proposal and explicit confirmation, appending v3. All three history restore buttons immediately became enabled without a page reload. A second restore proposal was rejected, leaving v3 unchanged and re-enabling all restore buttons. Starting a third restore replaced the previous rejected notice with the pending notice; it was then explicitly rejected. See `rollback-pending-stable.txt`, `rollback-confirmed-buttons-enabled.txt`, `rollback-second-pending.txt`, `rollback-rejected-buttons-enabled.txt` and `rollback-after-reject-new-pending.txt`. This verifies both terminal paths and the stale notice correction; no confirmed history was rewritten.

The companion server verification covers ordinary JWT/RLS, CAS, digest/revision mismatch, concurrent retries, cross-owner writes and migration preservation. These browser observations do not substitute for those checks.

## Observation limits

- An initial stale-draft attempt overlapped source hot reload and was inconclusive. It was repeated successfully with source frozen; it is not reported as a product regression or passing proof.
- A later rollback observation overlapped the author's fix and is also inconclusive; its filename explicitly records that boundary. Final rollback acceptance is recorded separately after the source is stable.
- One full-page stitched capture duplicated painted sections despite a single editor in the DOM. It was discarded; retained PNGs are viewport captures.
- The browser date-fill helper updated the input's visible value without committing the React change until a trusted keyboard increment/decrement. The final proposal and persisted date were verified as2026-09-15.
- Console inspection found no error; a pre-existing Next.js smooth-scroll attribute warning is recorded in `console.json`.
- This is local synthetic integration. User hard locks and external order state remain explicitly unknown. No complete#192 acceptance, production readiness, live AI or booking claim follows from these results.
