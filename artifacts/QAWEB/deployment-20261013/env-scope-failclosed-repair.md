# Deployment metadata fail-closed repair

Addresses the single Spec P2 in Main's fixed 8c445913..bd5a4727 deployment delta review. Only owned pin.py/test-pin.py changed; no platform request, deployment, environment, domain, credential, flag or budget operation ran.

Before selecting effective QA records, validate an explicitly supplied env list and every record's key/type/target/gitBranch. Missing or non-list inventory, unknown/non-object records, missing scope fields, invalid/empty/duplicate/unknown targets, invalid Git branch syntax or a branch on a non-Preview scope, and malformed custom-environment IDs refuse preparation. A declared empty list is distinguished from omitted/unknown inventory. Branch syntax checks use local refs/heads syntax only: no reflog, remote lookup or output of the supplied value.

Only after that complete check can existing QA-enable and opaque/mismatched target-ref checks run. The same ordering protects candidate and reviewed request preparation; missing target/branch cannot silently exclude a QA enable/ref record. Safe output still has only key/type/target/gitBranch, without value. Secret-value sentinels remain absent from serialized packets.

Actual validation: 10 local offline tests PASS, including original binding cases plus missing/non-list env, missing key/type/target/gitBranch for QA enable/ref and unrelated rows, invalid scope and explicit empty-inventory cases. Source syntax and git diff/docs checks PASS. No live project/environment or runtime acceptance is inferred, and Main final review/required CI gates remain unchanged.
