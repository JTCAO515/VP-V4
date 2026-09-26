import SwiftUI
import StoreKit

enum NativePassScopeGate {
    static func canShow(_ captured: NativeDataScope?, current: NativeDataScope?) -> Bool {
        guard let captured, let current else { return false }
        return captured == current
    }
}

private struct NativePassRead: Decodable {
    struct DataPart: Decodable {
        let productId: String?
        let grants: [Grant]
    }
    struct Grant: Decodable, Identifiable {
        let transactionId: String
        let startsAt: String
        let endsAt: String
        let state: String
        let effectiveState: String
        let catalogVersion: Int
        let policyVersion: String
        var id: String { transactionId }
    }
    let data: DataPart
}

private struct NativePassClaim: Decodable {
    struct Claim: Decodable { let state: String; let transactionId: String }
    let data: Claim
}

struct ProfileView: View {
    @Environment(AppSettings.self) private var settings

    @State private var email = ""
    @State private var password = ""
    @State private var passRead: NativePassRead?
    @State private var passProduct: Product?
    @State private var passStatus: String?
    @State private var passBusy = false
    @State private var passScope: NativeDataScope?

    private var chinese: Bool { settings.selectedLocale == .zh }

    private var accountCaption: Text {
        settings.nativeSession.enabled ? Text(verbatim: chinese ? "测试环境身份" : "Test environment identity") : Text("profile.preview_account")
    }
    private var storageCaption: Text {
        settings.nativeSession.enabled ? Text(verbatim: chinese ? "凭据保存在本机钥匙串" : "Credentials stored in this device’s Keychain") : Text("profile.none")
    }
    private var foundationCaption: Text {
        settings.nativeSession.enabled ? Text(verbatim: chinese ? "仅用于测试账号；行程可与测试网页同步，AI和推送尚未接入。" : "Test accounts only. Trips can sync with the test web app. AI and push are not connected.") : Text("profile.foundation_note")
    }

    private var sessionStatus: String {
        switch settings.nativeSession.status {
        case "active": chinese ? "会话有效" : "Session active"
        case "expiredOrReplaced": chinese ? "会话已过期或已在另一手机登录，请重新登录" : "Session expired or replaced on another phone. Sign in again."
        case "retry": chinese ? "连接未完成，请重试会话" : "Connection incomplete. Retry the session."
        case "storageError": chinese ? "无法读取本机凭据，请重新登录" : "Cannot read local credentials. Sign in again."
        default: chinese ? "尚未登录" : "Signed out"
        }
    }

    var body: some View {
        @Bindable var settings = settings

        Form {
            Section {
                HStack(spacing: 14) {
                    Image("PandaMark")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 58, height: 58)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .accessibilityHidden(true)

                    VStack(alignment: .leading, spacing: 4) {
                        BrandWordmark(width: 150)
                        accountCaption
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel(Text(verbatim: "Vise Panda. ") + accountCaption)
            }

            if settings.nativeSession.enabled {
                Section(chinese ? "测试账号" : "Test account") {
                    Text(sessionStatus)
                        .accessibilityIdentifier("native.session.status")
                    if let subject = settings.nativeSession.subject {
                        if let name = settings.nativeSession.displayName { Text(name).accessibilityIdentifier("native.profile.name") }
                        Text(subject).font(.caption).accessibilityIdentifier("native.session.subject")
                        Button(chinese ? "刷新会话" : "Refresh session") { Task { await settings.nativeSession.validate() } }
                        Button(chinese ? "退出登录" : "Sign out") { Task { await settings.nativeSession.logout() } }
                    } else {
                        TextField(chinese ? "邮箱" : "Email", text: $email)
                            .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.emailAddress)
                            .accessibilityIdentifier("native.login.email")
                        SecureField(chinese ? "密码" : "Password", text: $password)
                            .accessibilityIdentifier("native.login.password")
                        Button(chinese ? "登录" : "Sign in") {
                            let submitted = password
                            password = ""
                            Task { await settings.nativeSession.login(email: email, password: submitted) }
                        }.accessibilityIdentifier("native.login.submit")
                        Button(chinese ? "重试会话" : "Retry session") { Task { await settings.nativeSession.validate() } }
                    }
                }.disabled(settings.nativeSession.busy)
            }

            if settings.nativeSession.dataScope != nil {
                Section(chinese ? "Journey Pass 测试权益" : "Journey Pass test entitlement") {
                    if NativePassScopeGate.canShow(passScope, current: settings.nativeSession.dataScope), let passStatus {
                        Text(passStatus).font(.footnote).accessibilityIdentifier("native.pass.status")
                    }
                    if NativePassScopeGate.canShow(passScope, current: settings.nativeSession.dataScope), let read = passRead {
                        ForEach(read.data.grants) { grant in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(grant.effectiveState == "active" ? (chinese ? "生效中" : "Active") : grant.effectiveState)
                                Text("\(grant.startsAt) – \(grant.endsAt)").font(.caption).textSelection(.enabled)
                                Text("catalog \(grant.catalogVersion) · \(grant.policyVersion)").font(.caption2).foregroundStyle(.secondary)
                            }.accessibilityIdentifier("native.pass.grant.\(grant.transactionId)")
                        }
                    }
                    if NativePassScopeGate.canShow(passScope, current: settings.nativeSession.dataScope), let passProduct {
                        Button(chinese ? "Sandbox 购买 · \(passProduct.displayPrice)" : "Sandbox purchase · \(passProduct.displayPrice)") {
                            Task { await purchasePass(passProduct, session: settings.nativeSession) }
                        }.disabled(passBusy)
                    }
                    Button(chinese ? "刷新权益" : "Refresh entitlement") {
                        Task { await loadPass(session: settings.nativeSession) }
                    }.disabled(passBusy)
                }
                .task(id: settings.nativeSession.dataScope) { await loadPass(session: settings.nativeSession) }
                Section(chinese ? "基础偏好" : "Basic preferences") {
                    NavigationLink(chinese ? "已保存旅行节奏" : "Saved travel pace") { NativeTravelPaceView() }
                }
            }

            if settings.nativeSession.subject != nil {
                Section {
                    NavigationLink(chinese ? "旅途支持请求" : "Travel support requests") {
                        NativeServiceCaseView().id(settings.nativeSession.dataScope)
                    }
                }
            }

            Section("profile.language") {
                Picker("profile.language", selection: $settings.selectedLocale) {
                    ForEach(SupportedLocale.selectionLocales(current: settings.selectedLocale)) { locale in
                        Text(locale.nativeName).tag(locale)
                    }
                }
                .pickerStyle(.navigationLink)
            }

            Section("profile.status") {
                if settings.nativeSession.subject == nil { Label("profile.no_account", systemImage: "person.crop.circle.badge.xmark") }
                if !settings.nativeSession.enabled { Label("profile.no_sync", systemImage: "icloud.slash") }
                Label("profile.no_live_services", systemImage: "network.slash")
            }

            Section("profile.privacy") {
                LabeledContent("profile.data_storage") {
                    storageCaption
                }
                LabeledContent("profile.permissions") {
                    Text("profile.none")
                }
            }

            Section("profile.about") {
                LabeledContent("profile.version", value: "0.1.0")
                foundationCaption
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .vpNavigationTitle("tab.profile")
    }

    private func loadPass(session: NativeSession) async {
        guard let scope = session.dataScope else {
            passScope = nil; passRead = nil; passProduct = nil; passStatus = nil
            return
        }
        passScope = scope
        passRead = nil
        passProduct = nil
        passStatus = nil
        do {
            let bytes = try await session.storeKitRequest(method: "GET")
            guard session.dataScope == scope else { return }
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            let read = try decoder.decode(NativePassRead.self, from: bytes)
            passRead = read
            passProduct = nil
            if let id = read.data.productId,
               let product = try await Product.products(for: [id]).first,
               product.type == .nonRenewable,
               session.dataScope == scope {
                passProduct = product
            }
            if session.dataScope == scope { passStatus = nil }
        } catch {
            guard session.dataScope == scope else { return }
            passRead = nil
            passProduct = nil
            passStatus = chinese ? "Sandbox 权益尚未启用" : "Sandbox entitlement is unavailable"
        }
    }

    private func purchasePass(_ product: Product, session: NativeSession) async {
        guard let scope = session.dataScope, let owner = UUID(uuidString: scope.subject),
              NativePassScopeGate.canShow(passScope, current: scope), passRead?.data.productId == product.id else { return }
        passBusy = true
        defer { passBusy = false }
        do {
            let result = try await product.purchase(options: [.appAccountToken(owner)])
            switch result {
            case .pending:
                passStatus = chinese ? "购买待批准，权益未生效" : "Purchase pending; no grant yet"
            case .userCancelled:
                passStatus = chinese ? "购买已取消" : "Purchase cancelled"
            case .success(let verification):
                guard case .verified(let transaction) = verification,
                      session.dataScope == scope else {
                    passStatus = chinese ? "交易未验证，权益未生效" : "Transaction unverified; no grant"
                    return
                }
                let body = try JSONEncoder().encode(["signedTransaction": verification.jwsRepresentation])
                let receipt = try await session.storeKitRequest(method: "POST", body: body)
                let claim = try JSONDecoder().decode(NativePassClaim.self, from: receipt)
                guard claim.data.state == "active", claim.data.transactionId == String(transaction.id) else {
                    passStatus = chinese ? "交易未生效" : "Transaction did not grant access"
                    return
                }
                await transaction.finish()
                await loadPass(session: session)
            @unknown default:
                passStatus = chinese ? "未知购买状态" : "Unknown purchase state"
            }
        } catch {
            passStatus = chinese ? "服务端验证未完成，请稍后重试" : "Server verification incomplete; retry later"
        }
    }
}

#Preview {
    NavigationStack { ProfileView() }
        .environment(AppSettings())
}
