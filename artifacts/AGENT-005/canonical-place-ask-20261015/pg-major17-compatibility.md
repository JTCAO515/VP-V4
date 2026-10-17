# Native17 helper compatibility correction

The original helper required patch 17.11 although the accepted native17 CI provision and SQL inspector require major 17. Only the owned helper version predicate/error and its README were changed. The helper now requires the standard postgres major-17 version output and retains the actual server version in its emitted evidence. Workflow, provision, SQL/catalog/ACL/MAINTAIN checks, source manifest, required zero-skip activation, namespace, no-TCP and 0700 assertions are unchanged.

The original fixed-head helper was executed against a synthetic 17.12 version string and rejected it before client loading. The corrected actual helper version gate accepts synthetic 17.1, 17.11 and 17.12 strings and rejects 16.15, 18.0 and 170.1. These probes stop before loading a PG client or creating a cluster; they are gate-only checks, not runtime evidence for those patch releases.

Actual existing HTTP/SDK/resident/ordinary-role PG entry: 12/12 PASS, 0 skipped, on PostgreSQL 17.11 (Homebrew). Actual emitted database evidence retains listen_addresses empty, unix_socket_permissions 0700 and the complete server version. Source SQL/fixtures remain the same pinned coherent inputs as the prior successful run. Syntax and diff checks PASS. Other unchanged tests reuse the prior same-source evidence; no wider matrix was run.

Compressed original gate rejection, gate probes and actual 17.11 runtime output are preserved beside this note. Earlier failure/pass evidence was not replaced. C0 synthetic identity and closed provider transport boundaries remain unchanged; this does not establish live Auth/PostgREST/provider, Native UI or target acceptance.
