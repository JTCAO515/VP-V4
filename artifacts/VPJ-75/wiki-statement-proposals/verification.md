# #359 bounded model proposal increment — 2026-09-15

Baseline: main55c21bc8c1639becef294c86ee47e7395ae3b880 after user-authorized #399
merge with all checks passing. Merge tree equals1cd1b1a. Live Vercel ignored-build
rule was verified before merge; GitHub/Vercel reported55c21bc “Canceled by Ignored
Build Step”; production overview still showeddb5fb7b. No production setting changed.
Branch: codex/wiki-statement-proposals in the existing isolated worktree.

## Implemented result

One explicit C0 source set can produce bounded, structured statement proposals via
the actual model protocol/transport path. Canonical sources and unambiguous exact
quotes are bound by the application and rechecked by PostgreSQL. Full proposals
persist as wiki-draft/2 and survive database restart. Ops shows quotes, pre-fills
bilingual statement/condition/exception fields and records the starting proposal
index when an operator edits/submits through existing review controls. Old bodies
and receipts stay compatible. Proposals never publish themselves.

## Actual verification

- PostgreSQL17.6:18/18 PASS, zero skips. Prior body/link/receipt/rollback/concurrency/
  ACL suite plus new migration rollback, source/quote/Unicode-offset forgery
  rejection, actual worker-protocol→quote binding→complete→database process restart
  →full readback, proposal-index submission and invalid/stale index refusal.
- Contracts378/378 PASS. Dedicated tests cover output bounds, source authority
  injection, missing/repeated quotations, computed Unicode code-point offsets,
  dedicated prompt/output cap, C0-only/pre-cancel handling and closed login index.
- Security146pass/1existing environment skip and generic integration23pass/76skips,
  no failures; these aggregates remain INCOMPLETE.
- Typecheck, source lint, webpack production build, docs and diff checks PASS.
- Actual built browser→real handlers→native PostgreSQL, with synthetic identity:
  proposal list and quote; schema2 readback; bilingual fields/conditions/exceptions
  prefilled; operator modified both languages then submitted; pending/unpublished
  candidate retained original revision and proposalIndex0; no self-review action;
  desktop1280/mobile390 and legacy RTL compatibility checked.
- Independent review found no must-fix issue in C0/C2 separation, source binding,
  immutable body compatibility, index origin or closed query handling.

All provider responses are **injected fixtures**; zero paid model calls. Auth is the
repository SQL-claims fixture, not GoTrue/JWT acceptance. Quote identity is tested;
real model semantic faithfulness/contradiction handling is NOT accepted from these
fixtures. A correct quote can still accompany a wrong claim and requires review.

## Reproduction and findings

Use the same native PostgreSQL runtime and pnpm9.15.9 as the earlier increments.

```sh
VP_WIKI_PG_BIN=/tmp/vpwiki-pg-runtime/node_modules/@embedded-postgres/darwin-arm64/native/bin \
VP_WIKI_PG_MODULE=/tmp/vpwiki-pg-runtime/node_modules/pg/lib/index.js \
node --test tests/integration/knowledge/wiki-draft.test.mjs
node scripts/run-ci-suite.mjs contract
node scripts/run-ci-suite.mjs security
node scripts/run-ci-suite.mjs integration
node scripts/lint.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/next/dist/bin/next build --webpack
node scripts/docs-check.mjs
git diff --check
```

Use `VP_WIKI_BROWSER_FIXTURE=1` only for the owned loopback browser fixture. It proxies
built Next3196 via3197 and uses the real request handlers/database with synthetic
identity. `/fixture/stop` closes it; database cleanup removes only its owned directory.
This does not add a deployed auth bypass or production flag.

Raw local logs: `/tmp/vpv4-wiki-proposals-db.log` retains the original failure;
`/tmp/vpv4-wiki-proposals-db-fixed.log` records18/18 after repair;
`/tmp/vpv4-wiki-proposals-contract.log`, `...-security.log`, `...-integration.log`,
`/tmp/vpv4-wiki-proposals-build-final.log` and `...-browser.log` retain checks.
The first provider fixture omitted required choices[0].index; corrected to the
existing strict protocol shape, without weakening validation. Real SQL found alias
`s` colliding with the PL/pgSQL source row variable; renamed only that query alias
and re-ran the unchanged rejection/restart/submission assertions successfully.

## Remaining scope

UNRUN: paid real model corpus/quality evaluation, real GoTrue and deployed Staging
producer→consumer, new/previous remote migrations and backup/restore, real-data
policy binding, complete source/procedure/topic coverage, final edited-statement
span entailment, withdrawn-source dispatch barrier, persistent worker timeout/crash/
unknown-fee recovery and full native/physical/Store acceptance. No keys requested,
no remote schema/permissions changed, no automatic publication or parent closure.

#359 stays open. This PR requires its own CI and merge authorization; previous
one-round CI waiver is not reused. Disable the new entry on rollback, retain all
stored versions/candidate links/receipts and forward-repair applied migrations.
