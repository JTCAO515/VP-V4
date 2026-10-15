#!/bin/bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
contract_work=$(mktemp -d /tmp/ios-library-material-chat.XXXXXX)
trap 'rm -rf "$contract_work"' EXIT
# Compile the actual shared State and owned actions without SwiftUI views or a
# Simulator SDK request. AppTab cases are extracted from the accepted source.
python3 - "$contract_work" <<'PY'
import pathlib, re, sys
root = pathlib.Path('ios/VisePanda/VisePanda')
state = (root / 'Features/Frontend/NativeFrontendState.swift').read_text()
state = state.split('struct NativeFrontendBoundary: View {', 1)[0].replace('import SwiftUI', 'import Foundation', 1)
out = pathlib.Path(sys.argv[1])
(out / 'State.swift').write_text(state)
chat = (root / 'Features/Frontend/Chat/NativeFrontendChatView.swift').read_text()
association = chat.split('    private func linkedJourneyID(for context: String) -> String? {', 1)[1].split('    private func contextCard(', 1)[0]
(out / 'ActualChatAssociation.swift').write_text('@MainActor struct ActualChatAssociation {\n    let state: NativeFrontendState\n    func linkedJourneyID(for context: String) -> String? {' + association + '}\n')

app_tab = (root / 'Navigation/AppTab.swift').read_text()
cases = re.findall(r'^    case (\w+)\s*$', app_tab, re.M)
assert cases == ['vp', 'journeys', 'library', 'memory', 'trip', 'explore', 'ask', 'tools', 'profile']
(out / 'AppTab.swift').write_text('enum AppTab {\n' + '\n'.join('    case ' + case for case in cases) + '\n}\n')
PY
for contract_source in MaterialChatContract StateContract LocaleContract; do
    swiftc -swift-version 6 -parse-as-library "$contract_work/State.swift" "$contract_work/AppTab.swift" "$contract_work/ActualChatAssociation.swift" ios/VisePanda/VisePanda/Features/Frontend/LibraryMemory/NativeFrontendLibraryActions.swift "tests/contract/ios-frontend-library-memory/$contract_source.swift" -o "$contract_work/contract"
    "$contract_work/contract"
done
git diff --check
