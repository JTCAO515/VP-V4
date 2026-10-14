import Foundation

@main struct PolicyChecks {
    static func main() {
        let cases: [(String, Bool, Bool)] = [
            ("", true, false),
            (" \t\n\r", true, false),
            ("\u{3000}\u{00a0}", true, false),
            ("你好", false, true),
            ("  开始聊天 \n", false, true),
            (String(repeating: "中", count: 2000), false, true),
            (String(repeating: "中", count: 2001), false, false),
            (String(repeating: " ", count: 2000) + "字", false, false),
            (String(repeating: "👨‍👩‍👧‍👦", count: 2000), false, true),
            (String(repeating: "e\u{301}", count: 2001), false, false),
            (String(repeating: " ", count: 2001), true, false)
        ]
        for (draft, voice, allowed) in cases {
            precondition(NativeMuseChatComposerPolicy.showsVoice(for: draft) == voice)
            precondition(NativeMuseChatComposerPolicy.canSubmit(draft, blocked: false) == allowed)
            // Loading and failed both set blocked; neither may admit any draft.
            precondition(!NativeMuseChatComposerPolicy.canSubmit(draft, blocked: true))
        }
        print("PASS: 11 input scenarios; empty/whitespace voice, raw 2000/2001 limits, Unicode graphemes, blocked send")
    }
}
