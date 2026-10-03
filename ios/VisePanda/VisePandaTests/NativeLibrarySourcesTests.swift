import XCTest
@testable import VisePanda

nonisolated final class NativeLibrarySourcesTests:XCTestCase {
    private let id="12345678-1234-4234-8234-123456789abc"
    @MainActor private func bytes(_ value:[String:Any])throws->Data{try JSONSerialization.data(withJSONObject:value)}
    @MainActor private func unavailable(_ source:NativeLibrarySource)->[String:Any]{["version":1,"kind":"library_page","source":source.rawValue,"status":"unavailable","reason":"DOMAIN_READER_MISSING","items":NSNull(),"nextCursor":NSNull()]}
    @MainActor private func cursor(_ source:NativeLibrarySource,query:String?,domain:String)throws->String {
        let raw=try bytes(["source":source.rawValue,"query":query.map{$0 as Any} ?? NSNull(),"domainCursor":domain]);return "l1."+raw.base64EncodedString().replacingOccurrences(of:"+",with:"-").replacingOccurrences(of:"/",with:"_").replacingOccurrences(of:"=",with:"")
    }
    @MainActor func testMissingReaderNullIsNotAnEmptySearchOrCrossSourcePage()throws {
        for source in [NativeLibrarySource.materials,.orders] {
            let page=try NativeLibraryPage.decode(bytes(unavailable(source)),source:source);XCTAssertNil(page.items);XCTAssertEqual(page.reason,"DOMAIN_READER_MISSING")
            var fake=unavailable(source);fake["items"]=[];XCTAssertThrowsError(try NativeLibraryPage.decode(bytes(fake),source:source))
            XCTAssertThrowsError(try NativeLibraryPage.decode(bytes(unavailable(source)),source:.results))
        }
    }
    @MainActor func testCursorBindsSourceAndExactQueryWithoutUnicodeNormalization()throws {
        let q="café",other="cafe\u{301}",token=try cursor(.translations,query:q,domain:id)
        XCTAssertTrue(NativeLibraryCursor.valid(token,source:.translations,query:q));XCTAssertFalse(NativeLibraryCursor.valid(token,source:.results,query:q));XCTAssertFalse(NativeLibraryCursor.valid(token,source:.translations,query:other));XCTAssertFalse(NativeLibraryCursor.valid(token,source:.translations,query:nil))
        let raw:[String:Any]=["version":1,"kind":"library_page","source":"translations","status":"available","reason":NSNull(),"items":[],"nextCursor":token]
        let page=try NativeLibraryPage.decode(bytes(raw),source:.translations,query:q);XCTAssertTrue(page.items?.isEmpty==true);XCTAssertNotNil(page.nextCursor)
    }
    @MainActor func testExactProjectionPreservesTranslationIdentityAndRejectsOtherItem()throws {
        let row=NativeLibraryMetadata(source:.translations,id:id,revision:nil,title:"你好",summary:"你好",createdAt:nil,tripId:nil)
        let phrase:[String:Any]=["turnId":id,"sourceLocale":"en","targetLocale":"zh","original":"Hello","state":"translated","translation":"你好","backTranslation":"Hello"]
        let value:[String:Any]=["version":1,"kind":"library_item","source":"translations","id":id,"revision":NSNull(),"projection":["version":2,"kind":"translation","policyId":id,"phrase":phrase]]
        guard case .translation(let actual)=try NativeLibraryProjection.decode(bytes(value),reference:row) else{return XCTFail()};XCTAssertEqual(actual.turnId,id);XCTAssertEqual(actual.original,"Hello")
        var fake=value;fake["id"]=UUID().uuidString.lowercased();XCTAssertThrowsError(try NativeLibraryProjection.decode(bytes(fake),reference:row))
        fake=value;fake["revision"]=1;XCTAssertThrowsError(try NativeLibraryProjection.decode(bytes(fake),reference:row))
        guard case .unavailable=try NativeLibraryProjection.decode(bytes(["version":1,"kind":"unavailable"]),reference:row) else{return XCTFail()}
    }
    @MainActor func testLateActorAndRequestDurationCannotPublishMetadata()async throws {
        let scope=NativeDataScope(endpoint:"http://127.0.0.1:63251",subject:id,mobileEpoch:1,generation:1),key=NativeLibrarySourceStore.Key(scope:scope,source:.materials,query:"",cursor:nil)
        var current:NativeLibrarySourceStore.Key?=key;var now:TimeInterval=0
        let store=NativeLibrarySourceStore(uptime:{now}),raw=try bytes(unavailable(.materials))
        await store.load(key:key,current:{current},request:{now=20;return raw});XCTAssertNotNil(store.visible(key));now=30;XCTAssertNil(store.visible(key))
        now=100;await store.load(key:key,current:{current},request:{now=131;return raw});XCTAssertNil(store.page)
        await store.load(key:key,current:{current},request:{current=nil;store.clear();return raw});XCTAssertNil(store.page);XCTAssertNil(store.visible(key))
    }
    @MainActor func testPlaceCapabilitiesCannotGrantWritersOrFollowArbitraryHref()throws {
        let trip="22345678-1234-4234-8234-123456789abc"
        let ask:[String:Any]=["status":"available","reference":["tripId":trip,"canonicalPoiId":id],"handoff":["kind":"ask_ready","href":"/visepanda/ask?tripId="+trip+"&poiId="+id,"poiId":id,"readiness":"recheck_required"]]
        let caps:[String:Any]=["ask":ask,"save":["status":"unavailable","reason":"DOMAIN_WRITER_MISSING"],"add":["status":"unavailable","reason":"NO_ELIGIBLE_EVIDENCE"],"visual":["status":"unavailable","reason":"NO_LICENSED_VISUAL"]]
        let root:[String:Any]=["version":1,"kind":"library_place","status":"available","reason":NSNull(),"entity":["provider":"amap","providerPoiId":"provider-1","canonicalPoiId":id,"name":"Observed Hall","address":NSNull(),"location":NSNull(),"observedAt":NSNull()],"capabilities":caps]
        let value=try NativeLibraryPlace.decode(bytes(root),provider:.amap,providerID:"provider-1",tripID:trip);XCTAssertEqual(value.askTripID,trip);XCTAssertEqual(value.canonicalPoiID,id)
        var bad=root,changed=caps;changed["save"]=["status":"available"];bad["capabilities"]=changed;XCTAssertThrowsError(try NativeLibraryPlace.decode(bytes(bad),provider:.amap,providerID:"provider-1",tripID:trip))
        var evil=ask;var handoff=try XCTUnwrap(ask["handoff"] as? [String:Any]);handoff["href"]="https://invalid.example/action";evil["handoff"]=handoff;changed=caps;changed["ask"]=evil;bad=root;bad["capabilities"]=changed
        XCTAssertThrowsError(try NativeLibraryPlace.decode(bytes(bad),provider:.amap,providerID:"provider-1",tripID:trip))
        XCTAssertThrowsError(try NativeLibraryPlace.decode(bytes(root),provider:.amap,providerID:"other-place",tripID:trip))
        XCTAssertThrowsError(try NativeLibraryPlace.decode(bytes(root),provider:.amap,providerID:"provider-1",tripID:id))
    }

}
