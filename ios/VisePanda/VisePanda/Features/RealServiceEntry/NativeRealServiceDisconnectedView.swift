import SwiftUI

/// Presented by the root only when explicit real-service mode has no endpoint.
struct NativeRealServiceDisconnectedView: View {
    let chinese: Bool

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: VPSpacing.section) {
                Image(systemName: "network.slash")
                    .font(.largeTitle)
                    .foregroundStyle(Color.vpSecondaryText)
                    .accessibilityHidden(true)

                Text(verbatim: chinese ? "真实服务尚未连接" : "Real service is not connected")
                    .font(.title2.bold())
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("native.real-service.disconnected.title")

                Text(verbatim: chinese
                     ? "这个版本尚未连接测试服务，服务就绪后请更新应用。"
                     : "This version is not connected to the test service yet. Please update the app when the service is ready.")
                    .font(.body)
                    .foregroundStyle(Color.vpSecondaryText)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("native.real-service.disconnected.message")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(VPSpacing.standard)
        }
        .background(Color.vpBackground)
        .accessibilityIdentifier("native.real-service.disconnected")
    }
}
