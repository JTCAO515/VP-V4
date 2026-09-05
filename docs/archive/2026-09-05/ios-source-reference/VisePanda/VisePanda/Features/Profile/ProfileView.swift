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
                        .scaledToFill()
                        .frame(width: 58, height: 58)
                        .clipShape(Circle())
                        .accessibilityHidden(true)

                    VStack(alignment: .leading, spacing: 4) {
                        Text("VisePanda.")
                            .font(.title3.weight(.bold))
                            .foregroundStyle(Color.vpBrand)
                        Text("profile.preview_account")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
                .accessibilityElement(children: .combine)
            }

            Section("profile.language") {
                Picker("profile.language", selection: $settings.selectedLocale) {
                    ForEach(SupportedLocale.allCases) { locale in
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
        .navigationTitle("tab.profile")
    }
}

#Preview {
    NavigationStack { ProfileView() }
        .environment(AppSettings())
}
