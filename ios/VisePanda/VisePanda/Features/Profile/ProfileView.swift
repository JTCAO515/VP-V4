import SwiftUI

struct ProfileView: View {
    @Environment(AppSettings.self) private var settings

    @State private var email = ""
    @State private var password = ""

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
}

#Preview {
    NavigationStack { ProfileView() }
        .environment(AppSettings())
}
