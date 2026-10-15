"""Prove that the view differs from accepted QA only by static locale wiring."""
from pathlib import Path
import re
import subprocess

root = Path(__file__).resolve().parents[3]
base = "4ff26a2889b841de594f8ba34ebd6e6388abacb1"
prefix = "ios/VisePanda/VisePanda/Features/Frontend/ChatComposer/"

def accepted(name):
    return subprocess.check_output(["git", "show", base + ":" + prefix + name], cwd=root).decode()

view = (root / prefix / "NativeMuseChatComposerView.swift").read_text()
policy = (root / prefix / "NativeMuseChatComposerPolicy.swift").read_text()
copies = dict(re.findall(r'case \.(\w+):\s*return chinese \? "([^"]+)"', policy))
assert len(copies) == 11
assert '@Environment(\\.locale) private var locale' in view
assert 'text.value(locale: locale)' in view
assert set(re.findall(r'localized\(\.(\w+)\)', view)) == set(copies)
assert not re.search(r'[\u4e00-\u9fff]', view), "Static Chinese copy remains hardcoded in view"
restored = re.sub(r'localized\(\.(\w+)\)', lambda match: '"' + copies[match[1]] + '"', view)
restored = restored.replace('    @Environment(\\.locale) private var locale\n', '')
restored = restored.replace('    private func localized(_ text: NativeMuseChatComposerText) -> String {\n        text.value(locale: locale)\n    }\n\n', '')
assert restored == accepted("NativeMuseChatComposerView.swift"), "Non-copy view behavior changed"
assert policy.startswith(accepted("NativeMuseChatComposerPolicy.swift")), "Original submission policy changed"
print("PASS: exact QA view byte equivalence after static copy normalization; voice/callback/submit/focus/layout untouched; original policy unchanged")
