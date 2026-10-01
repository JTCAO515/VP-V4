# Result-module export preparation — 2026-10-02

Base: `f8bf0ff54661ea210515cc7be86a661e61be7028`. New append-only migration
`20261002030000_vpj79_result_export.sql` adds a service-role-only owner/section
helper for artifacts, immutable revisions with physically retained comparison
content and original source-version references, and content-free event references.
It reuses #589's bounded page/terminal-section manifest convention. Revision
cursors use artifact UUID + integer revision; bigint event IDs are decimal
strings. It does not copy Task answers, Trip content, Memory summaries,
credentials/session IDs, idempotency keys or request digests.

PASS: `VP_PRIVACY_DB_TEST=1 node --experimental-strip-types --test tests/integration/privacy/result-data-rights.test.mjs` (1/1), including 107 artifacts,
109 revisions and 110 event references across 7/100-item pages; exact-size and
empty terminal pages; owner/section/foreign/malformed/deleted cursor denials;
bigint `9007199254740993`; ordinary-role RPC and direct-table denials; retained
service export after result/text withdrawal while ordinary reads remain hidden;
Trip/account cascade and old-identity read/publication rejection; other owner
preserved; transactional apply/rollback and compensating EXECUTE revoke/rollback.

PASS: full isolated PostgreSQL lane 139/139, Supabase RLS/ACL lane 23/23, contract 698/698,
lint/typecheck/docs/diff checks. Default integration is INCOMPLETE (39 pass/137
environment skips); security is INCOMPLETE (194 pass/1 environment skip).
No native runtime change; native-specific local tests are not applicable.

Every test identity, source and comparison is synthetic in disposable,
network-disabled PostgreSQL. Source rows remain under existing retention and
deletion semantics. Page terminal flags do not prove earlier pages, all three
sections, an atomic snapshot or all modules were collected. A future executor
must bind the owner to a reauthenticated request and provide snapshot/retry,
assembly and protected delivery. User export, account executor, provider copies,
Staging/Production and real private-data handling remain UNRUN; #560/#228 stay OPEN.

Rollback before application is transactional/revert. After application, use an
append-only migration to revoke only this helper's service-role EXECUTE. Keep
existing readers, retained rows and deletion cascades; do not restore deleted data.
