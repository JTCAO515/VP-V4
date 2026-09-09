import SwiftUI

struct ProfileView: View {
    @Environment(AppSettings.self) private var settings

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
                        Text("profile.preview_account")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel(Text(verbatim: "Vise Panda. ") + Text("profile.preview_account"))
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
                Label("profile.no_account", systemImage: "person.crop.circle.badge.xmark")
                Label("profile.no_sync", systemImage: "icloud.slash")
                Label("profile.no_live_services", systemImage: "network.slash")
            }

            Section("profile.privacy") {
                LabeledContent("profile.data_storage") {
                    Text("profile.none")
                }
                LabeledContent("profile.permissions") {
                    Text("profile.none")
                }
            }

            Section("profile.about") {
                LabeledContent("profile.version", value: "0.1.0")
                Text("profile.foundation_note")
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
