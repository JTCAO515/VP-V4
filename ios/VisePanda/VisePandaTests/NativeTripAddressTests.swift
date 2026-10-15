import Foundation
import XCTest
@testable import VisePanda

nonisolated final class NativeTripAddressTests: XCTestCase {
    @MainActor func testCodecDraftSourceExactConfirmationAndReadOnlyRecovery() async throws {
        let decoder = JSONDecoder(), encoder = JSONEncoder()
        func check(_ value: @autoclosure () throws -> Bool) throws { let result = try value(); XCTAssertTrue(result) }
        func rejected<T: Decodable>(_ type: T.Type, _ json: String) {
            XCTAssertNil(try? decoder.decode(type, from: Data(json.utf8)), json)
        }
        let original = "  广州市\n越秀区  "
        let address = try NativeUserProvidedAddress(text: original)
        try check(try decoder.decode(NativeUserProvidedAddress.self, from: encoder.encode(address)).text == original)
        XCTAssertTrue(NativeAddressText.valid(String(repeating: "中", count: 500)))
        XCTAssertTrue(!NativeAddressText.valid(String(repeating: "中", count: 501)))
        XCTAssertTrue(!NativeAddressText.valid(String(repeating: "😀", count: 376)))
        XCTAssertTrue(NativeAddressText.valid(String(repeating: "😀", count: 375)))
        XCTAssertTrue(!NativeAddressText.valid("\u{0085}"))
        XCTAssertTrue(!NativeAddressText.valid(" \u{3000}\u{feff}"))
        XCTAssertTrue(!NativeAddressText.valid("中\u{000b}"))
        rejected(NativeUserProvidedAddress.self, #"{"text":"中","source":"user_provided","verification":"verified"}"#)
        rejected(NativeUserProvidedAddress.self, #"{"text":"中","source":"grounded","verification":"unverified"}"#)
        rejected(NativeUserProvidedAddress.self, #"{"text":"中","source":"user_provided","verification":"unverified","extra":true}"#)
        rejected(NativeUserProvidedAddress.self, #"{"text":"\ud800","source":"user_provided","verification":"unverified"}"#)
        let old = try decoder.decode(NativeTripItem.self, from: Data(#"{"id":"i","dayId":"d","title":"title"}"#.utf8))
        XCTAssertTrue(old.userAddress == nil)
        let new = try decoder.decode(NativeTripItem.self, from: Data(#"{"id":"i","dayId":"d","title":"title","chineseAddress":{"text":"中","source":"user_provided","verification":"unverified"}}"#.utf8))
        XCTAssertTrue(new.userAddress?.text == "中")
        rejected(NativeTripItem.self, #"{"id":"i","dayId":"d","title":"title","chineseAddress":{"text":"中","source":"user_provided","verification":"verified"}}"#)
        let clear = NativeTripOperation(kind: .setChineseAddress, dayId: "d", itemId: "i", addressText: .clear)
        let encoded = try encoder.encode(clear)
        try check((try JSONSerialization.jsonObject(with: encoded) as! [String:Any])["text"] is NSNull)
        try check(try decoder.decode(NativeTripOperation.self, from: encoded) == clear)
        let set = NativeTripOperation(kind: .setChineseAddress, dayId: "d", itemId: "i", addressText: .set(original))
        try check(try decoder.decode(NativeTripOperation.self, from: encoder.encode(set)) == set)
        let title = try encoder.encode(NativeTripOperation(kind: .setTitle, title: "new"))
        try check((try JSONSerialization.jsonObject(with: title) as! [String:Any])["text"] == nil)
        rejected(NativeTripOperation.self, #"{"kind":"set_item_chinese_address","dayId":"d","itemId":"i"}"#)
        rejected(NativeTripOperation.self, #"{"kind":"set_item_chinese_address","dayId":"d","itemId":"i","text":" "}"#)
        rejected(NativeTripOperation.self, #"{"kind":"set_item_chinese_address","dayId":"d","itemId":"i","text":"中","verification":"verified"}"#)
        rejected(NativeTripOperation.self, #"{"kind":"set_title","title":"new","text":null}"#)
        XCTAssertTrue(NativeAddressText.classify(["广州市越秀区 1号"]) == .containsChineseText)
        XCTAssertTrue(NativeAddressText.classify(["1 Beijing Road"]) == .notChinese)
        for lines in [[], [""], ["東京かな"], ["中文한글"], ["中文😀"], ["中文Ж"], ["\u{0000}"], [String(repeating: "中", count: 1400)]] {
            XCTAssertTrue(NativeAddressText.classify(lines) == .unknown)
        }
        let actor = NativeDataScope(endpoint: "https://example.invalid", subject: "owner", mobileEpoch: 1, generation: 1)
        let target = NativeTripSupportTarget(actor: actor, tripID: "11111111-1111-4111-8111-111111111111", tripVersion: 5, dayID: "d", itemID: "i")
        let source = NativeTripSupportRead.SourceReference(sourceRevisionId: target.tripID, revisionLabel: "v1", snippetHash: String(repeating: "a", count: 64))
        func read(_ status: NativeTripSupportStatus = .current, _ applicability: NativeTripSupportApplicability = .matched, expires: String = "2099-01-01T00:00:00Z", sources: Bool = true) -> NativeTripSupportRead {
            let claim = NativeTripSupportClaim(claimType: "address", subjectId: "subject", value: .init(lines: ["广州"], locality: nil, countryCode: "CN", startsAt: nil, endsAt: nil, timeZone: nil), asOf: "2026-01-01T00:00:00Z", evidence: [.init(kind: "fact", factId: target.tripID, version: 1, reviewedAt: "2026-01-01T00:00:00Z", expiresAt: expires)])
            let entry = NativeTripSupportRead.Entry(supportId: target.tripID, receiptId: target.tripID, placeReferenceId: target.tripID, version: 1, scope: .address, applicability: applicability, status: status, claimRevision: 1, payloadHash: String(repeating:"a",count:64), sourceDigest: String(repeating:"a",count:64), sourceRefs: sources ? [source] : [], claim: claim)
            return .init(kind: "support", tripId: target.tripID, tripVersion: target.tripVersion, dayId: target.dayID, itemId: target.itemID, entries: [entry])
        }
        XCTAssertTrue(NativeTripAddressRead.references(read(), target: target, current: actor)?.count == 1)
        XCTAssertTrue(NativeTripAddressRead.references(read(.revoked), target: target, current: actor)?.isEmpty == true)
        XCTAssertTrue(NativeTripAddressRead.references(read(.current, .unverified), target: target, current: actor)?.isEmpty == true)
        XCTAssertTrue(NativeTripAddressRead.references(read(expires:"2020-01-01T00:00:00Z"), target: target, current: actor)?.isEmpty == true)
        XCTAssertTrue(NativeTripAddressRead.references(read(sources:false), target: target, current: actor)?.isEmpty == true)
        XCTAssertTrue(NativeTripAddressRead.references(read(), target: target, current: nil) == nil)
        let other = NativeTripSupportTarget(actor: actor, tripID: target.tripID, tripVersion: 6, dayID: "d", itemID: "i")
        XCTAssertTrue(NativeTripAddressRead.references(read(), target: other, current: actor) == nil)
        XCTAssertTrue(NativeTripAddressRead.references(nil, target: target, current: actor) == nil)
        let summary = NativeTripSummary(id: target.tripID, title: "Trip", headVersion: 5, updatedAt: "2026-01-01T00:00:00Z")
        let base = NativeTripDetail(version: 2, trip: summary, content: .init(days: [.init(id: "d", date: "2026-10-16", items: [new])]), hardLocks: .notEnabled, externalOrderStatus: .notConnected, confirmationState: "confirmed")
        var draft = NativeTripDraft(base)
        draft.days[0].items[0].userAddress = address
        XCTAssertTrue(draft.patch.operations == [set])
        XCTAssertTrue(base.content.days[0].items[0].userAddress?.text == "中") // Editing/cancel leaves confirmed bytes intact.
        draft.days[0].items[0].userAddress = nil
        XCTAssertTrue(draft.patch.operations == [clear])
        draft = NativeTripDraft(base)
        draft.days[0].items[0].title = "changed"
        XCTAssertTrue(draft.patch.operations.count == 1 && draft.patch.operations[0].kind == .upsertItem)
        XCTAssertTrue(draft.patch.operations[0].addressText == nil)
        let proposal = NativeTripPending.Proposal(id: target.tripID, revision: 1, baseTripVersion: 5, status: "pending", createdAt: "2026-01-01T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z", titleDiff: .init(before: "Trip", after: "Trip"), dayDiffs: [], patch: .init(expectedVersion: 5, operations: [set]), digest: "digest", stale: false, evidence: "", assumptions: "")
        var confirmedItem = new; confirmedItem.userAddress = address
        func confirmed(_ version: Int, _ item: NativeTripItem) -> NativeTripDetail {
            .init(version: 2, trip: .init(id: target.tripID, title: "Trip", headVersion: version, updatedAt: "2026-01-01T00:00:00Z"), content: .init(days: [.init(id: "d", date: "2026-10-16", items: [item])]), hardLocks: .notEnabled, externalOrderStatus: .notConnected, confirmationState: "confirmed")
        }
        XCTAssertTrue(NativeTripAddressConfirmation.matches(confirmed(6, confirmedItem), proposal: proposal, resultingVersion: 6))
        XCTAssertTrue(!NativeTripAddressConfirmation.matches(confirmed(7, confirmedItem), proposal: proposal, resultingVersion: 6))
        XCTAssertTrue(!NativeTripAddressConfirmation.matches(confirmed(6, new), proposal: proposal, resultingVersion: 6))
        XCTAssertTrue(!NativeTripAddressConfirmation.matches(base, proposal: proposal, resultingVersion: 6))
        let pending = NativeTripPending(version: 2, trip: summary, proposal: proposal)
        let recoveryPatch = proposal.patch
        var reads = 0
        let recovered = try await NativeTripAddressProposalRecovery.read(expected: recoveryPatch, retained: recoveryPatch, draft: recoveryPatch, tripID: target.tripID, current: { true }, get: { reads += 1; return pending })
        XCTAssertTrue(reads == 1 && recovered.proposal.id == proposal.id)
        let changed = NativeTripPatch(expectedVersion: recoveryPatch.expectedVersion, operations: [.init(kind: .setChineseAddress, dayId: "d", itemId: "i", addressText: .set("其他地址"))])
        do {
            _ = try await NativeTripAddressProposalRecovery.read(expected: changed, retained: recoveryPatch, draft: recoveryPatch, tripID: target.tripID, current: { true }, get: { reads += 1; return pending })
            XCTFail("different address request must not read or send")
        } catch { XCTAssertTrue(reads == 1) }
        do {
            _ = try await NativeTripAddressProposalRecovery.read(expected: recoveryPatch, retained: recoveryPatch, draft: recoveryPatch, tripID: target.tripID, current: { true }, get: { reads += 1; throw NativeDataError.sessionUnavailable })
            XCTFail("failed read must stay unknown")
        } catch { XCTAssertTrue(reads == 2) }
        var sameActorAndVersion = true
        do {
            _ = try await NativeTripAddressProposalRecovery.read(expected: recoveryPatch, retained: recoveryPatch, draft: recoveryPatch, tripID: target.tripID, current: { sameActorAndVersion }, get: { reads += 1; sameActorAndVersion = false; return pending })
            XCTFail("late actor/version result must not publish")
        } catch { XCTAssertTrue(reads == 3) }
        let canceled = Task { @MainActor in
            withUnsafeCurrentTask { $0?.cancel() }
            do {
                _ = try await NativeTripAddressProposalRecovery.read(expected: recoveryPatch, retained: recoveryPatch, draft: recoveryPatch, tripID: target.tripID, current: { true }, get: { reads += 1; return pending })
                XCTFail("canceled request must not read")
            } catch { XCTAssertTrue(reads == 3) }
        }
        await canceled.value
    }

    @MainActor private func archiveContent(address: Any? = nil) -> [String: Any] {
        var item: [String: Any] = ["id": "i", "dayId": "d", "title": "Confirmed item"]
        if let address { item["chineseAddress"] = address }
        return ["days": [["id": "d", "date": "2026-10-16", "items": [item]]]]
    }

    @MainActor func testArchiveContentAcceptsOldAndExactUnverifiedAddressWithoutChangingText() throws {
        // The optional-address ArchiveDataRows integration is Main-owned, not present in this WT base.
        XCTAssertNoThrow(try NativeArchiveDataRows.content(archiveContent()))
        let text = "  广州市\n越秀区  "
        let address: [String: Any] = ["text": text, "source": "user_provided", "verification": "unverified"]
        let content = archiveContent(address: address)
        let before = try JSONSerialization.data(withJSONObject: content, options: [.sortedKeys])
        XCTAssertNoThrow(try NativeArchiveDataRows.content(content))
        XCTAssertEqual(try JSONSerialization.data(withJSONObject: content, options: [.sortedKeys]), before)
        let decoded = try JSONDecoder().decode(NativeTripContent.self, from: before)
        XCTAssertEqual(decoded.days.first?.items.first?.userAddress?.text, text)
    }

    @MainActor func testArchiveContentRejectsNullForgedTagsExtraKeysAndMalformedTypes() throws {
        let invalid: [Any] = [
            NSNull(),
            ["text": "广州", "source": "user_provided", "verification": "verified"],
            ["text": "广州", "source": "grounded", "verification": "unverified"],
            ["text": "广州", "source": "user_provided", "verification": "unverified", "extra": true],
            ["text": "广州", "source": "user_provided"],
            ["text": 123, "source": "user_provided", "verification": "unverified"],
            "广州", ["广州"]
        ]
        for address in invalid {
            XCTAssertThrowsError(try NativeArchiveDataRows.content(archiveContent(address: address)))
        }
        var extraItem: [String: Any] = ["id": "i", "dayId": "d", "title": "Confirmed item", "other": true]
        XCTAssertThrowsError(try NativeArchiveDataRows.content(["days": [["id": "d", "date": "2026-10-16", "items": [extraItem]]]]))
        extraItem.removeValue(forKey: "other")
        extraItem["dayId"] = "another-day"
        XCTAssertThrowsError(try NativeArchiveDataRows.content(["days": [["id": "d", "date": "2026-10-16", "items": [extraItem]]]]))
    }

    @MainActor func testArchiveContentEnforcesSharedScalarByteBlankAndControlLimits() throws {
        func value(_ text: String) -> [String: Any] {
            ["text": text, "source": "user_provided", "verification": "unverified"]
        }
        for text in [String(repeating: "中", count: 500), String(repeating: "😀", count: 375)] {
            XCTAssertNoThrow(try NativeArchiveDataRows.content(archiveContent(address: value(text))))
        }
        for text in [String(repeating: "中", count: 501), String(repeating: "😀", count: 376), "", " \u{3000}\u{feff}", "中\u{000b}", "中\u{0085}"] {
            XCTAssertThrowsError(try NativeArchiveDataRows.content(archiveContent(address: value(text))))
        }
    }

    @MainActor private func reviewDetail(_ days: [NativeTripDay], version: Int = 5) -> NativeTripDetail {
        .init(version: 2, trip: .init(id: "11111111-1111-4111-8111-111111111111", title: "Trip", headVersion: version, updatedAt: "2026-10-16T00:00:00Z"), content: .init(days: days), hardLocks: .notEnabled, externalOrderStatus: .notConnected, confirmationState: "confirmed")
    }
    @MainActor private func reviewPending(_ before: NativeTripDetail, after: NativeTripContent?, operations: [NativeTripOperation]) -> NativeTripPending {
        .init(version: 2, trip: before.trip, proposal: .init(id: "22222222-2222-4222-8222-222222222222", revision: 1, baseTripVersion: before.trip.headVersion, status: "pending", createdAt: "2026-10-16T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z", titleDiff: .init(before: "Trip", after: "Trip"), dayDiffs: [], patch: .init(expectedVersion: before.trip.headVersion, operations: operations), digest: String(repeating: "a", count: 64), stale: false, evidence: "", assumptions: "", after: after))
    }

    @MainActor func testRollbackRebuildWithoutAddressOperationShowsActualAddressClear() throws {
        let address = try NativeUserProvidedAddress(text: "  广州越秀区\n1号  ")
        let item = NativeTripItem(id: "i", dayId: "d", title: "Item", userAddress: address)
        let before = reviewDetail([.init(id: "d", date: "2026-10-16", items: [item])])
        var restored = before.content
        restored.days[0].items[0].userAddress = nil
        let pending = reviewPending(before, after: restored, operations: [
            .init(kind: .deleteDay, dayId: "d"), .init(kind: .upsertDay, dayId: "d", date: "2026-10-16"),
            .init(kind: .upsertItem, title: "Item", dayId: "d", itemId: "i")
        ])
        let review = NativeTripAddressReview.evaluate(before: before, pending: pending)
        XCTAssertTrue(review.canConfirm)
        let change = try XCTUnwrap(review.changes.first)
        XCTAssertEqual(review.changes.count, 1)
        XCTAssertEqual(change.kind, .changed)
        XCTAssertEqual(change.before?.address?.text, address.text)
        XCTAssertNil(change.after?.address)
        XCTAssertNotNil(change.after) // Clearing an address differs from removing its item.
        XCTAssertEqual(before.content.days[0].items[0].userAddress, address)
        let unknown = reviewPending(before, after: nil, operations: pending.proposal.patch.operations)
        XCTAssertFalse(NativeTripAddressReview.evaluate(before: before, pending: unknown).canConfirm)
    }

    @MainActor func testRestoreDeletedAddressedItemAndCrossDayMoveAreVisible() throws {
        let address = try NativeUserProvidedAddress(text: "广州 1号")
        let before = reviewDetail([.init(id: "d", date: "2026-10-16", items: [])])
        let restored = NativeTripContent(days: [.init(id: "d", date: "2026-10-16", items: [.init(id: "i", dayId: "d", title: "Restored", userAddress: address)])])
        let addition = NativeTripAddressReview.evaluate(before: before, pending: reviewPending(before, after: restored, operations: [.init(kind: .upsertItem, title: "Restored", dayId: "d", itemId: "i")]))
        XCTAssertTrue(addition.canConfirm)
        XCTAssertEqual(addition.changes.count, 1)
        XCTAssertEqual(addition.changes.first?.kind, .added)
        XCTAssertNil(addition.changes.first?.before)
        XCTAssertEqual(addition.changes.first?.after?.address, address)
        let addressed = reviewDetail(restored.days)
        let moved = NativeTripContent(days: [.init(id: "other", date: "2026-10-17", items: [.init(id: "i", dayId: "other", title: "Moved", userAddress: address)])])
        let movement = NativeTripAddressReview.evaluate(before: addressed, pending: reviewPending(addressed, after: moved, operations: []))
        XCTAssertTrue(movement.canConfirm)
        XCTAssertEqual(movement.changes.count, 1)
        XCTAssertEqual(movement.changes.first?.kind, .moved)
        XCTAssertEqual(movement.changes.first?.before?.location.dayID, "d")
        XCTAssertEqual(movement.changes.first?.after?.location.dayID, "other")
        XCTAssertEqual(movement.changes.first?.before?.address, movement.changes.first?.after?.address)
        let deletion = NativeTripAddressReview.evaluate(before: addressed, pending: reviewPending(addressed, after: .init(days: []), operations: [.init(kind: .deleteItem, dayId: "d", itemId: "i")]))
        XCTAssertEqual(deletion.changes.first?.kind, .removed)
        XCTAssertNil(deletion.changes.first?.after)
    }

    @MainActor func testUnknownAfterBlocksPotentialAddressChangesButNotOrdinarySameItemRename() throws {
        let address = try NativeUserProvidedAddress(text: "广州")
        let before = reviewDetail([.init(id: "d", date: "2026-10-16", items: [.init(id: "i", dayId: "d", title: "Item", userAddress: address)])])
        for operation: NativeTripOperation in [
            .init(kind: .deleteDay, dayId: "d"), .init(kind: .deleteItem, dayId: "d", itemId: "i"),
            .init(kind: .setChineseAddress, dayId: "d", itemId: "i", addressText: .clear),
            .init(kind: .upsertItem, title: "Restored", dayId: "d", itemId: "restored")
        ] {
            XCTAssertFalse(NativeTripAddressReview.evaluate(before: before, pending: reviewPending(before, after: nil, operations: [operation])).canConfirm)
        }
        let rename = NativeTripOperation(kind: .upsertItem, title: "Renamed", dayId: "d", itemId: "i")
        let missing = NativeTripAddressReview.evaluate(before: before, pending: reviewPending(before, after: nil, operations: [rename]))
        XCTAssertTrue(missing.canConfirm)
        XCTAssertTrue(missing.changes.isEmpty)
        var after = before.content; after.days[0].items[0].title = "Renamed"
        let known = NativeTripAddressReview.evaluate(before: before, pending: reviewPending(before, after: after, operations: [rename]))
        XCTAssertTrue(known.canConfirm)
        XCTAssertTrue(known.changes.isEmpty)
    }

    @MainActor func testAddressReviewFailsClosedForMalformedAfterOrWrongBase() throws {
        let before = reviewDetail([.init(id: "d", date: "2026-10-16", items: [])])
        let duplicate = NativeTripContent(days: before.content.days + before.content.days)
        XCTAssertFalse(NativeTripAddressReview.evaluate(before: before, pending: reviewPending(before, after: duplicate, operations: [])).canConfirm)
        let wrongDay = NativeTripContent(days: [.init(id: "d", date: "2026-10-16", items: [.init(id: "i", dayId: "different", title: "Item")])])
        XCTAssertFalse(NativeTripAddressReview.evaluate(before: before, pending: reviewPending(before, after: wrongDay, operations: [])).canConfirm)
        let pending = reviewPending(before, after: before.content, operations: [])
        XCTAssertFalse(NativeTripAddressReview.evaluate(before: reviewDetail(before.content.days, version: 6), pending: pending).canConfirm)
        XCTAssertFalse(NativeTripAddressReview.evaluate(before: nil, pending: pending).canConfirm)
    }


    @MainActor func testInitialVersionZeroFirstProposalWithoutAddressesPreservesConfirmation() throws {
        var initial = reviewDetail([], version: 0)
        initial.confirmationState = "initial"
        let after = NativeTripContent(days: [.init(id: "d", date: "2026-10-16", items: [.init(id: "i", dayId: "d", title: "First item")])])
        let operations: [NativeTripOperation] = [.init(kind: .upsertDay, dayId: "d", date: "2026-10-16"), .init(kind: .upsertItem, title: "First item", dayId: "d", itemId: "i")]
        let known = NativeTripAddressReview.evaluate(before: initial, pending: reviewPending(initial, after: after, operations: operations))
        XCTAssertTrue(known.canConfirm)
        XCTAssertTrue(known.changes.isEmpty)
        let unknown = NativeTripAddressReview.evaluate(before: initial, pending: reviewPending(initial, after: nil, operations: operations))
        XCTAssertTrue(unknown.canConfirm)
        XCTAssertTrue(unknown.changes.isEmpty)
    }

    @MainActor func testLegacyAddressFreeTitleDateAndItemEditsDoNotRequireNewAfterSnapshot() throws {
        let operations: [NativeTripOperation] = [
            .init(kind: .setTitle, title: "Changed"), .init(kind: .upsertDay, dayId: "d", date: "2026-10-17"),
            .init(kind: .upsertItem, title: "Changed", dayId: "d", itemId: "i"),
            .init(kind: .upsertItem, title: "Added", dayId: "d", itemId: "new"),
            .init(kind: .deleteItem, dayId: "d", itemId: "i"), .init(kind: .deleteDay, dayId: "d")
        ]
        for state: String? in [nil, "initial", "confirmed"] {
            var before = reviewDetail([.init(id: "d", date: "2026-10-16", items: [.init(id: "i", dayId: "d", title: "Item")])], version: state == "initial" ? 0 : 5)
            before.confirmationState = state
            for operation in operations {
                let result = NativeTripAddressReview.evaluate(before: before, pending: reviewPending(before, after: nil, operations: [operation]))
                XCTAssertTrue(result.canConfirm)
                XCTAssertTrue(result.changes.isEmpty)
            }
            var after = before.content; after.days[0].date = "2026-10-17"; after.days[0].items[0].title = "Changed"
            XCTAssertTrue(NativeTripAddressReview.evaluate(before: before, pending: reviewPending(before, after: after, operations: Array(operations.prefix(3)))).canConfirm)
        }
    }

    @MainActor func testInitialOrLegacyAddressConcernStillFailsClosed() throws {
        let address = try NativeUserProvidedAddress(text: "广州")
        for state: String? in [nil, "initial"] {
            var before = reviewDetail([], version: 0); before.confirmationState = state
            let operation = NativeTripOperation(kind: .setChineseAddress, dayId: "d", itemId: "i", addressText: .set(address.text))
            XCTAssertFalse(NativeTripAddressReview.evaluate(before: before, pending: reviewPending(before, after: nil, operations: [operation])).canConfirm)
            let addressed = NativeTripContent(days: [.init(id: "d", date: "2026-10-16", items: [.init(id: "i", dayId: "d", title: "Item", userAddress: address)])])
            XCTAssertFalse(NativeTripAddressReview.evaluate(before: before, pending: reviewPending(before, after: addressed, operations: [])).canConfirm)
            before = reviewDetail(addressed.days, version: 0); before.confirmationState = state
            XCTAssertFalse(NativeTripAddressReview.evaluate(before: before, pending: reviewPending(before, after: .init(days: []), operations: [.init(kind: .deleteDay, dayId: "d")])).canConfirm)
        }
    }


    @MainActor func testCanonicalEquivalentAddressFormsRetainDistinctUTF8ThroughDraftReadbackAndRecovery() async throws {
        let nfc = "\u{00e9}", nfd = "e\u{0301}"
        XCTAssertEqual(nfc, nfd) // Swift's ordinary string equality is intentionally unchanged.
        XCTAssertFalse(nfc.utf8.elementsEqual(nfd.utf8))
        let first = try NativeUserProvidedAddress(text: nfc)
        let second = try NativeUserProvidedAddress(text: nfd)
        XCTAssertNotEqual(first, second)
        XCTAssertNotEqual(NativeAddressOperationText.set(nfc), .set(nfd))
        XCTAssertEqual(NativeAddressOperationText.clear, .clear)
        XCTAssertNotEqual(NativeAddressOperationText.clear, .set(nfc))
        let decoded = try JSONDecoder().decode(NativeUserProvidedAddress.self, from: JSONEncoder().encode(second))
        XCTAssertTrue(decoded.text.utf8.elementsEqual(nfd.utf8))
        let before = reviewDetail([.init(id: "d", date: "2026-10-16", items: [.init(id: "i", dayId: "d", title: "Item", userAddress: first)])])
        var draft = NativeTripDraft(before)
        draft.days[0].items[0].userAddress = second
        let operation = NativeTripOperation(kind: .setChineseAddress, dayId: "d", itemId: "i", addressText: .set(nfd))
        XCTAssertEqual(draft.patch.operations, [operation])
        guard case .set(let raw)? = draft.patch.operations.first?.addressText else { return XCTFail("Expected the original NFD address operation") }
        XCTAssertTrue(raw.utf8.elementsEqual(nfd.utf8))
        let originalOperation = NativeTripOperation(kind: .setChineseAddress, dayId: "d", itemId: "i", addressText: .set(nfc))
        XCTAssertNotEqual(operation, originalOperation)
        let pending = reviewPending(before, after: .init(days: draft.days), operations: [operation])
        let review = NativeTripAddressReview.evaluate(before: before, pending: pending)
        XCTAssertTrue(review.canConfirm)
        XCTAssertEqual(review.changes.count, 1)
        let normalizedReadback = reviewDetail(before.content.days, version: 6)
        XCTAssertFalse(NativeTripAddressConfirmation.matches(normalizedReadback, proposal: pending.proposal, resultingVersion: 6))
        XCTAssertTrue(NativeTripAddressConfirmation.matches(reviewDetail(draft.days, version: 6), proposal: pending.proposal, resultingVersion: 6))
        let normalizedPending = reviewPending(before, after: before.content, operations: [originalOperation])
        var reads = 0
        do {
            _ = try await NativeTripAddressProposalRecovery.read(expected: pending.proposal.patch, retained: normalizedPending.proposal.patch, draft: pending.proposal.patch, tripID: before.trip.id, current: { true }, get: { reads += 1; return pending })
            XCTFail("Different retained UTF8 must not enter recovery")
        } catch { XCTAssertEqual(reads, 0) }
        do {
            _ = try await NativeTripAddressProposalRecovery.read(expected: pending.proposal.patch, retained: pending.proposal.patch, draft: pending.proposal.patch, tripID: before.trip.id, current: { true }, get: { reads += 1; return normalizedPending })
            XCTFail("A canonically equal but byte-different server patch is not the original request")
        } catch { XCTAssertEqual(reads, 1) }
    }

}
