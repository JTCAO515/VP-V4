import Foundation

/// Exact online-only value. It never grants GroundedClaim or offline eligibility.
struct NativeUserProvidedAddress: Codable, Equatable {
    let text: String
    var source: String { "user_provided" }
    var verification: String { "unverified" }
    private enum CodingKeys: String, CodingKey { case text, source, verification }
    init(text: String) throws {
        guard NativeAddressText.valid(text) else { throw NativeAddressValueError.invalid }
        self.text = text
    }
    init(from decoder: Decoder) throws {
        let raw = try decoder.container(keyedBy: NativeAddressKey.self)
        guard Set(raw.allKeys.map(\.stringValue)) == Set(["text", "source", "verification"]) else { throw NativeAddressValueError.invalid }
        let values = try decoder.container(keyedBy: CodingKeys.self)
        guard try values.decode(String.self, forKey: .source) == "user_provided",
              try values.decode(String.self, forKey: .verification) == "unverified" else { throw NativeAddressValueError.invalid }
        try self.init(text: values.decode(String.self, forKey: .text))
    }
    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(text, forKey: .text)
        try values.encode(source, forKey: .source)
        try values.encode(verification, forKey: .verification)
    }
}
enum NativeAddressValueError: Error { case invalid }
struct NativeAddressKey: CodingKey {
    let stringValue: String
    let intValue: Int? = nil
    init?(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { return nil }
}
enum NativeAddressText {
    static let whitespace = Set("\t\n\r \u{0085}\u{00a0}\u{1680}\u{2000}\u{2001}\u{2002}\u{2003}\u{2004}\u{2005}\u{2006}\u{2007}\u{2008}\u{2009}\u{200a}\u{2028}\u{2029}\u{202f}\u{205f}\u{3000}\u{feff}".unicodeScalars)
    static func forbidden(_ point: UInt32) -> Bool {
        point <= 8 || point == 11 || point == 12 || (14...31).contains(point) || (127...159).contains(point)
    }
    static func valid(_ text: String) -> Bool {
        let scalars = text.unicodeScalars
        return !scalars.isEmpty && scalars.count <= 500 && text.utf8.count <= 1500
            && scalars.contains { !whitespace.contains($0) }
            && !scalars.contains { forbidden($0.value) }
    }
    enum Observation: String { case containsChineseText, notChinese, unknown }
    static func classify(_ lines: [String]) -> Observation {
        guard (1...16).contains(lines.count), lines.allSatisfy({ !$0.isEmpty }) else { return .unknown }
        let text = lines.joined(separator: "\n")
        func han(_ point: UInt32) -> Bool { (0x3400...0x4dbf).contains(point) || (0x4e00...0x9fff).contains(point) || (0xf900...0xfaff).contains(point) }
        guard text.utf8.count <= 4096, !text.unicodeScalars.contains(where: { scalar in
            let point = scalar.value
            return forbidden(point) || (point > 0x024f && !han(point) && !whitespace.contains(scalar)
                && !(0x2000...0x206f).contains(point) && !(0x3000...0x303f).contains(point)
                && !(0xff01...0xff65).contains(point))
        }) else { return .unknown }
        return text.unicodeScalars.contains { han($0.value) } ? .containsChineseText : .notChinese
    }
}

enum NativeAddressOperationText: Equatable { case set(String), clear }
