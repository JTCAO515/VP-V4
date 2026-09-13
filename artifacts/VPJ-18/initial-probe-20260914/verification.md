# Initial map probe preparation

Related to #362/#208. Independent preparation alongside the S2 #206/#264 integration lane. The executable is limited to one public synthetic search plus one walking request per selected provider. No application route, SDK, consumer, private coordinate, Trip write, production environment or provider selection is changed.

PASS: six local contract checks covering official endpoint/coordinate order, city restriction, disabled and missing-key zero-dispatch, two-call limit/admission ordering, no retries, bounded response, log redaction, duration units and exclusive ledger creation; source policy lint266, typecheck, docs check, syntax and diff check. The initially missing worktree dependencies were installed with the unchanged frozen lockfile before typecheck passed. Tests use in-process response fixtures, not map services.

UNRUN: actual account access, API probes, account price/quota reconciliation, 120-query/four-city and40-route comparison, independently calibrated POI/entrance truth, client SDK loading, mainland/overseas networks and physical devices. Limited secure-configuration checks did not locate keys; the official AMap console displayed login. Do not infer that the user has no accounts or no credentials elsewhere.

The [runbook](../../../docs/benchmarks/maps/initial-probe.md) describes the concrete secure setup and command. Credentials and provider responses are not retained. Current transport failure classification is intentionally coarse; account/API error codes are preserved without messages for later diagnosis. Full #362/#208 remain open; this is not a map integration acceptance result.
