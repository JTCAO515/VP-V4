import Foundation
import CryptoKit
import CoreFoundation

/// Metadata only. Hashes use the original UTF-8 bytes, without trimming or normalization.
struct NativeTranslationRecoveryIdentity: Equatable, Sendable, Encodable {
    let threadId: String
    let turnId: String
    let idempotencyKey: String
    let policyId: String
    let noticeHash: String
    let sourceLocale: String
    let targetLocale: String
    let inputHash: String

    init(threadId: String, turnId: String, idempotencyKey: String, policyId: String,
         noticeHash: String, sourceLocale: String, targetLocale: String, inputHash: String) throws {
        guard [threadId, turnId, idempotencyKey, policyId].allSatisfy(Self.canonicalUUID),
              [noticeHash, inputHash].allSatisfy(Self.canonicalHash),
              ["zh", "en"].contains(sourceLocale), ["zh", "en"].contains(targetLocale),
              sourceLocale != targetLocale else { throw NativeTranslationRecoveryError.invalidIdentity }
        self.threadId = threadId; self.turnId = turnId; self.idempotencyKey = idempotencyKey
        self.policyId = policyId; self.noticeHash = noticeHash
        self.sourceLocale = sourceLocale; self.targetLocale = targetLocale; self.inputHash = inputHash
    }

    static func hashInput(_ text: String) -> String {
        SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    static func canonicalUUID(_ value: String) -> Bool {
        let bytes = Array(value.utf8)
        return bytes.count == 36 && UUID(uuidString: value)?.uuidString.lowercased() == value
            && (49...53).contains(bytes[14]) && [56, 57, 97, 98].contains(bytes[19])
    }
    static func canonicalHash(_ value: String) -> Bool {
        value.utf8.count == 64 && value.utf8.allSatisfy { (48...57).contains($0) || (97...102).contains($0) }
    }

    static let keys: Set<String> = ["threadId", "turnId", "idempotencyKey", "policyId", "noticeHash", "sourceLocale", "targetLocale", "inputHash"]
    static func decode(_ raw: Any?) throws -> Self {
        let v = try NativeTranslationRecoveryJSON.object(raw, keys: keys)
        func string(_ key: String) throws -> String {
            guard let s = v[key] as? String else { throw NativeTranslationRecoveryError.corruptRecord }
            return s
        }
        return try .init(threadId: string("threadId"), turnId: string("turnId"), idempotencyKey: string("idempotencyKey"),
                         policyId: string("policyId"), noticeHash: string("noticeHash"), sourceLocale: string("sourceLocale"),
                         targetLocale: string("targetLocale"), inputHash: string("inputHash"))
    }
}

enum NativeTranslationRecoveryError: Error, Equatable {
    case invalidIdentity, invalidScope, corruptRecord, storageFailure, pendingRecord, compareFailed, invalidReceipt
}

/// JSONSerialization validates syntax; this bounded scanner additionally rejects duplicate
/// keys (including escaped spellings) before Foundation can silently collapse them.
enum NativeTranslationRecoveryJSON {
    static func object(_ raw: Any?, keys: Set<String>) throws -> [String: Any] {
        guard let value = raw as? [String: Any], Set(value.keys) == keys else {
            throw NativeTranslationRecoveryError.corruptRecord
        }
        return value
    }
    static func integer(_ raw: Any?) throws -> Int {
        guard let n = raw as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(),
              ["i", "q", "s", "l"].contains(String(cString: n.objCType)),
              n.int64Value >= 0, n.int64Value <= 9_007_199_254_740_991 else {
            throw NativeTranslationRecoveryError.corruptRecord
        }
        return n.intValue
    }
    static func parse(_ data: Data, limit: Int) throws -> Any {
        guard !data.isEmpty, data.count <= limit else { throw NativeTranslationRecoveryError.corruptRecord }
        let value = try JSONSerialization.jsonObject(with: data)
        var scanner = Scanner(bytes: Array(data)); try scanner.value(depth: 0); scanner.space()
        guard scanner.index == scanner.bytes.count else { throw NativeTranslationRecoveryError.corruptRecord }
        return value
    }
    private struct Scanner {
        let bytes: [UInt8]
        var index = 0
        mutating func space() { while index < bytes.count && [9, 10, 13, 32].contains(bytes[index]) { index += 1 } }
        mutating func string() throws -> String {
            let start = index
            guard index < bytes.count, bytes[index] == 34 else { throw NativeTranslationRecoveryError.corruptRecord }
            index += 1
            while index < bytes.count {
                let b = bytes[index]; index += 1
                if b == 92 { index += 1 }
                if b == 34 {
                    guard let s = try JSONSerialization.jsonObject(with: Data(bytes[start..<index]), options: .fragmentsAllowed) as? String else {
                        throw NativeTranslationRecoveryError.corruptRecord
                    }
                    return s
                }
            }
            throw NativeTranslationRecoveryError.corruptRecord
        }
        mutating func take(_ b: UInt8) throws {
            space(); guard index < bytes.count, bytes[index] == b else { throw NativeTranslationRecoveryError.corruptRecord }; index += 1
        }
        mutating func value(depth: Int) throws {
            guard depth < 8 else { throw NativeTranslationRecoveryError.corruptRecord }
            space(); guard index < bytes.count else { throw NativeTranslationRecoveryError.corruptRecord }
            if bytes[index] == 34 { _ = try string(); return }
            if bytes[index] == 123 {
                index += 1; space(); var keys = Set<String>()
                if index < bytes.count, bytes[index] == 125 { index += 1; return }
                while true {
                    space(); let key = try string()
                    guard keys.insert(key).inserted else { throw NativeTranslationRecoveryError.corruptRecord }
                    try take(58); try value(depth: depth + 1); space()
                    if index < bytes.count, bytes[index] == 125 { index += 1; return }; try take(44)
                }
            }
            if bytes[index] == 91 {
                index += 1; space()
                if index < bytes.count, bytes[index] == 93 { index += 1; return }
                while true {
                    try value(depth: depth + 1); space()
                    if index < bytes.count, bytes[index] == 93 { index += 1; return }; try take(44)
                }
            }
            let start = index
            while index < bytes.count && ![9, 10, 13, 32, 44, 93, 125].contains(bytes[index]) { index += 1 }
            guard index > start else { throw NativeTranslationRecoveryError.corruptRecord }
        }
    }
}
