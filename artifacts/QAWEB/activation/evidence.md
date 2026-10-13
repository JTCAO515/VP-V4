# QAWEB-005 activation preparation evidence — 2026-10-13

Base: e51cd9b9bec94afebed06ef6cf695224c3d24492; branch codex/qaw005-activation-20261013.
Only new activation scripts, activation artifacts and activation contract tests are owned.

PASS — official Supabase Go2China link `link_6acdbe0471c081919ff47de24ca53b0f`, fixed project `dzqdzetcctkhbrhlxxgn`, three SELECT-only calls actually succeeded. Observed migration count 75; `turn_data_private` absent; `qa_read_work_v1(uuid,uuid)` absent. 8 text policies, 0 currently effective; 3 budget scopes, 0 currently usable; 3 enabled provider limit rows. Provider limit enabled alone is not usable budget or current pricing evidence. No credentials were requested, printed or copied. No database writes were made.

PASS — 8 new contract tests, including synthetic full metadata; old modes/providers and stale price evidence; expired/underfunded budgets; unknown destination/pricing; cross user/Auth Session/QA Session/turn/lease/policy/hash/scope; fresh notice hash; pinned baseline75 + reviewed missing80 = complete155 migration-set/recovery checks (current75, missing, extra, substituted and reordered lists fail); zero fetch calls. Fixture evidence uses example.invalid and is expressly not a real tariff or supplier claim.

PASS — 10 existing QA hosted-profile/executor/worker tests. These are offline/fixture evidence, not real auth/provider/target calls. PASS — docs-check and diff whitespace check.

Tools: Node v26.8.2 observed. Shell/local write permissions and official plugin read permission were actually exercised. No target write/activation permission tested or claimed. Current installed model/tier was not changed or verified; no Fast-tier claim. Read repository AGENTS, CONTEXT/HANDOFF relevant sections, development workflow/integration policy, current shared DEVELOPMENT-RULES and Supabase main skill. Memory keyword lookup returned no relevant QAWEB record.

Supabase docs: fetched current changelog and [RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security). The announced HTTP TLS cipher change does not affect this offline kit; no new Supabase SDK, schema, grant or auth implementation was introduced.

UNRUN — real provider, authenticated QA UI consent, target migration/recovery, deployment, worker activation, billing, RLS runtime integration and restore drill. Current target facts block readiness. Exact-head formal review and CI/merge belong to Main. No parent acceptance or issue closure asserted.

Correction after Main WIP review: initial 80-versus-remote comparison would have blocked a fully migrated target. Replaced it with immutable source-hashed 155-version manifest. Actual baseline75 re-read through official plugin; missing80 cross-checked with existing hook-run-01 replay evidence. Observation JSON cannot redefine either list. No target write.
