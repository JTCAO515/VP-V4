import Foundation
import CoreFoundation

enum NativeTravelerBriefWire {
    static let version = "traveler-brief/1"
    static let notice = "case-minimal-brief/1"
    static func bytes(_ value: [String: Any]) throws -> Data {
        try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys, .withoutEscapingSlashes])
    }
    static func object(_ raw: Any?, keys: Set<String>) throws -> [String: Any] {
        guard let value = raw as? [String: Any], Set(value.keys) == keys else { throw NativeDataError.invalidResponse }
        return value
    }
    static func uuid(_ raw: Any?) throws -> String {
        guard let value = raw as? String, NativeMemoryWire.uuid(value) else { throw NativeDataError.invalidResponse }; return value
    }
    static func integer(_ raw: Any?, maximum: Int = 9_007_199_254_740_990, minimum: Int = 0) throws -> Int {
        guard let number = raw as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
              number.doubleValue.isFinite, number.doubleValue.rounded() == number.doubleValue,
              number.doubleValue >= Double(minimum), number.doubleValue <= Double(maximum) else { throw NativeDataError.invalidResponse }
        return number.intValue
    }
    static func bool(_ raw: Any?) throws -> Bool {
        guard let number = raw as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() else { throw NativeDataError.invalidResponse }; return number.boolValue
    }
    static func text(_ raw: Any?, maximum: Int) throws -> String {
        guard let value = raw as? String, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              value.utf16.count <= maximum, !value.contains("\0") else { throw NativeDataError.invalidResponse }; return value
    }
    static func digest(_ raw: Any?) throws -> String {
        guard let value = raw as? String, value.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { throw NativeDataError.invalidResponse }; return value
    }
    static func timestamp(_ raw: Any?) throws -> Double { Double(try integer(raw, maximum: 8_639_999_999_999_999, minimum: 1)) }
    static func key(_ raw: Any?) throws -> String {
        guard let value = raw as? String else { throw NativeDataError.invalidResponse }
        if value.hasPrefix("memory:") { _ = try uuid(String(value.dropFirst(7))) }
        else if !["problem", "travel_pace", "budget", "requirements", "response_detail"].contains(value) { throw NativeDataError.invalidResponse }
        return value
    }
    static func payload(_ bytes: Data) throws -> Any {
        guard bytes.count <= 256_000 else { throw NativeDataError.invalidResponse }
        let root = try object(JSONSerialization.jsonObject(with: bytes), keys: ["data"])
        return root["data"] as Any
    }
}
