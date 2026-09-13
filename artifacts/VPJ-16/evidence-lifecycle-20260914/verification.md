# Evidence lifecycle — S2 integration in progress

Related to #206/#264. Baseline main8e95279 / PR371 is merged. Its final Quality34771205900, Budget34771205904, Native34771205917 and Preview passed; Production deployment was cancelled and all aliases unchanged at2026-09-13T17:30:24Z.

This slice verifies live eligibility changes without rewriting original completions: current support, a newly published conflict, natural conflict expiry, then natural support expiry. A historical partial must not silently gain evidence after its original gap resolves. It adds no runtime/migration change. The new test uses ordinary author/reviewer publication and real elapsed time, with no SQL expiry rewrite.

PASS: isolated PostgreSQL17/17, zero skips, about50seconds; source syntax and diff checks. The new lifecycle scenario preserves original completion/Turn/work snapshots and owner isolation. This is a disposable database test with controlled classification, not live model or Staging acceptance.

Staging read-only preflight at2026-09-13T17:35:48Z:46 migrations,6users/3Trips,315 attempts/0unresolved, reader/Ops false/members0; original card relation remains revoked. Actual fault scenario remains **UNRUN**. Dedicated Preview provisioning has started; no reader/Ops activation or new publication/model call has occurred for this slice.

Frozen scenario: `tests/fixtures/knowledge/evidence-lifecycle-v1.json`. At most4 new model attempts,28 million CNY micros total reservation and35minute window; estimates and unknown billed charges remain separate. Two explicitly synthetic statements, separate normal author/reviewer identities, current-input-only classifier and existing native/Web readers. Card support expires after20minutes; conflicting mobile support after5minutes. Preserve original12 statements/publications and all old task/Trip records; revoke only the two new candidates, disable both switches, remove owned memberships and exact host allowance, and sign out in cleanup. Never reactivate the original revoked record.

This additional payment scenario does not fulfill frozen museum/ferry H07/H08 or complete12-case Harness. H08 was visible during readiness review; do not claim it remained blind to this executor. Physical/VoiceOver, source injection, provider-unavailable, full S2 and Production acceptance remain UNRUN. Maps draftPR372 remains the only independent preparation lane and has not made actual provider calls.
