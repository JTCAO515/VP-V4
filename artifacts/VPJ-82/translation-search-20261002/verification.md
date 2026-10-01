# VPJ-82 bounded translation keyword search

Date: 2026-10-02 (Asia/Shanghai). Branch: codex/vpj82-translation-history-search-20261002.
Started from eee7ad3c; fast-forwarded to9655c3e8 before final checks, preserving merged
#598 NativeSession task-history method and #599 Web source. Related to #563; stays OPEN.

## One result and scope

The Translation tool can explicitly search its bounded server-read saved history by
original, translation or back-translation. Raw query≤120 UTF-16 units; trim+JS default
lowercase, literal containment within one field; %, _ and backslash are not wildcard.
Existing SQL128+one content-free sentinel and canonical/numeric projection run first.
No SQL/migration, text index/copy, permission, provider, recipient, model context or
shared runner/ACL changes. Old no-query v2/UUID cursor, old20 and exact rights retained.

Search continuation is q1.base64url closed{turnId,rawquery}, ≤1200 ASCII; raw query
must match request, anchor must still match query and current actor/policy/consent.
21 valid matching translations permit20+safe cursor. Sparse/rawtail/invalid windows
without safe continuation are unavailable without partial metadata or false empty.
Unsigned cursor is neither permission nor proof of prior server issuance.

New native field/store query state uses raw UTF-8 equality and query echo, one-page
replacement, immediate clearing on query edit, generation/cancellation fencing,
monotonic20s lifetime and unchanged fresh exact reopen. Search owns a separate task
from original translation submit/poll; actor/background clears keywords and data.
No Knowledge, Ask, fixture, WebTrip, Journeys, privacy or global handoff edits.

## Observed checks

- PASS contract7/7: all3 projected fields, literal special symbols, no cross-field
  concatenation, max length, sparse/invalid uniform unavailable, typed query cursor,
  mismatching anchor, different Unicode spellings, old no-query cursor and legal
  full-size/escaped body regression. `node --experimental-strip-types --test tests/contract/translate/history.test.ts`.
- PASS dedicated PostgreSQL3/3 zero skips: current owner/policy/consent, status/hidden/
  deleted/expired/session, raw128 sparse tail and new query projection on same SQL
  candidates. `VP_TRANSLATION_HISTORY_DB_TEST=1 node --experimental-strip-types --test tests/integration/translate/history.test.mjs`.
- PASS real disposable Auth→Next→RPC1/1 on final9655 base: three unique field matches,
  two pages, query echo/binding/cross-query rejection, current-query nonmatching anchor,
  foreign anchor/actor, query121/duplicate query/legacy cursor misuse, withdrawal,
  exact same-turn reopen, old no-query compatibility, 327375-byte valid page,
  session-fault24/24 and model HTTP/budget attempts0. `node --experimental-strip-types tests/integration/turn/run-native-http.mjs --translation-history`.
- ENVIRONMENT FAIL retained: first final-base HTTP attempt exited during default-port
  preflight (no tests executed), because Library's own Auth/UI stack occupied59620
  offsets (read-only nodePID16385/userjtsm5p listener59651 observed). No kill/runner
  change or gate bypass. After listener exited, the unchanged preflight passed and
  sequential retry produced actual1/1 PASS; see separate failure and success logs.
- PASS NativeTranslationTests15, including query-bound pages/exact ref, query change
  and late old reply, raw Unicode byte inequality/echo mismatch, expiry and consent
  withdrawal, and earlier size/session/submission cases. `xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=759AD509-F16E-4582-8F77-C224A6CDE76B' -derivedDataPath /tmp/vpj82-translation-search-derived -resultBundlePath /tmp/vpj82-translation-search-final-tests.xcresult -only-testing:VisePandaTests/NativeTranslationTests CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-`.
- PASS unit154/154 and contract718/718 on initialeee7 base; unchanged relevant source
  evidence reused after safe9655 integration. Final-base typecheck/lint/docs/diff and
  native+AuthHTTP checks PASS. No shared scope or introduced field/permission changes.
- PARTIAL ordinary security197 pass/0 fail/1 skip (disposable Supabase AI14 gate);
  ordinary integration39 pass/0 fail/147 gated skips. Full applicable CI is required;
  these skip-bearing commands are not target/complete-suite acceptance.
- OBSERVED zh/en guest screenshot query field, limit/scanning disclosure and disabled
  authenticated action. This is not a logged-in native search/HTTP/card UI claim.

All identities/data/notices/results synthetic. Local DB containers were network-
disabled/uniquely named; Auth stack owns cleanup. Owned Simulator759AD only. No
private real data, credentials in evidence, model/provider, money or target operations.

## Limits and rollback

UNRUN: logged-in native Auth→search/page→card UI, physical device, shared Staging/
Production migration/provider, whole-library/all-history snapshot/full #563 acceptance.
Sparse scans can legitimately be unavailable; results are live, not snapshot complete.
The new term reaches only the ordinary permission-checked app reader, no model.

Rollback reverts this optional-query HTTP/native delta while retaining v2 browse/
exact/old20 readers. There is no migration/permission/retention rollback to apply.
Main independently reviews final SHA/CI and merges; this branch never self-merges.
