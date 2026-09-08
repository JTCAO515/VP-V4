# VPJ-01 native foundation slice

Class A, repository-only. Related to #188; parent acceptance remains open.
Inputs: main 589cee6 with merged PR253/256, ADR-0023, VPJ-01 and existing local IOS-01 source.
Native blockers: none on GitHub at 2026-09-09. Original dirty worktree remains untouched.

Outcome: audited native project, Trip/Explore/Ask/Tools/Profile (Ask default), Today within Trip,
zh/en release selection with preserved legacy locale resources, accessible system controls.
Primary paths: ios/**. Adjacent scope: docs/contracts/vpj-01.md and artifacts/VPJ-01 for
migration and verification; shared handoff updated at meaningful completion.
Checks: native build and tests on installed Xcode using command-scoped DEVELOPER_DIR,
simulator evidence, docs/diff checks and all existing PR CI. No Web behavior changes in this slice.
Remaining: real account/Trip integration, signed device/Store acceptance, Web release-locale
migration and any accessibility observations not actually run. No capability acceptance inferred.
Rollback: revert this PR; no persisted user data or migration is introduced.
