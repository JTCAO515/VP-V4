import SwiftUI
import Testing
@testable import VisePanda

/// Synthetic local bindings only; no Auth, service or device acceptance.
@MainActor
struct NativeQAComposerTests {
    @MainActor private final class Eligibility {
        var generation = 1
        var active = true
        var blocked = false
    }

    @Test func preservesOriginalBytesAndOverLimitEdits() {
        var raw = ""
        let draft = Binding(get: { raw }, set: { raw = $0 })
        let guarded = NativeQAComposerAccess.protectedDraft(draft, isCurrent: { true }, canEdit: { true })
        let original = "  中文\ne\u{301} 👩🏽‍💻\r\n "
        guarded.wrappedValue = original
        #expect(Array(raw.utf8) == Array(original.utf8))
        #expect(Array(guarded.wrappedValue.utf8) == Array(original.utf8))
        guarded.wrappedValue = String(repeating: "🙂", count: 2001)
        #expect(raw.utf16.count == 4002)
        #expect(!NativeQAComposerAccess.validInput(raw))
    }

    @Test func staleBindingHidesAndCannotOverwriteNewScope() {
        let eligibility = Eligibility()
        var raw = "private A"
        var reads = 0
        let draft = Binding(get: { reads += 1; return raw }, set: { raw = $0 })
        let old = NativeQAComposerAccess.protectedDraft(draft, isCurrent: { eligibility.generation == 1 }, canEdit: { true })
        eligibility.generation = 2
        raw = "new B edit"
        let previousReads = reads
        #expect(old.wrappedValue == "")
        #expect(reads == previousReads)
        old.wrappedValue = "late A keyboard write"
        #expect(raw == "new B edit")
    }

    @Test func inactiveAndPendingBindingsRejectWrites() {
        let eligibility = Eligibility()
        var raw = "retained draft"
        let guarded = NativeQAComposerAccess.protectedDraft(
            Binding(get: { raw }, set: { raw = $0 }),
            isCurrent: { eligibility.active }, canEdit: { !eligibility.blocked }
        )
        eligibility.blocked = true
        guarded.wrappedValue = "pending mutation"
        #expect(raw == "retained draft")
        eligibility.active = false
        #expect(guarded.wrappedValue == "")
        guarded.wrappedValue = "background mutation"
        #expect(raw == "retained draft")
        eligibility.active = true
        eligibility.blocked = false
        guarded.wrappedValue = "fresh edit"
        #expect(raw == "fresh edit")
    }

    @Test func utf16AndWhitespaceBoundaries() {
        #expect(!NativeQAComposerAccess.validInput(""))
        #expect(!NativeQAComposerAccess.validInput(" \t\r\n\u{3000}"))
        #expect(NativeQAComposerAccess.validInput(String(repeating: "a", count: 4000)))
        #expect(!NativeQAComposerAccess.validInput(String(repeating: "a", count: 4001)))
        #expect(NativeQAComposerAccess.validInput(String(repeating: "🙂", count: 2000)))
        #expect(!NativeQAComposerAccess.validInput(String(repeating: "🙂", count: 2001)))
        #expect(NativeQAComposerAccess.validInput(" \n问一下\n "))
    }

    @Test func sendsOnceWithoutClearingOrChangingBytes() {
        var raw = " \ne\u{301}你好🙂\n "
        let original = Array(raw.utf8)
        let draft = Binding(get: { raw }, set: { raw = $0 })
        var latch = false
        var calls = 0
        var received: [UInt8] = []
        for _ in 0..<2 {
            NativeQAComposerAccess.send(
                draft: draft, canSend: true, isBusy: false, hasUnconfirmedRequest: false,
                latched: &latch, isCurrent: { true },
                onSend: { calls += 1; received = Array(raw.utf8) }
            )
        }
        #expect(calls == 1)
        #expect(received == original)
        #expect(Array(raw.utf8) == original)
    }

    @Test func staleSendAndAllDenialsDoNotCallOwner() {
        var current = true
        var calls = 0
        let oldCallback = { current }
        current = false
        for (allowed, busy, pending, eligible, text) in [
            (true, false, false, oldCallback(), "old callback"),
            (false, false, false, true, "no permission"),
            (true, true, false, true, "busy"),
            (true, false, true, true, "unknown"),
            (true, false, false, true, " \n"),
            (true, false, false, true, String(repeating: "🙂", count: 2001))
        ] {
            var latch = false
            let result = NativeQAComposerAccess.send(
                draft: .constant(text), canSend: allowed, isBusy: busy,
                hasUnconfirmedRequest: pending, latched: &latch,
                isCurrent: { eligible }, onSend: { calls += 1 }
            )
            #expect(!result)
            #expect(!latch)
        }
        #expect(calls == 0)
    }
}
