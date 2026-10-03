# Preserved actual pre-final findings

Earlier targeted logs were overwritten by the same runner; exact observed failure excerpts below are retained from tool output, not reconstructed PASS logs.
- Initial graph: `ERROR: column reference "turns" is ambiguous`, PL/pgSQL variable versus table name; repaired explicit variable conflict handling.
- Retention fixture: `SERVICE_TASK_CAPACITY_SCOPE_CONFLICT`; old text capacity requires thread.trip_id NULL. Fixture corrected to actual valid exclusive turn-bound/null-thread scope, old guard not bypassed.
- Actual erasure: `ERROR: new row for relation "text_content" violates check constraint "bounded_text_content"` on input_text empty. Runtime writes only fixed non-user deletion marker, keeps constraint; original private input/output erased, readers unavailable.
- Lifecycle patch caused actual queued null-Trip new Turn insert result code0 (negative expected nonzero). Runtime cause: unqualified auth.users `id` resolved to local entity ID under PL/pgSQL use_variable, so owner-exists check incorrectly false and fence was skipped. Corrected to `auth.users.id=f.owner_id`; the same SQL rejection assertion stays unchanged and final5/5 passes. This was not fixture-only.
- Main review947: plan graph stored Trip title and completed snapshots. Runtime hashes title, clears plan.graph and job.expected_graph/proof at completion; bounded unconfirmed expiry purge and new account cascades actual test passes. Legacy minimum D1 tombstone is deliberately retained.
