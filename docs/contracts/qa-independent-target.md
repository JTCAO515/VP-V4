# Approved QA target binding

Latest JT decision on 2026-10-13 explicitly selects the existing `dzqdzetcctkhbrhlxxgn` Supabase project and acknowledges that test and Production share its data. This supersedes the earlier independent-database direction. Reuse #680–#683 and their original acceptance criteria; do not create a project, request new credentials or restart completed work. The filename and prior commits retain that earlier decision's history; this text is the current contract.

## Trusted binding

- The approved QA project reference is supplied only by operator configuration or a reviewed nonsecret target package. Use `VISEPANDA_QA_SUPABASE_PROJECT_REF` for the Web configuration. It must be a lowercase 20-character Supabase reference and must equal the current approved shared target `dzqdzetcctkhbrhlxxgn`; no unapproved destination is selected implicitly.
- The Supabase URL is exactly `https://<approved-ref>.supabase.co`, with no credentials, port, query, fragment or additional path. Public Web URL configuration must equal this binding. Requests, cookies, Host headers, URLs and job payloads cannot choose or override it. Missing configuration fails closed rather than silently selecting a target. Existing local-only isolated fixtures retain their explicit localhost path.
- The hosted QA profile/package records its reviewed project binding. The composition root independently binds RPC and job execution to that same target, so a syntactically valid job URL for another project is insufficient. The prepared closed profile /4 and target /2 may be reused; legacy S1/planning behavior remains unchanged.
- Image ID, source build, canonical profile hash, endpoint, policy/notice identity and budget identity stay bound together. QA validation uses the reviewed worker image's Node, with no host Node installation, network or credential mounts. Keep the original tmpfs/file safeguards and disabled first heartbeat.

## Fresh initialization and activation

The current target has 75 migrations and lacks 80 repository migrations. Prepare the exact existing-75-to-155 compatibility and recovery rehearsal, preserving its data, owners, ACLs, Auth, Storage and deletion boundaries. Fresh-empty initialization remains an isolated fixture mode, not a replacement of the existing database. Migration and protected-runtime/ACL checks must pass before QA activation. New policy/notice/price/consent/budget evidence remains required; old expired policies are not revived.

Web deployment changes are limited to the QA branch/domain. Production aliases and environments keep their current binding. JT has already placed the existing ECS `db.key` and `qwen.key` for this target through hidden input. Preserve and use the original approved private tmpfs/file boundary; do not read or transmit their values, overwrite them, request repeat input or create a new project-specific slot. File preparation is not live authentication. Qwen account/endpoint and actual spending remain under their existing bounded authorization.

Shared-target approval is explicit and must not be requested again. It does not authorize irreversible deletion, access expansion, arbitrary service pause, high-privilege user-data export, a new persistent AGE recovery identity or an unbounded provider expense. Prepare one prefilled, concrete recovery/migration operation with source, exact data and role scope, encrypted destinations, retention, window, compatibility, service impact and rollback boundaries for the remaining required approval. Do not split it into repeated approvals or require JT to write JSON. Non-destructive code, isolated tests and normal protected merges continue independently.

## Validation boundaries

Test missing/invalid/unapproved references, mismatched public URL, cross-project jobs and packages, unavailable image/build, and accidental Production environment changes. Reuse original identity, duplicate/unknown admission, durable recovery, consent, context and budget regressions. Fresh or restored synthetic initialization, provider transport simulation and source compilation stay distinct from real shared-target Auth/Session/provider/multi-turn acceptance.
