#!/usr/bin/env python3
"""Default system appearance only: owned Simulators, no app QA appearance override."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import uuid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--test-products', type=Path, required=True,
                        help='Fresh build-for-testing .xctestproducts package from this source')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--runtime', choices=['17.5', '26.5'], required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    products = args.test_products.resolve()
    if not products.exists():
        raise RuntimeError('Prepared test products missing')
    commands = output / 'commands.jsonl'

    def command(argv, *, env=None, check=True):
        result = subprocess.run(argv, env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        with commands.open('a') as stream:
            stream.write(json.dumps({'argv': argv, 'exitCode': result.returncode, 'output': result.stdout}) + '\n')
        if check and result.returncode:
            raise RuntimeError(f'{argv[0]} failed ({result.returncode}): {result.stdout[-2000:]}')
        return result.stdout.strip()

    kind = 'iPhone-SE-3rd-generation' if args.runtime == '17.5' else 'iPhone-17-Pro'
    device = command(['xcrun', 'simctl', 'create', 'VPJ77-Default-' + uuid.uuid4().hex,
                      'com.apple.CoreSimulator.SimDeviceType.' + kind,
                      'com.apple.CoreSimulator.SimRuntime.iOS-' + args.runtime.replace('.', '-')])
    uuid.UUID(device)
    metadata = {'runtime': args.runtime, 'ownedDevice': device, 'qaAppearanceOverride': False, 'runs': []}
    try:
        command(['xcrun', 'simctl', 'bootstatus', device, '-b'])

        def appearance(style):
            command(['xcrun', 'simctl', 'ui', device, 'appearance', style])
            readback = command(['xcrun', 'simctl', 'ui', device, 'appearance'])
            if readback != style:
                raise RuntimeError(f'System appearance mismatch: requested {style}, read {readback}')
            return readback

        def test(name, style, switch_to=None):
            appearance(style)
            env = os.environ.copy()
            env.pop('TEST_RUNNER_VPJ77_SYSTEM_SETUP_ONLY', None)
            env.pop('TEST_RUNNER_VPJ77_SYSTEM_SWITCH_TO', None)
            env['TEST_RUNNER_VPJ77_SYSTEM_APPEARANCE'] = style
            if switch_to:
                env['TEST_RUNNER_VPJ77_SYSTEM_SWITCH_TO'] = switch_to
            result_path = output / (name + '.xcresult')
            selected = 'testDefaultSystemAppearanceSwitch' if switch_to else 'testDefaultSystemAppearanceMatrix'
            argv = ['xcodebuild', 'test-without-building', '-testProductsPath', str(products),
                    '-destination', 'platform=iOS Simulator,id=' + device,
                    '-only-testing:VisePandaUITests/NativeAssistantFixtureDefaultAppearanceUITests/' + selected,
                    '-parallel-testing-enabled', 'NO', '-resultBundlePath', str(result_path)]
            if switch_to:
                with (output / (name + '.log')).open('w') as log:
                    process = subprocess.Popen(argv, env=env, text=True, stdout=subprocess.PIPE,
                                               stderr=subprocess.STDOUT, bufsize=1)
                    changed = False
                    for line in process.stdout:
                        log.write(line)
                        log.flush()
                        if 'VPJ77_SWITCH_READY' in line and not changed:
                            appearance(switch_to)
                            changed = True
                    code = process.wait()
                with commands.open('a') as stream:
                    stream.write(json.dumps({'argv': argv, 'exitCode': code, 'hostSwitchObserved': changed}) + '\n')
                if code or not changed:
                    raise RuntimeError(f'Switch test failed: exit={code}, host switch={changed}')
            else:
                transcript = command(argv, env=env)
                (output / (name + ".log")).write_text(transcript + "\n")
                pages = [line for line in transcript.splitlines() if line.startswith("VPJ77 DEFAULT ") and not line.startswith("VPJ77 DEFAULT AX")]
                if len(pages) != 8:
                    raise RuntimeError(f"Expected all 8 page states, observed {len(pages)}")
            summary = json.loads(command(['xcrun', 'xcresulttool', 'get', 'test-results', 'summary',
                                          '--path', str(result_path)]))
            if summary.get('passedTests') != 1 or summary.get('failedTests') != 0 or summary.get('skippedTests') != 0:
                raise RuntimeError(f'Expected exactly one passed test and zero skips: {summary}')
            metadata['runs'].append({'name': name, 'systemReadback': style, 'switchTo': switch_to,
                                     'summary': summary, 'resultPath': str(result_path)})
            (output / 'verification.json').write_text(json.dumps(metadata, indent=2) + '\n')
            print(f'{name}: PASS (no skips)', flush=True)

        test('default-light', 'light')
        test('default-dark', 'dark')
        test('default-light-to-dark', 'light', 'dark')
        test('default-dark-to-light', 'dark', 'light')
    finally:
        command(['xcrun', 'simctl', 'shutdown', device], check=False)
        command(['xcrun', 'simctl', 'delete', device])
        metadata['ownedDeviceDeleted'] = True
        (output / 'verification.json').write_text(json.dumps(metadata, indent=2) + '\n')


if __name__ == '__main__':
    main()
