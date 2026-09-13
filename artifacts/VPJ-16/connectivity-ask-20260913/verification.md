# SIM Ask — local implementation, real integration pending

Three obligations add ordinary mainland carrier SIM application documents/outlets, call/data
allowance checks, or both to the existing classified-then-reviewed answer path. No facts or
source text go into the classifier. Cross-domain and unsupported additional needs remain partial.

Readiness only: operator SQL observed both existing SIM facts published through September 19;
this is not a product retrieval acceptance. The original official SIM section was rechecked
on September 13: https://english.www.gov.cn/2025special/bizexpatsinchina2025 (Daily Life Services,
I. SIM card, paragraphs I–II and plan note). No new publication or runtime permission occurred.

PASS: actual isolated PostgreSQL question suite 11/11, grounded task suite 13/13, zero skips.
Includes migration transaction rollback, exact scene/relation filtering, honest missing/revoked
and conflicting support, role denial, dispatch requirement, owner isolation, frozen historical
gaps and immutable terminal intents. PASS: 273 full contract tests, 22 static tests, unsigned
native build, Web build and 12 native knowledge XCTest cases with zero failures/skips.
Security: 146 pass, zero fail, 1 existing dedicated database-environment skip; incomplete for
that skipped gate. Independent migration/shared-contract review: 0 Critical / 0 Important.

The append-only migration changes only the private definition and intent CHECK. It was created
with Supabase CLI and its unapplied version set after the existing 090000 migration to preserve
execution order. No applied migration changed. New fixed classification cases: 44 zh/en cases
in tests/fixtures/knowledge/connectivity-intent-v1.json, frozen before provider calls.

UNRUN: actual Staging43→44 backup/restore/upgrade, frozen new and affected legacy provider
cases, native SIM tasks, desktop/390 Web SIM results. No SIM Ask runtime acceptance yet.
Full #206/#264/S2 remain open; full release and physical-device checks remain separate.
