import Observation
import SwiftUI

enum SupportedLocale: String, CaseIterable, Identifiable, Sendable {
    case zh = "zh-Hans"
    case en
    case es
    case ru
    case ar

    var id: String { rawValue }
    var locale: Locale { Locale(identifier: rawValue) }
    var layoutDirection: LayoutDirection { self == .ar ? .rightToLeft : .leftToRight }

    var nativeName: String {
        switch self {
        case .zh: "中文"
        case .en: "English"
        case .es: "Español"
        case .ru: "Русский"
        case .ar: "العربية"
        }
    }

    static func launchLocale(arguments: [String] = ProcessInfo.processInfo.arguments) -> SupportedLocale {
        guard let flagIndex = arguments.firstIndex(of: "-VisePandaLocale"),
              arguments.indices.contains(flagIndex + 1),
              let locale = SupportedLocale(rawValue: arguments[flagIndex + 1])
        else {
            return .zh
        }

        return locale
    }
}

@MainActor
@Observable
final class AppSettings {
    var selectedLocale: SupportedLocale

    init(selectedLocale: SupportedLocale? = nil) {
        self.selectedLocale = selectedLocale ?? SupportedLocale.launchLocale()
    }
}
