import SwiftUI

@main
struct VisePandaApp: App {
    @UIApplicationDelegateAdaptor(NativeNotificationDelegate.self) private var notificationDelegate
    @State private var settings = AppSettings()

    var body: some Scene {
        WindowGroup {
            Group {
                if ProcessInfo.processInfo.arguments.contains("-VPJ77Specimen") {
                    AssistantSpecimenView()
                } else {
                    AppShellView()
                }
            }
                .environment(settings)
                .environment(\.locale, settings.selectedLocale.locale)
                .environment(\.layoutDirection, settings.selectedLocale.layoutDirection)
                .tint(.vpBrand)
        }
    }
}
