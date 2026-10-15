import Foundation

@main struct LocaleChecks {
    static func main() {
        let chinese: [NativeMuseChatComposerText: String] = [
            .start: "开始聊天",
            .inputHint: "输入本地样例消息，回车发送；键盘工具栏可收起键盘。",
            .voice: "设备端语音输入",
            .send: "发送本地样例消息",
            .limit: "请缩短到2000个字符以内，原文不会截断。",
            .done: "完成",
            .dismissKeyboard: "完成输入，收起键盘",
            .attachment: "附件 · 本地样例",
            .expression: "表达 · 本地样例",
            .place: "地点 · 本地样例",
            .tools: "添加附件、表达或地点 · 本地样例"
        ]
        precondition(chinese.count == NativeMuseChatComposerText.allCases.count)
        for identifier in ["zh-Hans", "zh-CN", "zh-Hant"] {
            for key in NativeMuseChatComposerText.allCases {
                precondition(key.value(locale: Locale(identifier: identifier)) == chinese[key])
            }
        }
        for identifier in ["en", "en-US", "en-GB"] {
            for key in NativeMuseChatComposerText.allCases {
                let value = key.value(locale: Locale(identifier: identifier))
                precondition(!value.isEmpty && value != chinese[key])
                precondition(!value.unicodeScalars.contains { (0x4E00...0x9FFF).contains($0.value) })
            }
        }
        precondition(NativeMuseChatComposerText.start.value(locale: Locale(identifier: "en")) == "Start chatting")
        precondition(NativeMuseChatComposerText.done.value(locale: Locale(identifier: "en")) == "Done")
        precondition(NativeMuseChatComposerText.voice.value(locale: Locale(identifier: "en")) == "On-device voice input")
        precondition(NativeMuseChatComposerText.limit.value(locale: Locale(identifier: "en")).contains("2000"))
        // Locale selection is evaluated per read: switching back restores the exact Chinese copy.
        precondition(NativeMuseChatComposerText.start.value(locale: Locale(identifier: "zh-Hans")) == "开始聊天")
        print("PASS: all 11 static copy entries across 6 zh/en locales; exact Chinese retained; English has no Chinese; locale switch restored")
    }
}
