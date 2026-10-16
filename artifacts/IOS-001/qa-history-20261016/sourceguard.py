"""Small regression constraint for the requested removal of independent refresh loops."""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[3]
feature = root / 'ios/VisePanda/VisePanda/Features/RealServiceEntry/NativeQAUI/History'
view = (feature / 'NativeQAHistoryView.swift').read_text()
source = (feature / 'NativeQAHistoryPresentation.swift').read_text()
for file in feature.glob('*.swift'):
    text = file.read_text()
    assert not re.search(r'\b(?:TimelineView|Timer|CADisplayLink)\b|\.task\s*[{(]|\bTask\s*[{.]|\bwhile\s|\bfor\s+await\b', text), file
assert 'scenePhase == .active, let snapshot = source.readable()' in view
assert '.id(snapshot.scope)' in view
assert 'source.select(session.id, displayedScope: snapshot.scope)' in view
assert 'source.create(displayedScope: snapshot.scope)' in view
assert 'snapshot.sessions.contains(where: { $0.id == id })' in source
assert 'snapshot.scope == displayedScope' in source
print('PASS: no independent refresh loop; render, scope subtree and live tap guards retained')
