import SwiftUI

struct AskView: View {
    var isActive = true
    @Environment(AppSettings.self) private var settings
    @State private var draft = ""
    @FocusState private var isComposerFocused: Bool

    private let prompts: [(key: String, capability: CapabilityKind)] = [
        ("ask.prompt.plan", .tripPlanning),
        ("ask.prompt.translate", .translation),
        ("ask.prompt.prepare", .tripPlanning)
    ]

    var body: some View {
        if settings.nativeSession.enabled { NativeAskView(store: NativeAskStore(mode: settings.nativeSession.askMode), isActive: isActive) } else { previewBody }
    }

    private var previewBody: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: VPSpacing.section) {
                BrandHeader()

                VStack(alignment: .leading, spacing: 10) {
                    Text("ask.eyebrow")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Color.vpBrand)
                        .textCase(.uppercase)

                    VPReadableText("ask.title", style: .largeTitle, weight: .bold, tracking: -0.8)

                    Text("ask.subtitle")
                        .accessibilityIdentifier("ask-introduction")
                        .font(.body)
                        .foregroundStyle(Color.vpSecondaryText)
                }

                PreviewStatusBanner()
                availabilityNotice

                VStack(alignment: .leading, spacing: 10) {
                    Text("ask.try")
                        .font(.headline)

                    ForEach(Array(prompts.enumerated()), id: \.offset) { _, prompt in
                        NavigationLink(value: AppRoute.capability(prompt.capability)) {
                            HStack {
                                Text(LocalizedStringKey(prompt.key))
                                    .multilineTextAlignment(.leading)
                                Spacer()
                                Image(systemName: "arrow.up.right")
                                    .accessibilityHidden(true)
                            }
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.primary)
                            .padding(14)
                            .background(Color.vpSurface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        }
                        .buttonStyle(SoftPressButtonStyle())
                    }
                }
            }
            .padding(.horizontal, VPSpacing.standard)
            .padding(.top, VPSpacing.standard)
            .padding(.bottom, 120)
        }
        .scrollDismissesKeyboard(.interactively)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("ask.done") { isComposerFocused = false }
                    .accessibilityIdentifier("ask-keyboard-done")
            }
        }
        .background(Color.vpBackground)
        .safeAreaInset(edge: .bottom) {
            composer
        }
        .vpNavigationTitle("tab.ask")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var availabilityNotice: some View {
        Text("ask.disabled_hint")
            .accessibilityIdentifier("ask-availability-notice")
            .font(.footnote)
            .foregroundStyle(.primary)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var composer: some View {
        VStack(spacing: 8) {
            HStack(alignment: .bottom, spacing: 10) {
                TextField("ask.placeholder", text: $draft, axis: .vertical)
                    .accessibilityIdentifier("ask-composer-input")
                    .lineLimit(1...4)
                    .focused($isComposerFocused)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                    .background(Color.vpSurface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))

                Button(action: {}) {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 17, weight: .bold))
                        .frame(width: 44, height: 44)
                        .foregroundStyle(.white)
                        .background(Color.vpBrandFill, in: Circle())
                }
                .disabled(true)
                .accessibilityLabel(Text("ask.send"))
                .accessibilityHint(Text("ask.disabled_hint"))
            }
        }
        .padding(.horizontal, VPSpacing.standard)
        .padding(.vertical, 10)
        .background(.bar)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("ask-composer")
    }
}

#Preview {
    NavigationStack { AskView() }.environment(AppSettings())
}
