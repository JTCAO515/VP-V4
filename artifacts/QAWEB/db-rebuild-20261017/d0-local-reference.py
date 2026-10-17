"""Catalog reference only: fixed source in a fresh owned no-network container."""
import hashlib,json,subprocess,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
SOURCE=ROOT/'scripts/qa-agent-db-baseline'
PIN='7f0352ac99affbb00c67e77ca1ff1b7196b769af'
sys.path.insert(0,str(SOURCE))
from run import Fixture, IMAGE
report={'source':PIN,'image':IMAGE,'status':'FAIL','cleanup':'UNKNOWN','scope':'catalog only; no seed, contracts matrix, provider or target writes','sourceHashes':{}}
f=Fixture()
try:
 for p in sorted(SOURCE.iterdir()):
  if p.suffix not in ('.py','.sql','.json'):continue
  pinned=subprocess.check_output(['git','show',PIN+':'+str(p.relative_to(ROOT))],cwd=ROOT)
  assert pinned==p.read_bytes(), 'SOURCE_PIN_MISMATCH'
  report['sourceHashes'][str(p.relative_to(ROOT))]=hashlib.sha256(pinned).hexdigest()
 f.start();report['containerId']=f.cid;report['nonce']=f.nonce
 f.sql('create database catalog_reference;')
 f.sql((SOURCE/'platform.sql').read_text(),'catalog_reference')
 f.sql((SOURCE/'baseline.sql').read_text(),'catalog_reference')
 result=json.loads(f.sql((HERE/'d0-catalog.sql').read_text(),'catalog_reference')[1])
 assert result['transactionReadOnly']=='on' and len(result['objects'])==82
 (HERE/'d0-local-catalog.json').write_text(json.dumps(result,indent=2)+'\n')
 report['status']='PASS_CATALOG_REFERENCE'
except BaseException as e:
 report['error']=str(e) if isinstance(e,(RuntimeError,AssertionError)) else type(e).__name__
finally:
 try:report['cleanup']='PASS' if f.close() else 'UNKNOWN'
 except BaseException:report['cleanup']='UNKNOWN';report['status']='FAIL'
 (HERE/'d0-local-proof.json').write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps({k:report[k] for k in ('status','cleanup')}))
sys.exit(0 if report['status']=='PASS_CATALOG_REFERENCE' and report['cleanup']=='PASS' else 1)
