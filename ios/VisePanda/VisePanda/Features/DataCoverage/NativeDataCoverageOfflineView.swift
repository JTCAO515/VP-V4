import SwiftUI

/// The original coverage entry composes the owned consumer; no replacement privacy executor.
struct NativeDataCoverageOfflineView: View {
    let coverage: NativeDataCoverageStore
    let session: NativeSession
    let chinese: Bool
    var body: some View { NativeOfflineDataView(coverage: coverage, session: session, chinese: chinese) }
}
