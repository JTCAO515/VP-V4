# VPJ Issue audit — 2026-09-17

Scope: user-authorized Issue cleanup and automatic merge. Protected VPJ-02/49/62/75/76 are never mutation targets.

- `before.json.gz`: original public Issue bodies and metadata for the scoped writes, plus read-only protected snapshots and dependency numbers. Comments are left in GitHub and are not modified.
- `manifest.json`: original source commit, protection/mutation lists, snapshot SHA-256 and size.
- `definition-delta.json`: criterion deduplication/delegation and previously authorized non-protected experience criteria carried forward.
- The final `sync-result.json` records actual write/readback outcomes; absence means remote synchronization has not been recorded as complete.

Restore only a reviewed field delta after checking later edits. Never replace an active protected Issue or later progress with this snapshot. This evidence is tracker maintenance, not runtime/product acceptance.
