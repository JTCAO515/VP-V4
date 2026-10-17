"""Affected transaction/control cases only; no repetition of the 8/38 SQL matrix."""
import copy,datetime,hashlib,json,subprocess,uuid
from pathlib import Path
from local_fixture import LocalFixture,lit
from d3_transaction import Profile,WRITER,OUT,ROOT,target_profile,compile_transaction,compile_safe_stop,inspect_sql,outcome,candidate
def merge_delta(before,after,actual,key=''):
 if before==after:return copy.deepcopy(actual)
 if isinstance(before,dict) and isinstance(after,dict):
  result=copy.deepcopy(actual)
  for k in before.keys()|after.keys():
   if k not in after:raise AssertionError('UNEXPECTED_DESTRUCTIVE_DELTA')
   result[k]=merge_delta(before.get(k),after[k],actual.get(k),k)
  return result
 if isinstance(before,list) and isinstance(after,list):
  if all(isinstance(x,dict) and 'name' in x for x in before+after):
   b={x['name']:x for x in before};a={x['name']:x for x in after};r={x['name']:x for x in actual}
   for n in b.keys()|a.keys():
    assert n in a,'UNEXPECTED_DROP';r[n]=merge_delta(b.get(n),a[n],r.get(n),key)
   return sorted(r.values(),key=lambda x:x['ordinal'] if key=='columns' else (x.get('table',''),x['name']))
  if len(before)==len(after)==len(actual)==1:return [merge_delta(before[0],after[0],actual[0],key)]
 return copy.deepcopy(after)
def scope():
 now=datetime.datetime.now(datetime.timezone.utc)
 return {'target':'LOCAL_SYNTHETIC','writer':WRITER,'approval_reference':'current authorized own-local synthetic validation only','concurrency_reference':'this instance sole writer/no shared endpoint','window_start':(now-datetime.timedelta(seconds=5)).isoformat(),'window_end':(now+datetime.timedelta(minutes=5)).isoformat(),'run_id':str(uuid.uuid4())}
def main():
 f=LocalFixture();report={'status':'FAIL','checks':[],'cleanup':'UNKNOWN','realTarget':'UNRUN','sourceHashes':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (Path(__file__).resolve(),Path(__file__).with_name('d3_transaction.py'),Path(__file__).with_name('local_fixture.py'))}}
 def mark(s):report['checks'].append({'name':s,'status':'PASS'})
 def reject(sql,code):
  r,_=f.call_sql(sql,check=False);assert r.returncode and code.encode() in r.stderr,code
 try:
  f.start();f.build_before();legacy=f.seed('legacy_eligible');before=f.snapshot();target=target_profile();after=merge_delta(target.before,target.after,before)
  after['workShape']={'relnatts':before['workShape']['relnatts']+1,'droppedSlots':before['workShape']['droppedSlots']}
  next(c for o in after['objects'] if o['name']=='turn_private.work' for c in o['definitions'][0]['columns'] if c['name']=='execution_mode')['ordinal']=after['workShape']['relnatts']
  profile=Profile(before,after,True);ctx=scope();report['phase']='rollback'
  retained_sql="select encode(sha256(convert_to(to_jsonb(c)::text,'UTF8')),'hex') from turn_private.text_content c where turn_id="+lit(legacy['turn'])+';'
  retained=f.call_sql(retained_sql)[1]
  receipt=json.loads(f.call_sql(compile_transaction(profile,'rollback',ctx))[1]);assert receipt['phase']=='ROLLBACK_RETURNED' and f.snapshot()==before and f.call_sql(retained_sql)[1]==retained
  mark('real local DDL path passes before/after guards and rolls back with original metadata and bytes')
  report['phase']='guards'
  f.call_sql('alter table public.chat_threads add column d3_drift text;');reject(compile_transaction(profile,'apply',ctx),'P0303');f.call_sql('alter table public.chat_threads drop column d3_drift;')
  f.call_sql('alter function public.native_session_v2(text,uuid) rename to d3_missing_native;');reject(compile_transaction(profile,'apply',ctx),'P0303');f.call_sql('alter function public.d3_missing_native(text,uuid) rename to native_session_v2;')
  f.call_sql('alter role authenticated bypassrls;');reject(compile_transaction(profile,'apply',ctx),'P0303');f.call_sql('alter role authenticated nobypassrls;')
  f.call_sql('revoke execute on function public.native_prepare_v2(uuid,uuid,uuid) from service_role;');reject(compile_transaction(profile,'apply',ctx),'P0303');f.call_sql('grant execute on function public.native_prepare_v2(uuid,uuid,uuid) to service_role;')
  assert f.snapshot()==before
  mark('structure drift, missing routine, changed role flag and revoked required permission each refuse before delta')
  wrong=scope();wrong['window_start']='2000-01-01T00:00:00+00:00';wrong['window_end']='2000-01-01T00:01:00+00:00';reject(compile_transaction(profile,'apply',wrong),'P0302')
  r,_=f.call_sql(compile_transaction(profile,'apply',ctx),role='authenticated',actor=legacy['owner'],session=legacy['session'],check=False);assert r.returncode and b'P0301' in r.stderr
  for change in ({'writer':'wrong'},{'target':'wrong'},{'approval_reference':''},{'concurrency_reference':''}):
   try:compile_transaction(profile,'apply',{**ctx,**change});raise AssertionError('EXPECTED_SCOPE_REJECTION')
   except ValueError:pass
  mark('wrong role, expired interval and incomplete/wrong external scope reject; scope strings never create permission')
  report['phase']='cooperating_writer'
  cmd=['docker','--host',f._owned.endpoint,'exec','-i',f._owned.cid,'psql','-h','/tmp/baseline-sock','-U','postgres','-d',f.db,'-X','-q','-At','-v','ON_ERROR_STOP=1']
  holder=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  holder.stdin.write("begin;select pg_advisory_xact_lock(hashtextextended('D3:dzqdzetcctkhbrhlxxgn:qa-native',0));select 'D3_READY';select pg_sleep(3);rollback;\n");holder.stdin.close()
  while holder.stdout.readline().strip()!='D3_READY':assert holder.poll() is None
  reject(compile_transaction(profile,'apply',ctx),'P0306');holder.wait(timeout=10);assert holder.returncode==0
  mark('second local cooperating writer is rejected by actual transaction advisory lock; this does not prove real deployment quiescence')
  broken=copy.deepcopy(after);broken['objects'][0]['definitions']=None
  reject(compile_transaction(Profile(before,broken,True),'apply',ctx),'P0304');assert f.snapshot()==before and f.call_sql(retained_sql)[1]==retained
  mark('postcondition mismatch aborts whole transaction and preserves original records')
  report['phase']='commit'
  receipt=json.loads(f.call_sql(compile_transaction(profile,'apply',ctx))[1]);assert receipt['phase']=='COMMIT_RETURNED' and f.snapshot()==after
  assert outcome(receipt,ctx)['state']=='COMMIT_ACKNOWLEDGED'
  mark('explicit synthetic apply reaches actual COMMIT and acknowledged exact after-state')
  report['phase']='unknown'
  observed=json.loads(f.call_sql(inspect_sql(profile))[1]);assert observed['classification']=='AFTER_OBSERVED' and observed['readOnly']=='on'
  unknown=outcome(None,ctx,observed['classification']);assert unknown['state']=='COMMIT_OUTCOME_UNKNOWN' and not unknown['automaticWrite']
  for state in ('BEFORE_OBSERVED','MIXED_OR_DRIFT',None):assert outcome(None,ctx,state)['state']=='COMMIT_OUTCOME_UNKNOWN' and not outcome(None,ctx,state)['automaticWrite']
  assert outcome({**receipt,'run_id':str(uuid.uuid4())},ctx)['state']=='COMMIT_OUTCOME_UNKNOWN'
  mark('discarded local commit acknowledgment reconciles read-only to AFTER but never authorizes automatic retry or inverse; wrong receipt also UNKNOWN')
  # Explicit local safe STOP exercise, after recording that no recovery write is automatic.
  post=json.loads(f.call_sql("select public.qa_native_session_v1('create',1,'{}');",role='authenticated',actor=legacy['owner'],session=legacy['session'])[1])['thread']['id']
  stop_ctx=scope();stop_sql,stopped=compile_safe_stop(profile,stop_ctx);stop_receipt=json.loads(f.call_sql(stop_sql)[1]);assert f.snapshot()==stopped
  assert outcome(stop_receipt,stop_ctx,expected_operation='safe-stop')['state']=='COMMIT_ACKNOWLEDGED'
  assert outcome(stop_receipt,stop_ctx)['state']=='COMMIT_OUTCOME_UNKNOWN'
  assert f.call_sql('select count(*) from public.chat_threads where id='+lit(post)+';')[1]=='1' and f.call_sql(retained_sql)[1]==retained
  observed=json.loads(f.call_sql(inspect_sql(profile))[1]);assert observed['classification']=='MIXED_OR_DRIFT'
  mark('explicit local safe STOP keeps postchange thread and old exact bytes; changed grants classify drift rather than pretending rollback')
  report['status']='PASS_D3_TRANSACTION_CASES';report['unknownResultModel']='Acknowledgment deliberately discarded after successful local COMMIT; not an actual transport outage.'
 except BaseException as e:report['error']=str(e) if isinstance(e,(AssertionError,RuntimeError,ValueError)) else type(e).__name__
 finally:
  report['identity']=f.identity;report['cleanup']=f.close();path=OUT/('d3-run-'+f._owned.nonce+'.json');path.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'status':report['status'],'phase':report.get('phase'),'checks':len(report['checks']),'error':report.get('error'),'cleanup':report['cleanup'],'evidence':str(path)}))
 return 0 if report['status']=='PASS_D3_TRANSACTION_CASES' and report['cleanup']=='PASS' else 1
if __name__=='__main__':raise SystemExit(main())
