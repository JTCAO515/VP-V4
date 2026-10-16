"""Compile the current product method and root expression; no network or simulator."""
from pathlib import Path
import hashlib
import json
import subprocess
import tempfile

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
manifest = json.loads((OUT / 'candidate-manifest.json').read_text())
for entry in manifest['candidates']:
    assert hashlib.sha256((ROOT / entry['path']).read_bytes()).hexdigest() == entry['after_sha256']
session = (ROOT / manifest['candidates'][1]['path']).read_text()
method = session[session.index('    static func resolveEndpoint('):session.index('\n    var enabled: Bool')]
retained_probe = (OUT / 'EndpointCandidateProbe.swift').read_text()
start = retained_probe.index('struct Candidate {')
end = retained_probe.index('\nvar checks = 0')
probe = retained_probe[:start] + 'struct Candidate {\n' + method + '\n}\n' + retained_probe[end:]
probe = probe.replace('endpoint candidate assertions; pure source probe', 'actual product endpoint assertions; pure source probe')
shell = (ROOT / manifest['candidates'][0]['path']).read_text()
rollout = shell[shell.index('enum NativeFrontendRollout {'):]
route = (ROOT / 'ios/VisePanda/VisePanda/Navigation/AppRoute.swift').read_text()
shell_rollout = route[route.index('enum NativeShellRollout {'):route.index('\n@MainActor\nstruct AppEntryView')]
line = next(line.strip() for line in shell.splitlines() if 'let useFourTabs =' in line)
root_probe = 'import Foundation\n' + rollout + '\n' + shell_rollout + '\nlet assistantShell = NativeShellRollout.enabled()\n' + line + '\nprint("\\(useFourTabs):\\(NativeFrontendRollout.enabled())")\n'
with tempfile.TemporaryDirectory(prefix='ios001-applied-') as tmp:
    temp = Path(tmp)
    for name, source in [('endpoint', probe), ('root', root_probe)]:
        swift = temp / (name + '.swift')
        swift.write_text(source)
        subprocess.run(['xcrun', 'swiftc', '-D', 'DEBUG', str(swift), '-o', str(temp / name)], check=True)
    subprocess.run([str(temp / 'endpoint')], check=True)
    for args, expected in [([], 'true:true'), (['-V10RealServiceFrontend'], 'true:false'), (['-VisePandaLegacyShell'], 'false:false'), (['-VisePandaFourTabShell'], 'true:false')]:
        result = subprocess.check_output([str(temp / 'root'), *args], text=True).strip()
        assert result == expected, (args, result, expected)
    print('PASS: 4 actual product root/rollout flag scenarios; no SwiftUI integration claim')
print('PASS: full product after SHA256 matches accepted candidate manifest')
