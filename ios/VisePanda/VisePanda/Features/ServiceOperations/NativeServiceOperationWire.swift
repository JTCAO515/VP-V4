import Foundation
import CoreFoundation

enum NativeServiceOperationWire {
    static func object(_ value: Any, keys: Set<String>, optional: Set<String> = []) throws -> [String: Any] {
        guard let result = value as? [String: Any], keys.isSubset(of: Set(result.keys)),
              Set(result.keys).isSubset(of: keys.union(optional)) else { throw NativeDataError.invalidResponse }
        return result
    }
    static func uuid(_ value: String) -> Bool { UUID(uuidString: value) != nil }
    static func string(_ value: Any?, max: Int = 1000) throws -> String {
        guard let result = value as? String, !result.isEmpty, result.unicodeScalars.count <= max else { throw NativeDataError.invalidResponse }
        return result
    }
    static func identifier(_ value: Any?) throws -> String {
        let result = try string(value, max: 36)
        guard uuid(result) else { throw NativeDataError.invalidResponse }; return result.lowercased()
    }
    static func integer(_ value: Any?, minimum: Int = 0) throws -> Int {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
              number.doubleValue.isFinite, number.doubleValue.rounded() == number.doubleValue,
              number.doubleValue >= Double(minimum), number.doubleValue <= Double(Int32.max) else { throw NativeDataError.invalidResponse }
        return number.intValue
    }
    static func date(_ value: Any?) throws -> Date {
        let value = try string(value, max: 64)
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        guard let date = formatter.date(from: value) else { throw NativeDataError.invalidResponse }; return date
    }
    static func bytes(_ value: [String: Any]) throws -> Data {
        guard JSONSerialization.isValidJSONObject(value) else { throw NativeDataError.invalidResponse }
        return try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    }
    static func response(_ bytes: Data) throws -> [String: Any] {
        guard bytes.count <= 256_000 else { throw NativeDataError.invalidResponse }
        let envelope = try object(JSONSerialization.jsonObject(with: bytes), keys: ["data"])
        guard let data = envelope["data"] as? [String: Any] else { throw NativeDataError.invalidResponse }; return data
    }
}
