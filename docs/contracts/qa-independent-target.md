# Independent QA target

JT accepted the independent QA database direction on 2026-10-13. This changes the QA destination, not the Session, consent, context, budget, ownership or TripProposal contracts. Reuse #680–#683 and their original acceptance criteria. No Production data is copied and `dzqdzetcctkhbrhlxxgn` remains unchanged.

## Trusted binding

- The new QA project reference is supplied only by operator configuration or a reviewed nonsecret target package. Use `VISEPANDA_QA_SUPABASE_PROJECT_REF` for the Web configuration. It must be a lowercase 20-character Supabase reference and must not equal the known shared Production reference `dzqdzetcctkhbrhlxxgn`.
- The Supabase URL is exactly `https://<approved-ref>.supabase.co`, with no credentials, port, query, fragment or additional path. Public Web URL configuration must equal this binding. Requests, cookies, Host headers, URLs and job payloads cannot choose or override it. Missing configuration fails closed; it never falls back to the shared database. Existing local-only isolated fixtures retain their explicit localhost path.
- The hosted QA profile/package records its reviewed independent project binding. The composition root independently binds RPC and job execution to that same target, so a syntactically valid job URL for another project is insufficient. A closed new profile/package version may be used where the existing closed schema cannot express the binding; legacy S1/planning behavior remains unchanged.
- Image ID, source build, canonical profile hash, endpoint, policy/notice identity and budget identity stay bound together. QA validation uses the reviewed worker image's Node, with no host Node installation, network or credential mounts. Keep the original tmpfs/file safeguards and disabled first heartbeat.

## Fresh initialization and activation

Prepare the reviewed repository migration set against an empty independently owned QA database; do not import shared-project user rows, role credentials, Auth accounts, Storage objects or backups. Migration and protected-runtime/ACL checks must pass on the new target before activation. Initial account, policy, price, consent and budget evidence is fresh for that target; source-only or fixture evidence does not grant runtime permission.

Web deployment changes are limited to the QA branch/domain. Production aliases and environments keep their current binding. The existing ECS `db.key` belongs to the previous project and is not valid for a different reference; preserve it without reading, copying or overwriting it. A new target credential and any replacement file handoff require explicit scope and JT's secure operator input. The Qwen account/endpoint and actual spending limit also need their existing bounded authorization.

Direction approval does not approve project/organization creation, fees, new credentials, permission changes, Production maintenance or provider spending. Read-only capacity/cost discovery and isolated implementation/testing may proceed. Actual provisioning and activation require a concrete, reviewed operation and the corresponding approval.

## Validation boundaries

Test missing/invalid/shared references, mismatched public URL, cross-project jobs and packages, unavailable image/build, and accidental Production environment changes. Reuse original identity, duplicate/unknown admission, durable recovery, consent, context and budget regressions. Fresh synthetic initialization, provider transport simulation and source compilation stay distinct from real new-project Auth/Session/provider/multi-turn acceptance.
