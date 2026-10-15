# IOS-001 E3 server source integration evidence

The seven pinned files were extracted individually from candidate `2d07419a99458589e5bfe0e806e9e5e6107aa247` onto QA base `22559396eec5cd47d3a4d3d2a2bd5e49d52c6c7c`. No SQL, shared readers, configuration, lockfile, CI or Native sources were imported or changed. Product and test source bytes match the original pins; all 29 transitive dependencies match the original proof on this QA base. See source-proof.json.

Validation on these exact product/test bytes:

- PASS: `node --test tests/contract/journey-entry/goal-return/*.test.mjs` (5 tests across the original 3 test files; 0 skips).
- PASS: `node node_modules/typescript/bin/tsc --noEmit --incremental false` (empty successful diagnostic output).
- PASS: `node scripts/lint.mjs` (846 source files).
- PASS: `node scripts/docs-check.mjs`.
- PASS: `git diff --check` and individual SHA verification.

Dependencies were consumed through a temporary symlink to Main's existing node_modules; no install, lockfile or global configuration change. The symlink is removed before delivery.

The actual-sql-receipt test decodes the historical ordinary-authenticated transaction receipt pair only. Its nonce is provenance data, not authority to reuse any environment. Historical r1-r9/155 signed Auth and PG17.6 evidence remain restricted to their original source and environment. No historical bootstrap, Docker, nonce, framework test, or old migration was copied.

Current QA SQL/catalog/runtime, signed Auth HTTP, Native integration, target/device/provider, build, formal exact-head review, applicable CI and protected QA merge are UNRUN here. The separate SQL owner owns append 20261015024450; the old 120100 migration is absent from this change. Main owns Session/Conversation/PBX/CI integration. #203 remains open. Unavailable/unknown produces no fallback decision or inferred next step; no write, generation, selection, fee or configuration enablement is added.

Original V5 worktree remains at cca65b1977d9b3d9fe6e53078f10576421e5c77d with AGENTS.md SHA256 687b91defb004d5bcb1e75e4759b6497c4da4e5860e03b07e740a9ed44e83be2 and next-env.d.ts SHA256 0f70629890b72a0a82e91972cc032c04b658b26c265373cb711cf576bfbf8fcc unchanged. This evidence is scoped to the source slice, not a second current HANDOFF.
