import Foundation
struct Original {
    static func resolveEndpoint(arguments: [String], bundleConfiguration: [String: String]) -> URL? {
        if let raw = bundleConfiguration["VisePandaStagingAPIOrigin"], !raw.isEmpty {
            guard bundleConfiguration["VisePandaNativeEnvironment"] == "staging",
                  let url = URL(string: raw), url.scheme == "https", url.port == nil,
                  url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
                  url.path.isEmpty || url.path == "/",
                  let host = url.host,
                  (host == "staging.go2china.space" || host.range(of: #"^vp-v4-[a-z0-9]+-jtcao515s-projects\.vercel\.app$"#, options: .regularExpression) != nil)
            else { return nil }
            return URL(string: "https://" + host)
        }
        // An incomplete build configuration must not fall back to a local credential destination.
        guard bundleConfiguration["VisePandaNativeEnvironment", default: ""].isEmpty else { return nil }
        guard let index = arguments.firstIndex(of: "-VisePandaNativeAPI"), arguments.indices.contains(index + 1),
              let url = URL(string: arguments[index + 1]), url.scheme == "http",
              ["localhost", "127.0.0.1"].contains(url.host ?? ""), url.user == nil, url.password == nil,
              url.query == nil, url.fragment == nil, url.path.isEmpty || url.path == "/" else { return nil }
        return url
    }

}
struct Candidate {
    static func resolveEndpoint(arguments: [String], bundleConfiguration: [String: String]) -> URL? {
        if let raw = bundleConfiguration["VisePandaStagingAPIOrigin"], !raw.isEmpty {
            guard bundleConfiguration["VisePandaNativeEnvironment"] == "staging",
                  let url = URL(string: raw), url.scheme == "https", url.port == nil,
                  url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
                  url.path.isEmpty || url.path == "/",
                  let host = url.host,
                  (host == "staging.go2china.space" || host == "qatesting.go2china.space" || host.range(of: #"^vp-v4-[a-z0-9]+-jtcao515s-projects\.vercel\.app$"#, options: .regularExpression) != nil)
            else { return nil }
            return URL(string: "https://" + host)
        }
        // An incomplete build configuration must not fall back to a local credential destination.
        guard bundleConfiguration["VisePandaNativeEnvironment", default: ""].isEmpty else { return nil }
        guard let index = arguments.firstIndex(of: "-VisePandaNativeAPI"), arguments.indices.contains(index + 1),
              let url = URL(string: arguments[index + 1]), url.scheme == "http",
              ["localhost", "127.0.0.1"].contains(url.host ?? ""), url.user == nil, url.password == nil,
              url.query == nil, url.fragment == nil, url.path.isEmpty || url.path == "/" else { return nil }
        return url
    }

}

var checks = 0
func check(_ value: Bool, _ label: String) { precondition(value, label); checks += 1 }
func config(_ origin: String, _ env: String = "staging") -> [String: String] {
    ["VisePandaStagingAPIOrigin": origin, "VisePandaNativeEnvironment": env]
}
check(Original.resolveEndpoint(arguments: [], bundleConfiguration: config("https://qatesting.go2china.space")) == nil, "baseline refuses QA")
check(Candidate.resolveEndpoint(arguments: [], bundleConfiguration: config("https://qatesting.go2china.space"))?.absoluteString == "https://qatesting.go2china.space", "candidate exact QA")
for origin in ["http://qatesting.go2china.space", "https://qatesting.go2china.space:443", "https://qatesting.go2china.space/path", "https://qatesting.go2china.space?query=1", "https://qatesting.go2china.space#fragment", "https://user@qatesting.go2china.space", "https://qatesting.go2china.space.evil.example", "https://other.go2china.space"] {
    check(Candidate.resolveEndpoint(arguments: [], bundleConfiguration: config(origin)) == nil, "reject unapproved destination")
}
check(Candidate.resolveEndpoint(arguments: [], bundleConfiguration: config("https://qatesting.go2china.space", "production")) == nil, "reject nonstaging")
check(Candidate.resolveEndpoint(arguments: [], bundleConfiguration: config("https://staging.go2china.space")) != nil, "preserve staging")
check(Candidate.resolveEndpoint(arguments: [], bundleConfiguration: config("https://vp-v4-abc123-jtcao515s-projects.vercel.app")) != nil, "preserve exact preview")
check(Candidate.resolveEndpoint(arguments: ["-VisePandaNativeAPI", "https://qatesting.go2china.space"], bundleConfiguration: [:]) == nil, "no remote launch override")
check(Candidate.resolveEndpoint(arguments: ["-VisePandaNativeAPI", "http://127.0.0.1:3999"], bundleConfiguration: [:]) != nil, "preserve loopback fixture")
check(Candidate.resolveEndpoint(arguments: ["-VisePandaNativeAPI", "http://127.0.0.1:3999"], bundleConfiguration: ["VisePandaNativeEnvironment": "staging"]) == nil, "no incomplete build fallback")
print("PASS: \(checks) endpoint candidate assertions; pure source probe, no HTTP/Auth/provider")
