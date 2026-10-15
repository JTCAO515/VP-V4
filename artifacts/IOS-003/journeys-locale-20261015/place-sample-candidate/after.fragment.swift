struct NativePlaceActionsSampleExperience: View {
    @Environment(\.locale) private var locale
    @State private var chineseOverride: Bool?
    private var chinese: Bool { chineseOverride ?? (locale.language.languageCode?.identifier == "zh") }
    init() {}
    var body: some View {
        VStack(spacing: 0) {
            Picker("Sample language / 样例语言", selection: Binding(get: { chinese }, set: { chineseOverride = $0 })) {
                Text("中文").tag(true)
                Text("English").tag(false)
            }.pickerStyle(.segmented).padding()
                .accessibilityIdentifier("place.sample.language")
            NativePlaceActionsSample(chinese: chinese).id(chinese)
        }.onChange(of: locale.identifier) { _, _ in chineseOverride = nil }
    }
}

