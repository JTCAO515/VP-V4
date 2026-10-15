import Foundation

@main struct Checks {
    static func main() throws {
        let decoder = JSONDecoder(), encoder = JSONEncoder()
        func check(_ value: @autoclosure () throws -> Bool) throws { let result = try value(); precondition(result) }
        func rejected<T: Decodable>(_ type: T.Type, _ json: String) {
            precondition((try? decoder.decode(type, from: Data(json.utf8))) == nil, json)
        }
        let original = "  广州市\n越秀区  "
        let address = try NativeUserProvidedAddress(text: original)
        try check(try decoder.decode(NativeUserProvidedAddress.self, from: encoder.encode(address)).text == original)
        precondition(NativeAddressText.valid(String(repeating: "中", count: 500)))
        precondition(!NativeAddressText.valid(String(repeating: "中", count: 501)))
        precondition(!NativeAddressText.valid(String(repeating: "😀", count: 376)))
        precondition(NativeAddressText.valid(String(repeating: "😀", count: 375)))
        precondition(!NativeAddressText.valid("\u{0085}"))
        precondition(!NativeAddressText.valid(" \u{3000}\u{feff}"))
        precondition(!NativeAddressText.valid("中\u{000b}"))
        rejected(NativeUserProvidedAddress.self, #"{"text":"中","source":"user_provided","verification":"verified"}"#)
        rejected(NativeUserProvidedAddress.self, #"{"text":"中","source":"grounded","verification":"unverified"}"#)
        rejected(NativeUserProvidedAddress.self, #"{"text":"中","source":"user_provided","verification":"unverified","extra":true}"#)
        rejected(NativeUserProvidedAddress.self, #"{"text":"\ud800","source":"user_provided","verification":"unverified"}"#)
        let old = try decoder.decode(NativeTripItem.self, from: Data(#"{"id":"i","dayId":"d","title":"title"}"#.utf8))
        precondition(old.userAddress == nil)
        let new = try decoder.decode(NativeTripItem.self, from: Data(#"{"id":"i","dayId":"d","title":"title","chineseAddress":{"text":"中","source":"user_provided","verification":"unverified"}}"#.utf8))
        precondition(new.userAddress?.text == "中")
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
        precondition(NativeAddressText.classify(["广州市越秀区 1号"]) == .containsChineseText)
        precondition(NativeAddressText.classify(["1 Beijing Road"]) == .notChinese)
        for lines in [[], [""], ["東京かな"], ["中文한글"], ["中文😀"], ["中文Ж"], ["\u{0000}"], [String(repeating: "中", count: 1400)]] {
            precondition(NativeAddressText.classify(lines) == .unknown)
        }
        let actor = NativeDataScope(endpoint: "https://example.invalid", subject: "owner", mobileEpoch: 1, generation: 1)
        let target = NativeTripSupportTarget(actor: actor, tripID: "11111111-1111-4111-8111-111111111111", tripVersion: 5, dayID: "d", itemID: "i")
        let source = NativeTripSupportRead.SourceReference(sourceRevisionId: target.tripID, revisionLabel: "v1", snippetHash: String(repeating: "a", count: 64))
        func read(_ status: NativeTripSupportStatus = .current, _ applicability: NativeTripSupportApplicability = .matched, expires: String = "2099-01-01T00:00:00Z", sources: Bool = true) -> NativeTripSupportRead {
            let claim = NativeTripSupportClaim(claimType: "address", subjectId: "subject", value: .init(lines: ["广州"], locality: nil, countryCode: "CN", startsAt: nil, endsAt: nil, timeZone: nil), asOf: "2026-01-01T00:00:00Z", evidence: [.init(kind: "fact", factId: target.tripID, version: 1, reviewedAt: "2026-01-01T00:00:00Z", expiresAt: expires)])
            let entry = NativeTripSupportRead.Entry(supportId: target.tripID, receiptId: target.tripID, placeReferenceId: target.tripID, version: 1, scope: .address, applicability: applicability, status: status, claimRevision: 1, payloadHash: String(repeating:"a",count:64), sourceDigest: String(repeating:"a",count:64), sourceRefs: sources ? [source] : [], claim: claim)
            return .init(kind: "support", tripId: target.tripID, tripVersion: target.tripVersion, dayId: target.dayID, itemId: target.itemID, entries: [entry])
        }
        precondition(NativeTripAddressRead.references(read(), target: target, current: actor)?.count == 1)
        precondition(NativeTripAddressRead.references(read(.revoked), target: target, current: actor)?.isEmpty == true)
        precondition(NativeTripAddressRead.references(read(.current, .unverified), target: target, current: actor)?.isEmpty == true)
        precondition(NativeTripAddressRead.references(read(expires:"2020-01-01T00:00:00Z"), target: target, current: actor)?.isEmpty == true)
        precondition(NativeTripAddressRead.references(read(sources:false), target: target, current: actor)?.isEmpty == true)
        precondition(NativeTripAddressRead.references(read(), target: target, current: nil) == nil)
        let other = NativeTripSupportTarget(actor: actor, tripID: target.tripID, tripVersion: 6, dayID: "d", itemID: "i")
        precondition(NativeTripAddressRead.references(read(), target: other, current: actor) == nil)
        precondition(NativeTripAddressRead.references(nil, target: target, current: actor) == nil)
        print("PASS actual Native codec/DTO/op/source projection: old/new, forged tags, null/missing, scalar/byte/control, script, actor/version/TTL/source fences")
    }
}
