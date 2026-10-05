# Native J3 → J4 ownership and integration request

Owner: 01a10cc7-2f7f-7b92-bd91-4d69e95bc378. Branch/worktree: vpj48-native-community-experience-20261006. Base c515848; fixed J1 acb5ea21 and J2 ee211ecd normally merged. Original dirty checkout untouched.

Sole new source scope: Features/CommunityExperience/** and NativeCommunityExperienceTests.swift/Fixtures/CommunityExperience/**. No SQL, VoiceAudioDriver, target activation or original journals altered.

Before writing shared files, Main please obtain original owner release and grant exact leases:

1. App/NativeSession.swift: additive publicationActor (existing communitySafetyActor identity/expiry), separate bounded actor/session-bound publication transport, own recovery journal wrappers and own verified cleanup BEFORE preservePendingJournals. Existing transports/limits untouched.
2. Features/Explore/ExploreView.swift: one authenticated bounded Experience destination; no feed redesign.
3. Features/Knowledge/KnowledgeView.swift (actual Library path to be confirmed): one opaque saved Experience reference destination; existing Fact/place readers untouched.
4. Features/CommunitySubmission/NativeCommunitySubmissionView.swift: approved-own-item publication preview destination, exact ID only, no inherited body or permission; author withdraw/delete remain original J1 commands.
5. project.pbxproj: new own source and test membership only (proposed prefix F1489 after collision check).
6. Shared Trip/place flow only if necessary after original canonical place contract audit; original Proposal diff/confirmation stays sole write authority.

Sole TS producer please freeze canonical J3/J4 WIRE with publication state/version/author consent/rights/current source/safety/expiry/reader block/current endpoint actor. Need owner preview/publish/withdraw, exact read/list, opaque save references, inventory/export/delete and exact mutation/recovery wire. Public audience stays disabled. Internal approved is unavailable for public reads. Unknown rights/provider cannot enable publication or produce success.

Native reads will be process-local, bounded by both server absolute expiry and request-start monotonic TTL; no body/permission in old links, saved references or restoration. Background/account switch/denial clears content; new journal/export files must use existing private protection and verified erasure fence. Experience is never Fact; only current real canonical place may open original Save/TripProposal actions. Source invalidation never automatically deletes confirmed user Trip items.

Status: first own file written; implementation beginning. No shared lease granted, no full app/runtime/target PASS claimed.

Main 70a4d2 authorization received: controlled_registered only; own-text is an author declaration plus an independent limited review, never third-party copyright clearance/legal assurance. Consumed current TS publication/contract.ts and WIRE.md. Native Input explicitly forbids rightsReview/publish/revoke/queue/inspect including nested recovery; those remain Ops-only. Native author uses preview/requestPublication/mine/withdraw only. Lifetime/closed models/commands/outcomes/private export+journal+Store now written. Preliminary iOS SDK typecheck r1/r2 passed with extracted actual dependent definitions (not full app build or runtime evidence).

Additional precise shared request: CommunitySafety/NativeCommunitySafetyView.swift constructor: additive initialObjectID:String?; selectedCollection remains objects for that path; reload's existing store.read(objectID:...) branch after restore; existing authorSubmissionID/dispositions and all other UI unchanged. Needed to open current legitimate server-projected Experience.submissionID in original report/block caller, never a typed foreign UUID. Main obtain sole original J2 owner release before edit. Without lease, own caller will expose general original Safety destination but cannot claim exact-object J2 integration complete.

Actual Library path is Features/Knowledge/NativeKnowledgeView.swift. Proposed entry lives beside NativeLibraryProposalReferenceView in non-question branch; Explore entry must live in actual NativePlaceSearchView header, not previewBody. Prefix F1489 has no current collision.

Correction after Main's actual original Library lease: entry is in NativeLibrarySources.swift, additive savedExperiencesOpen + one button + one owned sheet only. NativeKnowledgeView untouched. Main leases now received for Profile, Session, PBX, J1 author link, Explore append link and NativeLibrarySources append link; normalmerged latest J1 0a7ee316 + J2 d738d0e4. No VoiceAudioDriver edits (only normal inherited upstream merge).

Actual caller implemented in NativeExperienceView plus native Session access/typed request/verified own export+journal cleanup BEFORE preserve branch. Native author never sends Ops-only actions, no fake public success. Canonical place wire has no provider tuple; NativeExperiencePlaceActionsView obtains a real matching current row via original NativeCommunityPlacePicker, compares canonical ID+mappingDigest, requalifies Experience again, then opens original NativePlaceActionsView/Proposal. No synthetic provider ID or name matching. If the user has no matching saved row, this path remains honestly unavailable with original Explore entry. Source failure never deletes confirmed user Trip.

Full testbuild-r1 FAIL (own missing ViewBuilder), fixed; full testbuild-r2 PASS on product source before subsequent tests/one refresh UI adjustment. Testbuild-r3 in progress. No runtime count yet. Current Safety link is general legitimate J2 reader; exact-object constructor lease request above remains pending, so full J3/J4 native acceptance is NOT complete.

Current evidence supersedes preceding progress only: full testbuild-r6 PASS; runtime-r1 actual 5 unchanged lifetime/journal/export cases PASS and 1 Session fixture FAIL (body stream ignored); fixed fixture, runtime-r2 actual6PASS0skip: two Experience affected cases + two original J1 + two original J2 Session/header/cleanup negatives. Reuse the unchanged5; no fresh whole11 claim. Six Swift-generated command/recovery fixtures copied ONLY from owned Simulator A0F21FA2 into VisePandaTests/Fixtures/CommunityExperience; current TS canonical parsePublicationInput actual6PASS offline. All remains synthetic local, not GoTrue/SQL/realtarget proof.

Pending precise blocker still required for complete Native J3/J4: grant original CommunitySafetyView initialObjectID/reload additive hunk. Current general Safety link is honest but not the complete same-object caller. No arbitrary UUID textbox or foreign reader grant added. Main please relay/lease that one hunk; new owned modules are otherwise implemented and under validation.

Local retained-data inventory: process-local current Experience/preview/metadata windows <=30s from request start and absolute server expiry; own Keychain `com.visepanda.native.community-experience.v1.<endpoint>` exact native mutation bytes, bound owner/epoch/session, until acknowledged or session cleanup; own `NativeCommunityExperienceExport` root protected complete/0700/0600/excluded backup, <=1MB, request-start30s, physically erased on expiry/background/account/denial. No persistent Experience body/index/cache/URL permissions. New scoped `export`/`delete` caller is wired to the canonical publication module. Original J1/J2 exports/deletes remain separate. Unified all-account dispatcher is not_enrolled; no all-account deletion claim.
