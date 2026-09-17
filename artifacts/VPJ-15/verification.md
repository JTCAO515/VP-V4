# VPJ-15 private producer verification

## Arrival statement preparation — 2026-09-17

PASS: ARR-01 adds one original bilingual `arrival` statement to the editorial
batch after a fresh read of the NIA's 2025-12-02 notice. It records only the
official free-filing channel and the stated port-device/paper fallback, with
explicit exclusions for visa, admission, and online-only claims. The source is
an editorial synopsis with no inferred blanket licence.

PASS: all 13 batch statements pass the repository's real statement validator;
the Supported Journey Matrix maps ARR-01 as `source_revalidated_prepublication`.
Focused matrix contracts pass2/2, full `pnpm test:contract` and `pnpm docs:check`
pass. No Staging mutation, provider call, or production action was performed.

## Supported Journey Matrix refresh — 2026-09-17

PASS: `supported-journey-matrix.json` now maps exactly the existing 12-statement
editorial batch: payment, connectivity and rail across Shanghai, Beijing,
Guangzhou and Chongqing, plus the Chongqing-only attraction records. The matrix
is deliberately development evidence only: it records the prior bounded Staging
observation and its current disabled reader, never a current product capability.

PASS: the contract test rejects any attempt to turn research-only candidates or
city/scene scope drift into supported statements (2/2 focused; full `pnpm
test:contract` and `pnpm docs:check` pass). It keeps N-01 arrival, airport
ground transport, accommodation/emergency and non-Chongqing attraction content
explicitly out of the supported cells.

Base: main `a414c2a5961755aa64cfe135da8065837e18ba33` (PR317/318 merged). Branch: `codex/knowledge-draft-205`. This is one necessary private producer increment for #205; no city selection, real travel material, licence grant, Fact publication or product retrieval acceptance is claimed.

## Actual local runtime

A newly generated, exclusively owned `vp-ops-review-*` Supabase instance started at migration34. Through real GoTrue accounts and Web SSR Cookies, the suite created a legacy text receipt, applied migration35 with the CLI, then completed the new private source/assertion workflow. The final source/browser run passed **8/8 with 0 skips**; the original VPJ-14 suite on35 also passed **8/8 with 0 skips**, including its lost-acknowledgement same-ID retry. Both independently created stacks were stopped and removed by the scoped runner; existing local databases were not used or modified.

Observed source/assertion cases:

1. A legacy receipt created before35 replays exactly after the upgrade and after restart. The public entry grants EXECUTE only to authenticated; the moved private implementation and helpers grant it to none of anon/authenticated/service_role.
2. The stored snippet SHA256 equals a locally computed hash of exactly the submitted UTF-8 snippet. Source revision, pending assertion revision and both manual expressions reload together. Locator and usage statuses remain `unverified`; publication/eligibility remain false.
3. Same source key/revision with identical declarations concurrently reuses one source revision. Conflicting declarations produce one winner and one conflict; the loser leaves no candidate, audit or receipt. Source, assertion or expression drift under an existing operation ID conflicts; legacy/structured operation-ID cross-reuse also conflicts.
4. Actual PostgreSQL triggers inject an assertion INSERT failure and a receipt UPDATE failure. Each rolls back the new source and the delegated legacy candidate/audit/receipt writes. No exception is swallowed into partial success.
5. Another member reviews the exact immutable source/assertion binding. PostgreSQL and Next process restart preserve the reviewed record and audits. Member revocation and real GoTrue global sign-out reject previously successful new and legacy receipts.
6. Chinese snippet2000 and zh/en1000-character payloads succeed inside the total UTF-8 cap; an oversized HTTP body returns413. A direct authenticated RPC cannot bypass the raw source-field limit using excessive edge padding.

Three new source-input contracts and the existing ten Ops contracts passed **13/13**. The SQL limit counts the original string's codepoints, while Web validation conservatively counts UTF-16 units. This difference does not permit SQL whitespace padding to evade its original-text limit.

## Browser proof

Using the established dedicated headless-shell fallback after the in-app Browser was unavailable, the actual existing Ops page performs synthetic author login → source/address/bilingual form → self-review denial notice → sign-out → reviewer login → review → structured detail read. It preserves the pending-only message and shows unverified locator/use declarations after review.

- [Desktop form](source-form-desktop.png)
- [Reviewed desktop detail](reviewed-desktop.png)
- [390×844 reviewed detail](reviewed-mobile.png)
- [Arabic detail](reviewed-ar.png)

The final browser run observed0 page errors and0 console errors, document `lang=ar`/`dir=rtl`, and390px document width without horizontal overflow. Screenshots were visually inspected. The first browser script failed because it checked the second sign-in page before the existing-session UI settled; the script now waits for its actual signed-in/signed-out state. The identifier input pattern was also checked with real browser native validation after correcting its Unicode Sets escaping.

## Repository checks and limits

`pnpm check` passed lint/typecheck/build and22 static/copy-claim tests. Unit12 files and contract63 files passed. Aggregate integration/security exited0 but remained **incomplete with58/1 skips**; they do not become fully accepted from the two dedicated live suites. `pnpm docs:check` and diff checks passed. `db:verify` reports baseline-present with unconfigured connection probes, separate from the actual disposable upgrade proof above.

See [commands.jsonl](commands.jsonl), [unrun.md](unrun.md) and [the owning contract](../../docs/contracts/vpj-15.md). Independent review and final remote CI remain required before merge.
