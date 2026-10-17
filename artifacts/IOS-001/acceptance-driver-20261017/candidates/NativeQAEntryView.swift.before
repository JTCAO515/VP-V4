import SwiftUI

@MainActor
enum NativeQAEntryRollout {
    static func enabled(arguments: [String] = ProcessInfo.processInfo.arguments,
                        configuration: [String: String] = Bundle.main.infoDictionary?.compactMapValues { $0 as? String } ?? [:]) -> Bool {
        if arguments.contains("-V10RealServiceFrontend") { return true }
        // An installed QA build opens the real entry without remote launch overrides.
        return configuration["VisePandaNativeTaskContext"] == "qa_session_v1"
            && configuration["VisePandaNativeEnvironment"] == "staging"
            && NativeSession.resolveEndpoint(arguments: [], bundleConfiguration: configuration) != nil
    }
}

@MainActor
struct NativeQAEntryView: View {
    let chinese: Bool
    var isActive = true
    @Environment(AppSettings.self) private var settings
    @State private var port: NativeQASessionTransport?
    @State private var signingIn = false

    var body: some View {
        Group {
            if let port, port.matches(session: settings.nativeSession) {
                NativeQAServiceView(transport: port, chinese: chinese, isActive: isActive,
                                    onSignIn: { signingIn = true }, cancellationPersistence: port.cancellationJournal)
                    .id(ObjectIdentifier(port))
            } else { ProgressView() }
        }
        .task(id: ObjectIdentifier(settings.nativeSession)) {
            if port?.matches(session: settings.nativeSession) != true {
                port = settings.nativeSession.makeNativeQATransport()
            }
        }
        .sheet(isPresented: $signingIn) {
            NavigationStack { ProfileView(showSubscriptionEntry: false) }
        }
        .onChange(of: settings.nativeSession.dataScope) { _, scope in
            if scope != nil { signingIn = false }
        }
        .accessibilityIdentifier("native.qa.entry")
    }
}
