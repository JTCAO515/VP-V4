#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Produce reviewable shared-file candidates without writing shared sources."""
import difflib
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

root = Path(__file__).resolve().parents[3]
output = root / 'artifacts/IOS-VOICE/local-draft-20261015'
output.mkdir(parents=True, exist_ok=True)
project = root / 'ios/VisePanda/VisePanda.xcodeproj'
pbx = project / 'project.pbxproj'
accepted_base = '774a04573088306160908a8bae73cfd125bb6294'
before = subprocess.check_output(['git', 'show', accepted_base + ':ios/VisePanda/VisePanda.xcodeproj/project.pbxproj'], cwd=root).decode()
after = before
names = ['NativeLocalVoiceContext', 'NativeLocalVoiceCapture', 'NativeLocalVoiceSheet']
refs, builds = [], []
for index, name in enumerate(names, 1):
    ref = f'F10C150000000000000001{index:02d}'
    build = f'F10C150000000000000002{index:02d}'
    refs.append(ref); builds.append(build)
    after = after.replace('/* Begin PBXFileReference section */', f'/* Begin PBXFileReference section */\n        {ref} /* {name}.swift */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = VisePanda/Features/Frontend/LocalVoice/{name}.swift; sourceTree = SOURCE_ROOT; }};', 1)
    after = after.replace('/* Begin PBXBuildFile section */', f'/* Begin PBXBuildFile section */\n        {build} /* {name}.swift in Sources */ = {{isa = PBXBuildFile; fileRef = {ref}; }};', 1)
after = after.replace('600000000000000000000001 = {\n\t\t\tisa = PBXGroup;\n\t\t\tchildren = (', '600000000000000000000001 = {\n\t\t\tisa = PBXGroup;\n\t\t\tchildren = (' + ', '.join(refs) + ',\n', 1)
# Anchor the main application source phase only.
anchor = 'files = (\n                F956A62603650C2D6438F1B7'
assert anchor in after
after = after.replace(anchor, 'files = (\n                ' + ',\n                '.join(builds) + ',\n                F956A62603650C2D6438F1B7', 1)
ref, build = 'F10C15000000000000000301', 'F10C15000000000000000401'
test_path = '../../tests/contract/ios-local-voice/NativeLocalVoiceTests.swift'
after = after.replace('/* Begin PBXFileReference section */', f'/* Begin PBXFileReference section */\n        {ref} = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = "{test_path}"; sourceTree = SOURCE_ROOT; }};', 1)
after = after.replace('/* Begin PBXBuildFile section */', f'/* Begin PBXBuildFile section */\n        {build} = {{isa = PBXBuildFile; fileRef = {ref}; }};', 1)
after = after.replace('600000000000000000000001 = {\n\t\t\tisa = PBXGroup;\n\t\t\tchildren = (', f'600000000000000000000001 = {{\n\t\t\tisa = PBXGroup;\n\t\t\tchildren = ({ref},\n', 1)
after = after.replace('800000000000000000000003 /* Sources */ = {isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = (', f'800000000000000000000003 /* Sources */ = {{isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = ({build}, ', 1)
assert all(after.count(x) == 3 for x in refs)

manifest = []
def candidate(path, old, new):
    label = str(path.relative_to(root))
    prefix = path.name
    (output / (prefix + '.before')).write_text(old)
    (output / (prefix + '.after')).write_text(new)
    (output / (prefix + '.patch')).write_text(''.join(difflib.unified_diff(old.splitlines(True), new.splitlines(True), fromfile='a/' + label, tofile='b/' + label, n=0)))
    def blob(text):
        return hashlib.sha1(b'blob ' + str(len(text.encode())).encode() + b'\0' + text.encode()).hexdigest()
    manifest.append(dict(path=label, before=blob(old), after=blob(new)))
assert pbx.read_text() in (before, after), 'Shared PBX drift: do not overwrite or regenerate from unknown bytes'
candidate(pbx, before, after)
plist = root / 'ios/VisePanda/VisePanda/NativeEnvironment.plist'
pold = subprocess.check_output(['git', 'show', accepted_base + ':ios/VisePanda/VisePanda/NativeEnvironment.plist'], cwd=root).decode()
pnew = pold.replace('VisePanda records only when you choose to speak a phrase for translation. Release or cancel to stop. VisePanda 仅在你选择说话翻译时录音，松开或取消即可停止。', 'VisePanda records only when you start voice input for a local draft or translation. Stop or cancel to end recording. VisePanda 仅在你主动开始本地草稿或翻译语音输入时录音，停止或取消即可结束。').replace('VisePanda recognizes your selected recording on this device so you can review its text before translation. If local recognition is unavailable, type your phrase. VisePanda 在本机识别你选择的录音，供你核对文字后翻译；本机识别不可用时可输入短句。', 'VisePanda recognizes your recording on this device for you to review before using the text in a local draft or translation. If on-device recognition is unavailable, type instead. VisePanda 在本机识别录音，供你审阅后采用到本地草稿或翻译；本机识别不可用时请手动输入。')
assert plist.read_text() in (pold, pnew), 'Shared plist drift: do not overwrite or regenerate from unknown bytes'
candidate(plist, pold, pnew)
(output / 'shared-candidates.json').write_text(json.dumps(manifest, indent=2) + '\n')
# Disposable mirror uses the normal App/test targets and exactly the candidate PBX.
# All root resources remain linked to this worktree, no original PBX mutation.
shadow = output / 'build-candidate'
shadow.mkdir(exist_ok=True)
shadow_project = shadow / 'VisePanda.xcodeproj'
shadow_project.mkdir(exist_ok=True)
(shadow_project / 'project.pbxproj').write_text(after.replace(test_path, str(root / 'tests/contract/ios-local-voice/NativeLocalVoiceTests.swift')))
shutil.copytree(project / 'xcshareddata', shadow_project / 'xcshareddata', dirs_exist_ok=True)
for child in project.parent.iterdir():
    if child == project: continue
    link = shadow / child.name
    if not link.exists(): link.symlink_to(child)
print(json.dumps(manifest, indent=2))
