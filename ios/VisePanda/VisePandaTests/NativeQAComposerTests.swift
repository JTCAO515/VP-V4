import SwiftUI
import Testing
@testable import VisePanda

/// Synthetic local bindings only; no Auth, service or device acceptance.
@MainActor
struct NativeQAComposerTests {
    @Test func coalescedFastCompletionAllowsNextQuestion() {
        var raw = "first"
        let draft = Binding(get: { raw }, set: { raw = $0 })
        let attempt = NativeQAComposerAttempt()
        NativeQAComposerAccess.send(
            draft: draft, canSend: true, isBusy: false, hasUnconfirmedRequest: false,
            attempt: attempt, isCurrent: { true }, onSend: { complete in raw = ""; complete() }
        )
        // Owner completes and clears draft before another render. No busy or
        // canSend edge is needed to unlock the actual input binding.
        let input = NativeQAComposerAccess.protectedDraft(draft, isCurrent: { true }, canEdit: { !attempt.isLatched })
        input.wrappedValue = "second"
        #expect(raw == "second")
        var calls = 0
        let outcome1 = NativeQAComposerAccess.send(
            draft: draft, canSend: true, isBusy: false, hasUnconfirmedRequest: false,
            attempt: attempt, isCurrent: { true }, onSend: { complete in calls += 1; complete() }
        )
        #expect(outcome1)
        #expect(calls == 1)
        #expect(!attempt.isLatched)
    }

    @MainActor private final class Eligibility {
        var generation = 1
        var active = true
        var blocked = false
    }

    @MainActor private final class Owner {
        var completions: [NativeQAComposerAccess.Completion] = []
        var work: Task<Void, Never>?
    }

    @Test func refusalExplicitlyCompletesAndReleasesInput() {
        let attempt = NativeQAComposerAttempt()
        let outcome2 = NativeQAComposerAccess.send(
            draft: .constant("question"), canSend: true, isBusy: false, hasUnconfirmedRequest: false,
            attempt: attempt, isCurrent: { true }, onSend: { complete in complete() }
        )
        #expect(outcome2)
        #expect(!attempt.isLatched)
    }

    @Test func cancelledOwnerTaskCompletesWithoutRevivingPrivateInput() async {
        let attempt = NativeQAComposerAttempt()
        let owner = Owner()
        let eligibility = Eligibility()
        let draft = Binding<String>.constant("private draft")
        let protected = NativeQAComposerAccess.protectedDraft(
            draft, isCurrent: { eligibility.active }, canEdit: { !attempt.isLatched }
        )
        NativeQAComposerAccess.send(
            draft: draft, canSend: true, isBusy: false, hasUnconfirmedRequest: false,
            attempt: attempt, isCurrent: { eligibility.active }, onSend: { complete in
                owner.work = Task { @MainActor in
                    defer { complete() }
                    await Task.yield()
                    guard !Task.isCancelled else { return }
                }
            }
        )
        #expect(attempt.isLatched)
        eligibility.active = false
        owner.work?.cancel()
        await owner.work?.value
        #expect(!attempt.isLatched)
        #expect(protected.wrappedValue == "")
    }

    @Test func staleScopeAndDuplicateCompletionsCannotUnlockSuccessorAttempt() {
        let attempt = NativeQAComposerAttempt()
        let owner = Owner()
        let eligibility = Eligibility()
        let oldCurrent: @MainActor () -> Bool = { eligibility.generation == 1 }
        NativeQAComposerAccess.send(
            draft: .constant("A"), canSend: true, isBusy: false, hasUnconfirmedRequest: false,
            attempt: attempt, isCurrent: oldCurrent, onSend: { owner.completions.append($0) }
        )
        eligibility.generation = 2
        attempt.invalidate()
        NativeQAComposerAccess.send(
            draft: .constant("B"), canSend: true, isBusy: false, hasUnconfirmedRequest: false,
            attempt: attempt, isCurrent: { eligibility.generation == 2 }, onSend: { owner.completions.append($0) }
        )
        #expect(owner.completions.count == 2)
        guard owner.completions.count == 2 else { return }
        owner.completions[0]()
        owner.completions[0]()
        #expect(attempt.isLatched)
        let outcome3 = NativeQAComposerAccess.send(
            draft: .constant("stale A"), canSend: true, isBusy: false, hasUnconfirmedRequest: false,
            attempt: attempt, isCurrent: oldCurrent, onSend: { _ in Issue.record("stale send") }
        )
        #expect(!outcome3)
        owner.completions[1]()
        #expect(!attempt.isLatched)
        NativeQAComposerAccess.send(
            draft: .constant("next B"), canSend: true, isBusy: false, hasUnconfirmedRequest: false,
            attempt: attempt, isCurrent: { true }, onSend: { owner.completions.append($0) }
        )
        owner.completions[1]()
        #expect(attempt.isLatched)
    }

    @Test func completionNeverGrantsUnknownRequestSendPermission() {
        let attempt = NativeQAComposerAttempt()
        NativeQAComposerAccess.send(
            draft: .constant("question"), canSend: true, isBusy: false, hasUnconfirmedRequest: false,
            attempt: attempt, isCurrent: { true }, onSend: { $0() }
        )
        #expect(!attempt.isLatched)
        let outcome4 = NativeQAComposerAccess.send(
            draft: .constant("question"), canSend: true, isBusy: false, hasUnconfirmedRequest: true,
            attempt: attempt, isCurrent: { true }, onSend: { _ in Issue.record("unknown resend") }
        )
        #expect(!outcome4)
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
        let attempt = NativeQAComposerAttempt()
        var calls = 0
        var received: [UInt8] = []
        for _ in 0..<2 {
            NativeQAComposerAccess.send(
                draft: draft, canSend: true, isBusy: false, hasUnconfirmedRequest: false,
                attempt: attempt, isCurrent: { true },
                onSend: { _ in calls += 1; received = Array(raw.utf8) }
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
            let attempt = NativeQAComposerAttempt()
            let result = NativeQAComposerAccess.send(
                draft: .constant(text), canSend: allowed, isBusy: busy,
                hasUnconfirmedRequest: pending, attempt: attempt,
                isCurrent: { eligible }, onSend: { _ in calls += 1 }
            )
            #expect(!result)
            #expect(!attempt.isLatched)
        }
        #expect(calls == 0)
    }
}
