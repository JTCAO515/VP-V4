import CoreGraphics
import CryptoKit
import Foundation
import PDFKit

/// Text extraction only. No PDF view, actions, external links or provider calls.
nonisolated struct NativePDFDocument: Sendable, Equatable {
    struct Line: Sendable, Equatable, Identifiable, Codable {
        let page: Int
        let number: Int
        let text: String
        var id: String { "\(page):\(number)" }
    }
    struct Page: Sendable, Equatable, Identifiable {
        let id: Int
        let lines: [Line]
    }
    let digest: String
    let bytes: Int
    let pages: [Page]
    private init(digest: String, bytes: Int, pages: [Page]) { self.digest = digest; self.bytes = bytes; self.pages = pages }
    static let maximumBytes = 20_000_000
    static let maximumPages = 10

    static func readSelectedURL(_ url: URL) throws -> Data {
        guard url.isFileURL, url.pathExtension.lowercased() == "pdf" else { throw NativePDFError.format }
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }
        let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
        guard values.isRegularFile == true, values.isSymbolicLink != true else { throw NativePDFError.format }
        guard let size = values.fileSize, size > 0, size <= maximumBytes else { throw NativePDFError.size }
        // Bound the allocation even if a provider replaces/grows the file after metadata was read.
        let file = try FileHandle(forReadingFrom: url)
        defer { try? file.close() }
        var data = Data()
        while let chunk = try file.read(upToCount: min(65_536, maximumBytes + 1 - data.count)), !chunk.isEmpty {
            try Task.checkCancellation()
            data.append(chunk)
            guard data.count <= maximumBytes else { throw NativePDFError.size }
        }
        guard !data.isEmpty else { throw NativePDFError.format }
        return data
    }

    static func extract(_ data: Data) throws -> Self {
        guard !data.isEmpty, data.count <= maximumBytes else { throw NativePDFError.size }
        guard data.starts(with: Data("%PDF-".utf8)),
              let provider = CGDataProvider(data: data as CFData),
              let cg = CGPDFDocument(provider), let document = PDFDocument(data: data) else { throw NativePDFError.format }
        guard !cg.isEncrypted, !document.isEncrypted, !document.isLocked else { throw NativePDFError.encrypted }
        guard (1...maximumPages).contains(cg.numberOfPages), document.pageCount == cg.numberOfPages else { throw NativePDFError.pages }
        var visited = Set<UInt>()
        var budget = 20_000
        guard safeDictionary(cg.catalog, depth: 0, visited: &visited, budget: &budget) else { throw NativePDFError.activeContent }
        var pages: [Page] = []
        for index in 0..<document.pageCount {
            try Task.checkCancellation()
            guard let page = document.page(at: index) else { throw NativePDFError.format }
            let text = page.string ?? ""
            guard text.count <= 40_000 else { throw NativePDFError.textLimit }
            let raw = text.components(separatedBy: .newlines)
            guard raw.count <= 500, raw.allSatisfy({ $0.count <= 1_000 }) else { throw NativePDFError.textLimit }
            let lines = raw.enumerated().compactMap { offset, value -> Line? in
                let text = value.trimmingCharacters(in: .whitespacesAndNewlines)
                return text.isEmpty ? nil : Line(page: index + 1, number: offset + 1, text: text)
            }
            pages.append(Page(id: index + 1, lines: lines))
        }
        return Self(digest: digest(data), bytes: data.count, pages: pages)
    }

    static func digest(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }

    private static func safeDictionary(_ dictionary: CGPDFDictionaryRef?, depth: Int,
                                       visited: inout Set<UInt>, budget: inout Int) -> Bool {
        guard let dictionary, depth <= 64, budget > 0 else { return false }
        let identity = UInt(bitPattern: dictionary.rawValue)
        if visited.contains(identity) { return true }
        visited.insert(identity)
        var safe = true
        CGPDFDictionaryApplyBlock(dictionary, { key, object, _ in
            budget -= 1
            guard budget > 0 else { safe = false; return false }
            let name = String(cString: key)
            if ["A", "AA", "OpenAction", "JS", "JavaScript", "EmbeddedFiles", "EF", "Launch", "RichMedia", "XFA", "AcroForm"].contains(name) {
                safe = false; return false
            }
            safe = safeObject(object, depth: depth + 1, visited: &visited, budget: &budget)
            return safe
        }, nil)
        return safe
    }

    private static func safeObject(_ object: CGPDFObjectRef, depth: Int,
                                   visited: inout Set<UInt>, budget: inout Int) -> Bool {
        guard depth <= 64, budget > 0 else { return false }
        switch CGPDFObjectGetType(object) {
        case .dictionary:
            var value: CGPDFDictionaryRef?
            guard CGPDFObjectGetValue(object, .dictionary, &value) else { return false }
            return safeDictionary(value, depth: depth, visited: &visited, budget: &budget)
        case .stream:
            var value: CGPDFStreamRef?
            guard CGPDFObjectGetValue(object, .stream, &value), let value else { return false }
            return safeDictionary(CGPDFStreamGetDictionary(value), depth: depth, visited: &visited, budget: &budget)
        case .array:
            var value: CGPDFArrayRef?
            guard CGPDFObjectGetValue(object, .array, &value), let value else { return false }
            for index in 0..<CGPDFArrayGetCount(value) {
                budget -= 1
                var child: CGPDFObjectRef?
                guard budget > 0, CGPDFArrayGetObject(value, index, &child), let child,
                      safeObject(child, depth: depth + 1, visited: &visited, budget: &budget) else { return false }
            }
            return true
        default: return true
        }
    }
}

enum NativePDFError: Error, Equatable { case format, size, pages, encrypted, activeContent, textLimit, expired, scope }
