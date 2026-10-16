"""Synthetic pure-message tests and actual-source SDK typecheck; no simulator or network."""
from pathlib import Path
import hashlib
import json
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
APP = ROOT / 'ios/VisePanda/VisePanda'
contract = APP / 'Features/RealServiceEntry/NativeQA/NativeQAContract.swift'
messages = APP / 'Features/RealServiceEntry/NativeQAUI/Messages'
production = [contract, messages / 'NativeQAMessagePresentation.swift', messages / 'NativeQAMessageCard.swift', APP / 'DesignSystem/VisePandaTheme.swift']
test = ROOT / 'ios/VisePanda/VisePandaTests/NativeQAMessagePresentationTests.swift'
original = (APP / 'App/NativeSession.swift').read_text()
a = original.index('struct NativeDataScope:')
b = original.index('\n}', a) + 2
scope = 'import Foundation\n' + original[a:b] + '\n'

def run(args, name):
    result = subprocess.run(args, cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    (OUT / name).write_text(result.stdout)
    print(name, 'PASS' if result.returncode == 0 else 'FAIL', flush=True)
    if result.returncode:
        print(result.stdout)
        raise SystemExit(result.returncode)

with tempfile.TemporaryDirectory(prefix='qa-message-proof-') as tmp:
    p = Path(tmp)
    src = p / 'Sources/VisePanda'
    tests = p / 'Tests/MessageTests'
    src.mkdir(parents=True)
    tests.mkdir(parents=True)
    (p / 'Package.swift').write_text('// swift-tools-version: 6.0\nimport PackageDescription\nlet package = Package(name: "QAMessageProof", platforms: [.macOS(.v14)], targets: [.target(name: "VisePanda"), .testTarget(name: "MessageTests", dependencies: ["VisePanda"])])\n')
    scope_file = src / 'NativeDataScope.swift'
    scope_file.write_text(scope)
    for file in production[:2]:
        (src / file.name).write_bytes(file.read_bytes())
    (tests / test.name).write_bytes(test.read_bytes())
    run(['xcrun', 'swift', 'test', '--package-path', str(p), '--scratch-path', str(p / 'build')], 'synthetic-swift-test.log')
    sdk = subprocess.check_output(['xcrun', '--sdk', 'iphoneos', '--show-sdk-path'], text=True).strip()
    run(['xcrun', 'swiftc', '-typecheck', '-swift-version', '6', '-strict-concurrency=complete', '-target', 'arm64-apple-ios17.0', '-sdk', sdk, '-module-cache-path', str(p / 'ios-cache'), str(scope_file)] + [str(f) for f in production], 'ios17-swift6-typecheck.log')
    card = (messages / 'NativeQAMessageCard.swift').read_text()
    assert 'TimelineView(.animation)' in card
    assert 'NativeQAMessagePresentation.resolve(' in card
    assert 'Text(verbatim: presentation.input)' in card and 'Text(verbatim: response)' in card
    assert 'native.qa.answer.' in card and 'native.qa.message-status.' in card
    for prohibited in ['@State', 'AsyncImage', 'Link(', 'openURL', 'UIPasteboard', 'textSelection', 'lineLimit(', 'Task {']:
        assert prohibited not in card, prohibited
    print('source-only rendering guards PASS (not UI runtime evidence)')
    (OUT / 'source-pins.json').write_text(json.dumps({
        'files': {str(f.relative_to(ROOT)): hashlib.sha256(f.read_bytes()).hexdigest() for f in production + [test]},
        'scopeExtractSHA256': hashlib.sha256(scope.encode()).hexdigest(),
        'target': 'arm64-apple-ios17.0', 'swiftLanguageMode': '6', 'synthetic': True
    }, indent=2) + '\n')
