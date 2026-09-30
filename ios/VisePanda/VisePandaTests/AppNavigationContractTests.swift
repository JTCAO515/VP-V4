import Foundation
import Testing
@testable import VisePanda

struct AppNavigationContractTests {
    @Test("Top-level tabs keep the operator-approved order")
    func tabOrder() {
        #expect(AppTab.legacyTabs == [.trip, .explore, .ask, .tools, .profile])
        #expect(AppTab.assistantTabs == [.vp, .journeys, .library, .memory])
    }

    @Test("VP is the default assistant-shell destination")
    func defaultTab() {
        #expect(AppTab.defaultSelection == .vp)
    }

    @Test("Tab localization keys remain stable")
    func tabLocalizationKeys() {
        #expect(AppTab.legacyTabs.map(\.localizationKey) == [
            "tab.trip", "tab.explore", "tab.ask", "tab.tools", "tab.profile"
        ])
    }

    @Test("Shell rollout has an explicit old-shell override")
    func shellRollout() {
        #expect(!NativeShellRollout.enabled(arguments: [], bundled: false))
        #expect(NativeShellRollout.enabled(arguments: ["-VisePandaFourTabShell"], bundled: false))
        #expect(NativeShellRollout.enabled(arguments: [], bundled: true))
        #expect(!NativeShellRollout.enabled(arguments: ["-VisePandaFourTabShell", "-VisePandaLegacyShell"], bundled: true))
    }

    @Test("Legacy entry URLs map to existing consumers and reject payloads")
    func entryURLs() throws {
        for entry in AppEntry.allCases {
            #expect(AppEntry.deepLink(try #require(URL(string: "visepanda://\(entry.rawValue)"))) == entry)
        }
        for alias in ["account", "privacy", "purchase", "logout"] {
            #expect(AppEntry.deepLink(try #require(URL(string: "visepanda://\(alias)"))) == .profile)
        }
        for raw in ["https://visepanda/memory", "visepanda://unknown", "visepanda://trip/foreign-id",
                    "visepanda://trip?write=true", "visepanda://user:password@memory", "visepanda://trip#foreign-id"] {
            #expect(AppEntry.deepLink(try #require(URL(string: raw))) == nil)
        }
        #expect(AppEntry.ask.tab(inAssistantShell: true) == .vp)
        #expect(AppEntry.trip.tab(inAssistantShell: true) == .journeys)
        #expect(AppEntry.knowledge.tab(inAssistantShell: true) == .library)
        #expect(AppEntry.memory.tab(inAssistantShell: true) == .memory)
        #expect(AppEntry.ask.tab(inAssistantShell: false) == .ask)
        #expect(AppEntry.profile.tab(inAssistantShell: false) == .profile)
        #expect(AppEntry.search.tab(inAssistantShell: true) == nil)
        #expect(AppEntry.search.tab(inAssistantShell: false) == nil)
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

    @Test("A chosen language survives a new app settings instance without launch overrides overwriting it")
    @MainActor
    func savedLanguage() throws {
        let suite = "VP-Locale-Test-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let firstLaunch = AppSettings(defaults: defaults, arguments: [])
        #expect(firstLaunch.selectedLocale == .zh)
        firstLaunch.selectedLocale = .en
        #expect(AppSettings(defaults: defaults, arguments: []).selectedLocale == .en)
        #expect(AppSettings(defaults: defaults, arguments: ["-VisePandaLocale", "ar"]).selectedLocale == .ar)
        #expect(AppSettings(defaults: defaults, arguments: []).selectedLocale == .en)
        #expect(SupportedLocale.launchLocale(arguments: [], savedLocale: "unsupported") == .zh)
    }
}
