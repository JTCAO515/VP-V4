# VPJ-82 grouped comparison / translation search — 2026-10-02

Base: `2ad3bc07a7635172580b144b6419020457642fe7`.
Branch: `codex/vpj82-grouped-material-search-20261002`.

## Behavior

One Library search input now feeds two distinct groups: current comparison results through the unchanged server reader, and saved translations matched locally within the existing authorized window of the latest 20 text requests. Translation matching examines original, translation and back-translation using localized literal substring matching; a matching back-translation is also shown as an excerpt. No server cursor, index, writer, full-history fetch, shared session, SQL or fixture change was introduced.

The phrase matcher returns nil for unreadable, expired, wrong-actor or invalid-query windows, separately from a readable empty match set. Matching cannot alter the request-start monotonic deadline or issue a request. Query updates recompute from the current input and close a selected detail; old query matches are not stored. Existing account/background/generation fences and exact Turn/body/policy reread remain authoritative before opening a card. Source boundaries and per-group unavailable/refresh states remain explicit.

## Evidence

- PASS: `NativeKnowledgeTests` 26/26 on iPhone SE (3rd generation), iOS 17.5. New cases cover original/translation/back matching, trimmed and case-insensitive input, no match, overlong query, no extra network read, no TTL renewal, expiration versus zero matches, unaccepted consent, late window publication, latest-query use, other actor and clear invalidation. Existing exact-read and source revocation tests remain in the same suite.
- PASS: docs check, source lint, TypeScript and diff check. Native test build compiled the actual changed views.
- Native rendering: `UIHostingController` uses a 320×568 viewport with `.accessibility5`; the actual search field font is asserted above 17pt, field width remains within the viewport, and the native UITextField editing event plus scrolling produce zh/en screenshots. This is signed-out test-host rendering, not a complete authenticated app-shell UI flow.
- A synthetic local domain reader matches a phrase, performs the existing exact reread, checks equality, and renders the real readonly `NativeTranslationCard` in zh/en at the same large-text viewport. These are fixture/interface and native-renderer observations, not Auth/Staging/provider proof.
- Reviewed screenshots: [search en](grouped-search/search-signedout-en-small-max.png), [search zh](grouped-search/search-signedout-zh-small-max.png), [local-reader card en](grouped-search/card-local-fixture-en-small-max.png), [local-reader card zh](grouped-search/card-local-fixture-zh-small-max.png). Large content scrolls vertically; no horizontal field overflow was observed. No dark-mode or VoiceOver claim is made.

## Limits and rollback

UNRUN: authenticated Library-row tap → exact reader → dismissal across the full app shell; real Staging/Production, physical device/VoiceOver, external discovery, all-material history and large-corpus quality. No real user data or paid provider request was used. A missing result means only no match in the current readable bounded group, never no material elsewhere. Parent #563 stays OPEN.

Rollback restores comparison-only query wiring and the separate saved-translation list. Existing readers, exact opening, stored materials and permissions remain intact.
