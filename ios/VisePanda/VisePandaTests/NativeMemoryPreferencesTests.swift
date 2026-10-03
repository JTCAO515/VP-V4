import XCTest
@testable import VisePanda

nonisolated final class NativeMemoryPreferencesTests:XCTestCase {
    private let owner="12345678-1234-4234-8234-123456789abc"
    private let memory="22345678-1234-4234-8234-123456789abc"
    private let receipt="32345678-1234-4234-8234-123456789abc"
    private let consent="42345678-1234-4234-8234-123456789abc"
    @MainActor private func row(revision:Int=1,summary:String?="Prefer quiet stays",state:String="explicit",granted:Bool=true)->[String:Any] {
        ["id":memory,"revision":revision,"state":state,"constraintKind":"preference","summary":summary.map{$0 as Any} ?? NSNull(),"sourceReceiptId":receipt,"consentId":consent,"consentStatus":granted ? "granted":"revoked","createdAt":"2026-10-03T00:00:00Z","updatedAt":ISO8601DateFormatter().string(from:Date())]
    }
    @MainActor private func read(_ rows:[[String:Any]])throws->Data {try JSONSerialization.data(withJSONObject:["version":1,"ownerId":owner,"profiles":rows])}
    @MainActor private func write(_ command:NativeMemoryCommand,row:[String:Any],undo:Bool=true,reused:Bool=false)throws->Data {
        try JSONSerialization.data(withJSONObject:["version":1,"receipt":["version":1,"ownerId":owner,"action":command.action,"operationId":command.operationID,"memoryId":memory,"consentId":consent,"sourceReceiptId":receipt,"revision":row["revision"]!,"state":row["state"]!,"reused":reused,"undoAvailable":undo],"profiles":[row]])
    }
    @MainActor private var scope:NativeDataScope {.init(endpoint:"http://127.0.0.1:63251",subject:owner,mobileEpoch:1,generation:1)}
    @MainActor func testClosedReadOwnerMaskingAndUpdateUndoNeverUsesCreateUndo()throws {
        let profile=try XCTUnwrap(NativeMemoryWire.read(read([row()]),owner:owner).first)
        XCTAssertTrue(profile.eligible)
        XCTAssertThrowsError(try NativeMemoryWire.read(read([row(granted:false)]),owner:owner))
        XCTAssertThrowsError(try NativeMemoryWire.read(read([row()]),owner:memory))
        let newer=try XCTUnwrap(NativeMemoryWire.read(read([row(revision:2)]),owner:owner).first)
        XCTAssertThrowsError(try NativeMemoryCommand(action:"createUndo",profile:newer))
        let update=try NativeMemoryCommand(action:"update",profile:profile,summary:"Prefer a quieter hotel")
        let body=try XCTUnwrap(JSONSerialization.jsonObject(with:update.body) as? [String:Any])
        XCTAssertEqual(Set(body.keys),Set(["action","operationId","memoryId","sourceReceiptId","expectedRevision","summary","saveLongTerm"]))
        XCTAssertEqual(body["memoryId"] as? String,profile.id)
        let undo=try NativeMemoryCommand(action:"updateUndo",profile:newer,updateOperationID:update.operationID)
        let undoBody=try XCTUnwrap(JSONSerialization.jsonObject(with:undo.body) as? [String:Any]);XCTAssertEqual(undoBody["updateOperationId"] as? String,update.operationID);XCTAssertNil(undoBody["summary"])
    }
    @MainActor func testUnknownWriteKeepsSameBytesThenCurrentReadbackAllowsExactUpdateUndo()async throws {
        let store=NativeMemoryPreferencesStore(),selected=scope
        await store.load(scope:selected,current:{selected},get:{try self.read([self.row()])})
        let profile=try XCTUnwrap(store.visible(selected).first);var sent:[Data]=[]
        await store.change("update",profile:profile,summary:"Prefer a quieter hotel",current:{selected},post:{body in sent.append(body);throw NativeDataError.server(code:"UNAVAILABLE")})
        XCTAssertNil(store.toast);XCTAssertNotNil(store.pending);XCTAssertTrue(store.visible(selected).isEmpty)
        let command=try XCTUnwrap(store.pending)
        await store.retry(current:{selected},post:{body in sent.append(body);return try self.write(command,row:self.row(revision:2,summary:"Prefer a quieter hotel"),reused:true)})
        XCTAssertEqual(sent[0],sent[1]);XCTAssertNil(store.pending);XCTAssertNotNil(store.toast)
        let undo=try XCTUnwrap(store.usableUndo(selected));XCTAssertEqual(undo.profile.revision,2);XCTAssertEqual(undo.updateOperationID,command.operationID)
        await store.undoSave(current:{selected},post:{body in
            let raw=try XCTUnwrap(JSONSerialization.jsonObject(with:body) as? [String:Any]);XCTAssertEqual(raw["action"] as? String,"updateUndo");XCTAssertEqual(raw["expectedRevision"] as? Int,2)
            let operation=try XCTUnwrap(raw["operationId"] as? String)
            return try JSONSerialization.data(withJSONObject:["version":1,"receipt":["version":1,"ownerId":self.owner,"action":"updateUndo","operationId":operation,"memoryId":self.memory,"consentId":self.consent,"sourceReceiptId":self.receipt,"revision":3,"state":"explicit","reused":false,"undoAvailable":false],"profiles":[self.row(revision:3)]])
        })
        XCTAssertEqual(store.visible(selected).first?.revision,3);XCTAssertNil(store.undo);XCTAssertEqual(store.notice,"undone")
    }
    @MainActor func testReceiptCannotGrantUndoAfterCurrentReadbackChangedOrConsentWasWithdrawn()async throws {
        let store=NativeMemoryPreferencesStore(),selected=scope
        await store.load(scope:selected,current:{selected},get:{try self.read([self.row()])})
        let profile=try XCTUnwrap(store.visible(selected).first)
        await store.change("update",profile:profile,summary:"Correction",current:{selected},post:{_ in
            let command=try XCTUnwrap(store.pending)
            let bytes=try self.write(command,row:self.row(revision:3,summary:nil,granted:false),undo:false,reused:true)
            var root=try XCTUnwrap(JSONSerialization.jsonObject(with:bytes) as? [String:Any]);var receipt=try XCTUnwrap(root["receipt"] as? [String:Any]);receipt["revision"]=2;root["receipt"]=receipt
            return try JSONSerialization.data(withJSONObject:root)
        })
        XCTAssertNil(store.undo);XCTAssertNil(store.toast);XCTAssertEqual(store.notice,"changed")
        XCTAssertEqual(store.visible(selected).first?.consentStatus,"revoked");XCTAssertNil(store.visible(selected).first?.summary)
    }
    @MainActor func testLateActorResponseCannotRestoreOldProfilesOrUndo()async throws {
        let store=NativeMemoryPreferencesStore(),initial=scope;var current:NativeDataScope?=initial
        await store.load(scope:initial,current:{current},get:{try self.read([self.row()])})
        let profile=try XCTUnwrap(store.visible(initial).first)
        await store.change("update",profile:profile,summary:"Correction",current:{current},post:{_ in
            let command=try XCTUnwrap(store.pending);current=nil;store.bind(nil)
            return try self.write(command,row:self.row(revision:2,summary:"Correction"))
        })
        XCTAssertTrue(store.profiles.isEmpty);XCTAssertNil(store.pending);XCTAssertNil(store.undo);XCTAssertNil(store.toast)
    }
}
