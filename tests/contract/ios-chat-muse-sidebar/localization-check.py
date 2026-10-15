"""Exercise the leaf's actual locale-selection method without an App/Simulator build."""
from pathlib import Path
import re
import subprocess
import tempfile

source = Path('ios/VisePanda/VisePanda/Features/Frontend/ChatSidebar/NativeMuseChatSidebarView.swift')
text = source.read_text()
method = re.search(r'    private func copy\([^}]+\n    }', text).group()
pairs = re.findall(r'copy\(("[^"\n]*"), ("[^"\n]*")\)', text)
assert len(pairs) == 10, 'Check all visible and accessibility copy, including the empty state'
assert 'Text(verbatim: conversation.title)' in text
assert 'state.selectLocalConversation(conversation.id)\n            onClose()' in text
assert 'state.startLocalConversation()\n                onClose()' in text
checks = []
for chinese, english in pairs:
    assert not re.search(r'[\u4e00-\u9fff]', english), english
    for locale, expected in [('en', english), ('en-US', english), ('en-GB', english), ('zh-Hans', chinese), ('zh-Hant', chinese)]:
        checks.append(f'precondition(Probe(locale: Locale(identifier: "{locale}")).value({chinese}, {english}) == {expected})')
program = '''import Foundation
struct Probe {
    let locale: Locale
METHOD
    func value(_ chinese: String, _ english: String) -> String { copy(chinese, english) }
}
'''.replace('METHOD', method) + '\n' + '\n'.join(checks) + '\nprint("PASS: actual leaf locale method, 10 copy pairs / 5 locales, verbatim titles and callback order")\n'
with tempfile.TemporaryDirectory(prefix='ios-sidebar-locale-') as directory:
    swift = Path(directory) / 'main.swift'
    binary = Path(directory) / 'check'
    swift.write_text(program)
    subprocess.run(['xcrun', 'swiftc', str(swift), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
