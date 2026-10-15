# Resolved-turn subject SQL integration — AGENT-005 / #206

2026-10-15 Asia/Shanghai. Code complete for this bounded existing resolved-turn path; Main exact-head review, CI registration/results and normal protected merge remain required. Generic selected-canonical Ask admission and full #206 acceptance remain incomplete.

## Exact scope and observed results

- Original QA base 22559396eec5cd47d3a4d3d2a2bd5e49d52c6c7c. TS initial/done source33df7b39; SQL bodies first committedcc79aab1; final moved/portable integration entryc808976f. Later evidence does not change those product bytes.
- Only new append `supabase/migrations/20261015040456_agent005_resolved_subject_context.sql`, assigned by Main, replaces exactly `public.read_grounded_ai_assist_context_v1(uuid)` and `public.grounded_ai_assist_work_v1(jsonb)`. No old migration, other prosrc, table/column, authority, role, grant or shared registry was changed.
- Before/after fixed prosrc SHA256 and function owner/language/search_path/security/ACL/argument/return/cost metadata are asserted. Unknown cost99 and unknown prosrc are rejected before replacement, with rollback restoring the original catalog. Expected hashes come from reviewed source, never target adoption.
- The work context check follows the original not-blocked/not_applicable branch, preserving normal no-model behavior. Completion establishes owner/context/root qualification before locking the job and re-reads under the job lock. Receipt/token/cost/reclaim semantics are unchanged.
- A full accepted migration replay yields265 application/Auth fixture tables. Snapshot proof allows exactly the two declared prosrc changes; every other function source and all function metadata, relation/column metadata, policies, constraints, default ACLs, roles and memberships remain equal. Append rollback restores the entire snapshot. All nine declared lifecycle/schema/runtime/export/write guards are TRUE before and after. No registry correction is needed.

## Actual tests

| Evidence | Result and scope |
| --- | --- |
| Initial/done production-function contracts | PASS73/73 at unchanged TS source33df7b39; C0 RPC/model transport |
| Default owned contract discovery after moving PG test | PASS58/58, 0skip; no gated PG file remains in contract |
| New integration path, native PostgreSQL17.11 + pgcrypto | PASS16/16, 0skip; actual SQL roles/RPC/persistence/locks plus controlled model transport |
| Native PostgreSQL16.15 compatibility attempt | FAIL before new append, old assistant-events frozen table-ACL pin; retained, not waived |
| Typecheck/lint | Prior PASS at unchanged TS source33df7b39 reused |
| Integration JS syntax / docs / full-base diff | PASS |

Two synthetic Auth actors only: A owns the Trip/turn and creates source/mapping/use candidates; B independently reviews them. Auth functions are the original accepted local SQL claim stubs, not GoTrue or signed-JWT evidence. No fixture GRANT is executed. The legitimate Guide producer runs only under its existing postgres permission for fixture setup; its ordinary authenticated ingress remains DENIED. Actual owner context/ensure/complete calls use `SET LOCAL ROLE authenticated`; original worker classification uses the existing service_role entry.

The original Guide producer creates a real source-qualified binding from an approved canonical mapping, current Trip/reference/head, original policy/consent, and approved prompt-use proof. Two real published variants make the original resolver persist a blocked matched turn; withdrawing only the unmapped competing publication makes the exact bound source usable. No binding, blocked-outcome row or subject is manually forged.

An independent normal authenticated `submit_grounded_turn` → original service-role worker resolver → owner `read_grounded_turn` test also persists a matched subject with `originalOutcome=answered` and zero Guide bindings. It is correctly not offered redundant AI Assist. The same name in a wrong city cannot borrow the Shanghai-only source.

Negative/causal coverage includes wrong actor/old turn/client-injected subject, current canonical/mapping identity change, Trip head/reference/Trip deletion, source withdrawal, immutable input change, session deletion/fresh same-owner session, concurrent ensure/completion, unknown ACK reconciliation without another model/complete, stored done after source loss, and cancellation without a successful completion or model rerun. Historical successful receipts are retained but cannot authorize current display after revocation.

## Runner and CI seam

Current entry:

```sh
AGENT005_NATIVE_PG=1 \
VP_WIKI_PG_BIN=/opt/homebrew/opt/postgresql@17/bin \
VP_WIKI_PG_MODULE=/Users/jtsm5p/Documents/Codex/2026-10-13/v10-main/agent008-pg-client-20261015/node_modules/pg/lib/index.js \
node --experimental-strip-types --test tests/integration/knowledge/agent-grounded-subject/subject-binding-postgres.test.mjs
```

`AGENT005_PG_BIN/MODULE` overrides are also accepted. Existing `VP_WIKI_PG_BIN` plus `VP_WIKI_PG_MODULE` activate the test without another flag. On Linux use a PG17 binary path (normally `/usr/lib/postgresql/17/bin`) and the lane's existing pg module. Each run creates one private0700 nonce/data/short Unix-socket tree, asserts listen_addresses empty, stops only that data directory's server, and deletes it. Mac uses/private/tmp; Linux uses/tmp. No global service, Docker, real data/provider/credential or target action is invoked. PG16 and PG17 diagnostics/role/catalog/cleanup evidence are separated in their respective directories.

PG16.15 fails at the **old** `20261010020000_assistant_events.sql` with ASSISTANT_EVENTS_AFTER_DRIFT, while all nine pre-existing guards remain TRUE. Its default table-owner ACL is `{postgres=arwdDxt/postgres}`; the frozen historical clause at line2108 requires `{postgres=arwdDxtm/postgres}`. The missing `m` is PG17's MAINTAIN privilege. This is a sufficient fixed-baseline incompatibility, not a new append SQL feature, and no historical guard/pin was weakened or migration skipped. [PostgreSQL17 privileges](https://www.postgresql.org/docs/17/release-17.html)

Main's smallest CI option is normal PG17 installation for this new subject sub-lane, preserving old Wiki PG16 behavior and reusing its pg dependency. Official PGDG supports Ubuntu24.04 and versioned server packages such as postgresql-17; Main owns workflow/runner installation and registration. An existing pinned Supabase17.6 image is another option, but would require adapting the native Node/module runner into that container. Neither option has been executed locally or claimed CI PASS. [Official Ubuntu installation](https://www.postgresql.org/download/linux/ubuntu/)

## Preserved failures and limits

Original 53PASS/1FAIL initial-context loss, replay parameter-spread authority failure, Auth role-stub whitespace pin mismatch, invalid fixture source declaration/qualifier count, draft-cap over-allocation, not-blocked return regression, exact SESSION_REPLACED expectation, rejected-prosrc test dollar-quote construction failure and PG16 frozen baseline failure are retained. Corrections changed test fixtures or this new two-function body as appropriate; no product permission/guard/quota/timeout was weakened.

The current shared contract still says Native/Web context lacks the subject. An exact before/after/patch candidate (`wiki-agentic-search.current.*`) is provided for Main's single shared-doc writer; that document is not hand-edited here.

Real GoTrue/session tokens, real HTTP Native/Web clients/browser/device, targetPG17.6/Supabase schema, real provider, pricing/fees and deployment are UNRUN. NativePG17.11 role/source/controlled transport proof is not those acceptances. Generic PlaceActions canonical navigation/draft input still is not an admitted persistent turn binding; Guide permissions are not transferred to it. Keep #206 OPEN.
