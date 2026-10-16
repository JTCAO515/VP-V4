"""Exact production-source compile with synthetic vault tests; no real Keychain IO."""
from pathlib import Path
import hashlib
import json
import subprocess

here = Path(__file__).resolve().parent
repo = here.parents[2]
app = repo / 'ios/VisePanda/VisePanda'
package = here / '.standalone'
source = package / 'Sources/VisePanda'
tests = package / 'Tests/VisePandaTests'
source.mkdir(parents=True, exist_ok=True)
tests.mkdir(parents=True, exist_ok=True)
session = (app / 'App/NativeSession.swift').read_text()

def declaration(name):
    start = session.index(name)
    if name == 'protocol NativeCredentialVault':
        start = session.rfind('@MainActor', 0, start)
    opening = session.index('{', start)
    depth = 1
    end = opening + 1
    while depth:
        depth += (session[end] == '{') - (session[end] == '}')
        end += 1
    return session[start:end]

extracted = '\n\n'.join(declaration(n) for n in [
    'struct NativeDataScope:', 'protocol NativeCredentialVault', 'struct NativeKeychainVault:'
])
(source / 'OriginalPrimitives.swift').write_text('import Foundation\nimport Security\n\n' + extracted + '\n')
paths = [app / ('Features/RealServiceEntry/NativeQA/' + n) for n in [
    'NativeQAContract.swift', 'NativeQACancellationContract.swift', 'NativeQACancellationJournal.swift']]
paths += [repo / 'ios/VisePanda/VisePandaTests/NativeQACancellationJournalTests.swift']
for path in paths:
    ((tests if path.name.endswith('Tests.swift') else source) / path.name).write_bytes(path.read_bytes())
(package / 'Package.swift').write_text('''// swift-tools-version: 6.0
import PackageDescription
let package = Package(name: "NativeQACancellationVerification", platforms: [.macOS(.v14)],
    products: [.library(name: "VisePanda", targets: ["VisePanda"])],
    targets: [.target(name: "VisePanda"), .testTarget(name: "VisePandaTests", dependencies: ["VisePanda"])])
''')

def run(args, log):
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    (here / log).write_text(result.stdout)
    print(result.stdout)
    return result.returncode

sdk = subprocess.check_output(['xcrun', '--sdk', 'iphonesimulator', '--show-sdk-path'], text=True).strip()
iostype = run(['xcrun', 'swiftc', '-swift-version', '6', '-target', 'arm64-apple-ios17.0-simulator',
    '-sdk', sdk, '-typecheck'] + [str(p) for p in sorted(source.glob('*.swift'))], 'ios17-typecheck.log')
tested = run(['swift', 'test', '--package-path', str(package), '--jobs', '2'], 'swift-test.log')
(here / 'verification.json').write_text(json.dumps({
    'synthetic': True, 'fixedContractHead': '4e9e58b352d51445c4b98eec3f1dece2750bf9d6',
    'ios17Swift6TypecheckExitCode': iostype, 'swiftTestExitCode': tested,
    'sourceHashes': {str(p.relative_to(repo)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},
    'extractedPrimitivesSHA256': hashlib.sha256(extracted.encode()).hexdigest(),
    'unrun': ['real Keychain IO', 'iOS app/PBX integration', 'target/provider/auth', 'device']
}, indent=2) + '\n')
raise SystemExit(iostype or tested)
