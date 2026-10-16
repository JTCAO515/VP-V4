"""Compile exact production sources with unchanged extracted scope/vault definitions; synthetic tests only."""
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
paths = [app / 'Features/RealServiceEntry/NativeQA/NativeQAContract.swift',
         app / 'Features/RealServiceEntry/NativeQAPersistence/NativeQAPendingJournal.swift',
         repo / 'ios/VisePanda/VisePandaTests/NativeQAPendingJournalTests.swift']
for path in paths:
    ((tests if path.name.endswith('Tests.swift') else source) / path.name).write_bytes(path.read_bytes())
(package / 'Package.swift').write_text('''// swift-tools-version: 6.0
import PackageDescription
let package = Package(name: "NativeQAJournalVerification", platforms: [.macOS(.v14)],
    products: [.library(name: "VisePanda", targets: ["VisePanda"])],
    targets: [.target(name: "VisePanda"), .testTarget(name: "VisePandaTests", dependencies: ["VisePanda"])])
''')
result = subprocess.run(['swift', 'test', '--package-path', str(package), '--jobs', '2'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
(here / 'swift-test.log').write_text(result.stdout)
print(result.stdout)
(here / 'verification.json').write_text(json.dumps({
    'synthetic': True, 'exitCode': result.returncode,
    'sourceHashes': {str(p.relative_to(repo)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},
    'extractedPrimitivesSHA256': hashlib.sha256(extracted.encode()).hexdigest(),
    'unrun': ['real Keychain IO', 'iOS app/PBX integration', 'target/provider/auth', 'device']
}, indent=2) + '\n')
raise SystemExit(result.returncode)
