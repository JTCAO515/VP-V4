import SwiftUI

@main
struct VisePandaApp: App {
    @State private var settings = AppSettings()

    var body: some Scene {
        WindowGroup {
            AppShellView()
                .environment(settings)
                .environment(\.locale, settings.selectedLocale.locale)
                .environment(\.layoutDirection, settings.selectedLocale.layoutDirection)
                .tint(.vpBrand)
        }
    }
}
