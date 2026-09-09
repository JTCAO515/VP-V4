# VPJ-56 repository preparation verification

2026-09-09; native input PR258 / 2c46519, refreshed onto main adbb623 (operator docs only).
No native business source or existing Quality PR changes.

PASS: local preflight ran xcodebuild -version (26.6 / 17F113), xcodebuild -list,
and xcrun simctl list devices available --json. Selected actual iPhone 17 Pro UDID
CC5A4866-E785-494D-9A7B-FAE14C48A96A under installed iOS 26.5.
This is toolchain/project/device discovery, not another build/test run.

PASS: Python syntax, workflow YAML parse, pnpm docs:check, git diff --check.
PASS: missing DEVELOPER_DIR smoke returned exit 1 with an explicit toolchain error.
Official pinned runner-image inventory matches the retrieved live inventory exactly.
See [commands](commands.jsonl) for actual successful preflight/static command records.

UNRUN: hosted Native iOS workflow, build/tests and upload on its GitHub runner.
The PR must provide that evidence; local preflight does not prove hosted availability.
The frozen native source already has 8 unit / 5 UI validation in VPJ-01, which remains
historical evidence rather than a new run of this orchestration script.

The workflow runs unsigned build and unfiltered shared-scheme tests, uploads real
xcresult/logs/bundle versions on success or failure, uses contents:read and no signing
secrets. Exact toolchain/runtime drift fails closed. A stable runner label can still
receive OS/security updates; the runtime environment is recorded, not claimed immutable.

Remaining operational conditions are listed in [unrun](unrun.md); #237 remains open.
