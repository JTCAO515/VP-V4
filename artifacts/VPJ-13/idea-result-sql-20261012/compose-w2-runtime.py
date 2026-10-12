from pathlib import Path
import json,hashlib,difflib,re
out=Path(__file__).parent
source=Path('/Users/jtsm5p/Documents/Codex/VP-V5-worktrees/vpj37-ops-control-sql-20261011/artifacts/VPJ-37/ops-control-sql-20261011/catalog-after-guards.json')
row=next(f for f in json.loads(source.read_text()) if f['signature']=='turn_data_private.runtime_supported_v1()')
assert row['md5']==hashlib.md5(row['definition'].encode()).hexdigest()=='e8cc78b8214d8379d6a9ce9c4d280431'
before=row['definition'];base=(out/'turn_data_private-runtime_supported_v1.before.sql').read_text();e1=(out/'turn_data_private-runtime_supported_v1.after.sql').read_text()
pins={
 'profile_data_private.schema_v1()':('af41a55b4b5eb9c89d19f96fb27720c5','889dc17d85f9747b81745a0625a8cdae'),
 'export_private.profile_hooks_valid_v1()':('61dcdc9d225dc74f6d82744d1fa02c73','d2861aa68f1c9cfd112f9acf19db417c'),
 'turn_data_private.schema_supported_v1()':('81eab8c4cdb31f2fd9289af2b5b4b63d','8d7a571aebe6c6afc61d5d450d69a3ff'),
 'result_data_private.schema_supported_v1()':('9f419ac01a94ce6cb8a351cb37f29cb9','a2b5cf59c92ed83a2fef97a6b6b102b8')}
reconstructed=base
for sig,(old,new) in pins.items():
 needle=json.dumps(sig)+':'+json.dumps(old);replacement=json.dumps(sig)+':'+json.dumps(new)
 assert reconstructed.count(needle)==1
 reconstructed=reconstructed.replace(needle,replacement)
assert reconstructed==before,'W2 full actual after is not exact four-pin delta'
block=e1[e1.index(' -- Fixed reviewed E1'):e1.index(' -- Managed Auth')]
after=before.replace('declare r record;p pg_proc;begin','declare r record;p pg_proc;actual_idea jsonb;begin',1).replace(' -- Managed Auth',block+' -- Managed Auth',1)
# Removing exactly the new E1 loop and local variable restores the full W2 bytes.
assert after.replace(block,'',1).replace('p pg_proc;actual_idea jsonb;begin','p pg_proc;begin',1)==before
(out/'runtime-on-w2.before.sql').write_text(before)
(out/'runtime-on-w2.after.sql').write_text(after)
(out/'runtime-on-w2.patch').write_text(''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='runtime-on-w2.before.sql',tofile='runtime-on-w2.after.sql')))
(out/'idea-result-on-w2-runtime.candidate.sql').write_text((out/'idea-result-core.candidate.sql').read_text()+'\n'+after)
(out/'runtime-on-w2.source-proof.json').write_text(json.dumps(dict(stage='PRIVATE SOURCE COMPOSITION ONLY; PRODUCT HOLD',w2CatalogSHA256=hashlib.sha256(source.read_bytes()).hexdigest(),w2RuntimeBeforeBodyMD5=hashlib.md5(base.encode()).hexdigest(),w2RuntimeActualAfterMD5=row['md5'],preservedW2Pins=pins,onlyOverlay='E1 fixed three-function full-body/metadata loop and its local variable',fullW2BytesRecoveredAfterRemovingOverlay=True,actualCombinedW2PrivacyGates='UNRUN; own fixture has base four guards, W2 source not applied',w2InstalledSupportedSuccessor='Must include three E1 funcs and composed runtime exact metadata; W2 current holder owns final source'),indent=2)+'\n')
print('Exact W2 four-pin after + E1-only overlay source proof PASS')
