import SwiftUI

/// A separately integrated stop card; no transport, journal or generation control is implemented here.
struct NativeQACancellationView: View {
    let chinese: Bool
    var isActive: Bool
    var onReadOriginalResult: (() -> Void)?
    @Environment(\.scenePhase) private var scenePhase
    @State private var store: NativeQACancellationStore
    init(transport: any NativeQATransport, persistence: any NativeQACancellationPersistence,
         currentTarget: @escaping () -> NativeQACancellationTarget?, chinese: Bool,
         isActive: Bool = true, onReadOriginalResult: (() -> Void)? = nil) {
        self.chinese = chinese; self.isActive = isActive; self.onReadOriginalResult = onReadOriginalResult
        _store = State(initialValue: NativeQACancellationStore(transport: transport, persistence: persistence, currentTarget: currentTarget))
    }
    private struct Identity: Equatable { let target: NativeQACancellationTarget?; let visible: Bool }
    private var identity: Identity { .init(target: store.target, visible: isActive && scenePhase == .active) }
    private func text(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    var body: some View {
        let displayedIdentity = identity
        let displayedIntent = store.captureIntent()
        Group {
            if displayedIdentity.visible, store.hasCurrentProjection, let displayedIntent {
                VStack(alignment: .leading, spacing: VPSpacing.standard) {
                    Text(title).font(.headline).accessibilityAddTraits(.isHeader)
                        .accessibilityIdentifier("native.qa.cancel.status")
                    Text(detail).font(.body).foregroundStyle(Color.vpSecondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                    if store.canRequestStop {
                        Button(text("请求停止这次生成", "Request stopping this generation")) {
                            guard identity.visible, store.isCurrent(displayedIntent) else { return }
                            Task {
                                guard identity.visible, store.isCurrent(displayedIntent) else { return }
                                await store.requestStop(intent: displayedIntent)
                            }
                        }
                            .frame(minHeight: 44).accessibilityIdentifier("native.qa.cancel.request")
                    } else if !store.busy {
                        Button(text("核对停止结果", "Check stop result")) {
                            guard identity.visible, store.isCurrent(displayedIntent) else { return }
                            Task {
                                guard identity.visible, store.isCurrent(displayedIntent) else { return }
                                await store.checkResult(intent: displayedIntent)
                            }
                        }
                            .frame(minHeight: 44).accessibilityIdentifier("native.qa.cancel.check")
                    }
                    if [.cancelled, .alreadyTerminal].contains(store.state), let onReadOriginalResult {
                        Button(text("读取原请求结果", "Read original request result")) {
                            guard identity.visible, store.isCurrent(displayedIntent) else { return }
                            onReadOriginalResult()
                        }.frame(minHeight: 44).accessibilityIdentifier("native.qa.cancel.original-result")
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(VPSpacing.standard).background(Color.vpSurface, in: RoundedRectangle(cornerRadius: 16))
                .accessibilityIdentifier("native.qa.cancel.card")
            }
        }
        .task(id: displayedIdentity) {
            guard identity == displayedIdentity else { return }
            await store.activate(displayedIdentity.visible)
        }
        .onDisappear { store.invalidate() }
    }
    private var title: String {
        switch store.state {
        case .inactive: text("停止状态已隐藏", "Stop state hidden")
        case .ready: text("这次请求的停止控制", "Stop control for this request")
        case .requesting: text("正在请求停止", "Requesting a stop")
        case .checking: text("正在核对停止结果", "Checking the stop result")
        case .pending: text("停止尚未确认", "Stopping is not confirmed")
        case .unknown, .unavailable: text("还没确认停止结果", "The stop result is unknown")
        case .cancelled: text("已确认这次请求停止", "This request is confirmed stopped")
        case .alreadyTerminal: text("原请求已有终态", "The original request is already terminal")
        case .blocked: text("暂时无法读取停止状态", "Stop state cannot be read")
        }
    }
    private var detail: String {
        switch store.state {
        case .cancelled:
            text("这是停止收据，不代表生成成果已保存或费用已退回。原请求结果需另行读取。", "This is a stop receipt, not confirmation of a saved result or refund. Read the original request result separately.")
        case .alreadyTerminal:
            text("请求可能在停止前已结束；这不证明本次停止生效，也不代表回答成功或退款。", "The request may have ended before the stop. This does not prove that this stop took effect, that the answer succeeded, or that a refund occurred.")
        case .requesting, .checking:
            text("仅核对这次原请求；尚未确认已停止。", "Only this original request is being checked; stopping has not yet been confirmed.")
        case .ready:
            text("停止针对这次请求，不会重新生成回答。离开页面不代表服务端已停止。", "Stopping concerns this request and will not regenerate an answer. Leaving the page does not mean the server has stopped.")
        case .blocked:
            text("请核对当前登录或权限。未确认的停止记录会保留，不会对后继请求操作。", "Check the current sign-in or access. Unconfirmed stop records remain retained and will not act on a successor request.")
        default:
            text("原停止身份与请求记录保持不变。核对只读取原收据，不会再次请求停止、重新生成或承诺退款。", "The original stop identity and record stay unchanged. Checking only reads the original receipt; it does not repeat the stop, regenerate an answer, or promise a refund.")
        }
    }
}
