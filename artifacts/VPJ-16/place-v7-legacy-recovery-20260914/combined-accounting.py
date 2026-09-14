from pathlib import Path
import json,hashlib
root=Path(__file__).parent
read=lambda p:json.loads(p.read_text())
a=root.parent/'place-v7-isolated-20260914';b=root.parent/'place-v7-legacy-continuation-20260914'
runs=[read(p/'place-run.json') for p in [a,b,root]]
assert all(x.get('finishedAt') for x in runs),'Wait for current controller cleanup'
assert read(root/'final-accounting.json')['runStatus']=='PASS'
assert read(a/'cleanup-recovery/verification.json')['status']=='PASS'
assert read(root.parent/'place-v7-transport-diagnostic-20260914/verification.json')['ownedNativeSessionsClosed']
assert [x['workerLaunches'] for x in runs]==[46,1,85]
original=read(a/'scenario.json');expected=[x for group in ['before','current','ambiguous','limits','legacy'] for x in original[group]]
tasks=[t for run in runs for t in run['tasks']];assert len(tasks)==len(expected)==132
assert [t['sampleId'] for t in tasks]==[e['id'] for e in expected]
assert all(t['expected']==e for t,e in zip(tasks,expected))
assert len({t['request']['turnId'] for t in tasks})==132
recoveries={r['recoveredRead']['turnId']:r['recoveredRead'] for r in runs[1:]}
for t in tasks:
 check=t if t.get('matches') else recoveries[t['request']['turnId']]
 assert check.get('matches') and check.get('foreignOwnerHidden') and t.get('replayBound')
 assert t['diagnosis']['reason']=='valid' and t['diagnosis']['turnId']==t['request']['turnId']
 assert t['worker']['prompt']['digest']==original['promptDigest']
 if t['request']['turnId'] in recoveries:assert check['modelCalls']==0
receipts=[]
for p in [a,b,root]:
 for f in p.glob('worker-*.jsonl'):
  receipts += [x['receipt'] for x in map(json.loads,f.read_text().splitlines()) if x.get('schemaVersion')=='vpj07-usage-journal/1']
assert len(receipts)==132 and len({r['attempt']['attemptId'] for r in receipts})==132
assert {r['turnId'] for r in receipts}=={t['request']['turnId'] for t in tasks}
assert read(root/'after-disable.json')['state']['attempts']==491
result={'schemaVersion':'place-combined-regression/1','coverage':'PASS','cases':132,'placeCases':26,'legacyCases':106,'modelCalls':132,'uniqueModelAttempts':132,'recoveredReadsWithoutModel':2,'tariffCnyMicros':sum(r['actualMicros'] for r in receipts),'supplierInvoice':'unknown','runtimeCommit':original['sourceCommit'],'apiCommit':original['apiSourceCommit'],'promptDigest':original['promptDigest'],'priorControllerFailuresPreserved':True,'userRequestedPauseAfterThisRound':True,'evidence':[{'run':str(p/'place-run.json'),'sha256':hashlib.sha256((p/'place-run.json').read_bytes()).hexdigest()} for p in [a,b,root]]}
(root/'combined-accounting.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
