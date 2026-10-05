import SwiftUI

/// These wrappers receive results from actual existing stores, never from navigation or dismissal.
struct NativeDataCoverageCoreConsumer: View {
    let coverage: NativeDataCoverageStore
    let session: NativeSession
    @Environment(\.scenePhase) private var phase
    @State private var core: NativeCoreExportStore?
    private var actor: NativeCommunitySafetyActor? { phase == .active ? try? session.communitySafetyActor() : nil }
    var body: some View {
        Group {
            if let core {
                NativeCoreExportView(store: core)
            .onChange(of: core.fileURL) { _, url in
                guard url != nil, let captured = actor, let receipt = core.receipt,
                      core.selectedFile(captured.scope) == url, core.storageReady else { return }
                Task {
                    let client = NativeDataCoverageClient(session: session, active: { phase == .active })
                    if coverage.visibleModules(captured).isEmpty { await coverage.load(client) }
                    guard actor == captured, core.selectedFile(captured.scope) == url, core.receipt?.requestId == receipt.requestId,
                          core.receipt?.generation == receipt.generation, core.receipt?.artifactDigest == receipt.artifactDigest,
                          core.receipt?.modules == receipt.modules else { return }
                    coverage.recordCore(receipt, delivered: true, current: captured)
                }
                }
            } else { ProgressView() }
        }.task { if core == nil { core = NativeCoreExportStore() } }
    }
}

struct NativeDataCoverageMemoryConsumer: View {
    let module: NativeDataCoverageModule
    let coverage: NativeDataCoverageStore
    let session: NativeSession
    let chinese: Bool
    @Environment(\.scenePhase) private var phase
    @State private var memory = NativeMemoryDeletionStore()
    private var actor: NativeCommunitySafetyActor? { phase == .active ? try? session.communitySafetyActor() : nil }
    var body: some View {
        NativeMemoryDeletionView(session: session, chinese: chinese, store: memory)
            .onChange(of: memory.receipt.map { $0.requestId + "/" + $0.state }) { _, _ in
                guard let captured = actor, memory.scope == captured.scope, let receipt = memory.receipt else { return }
                Task {
                    let client = NativeDataCoverageClient(session: session, active: { phase == .active })
                    if coverage.visibleModules(captured).isEmpty { await coverage.load(client) }
                    guard actor == captured, receipt.scope == module.scope else { return }
                    // Existing screen performs journal completion. A cleanup failure never becomes complete here.
                    if receipt.state == "completed" {
                        do { guard try session.memoryDeletionRecovery() == nil else { return } } catch { return }
                    }
                    coverage.recordLegacy(module: module, action: .delete, operationID: receipt.requestId,
                        selection: "\(receipt.selection.memories.count) " + (chinese ? "条所选记忆及预览中的派生范围" : "selected memories and previewed derived scope"),
                        state: receipt.state == "completed" ? .scopedComplete : .queued, current: captured)
                }
            }
    }
}

struct NativeDataCoverageTripConsumer: View {
    let module: NativeDataCoverageModule
    let coverage: NativeDataCoverageStore
    let session: NativeSession
    let selection: NativeLinkedTripDeleteSelection
    @Environment(\.scenePhase) private var phase
    @State private var deletion = NativeLinkedTripDeletionStore()
    private var actor: NativeCommunitySafetyActor? { phase == .active ? try? session.communitySafetyActor() : nil }
    var body: some View {
        NativeLinkedTripDeletionView(tripID: selection.tripID, headVersion: selection.headVersion, store: deletion)
            .onChange(of: deletion.receipt.map { $0.requestId + "/" + $0.state }) { _, _ in
                guard let captured = actor, captured.scope == selection.scope, let receipt = deletion.receipt,
                      receipt.tripId == selection.tripID else { return }
                Task {
                    let client = NativeDataCoverageClient(session: session, active: { phase == .active })
                    if coverage.visibleModules(captured).isEmpty { await coverage.load(client) }
                    guard actor == captured else { return }
                    if receipt.state == "completed" {
                        do { guard try session.pendingLinkedTripDeletion(target: selection) == nil else { return } } catch { return }
                    }
                    coverage.recordLegacy(module: module, action: .delete, operationID: receipt.requestId,
                        selection: selection.tripID + " · v\(selection.headVersion) · " + receipt.scope,
                        state: receipt.state == "completed" ? .scopedComplete : .queued, current: captured)
                }
            }
    }
}

struct NativeDataCoverageDeviceDeleteConsumer: View {
    let coverage: NativeDataCoverageStore
    let session: NativeSession
    let chinese: Bool
    @Environment(\.scenePhase) private var phase
    @State private var deletion = NativeDeviceMaterialDeleteStore()
    private var actor: NativeCommunitySafetyActor? { phase == .active ? try? session.communitySafetyActor() : nil }
    var body: some View {
        NativeDeviceMaterialDeleteView(session: session, chinese: chinese, store: deletion)
            .onChange(of: deletion.receipt?.requestId) { _, _ in
                guard let captured = actor, let receipt = deletion.receipt, receipt.namespace.matches(captured.scope),
                      receipt.state == "completed", !receipt.allUserDataCompleted else { return }
                Task {
                    let client = NativeDataCoverageClient(session: session, active: { phase == .active })
                    if coverage.visibleModules(captured).isEmpty { await coverage.load(client) }
                    guard actor == captured else { return }
                    coverage.recordDevice(moduleID: "materials", action: .delete, operationID: receipt.requestId,
                        selection: "\(receipt.selectedCount) · " + receipt.scopeDigest, current: captured)
                }
            }
    }
}

struct NativeDataCoverageDeviceExportConsumer: View {
    let coverage: NativeDataCoverageStore
    let session: NativeSession
    let chinese: Bool
    @Environment(\.scenePhase) private var phase
    private var actor: NativeCommunitySafetyActor? { phase == .active ? try? session.communitySafetyActor() : nil }
    var body: some View {
        NativeDeviceMaterialExportView(session: session, chinese: chinese)
            .onChange(of: session.deviceMaterials.delivery?.id) { _, _ in
                guard let captured = actor, let delivery = session.deviceMaterials.delivery,
                      (try? session.deviceMaterials.file(for: delivery, scope: captured.scope)) != nil else { return }
                Task {
                    let client = NativeDataCoverageClient(session: session, active: { phase == .active })
                    if coverage.visibleModules(captured).isEmpty { await coverage.load(client) }
                    guard actor == captured, (try? session.deviceMaterials.file(for: delivery, scope: captured.scope)) != nil else { return }
                    coverage.recordDevice(moduleID: "materials", action: .export, operationID: delivery.id.uuidString.lowercased(),
                        selection: delivery.digest + " · \(delivery.bytes) bytes", state: .partial, current: captured)
                }
            }
    }
}
