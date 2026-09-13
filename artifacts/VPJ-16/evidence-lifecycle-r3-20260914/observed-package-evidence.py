from pathlib import Path
import json,gzip,shutil,hashlib,re
src=Path(__file__).parent;repo=Path('/Users/jtcao/Documents/VP-V4-S2-Evidence-Lifecycle');dst=repo/'artifacts/VPJ-16/evidence-lifecycle-r3-20260914'
run=json.loads((src/'lifecycle.json').read_text());accept=json.loads((src/'acceptance.json').read_text())
assert run['status']=='FAIL' and accept['status']=='PASS'
assert accept['businessValidation']=='PASS' and accept['cleanupRecovery']=='PASS'
assert [x['operation'] for x in run['cleanup'] if x['status'] not in ['PASS',200]]==['revokeOwned']
assert json.loads((src/'saved-records-after.json').read_text())['status']=='PASS'
# Preserve only the first current-run answers from full native accessibility snapshots.
projections=[]
for locale in ['en','zh']:
 for label,expected in [('support',['answered']),('conflict',['partial','partial']),('conflict-expired',['partial','answered']),('card-expired',['no_answer','partial'])]:
  rows=json.loads((src/f'native-{locale}-{label}.json').read_text());groups=[]
  for row in rows:
   ident=row.get('AXUniqueId') or ''
   if ident.startswith('knowledge.answer.'):
    if len(groups)==len(expected):break
    groups.append({'outcome':ident.removeprefix('knowledge.answer.'),'label':row['AXLabel'],'facts':[],'gaps':[]})
   elif groups and ident.startswith('knowledge.note.'):
    groups[-1]['facts'].append({'id':ident.removeprefix('knowledge.note.'),'text':row['AXLabel']})
   elif groups and ident.startswith('knowledge.gap.'):
    groups[-1]['gaps'].append({'reason':ident.removeprefix('knowledge.gap.'),'text':row['AXLabel']})
  assert [x['outcome'] for x in groups]==expected,(locale,label,groups)
  stage={'support':'support-current','conflict':'conflict-current','conflict-expired':'conflict-naturally-expired','card-expired':'card-naturally-expired'}[label]
  api=next(o for o in run['observations'] if o['stage']==stage and o.get('status')=='PASS')['native']
  tasks=[x for x in api if x['locale']==locale][::-1]
  for group,task in zip(groups,tasks,strict=True):
   assert sorted(x['id'] for x in group['facts'])==sorted(x['factId'] for x in task['turn']['result']['knowledge']['statements']),(locale,label)
   group['apiTurnId']=task['turn']['turnId']
  projections.append({'locale':locale,'stage':stage,'identityMethod':'Native ordered exact-question/fact matching; API and Web carry explicit task IDs','answers':groups})
(src/'native-ui-projections.json').write_text(json.dumps(projections,ensure_ascii=False,indent=2)+'\n')
dst.mkdir(exist_ok=True)
for name in ['lifecycle.json','before.json','after-disable.json']:
 with gzip.open(dst/(name+'.gz'),'wb') as f:f.write((src/name).read_bytes())
for name in ['ui-observation-recoveries.json','runtime-equivalence.json','next-frontier.json','acceptance.json','attempt-audit.json','saved-records-before.json','saved-records-after.json','native-ui-projections.json','review-reuse.json','scenario.json','observed-source-hashes.json','firewall-remove-after.json','activation-intent.json','activation-transaction.json','activated.json','disabled.json','budget-preflight.json','policy-live.json']:
 shutil.copyfile(src/name,dst/name)
for name in ['lifecycle.mjs','window-state.mjs','saved-records.mjs','attempt-audit.mjs','summarize.mjs','package-evidence.py']:
 shutil.copyfile(src/name,dst/('observed-'+name))
for pattern in ['*-ui-complete.json','native-*.png','web-*.jpg','web-*-dom.json']:
 for p in src.glob(pattern):shutil.copyfile(p,dst/p.name)
recovery=src.parent/'evidence-lifecycle-r3-cleanup-20260914-r2'
recovery_dst=dst/'cleanup-recovery';recovery_dst.mkdir(exist_ok=True)
for name in ['recovery.json','review.json','retention-tests.json','targets.json','publication-verification.json','activation-intent.json','activation-transaction.json','activated.json','disabled.json','firewall-remove-after.json']:
 shutil.copyfile(recovery/name,recovery_dst/name)
for name in ['before.json','after-disable.json']:
 with gzip.open(recovery_dst/(name+'.gz'),'wb') as f:f.write((recovery/name).read_bytes())
for name in ['recovery.mjs','prepare-targets.mjs','verify-targets.mjs','window-state.mjs','test-retention.mjs']:
 shutil.copyfile(recovery/name,recovery_dst/('observed-'+name))
previous=src.parent/'evidence-lifecycle-r3-cleanup-20260914'
previous_dst=recovery_dst/'prior-failed';previous_dst.mkdir(exist_ok=True)
for name in ['recovery.json','review.json','firewall-remove-after.json']:
 shutil.copyfile(previous/name,previous_dst/name)
shutil.copyfile(previous/'recovery.mjs',previous_dst/'observed-recovery.mjs')
with gzip.open(previous_dst/'after-disable.json.gz','wb') as f:f.write((previous/'after-disable.json').read_bytes())
for p in dst.rglob('*'):
 if not p.is_file():continue
 if p.suffix in ['.png','.jpg']:continue
 b=gzip.decompress(p.read_bytes()) if p.suffix=='.gz' else p.read_bytes()
 assert not re.search(rb'eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}|sk-[A-Za-z0-9]{24,}|"(?:accessToken|access_token|refresh_token|password)"\s*:\s*"[^"\s]{6,}"',b),p.name
print(json.dumps({'status':'PASS','nativeProjections':sum(len(x['answers']) for x in projections),'artifactFiles':len(list(dst.iterdir()))}))
