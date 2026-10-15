# Qualified-intake chronological loader candidate, not applied here

Original shared test remains untouched. Main owns its released before-loader hunk.

The original before-hook excludes20261003030000, creates its two private functions only after replaying every later migration, and therefore reaches the canonical strict namespace guard with243 rather than245 functions. The frozen245 namespace SHA is1f871f82b3d7831ee8fbcb0dcee666e0e383f2921210e2d632299c5b2f453695. Removing exactly project_planning_qualified_comparison_v1(uuid,uuid,uuid,text,text,jsonb,text) and valid_planning_qualified_comparison_v1(uuid,uuid,uuid,text,text,jsonb,text,jsonb) gives243/c14ef9547af24d48f9069b7f09f8eb65aa1104e8fe43857b61fffcdf371d4005, exactly matching the official17.6 failure.

Owned native17 reproduction uses the same omitted migration, not dummy functions or an allowed hash. It verifies exact missing/extra sets and the real guard refusal. Restoring only the actual reviewed missing migration makes the full canonical append pass with all original guards. This is a causal fixture diagnosis, not managed-PG/GoTrue acceptance.

The before/after candidate changes only bootstrap order: prefix strictly before mine; original mine rollback/absence assertion and commit; suffix strictly after mine. It preserves full current-checkout dependencies, all four business cases, every assertion/negative/ACL, the original timeouts, and cleanup. Product SQL/ACL restoration and namespace guard remain unchanged.

Only four visible official hook failures have this proven cause. The fifth of719 tests is outside the available tail and remains UNKNOWN; no other fixture is changed or asserted to share this cause. Main must apply the exact shared hunk under its lease; this owner will verify that fixed source on a new isolated native instance when provided.
