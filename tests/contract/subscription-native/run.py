#!/usr/bin/env python3
"""Execute actual feature sources against synthetic ports, then SDK-typecheck actual SwiftUI.
No Simulator device, account, network, Keychain or App binary is used.
"""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[3]
feature = root / 'ios/VisePanda/VisePanda/Features/Subscriptions'
tests = root / 'ios/VisePanda/VisePandaTests/NativeSubscriptionTests.swift'
with tempfile.TemporaryDirectory(prefix='subscription-native-') as folder:
    work = Path(folder)
    sources = work / 'Sources/VisePanda'
    checks = work / 'Tests/SubscriptionTests'
    sources.mkdir(parents=True)
    checks.mkdir(parents=True)
    for source in feature.glob('*.swift'):
        if source.name != 'NativeSubscriptionView.swift':
            shutil.copy2(source, sources / source.name)
    shutil.copy2(tests, checks / tests.name)
    (work / 'Package.swift').write_text('''// swift-tools-version: 6.0
import PackageDescription
let package = Package(name: "SubscriptionNativeContract", platforms: [.macOS(.v14)], targets: [
 .target(name: "VisePanda"),
 .testTarget(name: "SubscriptionTests", dependencies: ["VisePanda"])
])
''')
    env = os.environ.copy()
    env['SUBSCRIPTION_FIXTURES'] = str(Path(__file__).with_name('Fixtures'))
    subprocess.run(['xcrun', 'swift', 'test', '--package-path', str(work), '--scratch-path', str(work/'build'), '--parallel'], env=env, check=True)
    sdk = subprocess.check_output(['xcrun', '--sdk', 'iphonesimulator', '--show-sdk-path'], text=True).strip()
    subprocess.run(['xcrun', 'swiftc', '-typecheck', '-swift-version', '6', '-sdk', sdk,
                    '-target', 'arm64-apple-ios17.0-simulator', '-module-cache-path', str(work/'sdk-cache'),
                    *map(str, sorted(feature.glob('*.swift')))], check=True)
    print('PASS: actual Swift 6 feature/Swift Testing synthetic-port behavior and actual iOS 17 Simulator SDK SwiftUI typecheck; device/App/target UNRUN')

# Supplemental capability check; executable tests above are the behavior evidence.
for source in feature.glob('*.swift'):
    body = source.read_text()
    for forbidden in ['import StoreKit', 'URLSession', '.purchase(', 'Transaction.finish', 'AppStore.sync', 'UserDefaults', 'Keychain', 'SecItem', 'FileManager', '"POST"', '"PUT"', '"PATCH"', '"DELETE"']:
        assert forbidden not in body, (source, forbidden)
print('PASS: module exposes no network-write, StoreKit/account-operation or persistence capability')
