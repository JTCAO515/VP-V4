#!/usr/bin/env python3
"""Compile actual presentation predicates and card; isolated synthetic values, no service."""
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[3]
VIEW = ROOT / 'ios/VisePanda/VisePanda/Features/Translation/NativeTranslationView.swift'
STORE = ROOT / 'ios/VisePanda/VisePanda/Features/Translation/NativeTranslationStore.swift'

def block(source, marker):
    start = source.index(marker)
    opening = source.index('{', start)
    depth = 1
    end = opening + 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[start:end]

view, store = VIEW.read_text(), STORE.read_text()
phrase = block(store, 'struct NativeTranslationPhrase:')
ready = block(view, 'extension NativeTranslationPhrase {')
origin = block(view, 'enum NativeTranslationCardOrigin {')
gate = block(view, 'private func recentCardIsCurrent(').replace('private func', 'func', 1)
checks = r'''
precondition(NativeTranslationCardOrigin.sample.translationLabel(chinese: true) == "样例译文")
precondition(NativeTranslationCardOrigin.sample.translationLabel(chinese: false) == "Sample translation")
precondition(NativeTranslationCardOrigin.sample.backTranslationLabel(chinese: true) == "样例回译")
precondition(NativeTranslationCardOrigin.sample.backTranslationLabel(chinese: false) == "Sample back-translation")
for actual: NativeTranslationCardOrigin in [.recent, .saved] {
    precondition(actual.translationLabel(chinese: true) == "译文 · AI 生成")
    precondition(actual.translationLabel(chinese: false) == "Translation · AI-generated")
    precondition(actual.backTranslationLabel(chinese: true) == "回译对照（AI 生成）")
    precondition(actual.backTranslationLabel(chinese: false) == "Back-translation (AI-generated)")
}
print("PASS: explicit sample-origin bilingual labels; real recent/saved AI labels preserved")

let id = "33333333-3333-4333-8333-333333333333"
func phrase(_ state: String = "translated", _ translation: String? = "你好。", _ back: String? = "Hello.", _ source: String = "en", _ target: String = "zh", _ original: String = "Hello.") -> NativeTranslationPhrase {
    .init(turnId: id, sourceLocale: source, targetLocale: target, original: original,
          state: state, translation: translation, backTranslation: back)
}
let good = phrase()
precondition(good.isPresentationReady)
precondition(phrase("translated", "Hello.", "你好。", "zh", "en", "你好。").isPresentationReady)
for state in ["pending", "cancelled", "unavailable", "needs_review", "unknown"] {
    precondition(!phrase(state, nil, nil).isPresentationReady)
    precondition(!phrase(state).isPresentationReady)
}
for value: String? in [nil, "", " \n", String(repeating: "x", count: 2401)] {
    precondition(!phrase("translated", value).isPresentationReady)
    precondition(!phrase("translated", "你好。", value).isPresentationReady)
}
precondition(!phrase("translated", "你好。", "Hello.", "xx").isPresentationReady)
precondition(!phrase("translated", "你好。", "Hello.", "en", "en").isPresentationReady)
precondition(!phrase("translated", "你好。", "Hello.", "en", "zh", "").isPresentationReady)
var presentation = Gate(activeScope: "actor-A", store: Store(scope: "actor-A", policy: Policy(valid: true, consentState: .accepted), phrases: [good]))
precondition(presentation.recentCardIsCurrent(good))
presentation.activeScope = nil
precondition(!presentation.recentCardIsCurrent(good))
presentation.activeScope = "actor-B"
precondition(!presentation.recentCardIsCurrent(good))
presentation.activeScope = "actor-A"
presentation.store.policy = nil
precondition(!presentation.recentCardIsCurrent(good))
presentation.store.policy = Policy(valid: false, consentState: .accepted)
precondition(!presentation.recentCardIsCurrent(good))
presentation.store.policy = Policy(valid: true, consentState: .withdrawn)
precondition(!presentation.recentCardIsCurrent(good))
presentation.store.policy = Policy(valid: true, consentState: .accepted)
presentation.store.phrases = []
precondition(!presentation.recentCardIsCurrent(good))
presentation.store.phrases = [phrase("pending", nil, nil)]
precondition(!presentation.recentCardIsCurrent(good))
print("PASS: actual phrase/presentation readiness and actor/consent/current-result negative predicates")
'''
with tempfile.TemporaryDirectory(prefix='ios005-presentation-') as tmp:
    directory = Path(tmp)
    predicate = directory / 'predicates.swift'
    predicate.write_text('import Foundation\n' + phrase + '\n' + ready + '''
    enum Consent { case accepted, withdrawn }
    struct Policy { var valid: Bool; var consentState: Consent }
    struct Store { var scope: String?; var policy: Policy?; var phrases: [NativeTranslationPhrase] }
    struct Gate { var activeScope: String?; var store: Store;
    ''' + gate + '}\n' + origin + '\n' + checks)
    subprocess.run(['xcrun', 'swift', str(predicate)], check=True)
    card = directory / 'card.swift'
    production_card = view[view.index('enum NativeTranslationCardOrigin {'):view.index('\n#if DEBUG\n#Preview(')]
    card.write_text('import Foundation\nimport SwiftUI\n' + phrase + '\n' + ready + '\nextension Color { static let vpBackground = Color.white }\n' + production_card + '\nenum AppTab { case vp, journeys, library }\n' + (ROOT / 'ios/VisePanda/VisePanda/Features/Frontend/NativeFrontendState.swift').read_text() + '\n' + (ROOT / 'ios/VisePanda/VisePanda/Features/Frontend/Expression/NativeFrontendExpressionView.swift').read_text())
    sdk = subprocess.check_output(['xcrun', '--sdk', 'iphonesimulator', '--show-sdk-path'], text=True).strip()
    subprocess.run(['xcrun', 'swiftc', '-typecheck', '-D', 'DEBUG', '-sdk', sdk, '-target', 'arm64-apple-ios18.0-simulator', str(card)], check=True)
    print('PASS: actual SwiftUI card, DEBUG sample and shared-state expression wrapper typecheck against installed iOS Simulator SDK (no Simulator boot or app build)')
subprocess.run(['xcrun', 'swiftc', '-frontend', '-parse', str(VIEW)], check=True)
print('PASS: full changed view syntax parse; runtime UI/provider/device remains UNRUN')
