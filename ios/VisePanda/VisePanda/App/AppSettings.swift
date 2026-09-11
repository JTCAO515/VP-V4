import Observation
import SwiftUI

enum SupportedLocale: String, CaseIterable, Identifiable, Sendable {
    case zh = "zh-Hans"
    case en
    case es
    case ru
    case ar

    // Legacy values remain decodable but are not offered as release languages.
    static let releaseLocales: [SupportedLocale] = [.zh, .en]

    static func selectionLocales(current: SupportedLocale) -> [SupportedLocale] {
        releaseLocales.contains(current) ? releaseLocales : releaseLocales + [current]
    }

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

    static func launchLocale(arguments: [String] = ProcessInfo.processInfo.arguments, savedLocale: String? = nil) -> SupportedLocale {
        guard let flagIndex = arguments.firstIndex(of: "-VisePandaLocale"),
              arguments.indices.contains(flagIndex + 1),
              let locale = SupportedLocale(rawValue: arguments[flagIndex + 1])
        else {
            return savedLocale.flatMap(SupportedLocale.init(rawValue:)) ?? .zh
        }

        return locale
    }
}

@MainActor
@Observable
final class AppSettings {
    private static let localePreferenceKey = "visepanda.selectedLocale"
    private let defaults: UserDefaults
    var selectedLocale: SupportedLocale {
        didSet { defaults.set(selectedLocale.rawValue, forKey: Self.localePreferenceKey) }
    }
    let nativeSession: NativeSession

    init(selectedLocale: SupportedLocale? = nil, nativeSession: NativeSession? = nil,
         defaults: UserDefaults = .standard, arguments: [String] = ProcessInfo.processInfo.arguments) {
        self.defaults = defaults
        self.nativeSession = nativeSession ?? NativeSession()
        self.selectedLocale = selectedLocale ?? SupportedLocale.launchLocale(
            arguments: arguments, savedLocale: defaults.string(forKey: Self.localePreferenceKey)
        )
    }
}
