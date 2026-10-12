import SwiftUI

private struct NativeJourneyMeasurementFrame: PreferenceKey {
    static let defaultValue = CGRect.zero
    static func reduce(value: inout CGRect, nextValue: () -> CGRect) { value = nextValue() }
}

/// Attach only to the actually rendered qualified/useful result branch. The
/// caller supplies the real enclosing viewport; nil/unknown geometry rejects.
struct NativeJourneyMeasurementRenderProbe: ViewModifier {
    let viewport: CGRect?
    let qualifiedCurrentUseful: Bool
    let active: Bool
    let presented: () -> Void
    let hidden: () -> Void
    @Environment(\.scenePhase) private var phase
    @State private var observedFrame = CGRect.zero
    private var visible: Bool {
        guard let viewport, !viewport.isNull, !viewport.isInfinite, !viewport.isEmpty,
              !observedFrame.isNull, !observedFrame.isInfinite, !observedFrame.isEmpty else { return false }
        return !viewport.intersection(observedFrame).isEmpty
    }
    private func observe() {
        guard active, phase == .active, qualifiedCurrentUseful, visible else { hidden(); return }
        presented()
    }
    func body(content: Content) -> some View {
        content.background {
            GeometryReader { proxy in Color.clear.preference(key: NativeJourneyMeasurementFrame.self, value: proxy.frame(in: .global)) }
        }
        .onPreferenceChange(NativeJourneyMeasurementFrame.self) { frame in observedFrame = frame; observe() }
        .onChange(of: viewport) { _, _ in observe() }
        .onChange(of: qualifiedCurrentUseful) { _, _ in observe() }
        .onChange(of: active) { _, _ in observe() }
        .onChange(of: phase) { _, _ in observe() }
        .onDisappear { hidden() }
    }
}
