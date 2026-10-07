# Actual owner device-journal sources

Base `0295c91b` includes unmerged Guide/Turn/Offline/Profile dependencies. Source inspection
found **22 feature Journal/Pending files, plus seven Session companion requests = 29 sources**.
This is a fixed service allowlist, not Keychain enumeration. A row uses the original decoder
and current reader eligibility; errors/corruption/old epochs/session mismatch are `unavailable`,
never `absent`. Only `errSecItemNotFound` from the exact original service can establish absence.
All keys below use the current `scope.subject` account and literal current endpoint suffix `E`.

`L` = `com.visepanda.native.local-session.v2`; `N` = `com.visepanda.native`.
`A` = current `NativeDataScope` endpoint/owner/mobileEpoch/generation.
`S` = A plus the original verified JWT session ID. Generation is a live-operation fence,
not an invented persisted field. Session's current `communitySafetyActor()` is required for
this feature; older non-JWT legacy product readers retain their original independent ABI.

| File/source | Exact service | Original qualification/reader and decoder | Export | Original completion/retention |
| --- | --- | --- | --- | --- |
| NativeDataCoverageJournal / coverage | N.data-coverage.v1.E | S; `read(actor)` with original `NativeDataCoverageCommand.matches(actor)` | operationId/trip/action only; nested module content excluded | original verifier + `completeOriginal`, then coverage `complete`; stop/unknown excluded |
| NativeMaterialReferenceJournal / materialReference | N.material-reference-data.v1.E | S; `read(actor)` + sole `NativeMaterialReferenceCommand` erase decoder | exact closed erase bytes, no material body | original receipt binding/requestDigest; Store `journal.complete` + physical readback |
| NativeProfileDataJournal / profile | N.profile-data.v1.E | S; `read(actor)` + `validateConfirmation` | exact closed erase bytes, no Profile body | original typed receipt + synchronous Session projection fence, original `complete` |
| NativeConversationDataJournal / conversation | N.conversation-data.v1.E | S; `read(actor)` + `validateConfirmation` | exact closed erase bytes, no conversation body | original typed receipt + Session projection invalidation, original `complete` |
| NativeServiceOperationJournal / serviceOperation | N.service-operations.v1.E | A; `read(scope)` + command.validate | operationId/caseId/action; recipient/body/authority excluded | `NativeServiceOperationReceipt.decode` binds original digest; `complete`; erased-UNKNOWN stop excluded |
| NativeTurnDataJournal / turn | N.turn-data.v1.E | S; `read(actor)` + `validateConfirmation` | exact closed erase bytes, no Turn body | original typed receipt + synchronous Turn/Result projection fences, original `complete` |
| NativeReservationJournal / reservation | L.reservation-confirm.E | A; `NativeReservationJournalVault.read` + original command | operationId/trip/confirm; original order content/source/authority excluded | original `confirmation`/`operation` verifies original command and receipt; `complete`; pre-write rejection is not a receipt |
| NativeCommunityJournal / community | N.community.v1.E | S; `read(scope,sessionID)` + NativeCommunityCommand | operationId/action; publication body/recipient content excluded | original outcome decoder/terminal matches original operation/submission; `complete`; no new publication/replay |
| NativeRecoveryJournal / recovery | N.local-recovery.v1.E | A; `read(scope:)` + pending.validate | operationId/trip/stage; report/provider/proposal body and authority excluded | original select outcome validates original request/receipt; `acknowledge` then explicit `finishTerminal`/remove; preparation receipt does not prove completion |
| NativeTripLifecycleJournal / tripLifecycle | L.trip-lifecycle.E | A; Vault.read + original command validates expectedSessionId/revision | operationId/trip/action; Trip title/preference authority excluded | original terminal/recovery decoder binds original command; original `complete` |
| NativeTravelerBriefJournal / travelerBrief | N.traveler-brief.v1.E | A; `read(actor)` + original command | operationId/caseId/action; recipient brief/body/authority excluded | original receipt validates operationId/requestDigest/action/case/grant/revision; `complete`; erased-UNKNOWN stop excluded |
| NativePDFJournal / pdf | L.pdf-intake.E | A; Vault.read + matches validates exact bytes and original command digest | operationId/trip only; PDF/patch/licensed content excluded | confirmed original operation + actual Trip readback, or exact cancelled operation; original `complete`; existing `recover` can send when absent, so new flow does not call it |
| NativeCommunitySafetyJournal / communitySafety | N.community-safety.v1.E | S; `read(scope,sessionID)` + original command decoder | operationId/action; reasons and recipient content excluded | original outcome terminal validates original operation/record/kind/submission; `complete`; no generic report/delete executor |
| NativeNotificationDataJournal / notificationData | N.notification-data.v1.E | S; `read(actor)` enforces sole erase decoder | exact closed erase references only | original immutable requestDigest/binding receipt; `complete` |
| NativeCoverageProgressJournal / coverageProgress | N.coverage-progress-data.v1.E | S; `read(actor)` + original `validateErase` | exact closed erase references only | original typed receipt/requestDigest; `complete` |
| NativeArchiveDataJournal / archive | N.archive-data.v1.E | S; `read(actor)` + original `validateConfirmation` | exact closed export/erase reference confirmation bytes; no archive body | original verified export binding/encrypted file or erasure receipt; `complete`; discardUncertainExport excluded |
| NativeExperienceJournal / experience | N.community-experience.v1.E | S; `read(actor)` + original ExperienceCommand | operationId/action; authored/licensed publication body excluded | original outcome matches original input/operation; `complete`; no publication/provider replay |
| NativePlaceActionJournal / placeAction | N.place-actions.v1.E | A; `read(scope)` + original command.validate | operationId/trip/action; identity reference body excluded conservatively | original receipt/cancelled decoder binds pending original request; `complete`; original Proposal confirmation stays separate |
| NativeScopedTripJournal / scopedTrip | L.scoped-trip-edit.E | A; Vault.read + original command/basis decoder | operationId/trip/action; reviewed patch/provider/licensed body excluded | only original strict declined/candidates/proposal/lock receipts observed; envelope-only terminal/UNKNOWN/abandon is not a local receipt |
| NativeResultDataJournal / result | N.result-data.v1.E | S; `read(actor)` + original `validateConfirmation` | exact closed erase reference bytes; no result body | original immutable requestDigest/binding receipt + synchronous projection invalidation, original `complete` |
| NativeNotificationJournal / notification | N.notifications.v2.E | A; `read(scope)` + pending.validate | original `exportMetadata` boundary: operationId/trip/action; **token and reason never exported** | original mutation receipt.matches command, device binding projection then `complete`; no pure receipt reader, explicit original UI retry/abandon only |
| NativePlaceGuidePending / guide | L.place-guide-operation.E | A; original stored read extraction + selection/validatedRecovery; unfenced expired record is unavailable | operationId/trip/reference metadata only; question/text/audio/prompt right excluded | original Guide history/ack paths remain; fenced/bodyless or missing exact question/identity proof is UNKNOWN for the local receipt; no journal expiry writer invoked by listing |
| NativePendingAsk / ask (companion) | L.E credential **pendingAsk field only** | original retainedPendingAsk + physical original Session.read(owner) validates epoch and equal pending; credential never leaves Session | extracted pending operationId/mode only; user/quoted input excluded | original policy-scoped history + pending.matches(recovered) verifies original input and Task fields, then `clearPendingAsk`; consent withdrawal/erase without that proof excluded |
| NativeTripSupportConfirmJournal / tripSupport (companion) | L.trip-support-confirm.E | A; original tripSupportConfirmationRecovery + request() | idempotencyKey/trip/confirm only; support authority/proposal body excluded | original historical or applied support receipt + matching proposal/version/support set; original complete; visible Trip confirmation never bypassed |
| NativeDeviceMaterialDeleteRequest / deviceDelete (companion) | L.device-delete-request.E | A; original pendingDeviceMaterialDeletion + strict request.decode/namespace | requestId/delete only; file identities/material body excluded | original selected physical deletion + immutable retained local receipt; original request removal/readback; retained receipt remains outside pending cleanup |
| NativeReadinessPendingSave / readinessSave (companion) | L.readiness-save.E | A; original readinessSaveRecovery + parsed() | operationId/trip/save only; private declaration/material/body excluded | original assessment save decoder has no independent immutable exact-request receipt reader; original UI only, UNKNOWN local completion; basis-change discard is not proof |
| NativeLinkedTripDeleteJournal / linkedTripDelete (companion) | L.linked-trip-delete.E | A; original linkedTripDeletionRecovery + decodedRequest | requestId/trip/confirm metadata only; selected sets/authority excluded | original completed receipt validates request/plan/trip/scopeDigest/selection; original complete; queued/cleanupPending is not completed |
| NativeMemoryDeleteJournal / memoryDelete (companion) | L.memory-bulk-delete.E | A; original memoryDeletionRecovery + command() | requestId/confirm metadata only; Memory sets/authority/body excluded | original completed receipt validates request/plan/digest/selection/tombstone/no cleanupPending; preferences invalidation then original complete |
| NativePendingTripDeletion / tripDelete (companion) | L.trip-deletion.E | original pendingTripDeletion is owner-only, **no persisted epoch/session** | present legacy record is unavailable for current-epoch export; absent requires exact service notfound | original request remains; do not add epoch, loosen old reader or fabricate current-session completion |

## Other retained records are not pending-cleanup sources

`NativeNotificationJournal.bindingService(E)` (`N.notifications.v2.E.device`) is a persistent safe
server-device binding, not an unresolved request. APNs authority and StoreKit/entitlement/payment
records are never swept or presented as pending. `L.device-delete-receipt.E` is the original
immutable local material receipt and remains retained. Original Session credential (`L.E`) is
read only inside Session to validate the extracted Ask field; access/refresh token, password,
headers and credential serialization never enter JournalData's source/output/logs.

Source identity hashes do not grant content rights. Metadata-only rows explicitly state exclusions;
there is no reconstruction of PDF/provider/published/recipient text or export of authorization.
Original server records, Trip/Memory, immutable domain receipts, minimal financial/audit/fences,
other owners/endpoints/sessions, AppGroup/shared materials and external/backup copies retain their
original boundaries. `local_journals` does not stand in for their separate catalog rows.
