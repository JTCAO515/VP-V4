# VPJ-82 saved translation history v2

Date: 2026-10-02 (Asia/Shanghai). Dedicated branch: codex/vpj82-translation-history-20261002.
Started at 91b36fec and fast-forwarded to ce61d912 before implementation, retaining
#594 Journeys and #595 composer runner/ACL changes. Related to #563; parent OPEN.

## Result and authorization

A saved translation disappeared from GET /api/translate after 20 newer ordinary
text requests, because that wire projects the existing list_text_turns limit20.
Old native/Library consumers remain untouched. An explicit Translation-tool entry
now opts into version2 pages and same-source exact Turn reopen. There is no provider,
recipient, write, budget or history-as-model-context extension; Production still503.

Main coordinator confirmed the closed read contract and ownership before editing:
new routes/history module; migration20261002050000; NativeTranslationStore/View/Tests;
one fixed GET-only NativeSession method; dedicated tests. Shared edits are only the
new postgres env/file, one native HTTP lane step/--translation-history runner branch,
and the two exact authenticated ACL signatures. No Knowledge, Ask/composer, fixture,
Journeys, privacy export, global architecture/handoff or applied migration changes.

## Observed checks

- PASS dedicated disposable PostgreSQL3/3, no skips: complete migration history with
  transactional forward/rollback; old translation after21 ordinary requests; two
  pages reconstruct26 translations with timestamp ties and unique UUIDs; exact
  same-source read; other owner/unknown cursor; role grants; sparse129-text tail;
  status, hidden/deleted/thread, withdrawn consent, naturally expired immutable
  policy and replaced session. Counts of model dispatch/budget attempts are0.
- PASS real disposable Auth → Next.js → RPC1/1, no skips: old20 omission vs new
  exact/page reopen, owner isolation, source state/hidden cursor invalidation,
  withdrawal, double-source revocation race, no-store and model HTTP/budget attempts0.
  Commands: `VP_TRANSLATION_HISTORY_DB_TEST=1 node --experimental-strip-types --test tests/integration/translate/history.test.mjs`;
  `node --experimental-strip-types tests/integration/turn/run-native-http.mjs --translation-history`.
- PASS `pnpm test:integration:db --lane postgres`:142/142 isolated-postgres +5/5
  existing Journeys pages =147/147, no failures/skips. Final indexed range refinement
  is included in this lane. Dedicated HTTP step is registered in supabase-http-native.
- PASS `pnpm test:unit`154/154, `pnpm test:contract`715/715; focused translation
  contracts12/12. Canonical/numeric needs_review and sparse-tail cases fail unavailable
  rather than report empty/complete; safe continuation requires a21st valid translation.
- PASS Simulator NativeTranslationTests10 tests, including19/20/21-second parameter
  cases, replacing pages, exact comparison, post-read consent withdrawal, late scope,
  stale generation, malformed cursor and unchanged old submission recovery. Test:
  `xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=9F5D7CD1-1CDE-4553-BDEA-A2DA2F554C10' -derivedDataPath /tmp/vpj82-translation-history-derived -resultBundlePath /tmp/vpj82-translation-history-final-tests.xcresult -only-testing:VisePandaTests/NativeTranslationTests CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-`.
  Final same-destination Simulator build passed after the cover/lifecycle cleanup.
- PASS lint, typecheck, docs:check, diff check, runner classification and JS syntax.
- PARTIAL ordinary security:197 pass/0 fail/1 skip (AI14 requires configured
  disposable Supabase); ordinary integration:39 pass/0 fail/146 gated skips. Neither
  skipped run is full database/target acceptance; applicable PR CI remains a gate.
- OBSERVED zh/en guest Simulator screen: new section/disabled unauthenticated entry
  visible, original20-window disclosure retained. Screenshots: zh-guest.png/en-guest.png.
  No logged-in native HTTP page/card UI observation is claimed from these guest shots.

All identities, notices, phrases and terminal answers were synthetic. The local
HTTP stack was uniquely named and removed by its runner; its credential-bearing
startup output is suppressed. The owned Simulator is9F5D7CD1; no other session's
device or original user checkout was touched. No secret/private user data was read.

## Remaining boundaries and rollback

UNRUN: logged-in native Auth→history/card UI chain, physical device, full global
search/all-material Library, shared Staging/Production migration, real translation
quality/provider and complete #563/#216 acceptance. Live traversal is not a snapshot
or full-history promise: raw128 sparse/invalid windows can be unavailable. Exact
eligible reopening is independent of that bound. UI retains one page for at most
20 monotonic seconds including request time; opening requires fresh policy and
complete phrase equality. Revoked retained data never reappears in ordinary reads.

Rollback removes the opt-in routes/native reader and disables the two new read RPCs
through append-only EXECUTE revocation. Source rows, original20 reader/submission,
actor/RLS, Trip confirmation, model ledger and deletion/retention remain unchanged.
