# Unknown data-directory replacement: FAIL to PASS

Code: `c5a1d23090557fe120ecba15c57fe122593f29c1`, parent `97dffb295a74d48fac67e1f35a9337c63c90120b`.

The prior helper captured runRoot/nonce/socket identities but only rejected a data symlink. An ordinary replacement data directory without postmaster.pid passed those checks and was recursively removed. The new synthetic regression actually failed against that prior implementation (`Missing expected exception`, `data-identity-before-fail.log`).

The helper now creates an empty 0700 data directory and captures its dev/inode with the other allocated directories. Cleanup verifies all four identities before looking for a PID or deleting anything. A changed inode, missing path, or symlink fails closed. Existing postmaster-path/status checks remain unchanged.

The new test initializes only its own fresh allocation, injects failure immediately after initdb and before server start, moves the captured data directory to its own shadow root, and substitutes an ordinary directory containing a marker with no PID. Cleanup must reject while retaining both the marker and captured inode. The test then restores its own captured directory and cleans its own allocation. No real old data or prior fixture is used.

Validation on PostgreSQL 17.11 / pg 8.13.1:

- PASS: original 14 resource checks plus the replacement regression, **15/15**; `diagnostic-resource-safety-data-identity.json` and `.log`.
- PASS: published cleanup called twice; previous descriptor restoration and unknown new pointer preservation still asserted.
- PASS: actual required entry **21/21, zero skip**, `native21-data-identity.log`. Successful real initdb and cleanup also verify that initdb reuses the precreated data inode.
- PASS: node syntax checks for both changed modules and git diff whitespace check.
- Original generated wire/export evidence bytes restored after the test run; old FAIL/PASS evidence retained separately.
- UNRUN: unchanged Guide13, original59, HTTP; Main owns the directed fixed-ref review and subsequent push/CI. No product SQL, Guide, db.mjs, inspect.mjs, fixtures, selected cases, 163 inputs, or CI gate changed.

Commands use the explicit PG bin/module recorded in resource-ownership-repair.md. The safety test runs with those variables; the required `node --test tests/integration/canonical-place-ask-sql/postgres.test.mjs` additionally sets `CANONICAL_PLACE_NATIVE_PG=1`.
