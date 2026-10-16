"""Own fresh PostgreSQL only. No DSN, network, mount, target or archive input."""
import hashlib,json,os,re,subprocess,time,uuid
from pathlib import Path
from assemble import build,HERE,ROOT
IMAGE='sha256:3866d94d8426927e8db3f1c5d790752292bfbe27b5f1f46e199ae1b7d3c1710b'
class Fixture:
 def __init__(self):self.nonce=uuid.uuid4().hex;self.name='qa-db-baseline-'+self.nonce[:12];self.cid=None;self.launched=False;self.endpoint=None;self.end=time.monotonic()+180
 def command(self,args,input=None,timeout=20,check=True):
  r=subprocess.run(args,input=input,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
  if check and r.returncode:
   codes=re.findall(rb'ERROR:\s+([0-9A-Z]{5})',r.stderr)
   raise RuntimeError('SQL_'+codes[-1].decode() if codes else 'LOCAL_COMMAND_FAILED')
  return r
 def docker(self,args,**kw):return self.command(['docker','--host',self.endpoint,*args],**kw)
 def inspect(self,target):
  r=self.docker(['inspect',target],check=False)
  if r.returncode:
   allowed=('Error: No such object: '+target,'error: no such object: '+target,'Error: No such container: '+target,'Error response from daemon: No such container: '+target)
   if r.stderr.decode().strip() in allowed:return None
   raise RuntimeError('INSPECT_UNKNOWN')
  return json.loads(r.stdout)[0]
 def own(self):
  item=self.inspect(self.cid or self.name)
  if item is None:return None
  assert item['Name']=='/'+self.name and item['Config']['Labels'].get('qa.db-baseline.owner')==self.nonce
  if self.cid:assert item['Id']==self.cid
  assert item['Image']==IMAGE
  return item
 def start(self):
  assert not any(k in os.environ for k in ('DOCKER_HOST','DOCKER_CONTEXT'))
  context=self.command(['docker','context','show']).stdout.decode().strip()
  self.endpoint=json.loads(self.command(['docker','context','inspect',context]).stdout)[0]['Endpoints']['docker']['Host'];assert self.endpoint.startswith('unix://')
  image=json.loads(self.docker(['image','inspect',IMAGE]).stdout)[0];assert image['Id']==IMAGE and not image['Config'].get('Volumes')
  assert self.inspect(self.name) is None
  command='umask 077; mkdir /tmp/baseline-sock; initdb -U postgres -D /tmp/baseline-db -A trust --no-locale -E UTF8 >/tmp/baseline-init.log 2>&1 && exec postgres -D /tmp/baseline-db -c listen_addresses= -c unix_socket_directories=/tmp/baseline-sock -c unix_socket_permissions=0700'
  self.launched=True
  raw=self.docker(['run','-d','--pull=never','--name',self.name,'--label','qa.db-baseline.owner='+self.nonce,'--network','none','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','1g','--cpus','1','--pids-limit','128','--init','--user','postgres','--entrypoint','/bin/sh',IMAGE,'-c',command]).stdout.decode().strip()
  assert re.fullmatch('[0-9a-f]{64}',raw);self.cid=raw;item=self.own();h=item['HostConfig']
  assert h['NetworkMode']=='none' and not item['Mounts'] and not h['PortBindings'] and not h['Privileged'] and h['CapDrop']==['ALL']
  for _ in range(100):
   if self.docker(['exec',self.cid,'pg_isready','-h','/tmp/baseline-sock','-U','postgres'],check=False).returncode==0:return
   time.sleep(.1)
  raise RuntimeError('READINESS_TIMEOUT')
 def sql(self,text,db='postgres',role=None,actor=None,session=None,anonymous=False,check=True):
  assert self.cid and time.monotonic()<self.end;self.own()
  claims={'sub':actor,'session_id':session,'role':role,'is_anonymous':anonymous}
  prefix="\\set VERBOSITY sqlstate\nset statement_timeout='10s';set lock_timeout='2s';\n"
  if role:
   assert role in ('authenticated','anon','service_role')
   prefix+='begin;set local role '+role+';set local request.jwt.claims='+lit(json.dumps(claims))+';set local request.jwt.claim.sub='+lit(actor or '')+';\n'
  r=self.docker(['exec','-i',self.cid,'psql','-h','/tmp/baseline-sock','-U','postgres','-d',db,'-X','-q','-At','-v','ON_ERROR_STOP=1'],input=(prefix+text+('\ncommit;' if role else '')).encode(),check=check)
  lines=r.stdout.decode().strip().splitlines();return r,lines[-1] if lines else ''
 def close(self):
  if not self.launched:return True
  item=self.own()
  if item is None:return self.cid is not None
  self.cid=item['Id'];self.docker(['rm','-f',self.cid]);assert self.inspect(self.cid) is None;return True

def lit(value):return 'null' if value is None else "'"+str(value).replace("'","''")+"'"
def main():
 from contracts import exercise
 report={'kind':'SYNTHETIC_EMPTY_POSTGRES_ONLY','status':'FAIL','realAuth':'UNRUN','provider':'UNRUN','target':'UNRUN','cleanup':'UNKNOWN','image':IMAGE,'checks':[]}
 f=Fixture()
 try:
  sql=build();f.start();report['nonce']=f.nonce;report['containerId']=f.cid
  assert f.sql("select count(*) from pg_tables where schemaname='public';")[1]=='0'
  # Cluster roles are global, second isolated database reuses only these fixed empty-fixture roles.
  fingerprints=[]
  for number in (1,2):
   db='baseline_'+str(number);f.sql('create database '+db+';')
   platform=(HERE/'platform.sql').read_text()
   if number==2:platform=re.sub(r'create role (?:anon|authenticated|service_role)[^;]*;','',platform)
   f.sql(platform,db);f.sql(sql,db);report['checks'].extend(exercise(f,db))
   fingerprint=f.sql("select md5(string_agg(n.nspname||'.'||p.proname||':'||pg_get_functiondef(p.oid),E'\\n' order by n.nspname,p.proname)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','identity_private','turn_private') and p.prokind='f';",db)[1];fingerprints.append(fingerprint)
  assert fingerprints[0]==fingerprints[1];report['functionCatalogRepeatable']=True;report['status']='PASS_NATIVE_SESSION_READ_SLICE';report['baselineSha256']=hashlib.sha256(sql.encode()).hexdigest()
 except BaseException as error:report['error']=str(error) if isinstance(error,(RuntimeError,AssertionError)) else type(error).__name__
 finally:
  try:report['cleanup']='PASS' if f.close() else 'UNKNOWN'
  except BaseException:report['cleanup']='UNKNOWN';report['status']='FAIL'
  out=ROOT/'artifacts/QAWEB/db-rebuild-20261017';out.mkdir(parents=True,exist_ok=True);path=out/('run-'+f.nonce+'.json');path.write_text(json.dumps(report,indent=2)+'\n')
  print(json.dumps({'status':report['status'],'cleanup':report['cleanup'],'checks':len(report['checks']),'error':report.get('error'),'evidence':str(path)}))
 return 0 if report['status'].startswith('PASS') and report['cleanup']=='PASS' else 1
if __name__=='__main__':
 import sys
 if sys.argv[1:]!=['--run']:raise SystemExit('EXPLICIT_SYNTHETIC_RUN_REQUIRED')
 raise SystemExit(main())
