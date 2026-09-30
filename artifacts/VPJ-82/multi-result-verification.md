# VPJ-82 multi-result search — 2026-09-30

Base: `fa593738dc363ad92a950783d05cdc8ffd90c3e6`.
Branch: `codex/vpj82-multi-result-search-20260930`.

## Delivered scope

The existing Library and #578 Search-to-Library consumer now searches multiple current `comparison/1` results, using one read-only native RPC/HTTP request per page and the original exact result reader on open. No shell, writer, result body or persistent search index is duplicated. The adjacent `NativeSession.swift` method was coordinated as a fixed GET transport only.

SQL applies actor ownership, lifecycle and the existing Task/text consent, goal, Trip/link/deletion and Memory eligibility before returning excerpts or calculating continuation. The page limit is 20. Keyset ordering uses artifact creation time and ID. The emitted next cursor is the last eligible result in the returned page. Incoming cursors are owner-bound, current eligible artifact anchors; they are not signed/encrypted and need not have appeared in a prior response. Hidden candidates never produce a cursor or total count. A revoked/deleted/foreign cursor returns the same unavailable response. Native pages replace earlier excerpts, bind actor/query/cursor, expire within 30 seconds including transport duration, and clear on query/account/background changes. Exact opening rechecks current ID/revision and refreshes the page on return.

## Observed checks

- PASS: docs check, source lint, TypeScript, diff check.
- PASS: contract suite 696/696, no skips; search projection rejects duplicate IDs, extra private fields, totals, invalid Trip scope and oversized pages.
- PASS: disposable local Auth → native Next HTTP → PostgreSQL suite 8/8, no skips. Includes 25 published synthetic comparisons, two-page retrieval without duplicates, literal query, actor/cursor isolation, malformed/cookie input, withdrawn newest result, deleted cursor, Task/Memory invalidation, queued Trip deletion and replaced session/consent withdrawal. Another fixture places 65 newer stale results before one current result; search still finds the current result and exposes no continuation for those stale candidates. With 129 newer stale candidates, both blank and sparse searches return unavailable without excerpts or a hidden-row cursor.
- Local synthetic two-page measurement: 101ms for 25 comparison fixtures in the final run (105ms in the preceding bounded-scan run). These are local elapsed observations, not a target SLA.
- PASS: `pnpm test:integration:db --lane supabase-rls`, 23/23 with no skips, including exhaustive function EXECUTE allowlist and private result-table grants.
- PASS: iOS simulator build; `NativeKnowledgeTests` 19/19 on iPhone 15 Pro iOS 17.5, including page replacement, expiry, query/cursor/account binding and late-response clearing, plus existing exact-open denial tests. A valid unavailable/overflow response has no current-page lifetime and cannot render as an empty successful search.
- INCOMPLETE: generic security suite 189 pass/1 target-specific skip. The corresponding disposable ACL/RLS lane above ran separately; no Staging claim follows.

## Limits and rollback

Only current comparison title/summary search is delivered. Historical results still use the existing explicit read semantics. Other uploaded materials, external discovery, actual Staging/provider/device/VoiceOver and large-corpus search quality remain UNRUN. The indexed raw keyset window is capped at 128 candidates plus one sentinel before query or basis checks, with at most one additional cursor-anchor qualification. If an unscanned tail remains and fewer than 21 eligible matches support safe continuation, search returns unavailable without excerpts or a hidden-row cursor. The existing 10-second HTTP deadline also fails unavailable on timeout. A deleted or revoked cursor intentionally requires a fresh first page. Previously shown excerpts have a maximum 30-second lifetime; opening always requests fresh authorization.

Rollback restores the prior Library consumer and disables/removes the new HTTP entry. Existing exact result reads, writers, revisions and stored results remain valid. The append-only read RPC/index may remain unused; rollback does not require deleting user data or rewriting applied history. Parent #563 remains OPEN.
