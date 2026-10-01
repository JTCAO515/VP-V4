# VPJ-82 saved translation materials — 2026-10-02

Base `f8bf0ff54661ea210515cc7be86a661e61be7028`; branch `codex/vpj82-library-materials-20261002`.

## Source and result

Library now separates saved translations from comparison results and the existing Translation tool. This read-only consumer reuses `NativeTranslationStore.load`, fixed `NativeSession.translateRequest` GETs to policy/history, and the existing literal `NativeTranslationCard`. No writer, API, migration, shell, fixture, or shared transport was changed.

The real translation source is retained text Turn content projected by the existing translation HTTP reader, with current native actor/session and text policy/consent checks. Its limit is translations within the 20 most recent text requests, not a complete translation or materials history. Pending, cancelled, unavailable and needs-review records are not presented as completed materials. UserArtifact currently has an in-memory domain object without a persistent native list/read API; it was not represented as saved upload history. Addresses have no separate persisted source here.

Opening re-reads policy/history and requires the same Turn ID, complete phrase content, policy ID and notice hash. Changed content, withdrawn consent, deletion or leaving the window is unavailable; no other record replaces the selection. The consumer admits GET policy/history only, with no body or provider request. List and detail use request-start monotonic 20-second lifetimes, original actor scope, cancellation and generation fences. Query-independent material state clears on background, account change and disappearance. A fresh domain reader prevents prior cached text surviving a failed refresh.

## Local evidence

- PASS: affected iOS compilation and `NativeKnowledgeTests` 22/22 plus unchanged `NativeTranslationTests` 5/5 on iPhone 15 Pro iOS 17.5.
- New adapter tests exercise the actual local `NativeTranslationStore` interface with synthetic policy/history data: read-only paths; exact re-open; changed body/same ID; different Turn; missing/removed window entry; policy/hash change; revoked consent; 20-second expiry including transport duration; changed account; late response after clear.
- PASS: existing translation HTTP/projection contracts 8/8, including read-only history filtering, inert numeric-validated projection, consent/session errors and no regeneration. These handler fixtures do not establish live Auth, Staging or provider acceptance for this slice.
- PASS: docs check, lint, TypeScript and diff check.

## Remaining acceptance and rollback

UNRUN: authenticated Staging/Production material loading, actual deletion/revocation across devices, physical-device and VoiceOver interactions, source-window volume/quality measurements, persistent uploaded order materials, independent address history and complete global search. No real user data, provider egress, production or financial action was used. Parent #563 remains OPEN.

Rollback removes the Library material panel/adapter while retaining the existing Translation tool, retained source records, comparison search and account rights.
