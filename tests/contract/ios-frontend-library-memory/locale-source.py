#!/usr/bin/env python3
"""Audit fixed-copy coverage and identity/payload invariants, not runtime UI proof."""
import pathlib, re, subprocess
root = pathlib.Path('ios/VisePanda/VisePanda/Features/Frontend/LibraryMemory')
base = '4ff26a2889b841de594f8ba34ebd6e6388abacb1'
for path in sorted(root.glob('*.swift')):
    source = path.read_text()
    original = subprocess.check_output(['git', 'show', f'{base}:{path}'], text=True)
    # Every Chinese UI literal is explicitly paired; the only unpaired literals
    # are the unchanged internal audience selection/tag/case values.
    stripped = re.sub(r'copy\("(?:[^"\\]|\\.)*", "(?:[^"\\]|\\.)*"\)', '', source)
    for literal in re.findall(r'"(?:[^"\\]|\\.)*"', stripped):
        if re.search(r'[\u4e00-\u9fff]', literal):
            assert literal in ['"同行人"', '"仅自己"'], (path, literal)
    ids = lambda text: re.findall(r'\.accessibilityIdentifier\(([^\n]+?)\)', text)
    # New wrappers reuse the existing boundary ID; original interactive IDs stay exact.
    assert ids(source)[:len(ids(original))] == ids(original), path
    for expression in ['Text(material.title)', 'Text(material.content)', 'Text(material.source)', 'Text(memory.title)', 'Text(memory.scope)', 'Text(memory.source)']:
        assert source.count(expression) == original.count(expression), (path, expression)
    assert not re.search(r'copy\((material|memory|notice|title|scope)\b', source), path
view = (root / 'NativeFrontendLibraryView.swift').read_text()
assert '.tag("同行人")' in view and '.tag("仅自己")' in view
assert 'state.openLibraryMaterialChat(material.id, locale: locale)' in view
assert 'NativeFrontendBoundary()' in view and 'NativeFrontendStatePanel(state: state)' in view
assert '.failed:' in view and 'No real request was sent.' in view
print('PASS: fixed-copy coverage, unchanged accessibility IDs/audience tags, dynamic payload rendering and local-only negative states')
