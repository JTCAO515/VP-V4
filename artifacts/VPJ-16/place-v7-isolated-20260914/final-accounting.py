from pathlib import Path
from collections import Counter
import json,hashlib
r=Path(__file__).parent
read=lambda n:json.loads((r/n).read_text())
s=read('scenario.json');v=read('place-run.json')
assert v.get('finishedAt'),'Controller still owns the active window'
before=read('before.json');after=read('after-disable.json')
receipts=[];diagnostics=[];destinations=[]
for p in sorted(r.glob('worker-*.jsonl')):
 for line in p.read_text().splitlines():
  row=json.loads(line)
  if row.get('schemaVersion')=='vpj07-usage-journal/1':receipts.append(row['receipt'])
  elif row.get('schemaVersion')=='vpj07-knowledge-validation-journal/1':diagnostics.append(row['receipt'])
  elif row.get('schemaVersion')=='provider-destination/1' and row.get('phase')=='attempted':destinations.append(row)
assert len({x['attempt']['attemptId'] for x in receipts})==len(receipts),'Duplicate usage receipt'
assert len({x['invocationId'] for x in destinations})==len(destinations),'Duplicate attempted destination'
assert len(receipts)==len(destinations)==v['workerLaunches'],'Incomplete or uncertain usage must be investigated'
assert after['state']['attempts']-before['state']['attempts']==len(receipts)
assert after['state']['unresolved']==0
assert after['state']['reader'] is False and after['state']['ops'] is False and after['state']['activeMembers']==0
for table,hashes in before['original'].items():assert not (Counter(hashes)-Counter(after['original'][table])),table+' original rows changed'
assert after['state']['users']==before['state']['users'] and after['state']['trips']==before['state']['trips']
f0=read('firewall-before.json')['active'];f1=read('firewall-remove-after.json')['active']
assert all(f0.get(k)==f1.get(k) for k in ['ownerId','projectKey','ips','firewallEnabled','crs','rules'])
assert read('firewall-remove-after.json').get('draft') is None
if v['status']=='PASS':
 assert v['workerLaunches']==s['maxNewModelAttempts']==132
 assert len(v['tasks'])==132 and all(t.get('matches') and t.get('foreignOwnerHidden') and t.get('replayBound') for t in v['tasks'])
 assert len(diagnostics)==132 and all(d['reason']=='valid' for d in diagnostics)
 assert {d['turnId'] for d in diagnostics}=={t['request']['turnId'] for t in v['tasks']}=={x['turnId'] for x in receipts}
 assert {x['stage'] for x in v['observations']}=={'current','ambiguous','revoked'}
 assert len([x for x in v['cleanup'] if x.get('operation')=='revokeOwned' and x.get('status')=='PASS'])==4
 assert all(x.get('status') in ['PASS',200] for x in v['cleanup'])
fees=Counter()
for x in receipts:fees[x['attempt']['ownerId']]+=x['actualMicros']
summary={'schemaVersion':'place-final-accounting/1','runStatus':v['status'],'workerCalls':len(receipts),'matchedCases':sum(bool(t.get('matches')) for t in v['tasks']),'unrunCases':132-len(v['tasks']),'tariffCnyMicros':sum(fees.values()),'tariffByOwner':dict(fees),'supplierInvoice':'unknown','originalRowHashesPreserved':True,'unresolved':0,'readerOpsMembersClosed':True,'firewallRestoredVersion':f1['version'],'originalAcceptanceFailuresRemain':True,'startedAt':v['startedAt'],'finishedAt':v['finishedAt']}
(r/'final-accounting.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary))
