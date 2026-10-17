import SwiftUI

/// Main injects the live authenticated GET port and the existing destinations. No AppShell,
/// Session factory, account, StoreKit, legacy Pass writer or data-control implementation lives here.
struct NativeSubscriptionView<Legacy: View, Controls: View>: View {
    let scope: NativeSubscriptionScope?
    let chinese: Bool
    private let legacyEntitlements: () -> Legacy
    private let dataControls: () -> Controls
    @State private var store: NativeSubscriptionStore
    @Environment(\.scenePhase) private var scenePhase

    init(scope: NativeSubscriptionScope?, chinese: Bool,
         port: any NativeSubscriptionReadPort = NativeSubscriptionUnavailablePort(),
         @ViewBuilder legacyEntitlements: @escaping () -> Legacy,
         @ViewBuilder dataControls: @escaping () -> Controls) {
        self.scope = scope
        self.chinese = chinese
        self.legacyEntitlements = legacyEntitlements
        self.dataControls = dataControls
        _store = State(initialValue: NativeSubscriptionStore(port: port))
    }

    private var copy: NativeSubscriptionCopy { .init(chinese: chinese) }
    private var locale: NativeSubscriptionLocale { chinese ? .zh : .en }
    private var reloadKey: ReloadKey { .init(scope: scope, locale: locale, active: scenePhase == .active) }
    private var visible: NativeSubscriptionEntitlement? {
        guard scope == store.currentScope else { return nil }
        return store.visibleEntitlement
    }

    var body: some View {
        Form {
            Section {
                Label(copy.notPurchasable, systemImage: "lock.fill")
                    .accessibilityIdentifier("subscription.purchase-unavailable")
                Text(copy.free)
                Text(copy.baseline).font(.footnote).foregroundStyle(.secondary)
            }
            if let catalog = store.catalog, catalog.locale == locale {
                Section(copy.text("月订阅", "Monthly subscription")) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(catalog.freeName).font(.headline)
                        Text(catalog.freeDescription)
                    }.accessibilityElement(children: .combine)
                    VStack(alignment: .leading, spacing: 6) {
                        Text(catalog.subscriptionName).font(.headline)
                        Text(catalog.subscriptionDescription)
                    }.accessibilityElement(children: .combine)
                    Text(catalog.status).font(.footnote)
                }.accessibilityIdentifier("subscription.catalog")
            }
            Section(copy.text("当前可核状态", "Current verified status")) {
                if store.phase == .loading, scope == store.currentScope {
                    ProgressView(copy.text("正在核实", "Checking"))
                        .accessibilityIdentifier("subscription.loading")
                }
                if let value = visible {
                    Text(copy.status(value.state)).accessibilityIdentifier("subscription.status")
                    if value.environment == .sandbox {
                        Text(copy.provenance).font(.footnote)
                    }
                    if let checkedAt = value.checkedAt {
                        dateRow(copy.text("服务端上次核验", "Last server check"), checkedAt)
                    }
                    if let period = value.period {
                        dateRow(copy.text("可信周期开始", "Verified period start"), period.purchaseAt)
                        dateRow(copy.text("可信周期结束", "Verified period end"), period.expiresAt)
                        if let revoked = period.revokedAt {
                            dateRow(copy.text("撤销时间", "Revoked at"), revoked)
                        }
                    }
                    if value.state == .unavailable || value.state == .reconciliationRequired {
                        Text(copy.unavailableDetail).font(.footnote)
                    }
                } else if scope == nil, store.currentScope == nil {
                    Text(copy.signInToVerify).accessibilityIdentifier("subscription.status")
                } else {
                    Text(copy.unavailable).accessibilityIdentifier("subscription.status")
                    Text(copy.unavailableDetail).font(.footnote)
                }
                Text(copy.balance).accessibilityIdentifier("subscription.capacity-unknown")
                Button(copy.refresh) { Task { await store.reload(locale: locale) } }
                    .disabled(store.phase == .loading || scenePhase != .active)
                    .accessibilityIdentifier("subscription.reload")
            }
            Section(copy.text("原有权益与共同资料权利", "Existing entitlements and shared data rights")) {
                NavigationLink(copy.legacy, destination: legacyEntitlements)
                    .accessibilityIdentifier("subscription.legacy-entitlements")
                NavigationLink(copy.controls, destination: dataControls)
                    .accessibilityIdentifier("subscription.data-controls")
                Text(copy.text("旧 Pass 沿原账本和周期显示，本页不会重新计算或发放。基础记忆与资料控制不以订阅为前提。", "Legacy Pass uses its original ledger and periods. This page does not recalculate or grant it. Basic memory and data controls do not require a subscription."))
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .navigationTitle(copy.title)
        .task(id: reloadKey) {
            store.setForeground(scenePhase == .active)
            if scenePhase == .active { await store.reload(locale: locale) }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { store.setForeground(false) }
        }
        .onChange(of: scope) { _, _ in store.invalidateIfScopeChanged() }
        .onDisappear { store.invalidate() }
    }

    private func dateRow(_ label: String, _ value: Date) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Text(value, format: .dateTime.year().month().day().hour().minute().second().timeZone())
        }.accessibilityElement(children: .combine)
    }

    private struct ReloadKey: Equatable {
        let scope: NativeSubscriptionScope?
        let locale: NativeSubscriptionLocale
        let active: Bool
    }
}
