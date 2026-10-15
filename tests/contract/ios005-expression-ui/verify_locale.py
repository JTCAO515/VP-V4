#!/usr/bin/env python3
"""Exercise actual locale selectors; retain dynamic payload and authority bytes."""
from pathlib import Path
import json
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[3]
BASE = 'a76799149cec460e742ab101a8b8190512b24464'
TRANSLATION = 'ios/VisePanda/VisePanda/Features/Translation/NativeTranslationView.swift'
EXPRESSION = 'ios/VisePanda/VisePanda/Features/Frontend/Expression/NativeFrontendExpressionView.swift'

def block(source, marker):
    start = source.index(marker)
    opening = source.index('{', start)
    depth, end = 1, opening + 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[start:end]

def baseline(path):
    return subprocess.check_output(['git', 'show', BASE + ':' + path], cwd=ROOT, text=True)

translation = (ROOT / TRANSLATION).read_text()
expression = (ROOT / EXPRESSION).read_text()
before = baseline(TRANSLATION)
for marker in ['private func recentCardIsCurrent(', 'extension NativeTranslationPhrase {',
               'fileprivate static func phrase(', 'enum NativeTranslationCardOrigin {',
               'private func loadSaved(']:
    assert block(before, marker) == block(translation, marker), marker
for payload in ['Text(translation)', 'Text(phrase.original)', 'Text(back)',
                'Text(Self.phrase(source: source, state: state).original)']:
    assert payload in before and payload in translation
for payload in ['material.title, icon:', 'journey.title, icon:',
                '$presentation.screenState', 'NativeFrontendStatePanel(state: state)']:
    assert payload in baseline(EXPRESSION) and payload in expression
assert 'chinese: chinese, origin: .sample' in translation
assert 'chinese: source == ' not in translation

selectors = []
all_pairs = []
for name, source in [('ExpressionCopy', expression), ('SampleCopy', translation.split('struct NativeTranslationSampleExperienceView: View {')[1])]:
    method = block(source, 'private func copy(').replace('private func', 'func', 1)
    prefix = 'var chinese: Bool { locale.language.languageCode?.identifier == "zh" }\n' if name == 'SampleCopy' else ''
    selectors.append('struct ' + name + ' { let locale: Locale;\n' + prefix + method + '\n}\n')
    pairs = re.findall(r'copy\("([^"\n]*)", "([^"\n]*)"\)', source)
    assert pairs
    all_pairs.extend((name, zh, en) for zh, en in pairs)

expected = ['Say it clearly', 'Page sample state', 'Material context', 'Journey context',
            'View expression sample', 'Expression', 'Sample direction', 'Sample state',
            'Open sample card', 'Expression sample']
assert all(any(en == value for _, _, en in all_pairs) for value in expected)
checks = []
for name, zh, en in all_pairs:
    args = json.dumps(zh, ensure_ascii=False) + ', ' + json.dumps(en, ensure_ascii=False)
    checks.append('precondition(' + name + '(locale: Locale(identifier: "en")).copy(' + args + ') == ' + json.dumps(en) + ')')
    checks.append('precondition(' + name + '(locale: Locale(identifier: "zh-Hans")).copy(' + args + ') == ' + json.dumps(zh, ensure_ascii=False) + ')')
with tempfile.TemporaryDirectory(prefix='ios005-locale-') as tmp:
    file = Path(tmp) / 'locale.swift'
    file.write_text('import Foundation\n' + ''.join(selectors) + '\n'.join(checks) + '\nprint("PASS: actual Expression/Sample selectors in en and zh-Hans")\n')
    subprocess.run(['xcrun', 'swift', str(file)], check=True)
print('PASS: dynamic payload, fixed fixture factory, authority/readiness/history guard source unchanged')
