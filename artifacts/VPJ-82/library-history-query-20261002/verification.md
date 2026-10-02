# Library bounded saved-translation query consumer — 2026-10-02

Base: `e67b23b4495b4a5e5d470619c0fe93618fca3f18`.
Branch: `codex/vpj82-library-history-query-20261002`.

Library's translation group now sends the existing v2 history query and query-bound cursor through the merged domain/session readers. It displays server-qualified matching pages instead of filtering only the current browse page. One page replaces another. Blank input browses; nonempty raw input (including spaces) is passed unchanged. Query/cursor are not trimmed, lowercased or canonically substituted.

Query changes use UTF-8 bytes for view task identity and invalidation, immediately removing the old page/cursor/card before a debounced first-page read. The domain reader still owns policy before/after, actor, canonical projection, raw query echo/cursor, 1MB and request-start monotonic20s checks. Exact reads do not receive a query parameter; the reference and detail display retain the original raw-query identity. Unavailable/sparse/expired states are distinct from a successful empty match set. Scope is explicitly bounded source windows, not unlimited/full-history search. Comparison reader contract and #606 result-basis renderer are unchanged.

## Evidence

- Native Knowledge **34/34 PASS**, including existing consent/body/policy/account/background/late/TTL cases and new raw Unicode query equality, wrong echo, query-cursor substitution, late old page after clear, valid same-query second page and exact reopen with retained query.
- Actual owned disposable Auth → Library native UI **1 executed / 1 PASS / 0 failures**. The old target is absent from initial browse page; entering `old` returns it through server search, removes browse rows, opens its exact body, and refreshes the query first page on dismissal. Original consent withdrawal then hides row/cursor and shows unavailable. [Summary](summary.json), [safe paths/status](routes-status.json), [UI log](auth-ui-pass.log.gz).
- Preparation:26 synthetic translation results and21 unrelated text requests through original admission, with a frozen owned model budget and **0 model/provider calls**. No real user data or target environment was used.
- Dedicated iOS17.5 device: `69130F0A-B946-4F73-8B01-25D882B94B41`; explicit destination and fresh DerivedData. Independent port base63020/proxy63052 uses #607's validated helpers and requires a supplied device, with no silent fallback. Owned fixture/Next/proxy/users cleaned in finally. No other simulator was shut down/erased.
- Docs/lint/TypeScript/diff and actual native compilation PASS. No unchanged server full suite was repeated.
- Reviewed images: [exact queried old translation](query-old-exact.png), [withdrawn query](query-withdrawn.png). The withdrawn screenshot includes the new Simulator keyboard onboarding overlay; no keyboard-overlay/accessibility claim is inferred. Earlier #602 runtime-toggle failure remains historical independent evidence; this cold-start consumer flow does not claim a new toggle or physical-device result.

## Limits and rollback

UNRUN: Staging/Production, physical device/VoiceOver, provider translation quality, sparse-volume quality and external/all-material/full-history search. Scan-limit unavailable is not a no-match claim. Parent #563 remains OPEN.

Rollback restores the prior Library query wiring; existing v2 search/exact APIs, permission checks, stored data and Translation tool stay intact. No writer/API/SQL/NativeSession/Translation/AppShell/Journeys/project source changes.
