import Foundation

/// An opaque lookup pointer. A link never supplies identity, credentials, content or Trip authority.
struct NativeEntryResumeLink: Equatable, Sendable {
    let entryID: UUID

    enum Result: Equatable {
        case entry(NativeEntryResumeLink)
        case unavailable
        case unrelated
    }

    static func parse(_ url: URL, associatedHosts: Set<String>) -> Result {
        let scheme = url.scheme?.lowercased()
        let host = url.host?.lowercased()
        let isCustom = scheme == "visepanda" && host == "resume"
        let isHTTPS = scheme == "https" && host.map(associatedHosts.contains) == true
        guard isCustom || isHTTPS else {
            // An unconfigured HTTPS resume link has a visible manual-entry fallback.
            return scheme == "https" && url.path.hasPrefix("/resume/") ? .unavailable : .unrelated
        }
        if isHTTPS && !url.path.hasPrefix("/resume/") { return .unrelated }
        guard url.user == nil, url.password == nil, url.port == nil,
              url.query == nil, url.fragment == nil,
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.percentEncodedPath == url.path else { return .unavailable }
        let pieces = url.path.split(separator: "/", omittingEmptySubsequences: false)
        let raw: String
        if isCustom {
            guard pieces.count == 2, pieces[0].isEmpty else { return .unavailable }
            raw = String(pieces[1])
        } else {
            guard pieces.count == 3, pieces[0].isEmpty, pieces[1] == "resume" else { return .unavailable }
            raw = String(pieces[2])
        }
        guard let id = UUID(uuidString: raw), id.uuidString.lowercased() == raw.lowercased() else { return .unavailable }
        return .entry(.init(entryID: id))
    }

    /// Explicit build configuration only; no default host and no activation of associated domains.
    static func configuredHosts(_ value: String?) -> Set<String> {
        guard let value else { return [] }
        return Set(value.split(separator: ",").compactMap { part in
            let host = part.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            guard let url = URL(string: "https://" + host), url.host == host,
                  url.user == nil, url.password == nil, url.port == nil,
                  url.path.isEmpty, url.query == nil, url.fragment == nil,
                  host.contains("."), !host.contains("*") else { return nil }
            return host
        })
    }
}
