"""Test-only IPC to a new immutable-source Fixture; no target/DSN/key interface."""
import hashlib,importlib,json,os,re,subprocess,sys,tempfile
from pathlib import Path
SOURCE='c66a58b8ba63f7107663a5b63fbcae66bdc4e6eb'
PREFIX='scripts/qa-agent-db-baseline/'
os.environ['PYTHONDONTWRITEBYTECODE']='1';sys.dont_write_bytecode=True
snapshot=Path(tempfile.mkdtemp(prefix='qa-service-c66-fixed-'));os.chmod(snapshot,0o700)
paths=subprocess.check_output(['git','ls-tree','-r','--name-only',SOURCE,'scripts/qa-agent-db-baseline'],text=True).splitlines()
pins={}
for path in paths:
 assert path.startswith(PREFIX)
 value=subprocess.check_output(['git','show',SOURCE+':'+path]);target=snapshot/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(value);os.chmod(target,0o400);pins[path]=hashlib.sha256(value).hexdigest()
for directory in sorted([p for p in snapshot.rglob('*') if p.is_dir()],key=lambda p:len(p.parts),reverse=True):os.chmod(directory,0o500)
sys.path.insert(0,str(snapshot/PREFIX));fixture_module=importlib.import_module('run');f=fixture_module.Fixture();db='consumer_'+f.nonce[:16]
def emit(x):print(json.dumps(x,ensure_ascii=False),flush=True)
def literal(v):
 if v is None:return 'null'
 if isinstance(v,bool):return 'true' if v else 'false'
 if isinstance(v,(dict,list)):return fixture_module.lit(json.dumps(v,ensure_ascii=False))+'::jsonb'
 if isinstance(v,int):return str(v)
 return fixture_module.lit(v)
try:
 f.start();assert f.sql("select count(*) from pg_tables where schemaname='public';")[1]=='0'
 f.sql('create database '+db+';')
 f.sql((snapshot/PREFIX/'platform.sql').read_text(),db)
 baseline=(snapshot/PREFIX/'baseline.sql').read_text();assert hashlib.sha256(baseline.encode()).hexdigest()==json.loads((snapshot/PREFIX/'reuse-map.json').read_text())['baselineSha256']
 f.sql(baseline,db)
 info=f.own();assert info and info['Id']==f.cid
 emit({'event':'ready','source':SOURCE,'nonce':f.nonce,'containerId':f.cid,'name':f.name,'image':fixture_module.IMAGE,'snapshot':str(snapshot),'baselineSha256':hashlib.sha256(baseline.encode()).hexdigest(),'networkNone':info['HostConfig']['NetworkMode']=='none','noMounts':not info['Mounts'],'noPorts':not info['HostConfig']['PortBindings'],'sourcePins':pins})
 for line in sys.stdin:
  request=json.loads(line)
  if request['op']=='close':break
  try:
   kwargs={k:request[k] for k in ('role','actor','session','anonymous') if k in request}
   if request['op']=='sql':text=request['sql']
   else:
    assert request['op']=='rpc' and re.fullmatch('[a-z][a-z0-9_]{1,80}',request['name'])
    assert all(re.fullmatch('p_[a-z0-9_]+',k) for k in request['params'])
    text='select public.'+request['name']+'('+','.join(k+'=>'+literal(v) for k,v in request['params'].items())+');'
   # Retain the actual PostgreSQL error code/message for the original API mapper.
   result,value=f.sql('\\set VERBOSITY verbose\n'+text,db,check=False,**kwargs)
   if result.returncode:
    match=re.search(rb'ERROR:\s+([0-9A-Z]{5}):\s*([^\n]+)',result.stderr)
    emit({'id':request['id'],'data':None,'error':{'code':match[1].decode() if match else 'LOCAL_SQL_ERROR','message':match[2].decode()[:300] if match else 'LOCAL_SQL_ERROR'}})
   else:
    data=json.loads(value) if request['op']=='rpc' and value else value if request['op']=='sql' else None
    emit({'id':request['id'],'data':data,'error':None})
  except BaseException as error:emit({'id':request['id'],'data':None,'error':{'code':'FIXTURE_FAILURE','message':str(error)[:100]}})
except BaseException as error:
 emit({'event':'fatal','error':str(error)[:100] if isinstance(error,(RuntimeError,AssertionError)) else type(error).__name__})
finally:
 try:
  cleanup=f.close();unchanged=all(hashlib.sha256((snapshot/p).read_bytes()).hexdigest()==sha for p,sha in pins.items());assert unchanged
  emit({'event':'closed','cleanup':'PASS' if cleanup else 'UNKNOWN','sourceUnchanged':unchanged,'containerId':f.cid,'nonce':f.nonce})
 except BaseException as error:emit({'event':'closed','cleanup':'UNKNOWN','error':type(error).__name__,'containerId':f.cid,'nonce':f.nonce})
