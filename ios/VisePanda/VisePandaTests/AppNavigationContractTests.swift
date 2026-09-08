import Testing
@testable import VisePanda

struct AppNavigationContractTests {
    @Test("Top-level tabs keep the operator-approved order")
    func tabOrder() {
        #expect(AppTab.allCases == [.trip, .explore, .ask, .tools, .profile])
    }

    @Test("Ask is the default launch destination")
    func defaultTab() {
        #expect(AppTab.defaultSelection == .ask)
    }

    @Test("Tab localization keys remain stable")
    func tabLocalizationKeys() {
        #expect(AppTab.allCases.map(\.localizationKey) == [
            "tab.trip", "tab.explore", "tab.ask", "tab.tools", "tab.profile"
        ])
    }

    @Test("Every first-version capability is explicitly preview-only")
    func capabilityMaturity() {
        #expect(CapabilityKind.allCases.allSatisfy { $0.availability == .previewOnly })
    }

    @Test("Release picker offers only Chinese and English")
    func releaseLocales() {
        #expect(SupportedLocale.releaseLocales == [.zh, .en])
    }

    @Test("Legacy selection stays representable until switching to a release locale")
    func legacySelection() {
        for legacy in [SupportedLocale.es, .ru, .ar] {
            #expect(SupportedLocale.selectionLocales(current: legacy) == [.zh, .en, legacy])
        }
        #expect(SupportedLocale.selectionLocales(current: .en) == [.zh, .en])
    }

    @Test("Five supported locales include an RTL Arabic option")
    func localeContract() {
        #expect(SupportedLocale.allCases.map(\.rawValue) == ["zh-Hans", "en", "es", "ru", "ar"])
        #expect(SupportedLocale.ar.layoutDirection == .rightToLeft)
    }

    @Test("Launch locale override is explicit and defaults to Chinese")
    func launchLocale() {
        #expect(SupportedLocale.launchLocale(arguments: ["VisePanda"]) == .zh)
        #expect(SupportedLocale.launchLocale(arguments: ["VisePanda", "-VisePandaLocale", "ar"]) == .ar)
        #expect(SupportedLocale.launchLocale(arguments: ["VisePanda", "-VisePandaLocale", "unknown"]) == .zh)
    }
}
