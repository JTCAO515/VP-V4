#!/usr/bin/env python3
"""Execute the real Store/journal and affected Swift Testing suites in an isolated macOS package.
No Simulator, Keychain, network or product credentials are used. Source files are copied byte-for-byte.
"""
from pathlib import Path
import subprocess
import tempfile
import sys
ROOT = Path(__file__).resolve().parents[3]
APP = ROOT / 'ios/VisePanda/VisePanda'
TESTS = ROOT / 'ios/VisePanda/VisePandaTests'

def block(source, marker):
    start = source.index(marker)
    opening = source.index('{', start)
    depth, end = 1, opening + 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[start:end]

with tempfile.TemporaryDirectory(prefix='ios005-recovery-tests-') as temp:
    directory = Path(temp)
    lib = directory / 'Sources/VisePanda'
    tests = directory / 'Tests/VisePandaTests'
    lib.mkdir(parents=True); tests.mkdir(parents=True)
    (directory / 'Package.swift').write_text('''// swift-tools-version: 6.0
import PackageDescription
let package = Package(name: "VisePanda", platforms: [.macOS(.v14)], products: [],
    targets: [.target(name: "VisePanda"), .testTarget(name: "VisePandaTests", dependencies: ["VisePanda"])])
''')
    for name in ['NativeTranslationStore', 'NativeTranslationRecoveryIdentity', 'NativeTranslationRecoveryJournal', 'NativeTranslationRecoveryReceipt']:
        (lib / (name + '.swift')).write_bytes((APP / ('Features/Translation/' + name + '.swift')).read_bytes())
    session = (APP / 'App/NativeSession.swift').read_text()
    models = (APP / 'Features/Ask/NativeAskModels.swift').read_text()
    # The app's scope, error and vault contract are used verbatim. No concrete Keychain implementation is compiled.
    subset = 'import Foundation\nimport Security\n'
    for marker in ['struct NativeDataScope:', 'enum NativeDataError:', '@MainActor\nprotocol NativeCredentialVault']:
        subset += block(session, marker) + '\n'
    subset += block(models, 'struct NativeTextPolicy:') + '\n'
    subset += block(models, 'struct NativeTextPolicyReply:') + '\n'
    # Store reads only this legacy accepted envelope; omit its unrelated ServiceTask matching method.
    subset += 'struct NativeTextAccepted: Decodable { let version: Int; let kind: String; let turnId: String; let reused: Bool }\n'
    (lib / 'AppContracts.swift').write_text(subset)
    for name in ['NativeTranslationTests', 'NativeTranslationRecoveryStoreTests']:
        (tests / (name + '.swift')).write_bytes((TESTS / (name + '.swift')).read_bytes())
    if '--sdk-only' not in sys.argv:
        subprocess.run(['xcrun', 'swift', 'test', '--package-path', str(directory), '--parallel'], check=True)
    else:
        (lib / 'NativeTranslationView.swift').write_bytes((APP / 'Features/Translation/NativeTranslationView.swift').read_bytes())
        # Only unavailable neighboring app interfaces are stubbed for typechecking. No runtime/session claim.
        (lib / 'NeighborInterfaces.swift').write_text('''import SwiftUI
import Observation
import Security
extension Color { static let vpBackground = Color.white }
enum FixtureLocale { case zh, en }
@MainActor @Observable final class AppSettings {
    var selectedLocale = FixtureLocale.en
    var nativeSession = NativeSession()
}
struct FixtureActor: Equatable { let scope: NativeDataScope }
struct FixtureErasure { let id: UUID; let scope: NativeDataScope; let actor: FixtureActor }
@MainActor @Observable final class NativeSession {
    var dataScope: NativeDataScope?
    var turnDataErasure: FixtureErasure?
    func communitySafetyActor() throws -> FixtureActor { throw NativeDataError.sessionUnavailable }
    func translateRequest(path: String, method: String, body: Data?) async throws -> Data { throw NativeDataError.sessionUnavailable }
    func translationHistoryRequest(cursor: String?, turnID: String?, query: String?) async throws -> Data { throw NativeDataError.sessionUnavailable }
    func translationRecoveryPersistence() -> any NativeTranslationRecoveryPersistence { NativeTranslationRecoveryJournal(vault: UnavailableVault()) }
}
@MainActor struct UnavailableVault: NativeCredentialVault {
    func read(service: String, owner: String) -> (OSStatus, Data?) { (errSecNotAvailable, nil) }
    func write(_ data: Data, service: String, owner: String) -> OSStatus { errSecNotAvailable }
    func remove(service: String, owner: String) -> OSStatus { errSecNotAvailable }
}
struct NativeVoiceTranslationView: View { var body: some View { EmptyView() } }
struct NativeTripView: View {
    let initialTripID: String; let initialTripScope: NativeDataScope; let initialTripVersion: Int
    var body: some View { EmptyView() }
}
''')
        sdk = subprocess.check_output(['xcrun', '--sdk', 'iphonesimulator', '--show-sdk-path'], text=True).strip()
        subprocess.run(['xcrun', 'swiftc', '-typecheck', '-swift-version', '6', '-D', 'DEBUG', '-sdk', sdk,
                        '-target', 'arm64-apple-ios17.0-simulator'] + [str(file) for file in sorted(lib.glob('*.swift'))], check=True)
        print('PASS: actual full Translation View, Store and journal iOS SDK typecheck; neighboring app interfaces unavailable stubs only')
