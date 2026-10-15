struct NativePlaceActionsSampleExperience: View {
    @State private var chinese = true
    init() {}
    var body: some View {
        VStack(spacing: 0) {
            Picker("Sample language / 样例语言", selection: $chinese) {
                Text("中文").tag(true)
                Text("English").tag(false)
            }.pickerStyle(.segmented).padding()
                .accessibilityIdentifier("place.sample.language")
            NativePlaceActionsSample(chinese: chinese).id(chinese)
        }
    }
}

