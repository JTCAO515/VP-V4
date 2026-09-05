import SwiftUI

struct AskView: View {
    @State private var draft = ""
    @FocusState private var isComposerFocused: Bool

    private let prompts: [LocalizedStringKey] = [
        "ask.prompt.plan",
        "ask.prompt.translate",
        "ask.prompt.prepare"
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: VPSpacing.section) {
                BrandHeader()

                VStack(alignment: .leading, spacing: 10) {
                    Text("ask.eyebrow")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Color.vpBrand)
                        .textCase(.uppercase)

                    Text("ask.title")
                        .font(.largeTitle.weight(.bold))
                        .tracking(-0.8)
                        .fixedSize(horizontal: false, vertical: true)

                    Text("ask.subtitle")
                        .font(.body)
                        .foregroundStyle(.secondary)
                }

                PreviewStatusBanner()

                VStack(alignment: .leading, spacing: 10) {
                    Text("ask.try")
                        .font(.headline)

                    ForEach(Array(prompts.enumerated()), id: \.offset) { _, prompt in
                        NavigationLink(value: AppRoute.capability(.tripPlanning)) {
                            HStack {
                                Text(prompt)
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
        .background(Color.vpBackground)
        .safeAreaInset(edge: .bottom) {
            composer
        }
        .navigationTitle("tab.ask")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var composer: some View {
        VStack(spacing: 8) {
            HStack(alignment: .bottom, spacing: 10) {
                TextField("ask.placeholder", text: $draft, axis: .vertical)
                    .lineLimit(1...4)
                    .focused($isComposerFocused)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                    .background(Color.vpSurface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))

                Button(action: {}) {
                    Image(systemName: "arrow.up")
                        .font(.headline.weight(.bold))
                        .frame(width: 44, height: 44)
                        .foregroundStyle(.white)
                        .background(Color.vpBrand, in: Circle())
                }
                .disabled(true)
                .accessibilityLabel(Text("ask.send"))
                .accessibilityHint(Text("ask.disabled_hint"))
            }

            Text("ask.disabled_hint")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, VPSpacing.standard)
        .padding(.vertical, 10)
        .background(.bar)
    }
}

#Preview {
    NavigationStack { AskView() }
}
