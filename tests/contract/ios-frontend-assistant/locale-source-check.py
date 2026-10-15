"""Check locale coverage and keep the accepted slice's mutation/confirmation contract."""
from pathlib import Path
import re
import subprocess

root = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
path = "ios/VisePanda/VisePanda/Features/Frontend/Assistant/NativeFrontendAssistantDetail.swift"
source = (root / path).read_text()
base = subprocess.check_output(["git", "show", "83983ac153efd861157e4153759a5a564bdb85b8:" + path], text=True)
original_flow = source[:source.index("    private func screenTitle")] + source[source.index("    private func resetAssistant"): ]
# Mutations, routing identities, guards, binding and dismissal behavior must stay unchanged.
for pattern in [r"state\.[A-Za-z]+\s*=\s*[^;\n}]+", r"state\.open\w+\([^)]*\)",
                r"todo\.status\s*=\s*\.\w+", r"guard draft\.canSave else \{ return \}",
                r"dismiss\(\)", r"\.interactiveDismissDisabled\(\)", r"\.tag\(\$0\)",
                r"isOn: \$allowed", r"isPresented: \$resetConfirmation"]:
    assert re.findall(pattern, original_flow) == re.findall(pattern, base), pattern
for payload in ["Text(state.assistantName)", "Text(state.assistantTagline)", "Label(state.assistantTone,",
                "Section(todo.title)", "Text(todo.explanation)", "Text(draft.tagline)",
                "text: $draft.name", "text: $draft.tagline", "selection: $draft.tone"]:
    assert payload in source, payload
# All authored Chinese visible UI literals are paired with English; payloads stay verbatim.
for number, line in enumerate(source.splitlines(), 1):
    if re.search(r'"[^"\n]*[\u3400-\u9fff]', line):
        assert "copy(" in line, (number, line)
assert source.count('@Environment(\\.locale)') == 2
assert 'feedback.message(locale: locale)' in source
assert 'NativeFrontendStatePanel(state: state)' in source
for action in ['Button("Cancel loading") { state.screenState = .cancelled }',
               'Button("Retry sample") { state.screenState = .ready }',
               'Button("Back to content") { state.screenState = .ready }']:
    assert action in source, action
assert 'Button(copy("重置", "Reset"), role: .destructive) { resetAssistant() }' in source
assert 'Button(copy("取消", "Cancel"), role: .cancel) { }' in source
print("PASS: complete owned static-copy coverage, original payload/mutations/routes/guards/confirmation, English state actions (source contract; not UI taps)")
