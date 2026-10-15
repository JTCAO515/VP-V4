import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const feature = resolve(root, 'ios/VisePanda/VisePanda/Features/Frontend/LocalVoice');
const read = p => readFileSync(p, 'utf8');

test('local voice has no network, billing, backend scope construction, durable transcript or raw logging API', () => {
  const text = ['NativeLocalVoiceContext', 'NativeLocalVoiceCapture', 'NativeLocalVoiceSheet'].map(n => read(resolve(feature, n + '.swift'))).join('\n');
  assert.doesNotMatch(text, /URLSession|URLRequest|ModelGateway|createTask|createGoal|NativeDataScope\(|UserDefaults|\.write\(|print\(|Logger\(/);
  assert.match(text, /NativeSystemVoiceAudioDriver\(\)/);
});
test('reused system driver remains explicitly on device with no network fallback', () => {
  const driver = read(resolve(root, 'ios/VisePanda/VisePanda/Features/VoiceTranslation/Audio/NativeSystemVoiceAudioDriver.swift'));
  assert.match(driver, /requiresOnDeviceRecognition = true/);
  assert.match(driver, /supportsOnDeviceRecognition/);
  assert.doesNotMatch(driver, /URLSession|URLRequest/);
});
test('PBX candidate includes every new Swift in App Sources and behavior suite in existing unit target', () => {
  const pbx = read(resolve(root, 'artifacts/IOS-VOICE/local-draft-20261015/project.pbxproj.after'));
  for (const name of ['NativeLocalVoiceContext', 'NativeLocalVoiceCapture', 'NativeLocalVoiceSheet']) {
    assert.ok(existsSync(resolve(feature, name + '.swift')));
    assert.match(pbx, new RegExp(name + '\\.swift in Sources'));
  }
  assert.match(pbx, /tests\/contract\/ios-local-voice\/NativeLocalVoiceTests.swift/);
});
