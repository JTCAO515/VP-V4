# VPJ-31 Native verification

Fixed Native source: `5e5cdb4f31747cfbed806bda13bb18c1cf7070fb`. Parent is normally integrated #654 final `0e3e946dd400b1c99ba0981f760b338e94129224`; no old shared-file copy.

The owner enters from the same Case row, chooses real server-qualified source options (saved pace, latest three eligible explicit preferences, or current Case-linked intake), privately previews, individually selects fields, and explicitly confirms sharing. All sources and fields start unselected. Unknown fields have no value and cannot be selected. No inferred/sensitive personality producer is invented. Budget and requirements use the actual typed intake value.

Current recipient/Case/purpose/grant revision/Brief revision/server source digest/preview ID/current actor must match. Source changes, background/navigation, session replacement, TTL and refresh invalidate review. Share writer checks exact selected keys before retaining bytes or dispatching. Shared subset source digest is independently validated, not compared to full preview digest. Owner audit and expired/revoked/feature-off withdrawal/deletion use original Case binding and fresh audit revision, without granting staff access.

Write-before-send device Keychain journal retains original bytes. Unknown ACK/null receipt/wrong digest preserve the operation. Original-byte retry and explicit server abandon are distinct from Undo. Server erased recovery has an explicit device stop with unknown outcome. NativeSession denial preserves journals; explicit logout erases the new journal alongside all seven existing journals and fences identity on erasure failure.

Export is a separate reference-only Brief companion with exact actor/session/request and 30-second lease. Source values are not copied; attachments are unavailable and core account export is not enrolled. Closed row validation rejects retained source refs in deleted/withdrawn/invalidated states. An explicitly invoked Share sheet uses only the current lease; protected temporary files are removed on expiry/background/account/navigation, and startup sweeps orphan files. This does not claim deletion of external copies.

## Observed checks

- Xcode 27.0 build 27A266a; iPhone 17 Pro / iOS 26.5 Simulator UDID `42675EC5-6837-4F73-B478-7D979D5DA392`.
- Initial generic unsigned Simulator build PASS before the final privacy refinements. It is not evidence of a final generic build.
- Initial and r2 tests failed compilation due to XCTest actor initializer isolation (r2 also missing try). Corrected using the repository's nonisolated XCTest class plus MainActor methods.
- Affected pre-final run: Native Brief 13/13 and existing Service Operations 22/22 PASS, zero skip. This validates unchanged service/session behavior; it is not a claim of final combined tests.
- Final source: NativeTravelerBriefTests 14/14 PASS, zero skip, with final app and test targets compiled. Covers unchecked fields, stale preview digest, unknown/inferred and wrong-Case source rejection, min-subset digest, session/grant/source review changes, original bytes and epoch, lost ACK/null/wrong receipt/abandon, late account response, storage failure, TTL, export scope/lease/erased refs, owner cleanup without active preview, actual NativeSession denial-preserve and logout/failure behavior via synthetic URLProtocol.
- PBX plist lint and staged diff checks PASS.

## UNRUN

Authenticated HTTP/Postgres permission/concurrency/source lifecycle is owned by TS/SQL and not claimed by Native fixture tests. Real staff enrollment/GRANT, real user data, provider/fees/contact, target schema activation/deploy, physical phone authorization, zh/en rendered UI/VoiceOver/human acceptance and real external sharing remain UNRUN. No such action was performed. Integrator owns the one combined PR and final required checks; this Native handoff is not whole Issue closure or production acceptance.
