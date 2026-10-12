"""Exact metadata guard deltas; never accepts unknown runtime hashes at install."""
import difflib
import hashlib
import json
import re
from pathlib import Path
OUT=Path(__file__).resolve().parent
BASE={x['signature']:x for x in json.loads((OUT/'catalog-before.json').read_text())}
LIVE={x['signature']:x for x in json.loads((OUT/'catalog-after-unpinned.json').read_text())}
VALUES=json.loads((OUT/'guard-values-after.json').read_text())
changed={}
notes=[]
RELATIONS={x['relation']:x for x in json.loads((OUT/'catalog-relations-before.json').read_text())}
AFTER_RELATIONS={x['relation']:x for x in json.loads((OUT/'catalog-relations-after-unpinned.json').read_text())}

def body(sig):return changed.get(sig,BASE[sig]['prosrc'])
for item in json.loads((OUT/'guard-query-locations.json').read_text()):
    new=VALUES[item['key']];assert re.fullmatch('[a-f0-9]{64}',new)
    old=item['oldHash'];s=body(item['signature']);assert s.count(old)==1
    changed[item['signature']]=s.replace(old,new)
    notes.append({'signature':item['signature'],'kind':'exact_owned_schema_catalog_delta','before':old,'after':new})

sig='profile_data_private.schema_v1()';s=body(sig)
# Constraint triggers also add a pg_constraint entry. Preserve every original
# constraint and include ONLY the exact new deferred admission trigger entry.
expected_match=re.search(r"expected:=\s*'((?:[^']|'')*)'::jsonb;",s);assert expected_match
old_specs=json.loads(expected_match[1].replace("''","'"));new_specs={}
normalize=lambda v:json.dumps(v,sort_keys=True).replace('REFERENCES public.','REFERENCES ')
for name,old_spec in old_specs.items():
    r=RELATIONS[name]
    actual_spec={'columns':[[x['name'],x['type'],x['notNull']]for x in r['columns']],
                 'constraints':[x[1]for x in r['constraints']]}
    assert normalize(old_spec)==normalize(actual_spec),'Unknown original relation structural delta '+name
    after_r=AFTER_RELATIONS[name]
    assert after_r['columns']==r['columns'],'No original columns may change'
    before_constraints=dict(r['constraints']);after_constraints=dict(after_r['constraints'])
    assert all(after_constraints.get(k)==v for k,v in before_constraints.items()),'Original constraint changed'
    extra={k:v for k,v in after_constraints.items() if k not in before_constraints}
    assert not extra or name=='turn_private.work' and extra=={'ops_control_admission_v1':'TRIGGER DEFERRABLE INITIALLY DEFERRED'}
    new_specs[name]={'columns':actual_spec['columns'],'constraints':[x[1]for x in after_r['constraints']]}
if old_specs!=new_specs:
    encoded=json.dumps(new_specs,separators=(',',':')).replace("'","''")
    s=s[:expected_match.start(1)]+encoded+s[expected_match.end(1):]
    changed[sig]=s
    notes.append({'signature':sig,'kind':'exact_new_deferred_admission_pg_constraint_entry',
      'relations':[n for n in old_specs if old_specs[n]!=new_specs[n]],'originalConstraintsPreserved':True})
m=re.search(r"if actual is distinct from '((?:[^']|'')*)'::jsonb then return false;end if;",s)
assert m
old=json.loads(m[1].replace("''","'"));new=json.loads(VALUES['profile-triggers'])
old_map={(x[0],x[1]):x for x in old};new_map={(x[0],x[1]):x for x in new}
assert all(new_map.get(k)==v for k,v in old_map.items()),'Existing trigger metadata cannot change silently'
added=[v for k,v in new_map.items() if k not in old_map]
assert added and all('ops_control_private.' in x[2] for x in added)
encoded=json.dumps(new,separators=(',',':')).replace("'","''")
changed[sig]=s[:m.start(1)]+encoded+s[m.end(1):]
notes.append({'signature':sig,'kind':'only_new_ops_triggers','added':added})

# Original main197 stored unqualified PUBLIC references although this helper
# executes with empty search_path. Diagnose formatting separately; no FK change.
sig='conversation_data_private.schema_supported_v1()';s=body(sig)
m=re.search(r"return foreign_n\s*=\s*'((?:[^']|'')*)'::jsonb",s);assert m
old=json.loads(m[1].replace("''","'"));new=json.loads(VALUES['conversation-fk'])
norm=lambda v:json.dumps(v,sort_keys=True).replace('REFERENCES public.','REFERENCES ')
assert norm(old)==norm(new),'Unexpected conversation FK structural delta'
if old!=new:
    encoded=json.dumps(new,separators=(',',':')).replace("'","''")
    changed[sig]=s[:m.start(1)]+encoded+s[m.end(1):]
    notes.append({'signature':sig,'kind':'observed_existing_empty_path_public_qualification','constraintStructureChanged':False})

def definition(sig,s):
    old=BASE[sig];assert old['definition'].count(old['prosrc'])==1
    return old['definition'].replace(old['prosrc'],s,1)

# Preserve the original exact fixed hashes, updating only named source deltas.
# Include MD5(prosrc) pins as well as MD5(pg_get_functiondef) pins.
changes={x['signature']:x['after'] for x in json.loads((OUT/'shared-candidates/manifest.json').read_text())}
structural_changes=dict(changed)
for count in range(20):
    maps={}
    for sig,row in changes.items():
        maps[BASE[sig]['md5']]=row['md5']
        maps[hashlib.md5(BASE[sig]['prosrc'].encode()).hexdigest()]=hashlib.md5(row['prosrc'].encode()).hexdigest()
    for sig,s in changed.items():
        maps[BASE[sig]['md5']]=hashlib.md5(definition(sig,s).encode()).hexdigest()
        maps[hashlib.md5(BASE[sig]['prosrc'].encode()).hexdigest()]=hashlib.md5(s.encode()).hexdigest()
    next_changed=dict(structural_changes)
    for sig,row in BASE.items():
        # Rebuild from original source each round; do not chain old hashes blindly.
        source=BASE[sig]['prosrc']
        structural=structural_changes.get(sig,source)
        for old,new in maps.items():
            if old==new or old not in source:continue
            # Existing exact hash occurrences map to current prediction. The guard
            # must not silently accept values from a live unknown function.
            if old in structural:structural=structural.replace(old,new)
        if structural!=source:next_changed[sig]=structural
    if next_changed==changed:break
    changed=next_changed
else:raise ValueError('Guard hash graph failed to stabilize')

folder=OUT/'guard-candidates';folder.mkdir(exist_ok=True)
manifest=[]
for sig,s in sorted(changed.items()):
    old=BASE[sig];after=definition(sig,s);name=sig.split('(')[0].replace('.','-')
    (folder/(name+'.before.sql')).write_text(old['definition'])
    (folder/(name+'.after.sql')).write_text(after)
    (folder/(name+'.patch')).write_text(''.join(difflib.unified_diff(old['definition'].splitlines(True),after.splitlines(True),fromfile=name+'.before.sql',tofile=name+'.after.sql')))
    predicted=dict(old,prosrc=s,definition=after,md5=hashlib.md5(after.encode()).hexdigest())
    manifest.append({'signature':sig,'before':old,'after':predicted,'afterCatalogVerified':False})
(folder/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(folder/'delta-notes.json').write_text(json.dumps(notes,indent=2)+'\n')
# Exact before source/ACL owner/config guards are generated by the same fixed
# snapshot builder. It verifies the baseline of these still-unchanged functions.
import importlib.util
spec=importlib.util.spec_from_file_location('shared_builder',OUT/'build_shared_candidates.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
(OUT/'guard-functions.candidate.sql').write_text(module.guard(manifest)+'\n'+''.join(x['after']['definition'].rstrip()+';\n' for x in manifest))
print(json.dumps({'exactGuardReplacements':len(manifest),'notes':notes,'actualAfter':'UNRUN'},default=str))
