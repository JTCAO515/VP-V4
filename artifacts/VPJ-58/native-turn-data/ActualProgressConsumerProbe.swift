import Foundation

@main struct ActualProgressConsumerProbe {
    static func main() throws {
        let raw = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
        guard let tuple = try JSONSerialization.jsonObject(with: raw) as? [String:Any],
              let receipt = tuple["r"] as? [String:Any], let original = tuple["bytes"] as? String,
              let decision = receipt["decision"] as? [String:Any] else { throw NativeDataError.invalidResponse }
        let actor = try NativeCommunitySafetyActor(scope:.init(endpoint:"http://127.0.0.1:65170",
            subject:NativeTurnDataCommand.id(receipt["ownerId"]),mobileEpoch:NativeTurnDataWire.integer(receipt["mobileEpoch"]),generation:1),
            sessionID:NativeTurnDataCommand.id(receipt["sessionId"]))
        let command = try NativeTurnDataCommand(body:Data(original.utf8))
        let now = try NativeTurnDataWire.time(decision["decidedAt"]).addingTimeInterval(40)
        let value = try NativeTurnDataProtocol.receipt(NativeCommunityWire.bytes(["data":receipt]),command:command.recovery(),actor:actor,now:now)
        guard let value, value.binding.scope == .progress, value.graph.empty,
              value.requestDigest == NativeTurnDataWire.digest(Data(original.utf8)),
              value.erased.values.allSatisfy({$0==0}), value.redacted.values.allSatisfy({$0==0}),
              value.retained.values.allSatisfy({$0==0}) else { throw NativeDataError.invalidResponse }
        print("PASS: identical Native Swift decoder admits actual local PG finite-progress receipt with original bytes beyond TTL; source Turn remains not modified.")
    }
}
