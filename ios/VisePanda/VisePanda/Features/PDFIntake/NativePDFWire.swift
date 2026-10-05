import Foundation

struct NativePDFField: Codable, Equatable, Identifiable {
    struct Locator: Codable, Equatable {
        let page: Int
        let line: Int
        let sourceTextHash: String
    }
    let kind: String
    let value: String
    let locator: Locator
    var id: String { kind }
    static func validValue(_ value: String, kind: String) -> Bool {
        ["date", "amount", "address", "status"].contains(kind) && !value.isEmpty && value.utf16.count <= 96
        && value == value.trimmingCharacters(in: .whitespacesAndNewlines)
        && !value.unicodeScalars.contains { $0.value < 32 || $0.value == 127 }
        && (kind != "date" || NativeScreenshotComparison.validDate(value))
    }
}

struct NativePDFCommand: Codable, Equatable {
    let operationId: String
    let expectedHeadVersion: Int
    let contentHash: String
    let byteCount: Int
    let pageCount: Int
    let extraction: String
    let expiresAt: String
    let fields: [NativePDFField]
    var valid: Bool {
        NativePDFWire.uuid(operationId) && (0...999_999_999).contains(expectedHeadVersion)
        && NativePDFWire.hash(contentHash) && (1...20_000_000).contains(byteCount) && (1...10).contains(pageCount)
        && extraction == "pdfkit_text" && NativePDFWire.date(expiresAt) != nil
        && (1...4).contains(fields.count) && Set(fields.map(\.kind)).count == fields.count && fields.contains { $0.kind == "date" }
        && fields.allSatisfy { NativePDFField.validValue($0.value, kind: $0.kind) && (1...pageCount).contains($0.locator.page)
            && (1...1000).contains($0.locator.line) && NativePDFWire.hash($0.locator.sourceTextHash) }
    }
    func encoded() throws -> Data {
        guard valid else { throw NativeDataError.invalidResponse }
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return try encoder.encode(self)
    }
    var digest: String? { (try? encoded()).map(NativePDFDocument.digest) }
}

struct NativePDFPreview: Decodable {
    struct Field: Decodable { let kind: String; let value: String; let locator: NativePDFField.Locator; let state: String }
    let kind: String
    let operationId: String
    let tripId: String
    let headVersion: Int
    let commandDigest: String
    let previewDigest: String
    let expiresAt: String
    let relation: String
    let fields: [Field]
    let patch: NativeTripPatch?
    let requiresExplicitConfirmation: Bool
    let evidenceTier: String
    let sourceAvailability: String
    let orderVerification: String
    func matches(_ command: NativePDFCommand, tripID: String) -> Bool {
        kind == "pdf_intake_preview/1" && operationId == command.operationId && tripId == tripID
        && headVersion == command.expectedHeadVersion && commandDigest == command.digest
        && NativePDFWire.hash(previewDigest) && expiresAt == command.expiresAt
        && ["new", "duplicate", "conflict"].contains(relation) && fields.count == command.fields.count
        && zip(fields, command.fields).allSatisfy { a, b in
            a.kind == b.kind && a.value == b.value && a.locator == b.locator && ["added", "duplicate", "conflict"].contains(a.state)
        } && requiresExplicitConfirmation && evidenceTier == "user_checked_local_pdf"
        && sourceAvailability == "local_only" && orderVerification == "unavailable"
        && (patch == nil ? relation == "duplicate" : patch?.expectedVersion == headVersion)
    }
}

struct NativePDFOperation: Decodable {
    let kind: String
    let operationId: String
    let tripId: String
    let sessionEpoch: Int
    let state: String
    let requestDigest: String?
    let commandDigest: String?
    let previewDigest: String?
    let expiresAt: String?
    let proposalId: String?
    let proposalRevision: Int?
    let baseTripVersion: Int?
    let confirmationEventId: String?
    let resultingVersion: Int?
}

struct NativePDFProposal: Decodable {
    let kind: String
    let operationId: String
    let tripId: String
    let sessionEpoch: Int
    let requestDigest: String
    let commandDigest: String
    let previewDigest: String
    let proposalId: String
    let proposalRevision: Int
    let baseTripVersion: Int
    let reused: Bool
}

enum NativePDFWire {
    static func uuid(_ value: String) -> Bool { UUID(uuidString: value) != nil && value == value.lowercased() }
    static func hash(_ value: String) -> Bool { value.count == 64 && value.utf8.allSatisfy { (48...57).contains($0) || (97...102).contains($0) } }
    static func date(_ value: String) -> Date? { NativeScopedTripCommand.date(value) }
    static func instant(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }
    static func namespace(_ actor: NativeDataScope) -> String {
        NativePDFDocument.digest(Data("\(actor.endpoint)|\(actor.subject)|\(actor.mobileEpoch)".utf8))
    }
}
