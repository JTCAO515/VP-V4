import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Executes the actual Foundation models/store/journal/resolver on macOS with
// synthetic identity and vault boundaries. It neither boots iOS nor touches APNs.
if (process.platform !== 'darwin') throw new Error('UNRUN: Native host checks require macOS and Swift.');
const root = path.resolve(import.meta.dirname, '../../..');
const work = await mkdtemp(path.join(tmpdir(), 'vpj30-native-host-'));
try {
  await mkdir(path.join(work, 'Sources/NotificationHost'), { recursive: true });
  await mkdir(path.join(work, 'Tests/NotificationHostTests'), { recursive: true });
  await writeFile(path.join(work, 'Package.swift'), '// swift-tools-version: 6.0\nimport PackageDescription\nlet package = Package(name: "NotificationHost", platforms: [.macOS(.v14)], targets: [.target(name: "NotificationHost"), .testTarget(name: "NotificationHostTests", dependencies: ["NotificationHost"])])\n');
  const modules = ['NativeNoticeCommand', 'NativeNoticeStore', 'NativeNoticeView', 'NativeNotificationModels', 'NativeNotificationPermission', 'NativeNotificationJournal', 'NativeNotificationResolution'];
  for (const name of modules) {
    await writeFile(path.join(work, `Sources/NotificationHost/${name}.swift`), await readFile(path.join(root, `ios/VisePanda/VisePanda/Features/Notifications/${name}.swift`)));
  }
  await writeFile(path.join(work, 'Sources/NotificationHost/HostBoundary.swift'), await readFile(path.join(import.meta.dirname, 'fixtures/native-host-boundary.swift.fixture')));
  await writeFile(path.join(work, 'Tests/NotificationHostTests/NativeNotificationTests.swift'), await readFile(path.join(root, 'ios/VisePanda/VisePandaTests/NativeNotificationTests.swift')));
  const extra = process.argv.slice(2);
  if (extra.length && !(extra.length === 2 && extra[0] === '--filter' && /^[A-Za-z0-9_/.]+$/.test(extra[1]))) throw new Error('Only --filter <suite/test> is supported.');
  const result = spawnSync('swift', ['test', '--package-path', work, ...extra], { stdio: 'inherit', timeout: 180000 });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(work, { recursive: true, force: true });
}
