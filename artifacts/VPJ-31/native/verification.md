# VPJ-31 Native verification

Fixed Native source: `5e5cdb4f31747cfbed806bda13bb18c1cf7070fb`. Parent is normally integrated #654 final `0e3e946dd400b1c99ba0981f760b338e94129224`; no old shared-file copy.

The owner enters from the same Case row, chooses real server-qualified source options (saved pace, latest three eligible explicit preferences, or current Case-linked intake), privately previews, individually selects fields, and explicitly confirms sharing. All sources and fields start unselected. Unknown fields have no value and cannot be selected. No inferred/sensitive personality producer is invented. Budget and requirements use the actual typed intake value.

Current recipient/Case/purpose/grant revision/Brief revision/server source digest/preview ID/current actor must match. Source changes, background/navigation, session replacement, TTL and refresh invalidate review. Share writer checks exact selected keys before retaining bytes or dispatching. Shared subset source digest is independently validated, not compared to full preview digest. The initial source used original Case binding and fresh audit revision for owner cleanup. The follow-up below removes that audit dependency, without granting staff access.

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

## Owner cleanup metadata follow-up

Fixed minimal Native delta: `03dce7eb7c4a9aa9f3698dc0990d70e1238b294c`, matching TS `owner_state` closed wire at `6f69963a24e9725759f24d2930b20dcd593c2ad6`. Four owned files changed; no Session/Profile/PBX or other UI-domain changes.

The previous cleanup binding required complete audit readability. The server's honest audit-limit denial could therefore hide withdrawal/deletion. Cleanup now uses independent fresh owner metadata: exact schema/kind/Case/owner/current recipient/grant revision/Brief revision/state, with a 30-second local boundary and current-actor fencing. It accepts actual absent revision 0 for explicitly deleting private previews; never-granted null recipients are not fabricated. No fields, source digest, source refs or history are accepted in this metadata. Mutations keep exact Case/CAS/current-server-authority/original-byte recovery.

Audit still requires the unchanged complete response and limit. An unavailable audit is shown honestly, independently of owner cleanup. No truncation, fake completeness, staff access or permission change was added. Deleted Cases cannot be revived by owner metadata; existing receipt recovery remains the original path.

Final affected Native test run: **17/17 PASS, zero skip** on the same Xcode 27.0 / iPhone 17 Pro iOS 26.5 Simulator. App and test targets compiled. Added checks exercise audit `BRIEF_LIMIT` while withdrawal succeeds, absent revision 0 deletion without audit/active preview, and rejection of nonowner/wrong Case/additional content/boolean revisions/null-recipient cleanup/expired metadata/late account responses. These are Native transport/vault fixtures, not an independent PG/HTTP or target-environment claim. Existing 22/22 Service Operations evidence is reused because its files and Session behavior are unchanged by this delta.
