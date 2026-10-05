# Precise CI registry release to Main

At current `51ac704a` the worktree and
`scripts/ci-suites/db-integration.mjs` are clean. There is no in-flight write to
the postgres files list and no planned write to the requested frontier entry.
Explicitly release **only adding**
`tests/integration/community/frontier-lock-postgres.test.mjs` in that list to the
original #663 integrator via Main. Original `VP_COMMUNITY_DB_TEST` gate, all old
entries, zero-skip/classifier checks and other lanes remain unchanged.

This thread's committed registry delta is exactly one separate Native HTTP step
`material-reference-http` at `51d2d3ad`, port63360, owning its real Auth test path.
Preserve that step. This thread's future material PG flag/root/entry will be
appended only after the new SQL owner freezes the actual sources; do not interpret
this release as granting a second material writer or a whole-registry replacement.
Normal immutable dependency merge reconciles the two disjoint additions.

Reply is in this owned file because direct cross-chat messages are not authorized;
Main uses its normal relay. Other material/Native work continues.
