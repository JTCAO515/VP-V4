# S2 native grounded event reconnect — local integration

Status: implementation and local validation passed on base815b465. This is not full #196/S2 or Staging acceptance.

Native v4 consumes a bounded live SSE connection, preserves canonical Turn eventId/sequence and applies a complete validated terminal card atomically. Current source projection is revalidated even after terminal cursor acknowledgement. Reconnection performs reads only; existing request-before-send, ServiceTask, consent and budget contracts remain unchanged. See docs/contracts/vpj-08.md.

Observed locally: SQL initial11/11, encoding2/2, real GoTrue/HTTP/SQL integration1/1 (held model, disconnect, exact-cursor reconnect, terminal on open connection, one dispatch, foreign owner and policy/source revocation). Swift state9/9; real native byte transport/store/Cancel1/1; zh/en UI2/2 including process restart and36s source refresh. Model/content are synthetic and local. The inspected screenshots show conditions/exclusions and retain synthetic labels. Native live2 used four synthetic model calls (one cancelled task); no real provider or user charging claim. Build and source-policy checks passed. Independent permission/data review0Critical/0Important, hashes retained.

Retained failures: native-live1 test compile failed because async let captured XCTest self; helper made static with no unchecked concurrency escape. sql-final first expected UNAUTHENTICATED while the actual deleted-session guard returned SESSION_REPLACED; accepted auth-denial taxonomy corrected. sql-final-2 short1.5s lease expired before authorization under concurrent native compilation, so its expiry-barrier test failed; serialized final rerun passed11/11 including actual short-lease expiry and deleted-session rejection. No failure is counted as PASS.

Final native transport deadline/cancellation build and targeted tests passed10/10 (nine state and one actual local native event test), with two synthetic calls; no duplicate send. The same UI layout/consumer behavior is reused from live2; no new full UI claim for later transport-only cleanup. Final SQL passed11/11; PR/CI and Staging42/native observation remain pending. Staging41 backup and offline restore verified, no remote migration or runtime window yet.

Broader #196 gaps remain: real remote event delivery/reconnect, post-dispatch unknown usage, complete background/offline/cancel/Trip recovery. Physical phone deferred; production release unrun and guarded. Prior PR344/345/346 evidence remains valid only within its recorded scope.
