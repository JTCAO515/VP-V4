import XCTest
@testable import VisePanda

nonisolated final class NativeTripSupportTests: XCTestCase {
    private let actor=NativeDataScope(endpoint:"http://127.0.0.1:63221",subject:"11111111-2222-3333-4444-555555555555",mobileEpoch:1,generation:0)
    private let trip="22222222-2222-3333-4444-555555555555"
    private let proposalID="33333333-2222-3333-4444-555555555555"
    private let receiptID="44444444-2222-3333-4444-555555555555"
    private let digest=String(repeating:"a",count:64)
    @MainActor private var target:NativeTripSupportTarget { .init(actor:actor,tripID:trip,tripVersion:3,dayID:"Day_1",itemID:"Item_A") }
    @MainActor private var proposal:NativeTripPending.Proposal {
        .init(id:proposalID,revision:2,baseTripVersion:3,status:"pending",createdAt:"2026-10-03T00:00:00Z",expiresAt:"2099-01-01T00:00:00Z",titleDiff:.init(before:"Trip",after:"Trip"),dayDiffs:[],patch:.init(expectedVersion:3,operations:[]),digest:digest,stale:false,evidence:"",assumptions:"")
    }
    @MainActor private func bytes(_ object:Any) throws -> Data { try JSONSerialization.data(withJSONObject:object,options:[.sortedKeys]) }
    private var claim:[String:Any] {
        ["claimType":"address","subjectId":"canonical-selected-place","value":["lines":["Synthetic reviewed address"],"countryCode":"CN"],"asOf":"2026-10-03T00:00:00Z","evidence":[["kind":"fact","factId":trip,"version":1,"reviewedAt":"2026-10-03T00:00:00Z","expiresAt":"2099-01-01T00:00:00Z"]]]
    }
    @MainActor private func prepared(item:String="Item_A",id:String?=nil)->[String:Any] {
        ["kind":"prepared","receiptId":id ?? receiptID,"version":1,"tripId":trip,"proposalId":proposalID,"proposalRevision":2,"baseVersion":3,"dayId":"Day_1","itemId":item,"scope":"address_reference","applicability":"unverified","claim":claim,"sourceDigest":digest,"expiresAt":"2099-01-01T00:00:00Z"]
    }
    @MainActor func testReadRejectsWrongExactSelectionAndWithdrawnValues() throws {
        let entry:[String:Any]=["supportId":proposalID,"receiptId":receiptID,"version":1,"scope":"address_reference","applicability":"unverified","status":"reference_current","claimRevision":1,"payloadHash":digest,"sourceDigest":digest,"claim":claim]
        var read:[String:Any]=["kind":"support","tripId":trip,"tripVersion":3,"dayId":"Day_1","itemId":"Item_A","entries":[entry]]
        XCTAssertEqual(try NativeTripSupportRead.decode(bytes(read),target:target).entries.count,1)
        read["itemId"]="item_a"
        XCTAssertThrowsError(try NativeTripSupportRead.decode(bytes(read),target:target))
        read["itemId"]="Item_A"
        var revoked=entry;revoked["status"]="revoked";read["entries"]=[revoked]
        XCTAssertThrowsError(try NativeTripSupportRead.decode(bytes(read),target:target))
        revoked["claim"]=NSNull();read["entries"]=[revoked]
        XCTAssertNil(try NativeTripSupportRead.decode(bytes(read),target:target).entries.first?.claim)
    }
    @MainActor func testExplicitSelectionAcrossItemsReviewIdentityAndUnknownFence() throws {
        let store=NativeTripSupportStore()
        store.bind(target,proposal:proposal)
        try store.installPrepared([bytes(prepared())],target:target,proposal:proposal)
        XCTAssertThrowsError(try store.freezeConfirmation(reviewedSelection:"not-reviewed",proposal:proposal,current:actor))
        store.select(receiptID,chosen:true)
        let oldReview=try XCTUnwrap(store.selectionReference)
        let other=NativeTripSupportTarget(actor:actor,tripID:trip,tripVersion:3,dayID:"Day_1",itemID:"Item_B")
        let otherID="55555555-2222-3333-4444-555555555555"
        store.bind(other,proposal:proposal)
        try store.installPrepared([bytes(prepared(item:"Item_B",id:otherID))],target:other,proposal:proposal)
        store.select(otherID,chosen:true)
        XCTAssertEqual(store.selectedIDs.count,2)
        XCTAssertThrowsError(try store.freezeConfirmation(reviewedSelection:oldReview,proposal:proposal,current:actor))
        let choices=try store.freezeConfirmation(reviewedSelection:XCTUnwrap(store.selectionReference),proposal:proposal,current:actor)
        XCTAssertEqual(choices.count,2)
        XCTAssertTrue(store.confirmationUnknown)
        store.select(receiptID,chosen:false)
        XCTAssertEqual(store.selectedIDs.count,2)
        XCTAssertThrowsError(try store.freezeConfirmation(reviewedSelection:XCTUnwrap(store.selectionReference),proposal:proposal,current:actor))
        XCTAssertThrowsError(try store.confirmed(key:"wrong",choices:choices))
        try store.confirmed(key:XCTUnwrap(store.confirmationKey),choices:choices)
        XCTAssertFalse(store.confirmationUnknown)
    }
    @MainActor func testLateActorReadNeverPublishesAndPreparedRejectsScopeExpiryOrExtraKeys() async throws {
        let store=NativeTripSupportStore();store.bind(target,proposal:proposal)
        var current:NativeDataScope?=actor
        let original=target
        await store.refresh(current:{current},get:{_ in
            current=nil
            return try self.bytes(["kind":"support","tripId":self.trip,"tripVersion":3,"dayId":"Day_1","itemId":"Item_A","entries":[]])
        })
        XCTAssertNil(store.read)
        var value=prepared();value["expiresAt"]="2000-01-01T00:00:00Z"
        XCTAssertThrowsError(try NativePreparedTripSupport.decode(bytes(value),target:original,proposal:proposal))
        value=prepared();value["scope"]="whole_itinerary_verified"
        XCTAssertThrowsError(try NativePreparedTripSupport.decode(bytes(value),target:original,proposal:proposal))
        value=prepared();value["titleVerified"]=true
        XCTAssertThrowsError(try NativePreparedTripSupport.decode(bytes(value),target:original,proposal:proposal))
    }
}
