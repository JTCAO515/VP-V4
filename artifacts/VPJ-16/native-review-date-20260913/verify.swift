import Foundation
enum SupportedLocale: String { case zh = "zh-Hans"; case en; var locale: Locale { Locale(identifier: rawValue) } }
let date = ISO8601DateFormatter().date(from: "2026-09-13T12:00:00Z")!
print("System locale: \(Locale.current.identifier)")
for chinese in [false, true] {
 let formatted = date.formatted(.dateTime.year().month(.abbreviated).day().locale((chinese ? SupportedLocale.zh : .en).locale))
 print("\(chinese ? "zh" : "en"): \(formatted)")
 precondition(chinese ? formatted.contains("年") && formatted.contains("月") : formatted.contains("Sep") && !formatted.contains("年"))
}
