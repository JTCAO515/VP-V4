"""Offline compiler for the existing Supabase execute_sql tool. Never connects.

Default is a dry-run summary. Apply output requires an external approved scope;
arguments document that scope, they do not create authorization. The operator
must separately verify it before submitting the fixed-target tool request.
"""
import argparse,datetime,hashlib,json,re,uuid
from dataclasses import dataclass
from propose import ROOT,OUT,fixed,lit
SOURCE='a3347896859118c673666430a062890e194b60c1'
PROJECT='dzqdzetcctkhbrhlxxgn';LINK='link_6acdbe0471c081919ff47de24ca53b0f'
WRITER='01a133bb-cc6d-7ca1-8db0-9e02bd252e1d'
def source(name):return fixed(SOURCE,'artifacts/QAWEB/db-rebuild-20261017/'+name)
def catalog_query():
 return source('d0-catalog.sql').replace('BEGIN READ ONLY;\n','').replace('\nROLLBACK;\n','').strip().rstrip(';')
def extra_query():
 s=source('d2-requested-catalog.sql');return s[s.index('WITH roles AS'):s.rindex('ROLLBACK;')].strip().rstrip(';')
def candidate():
 s=source('d2-admission-worker-proposal.sql')
 prefix="-- LOCAL-VALIDATED SOURCE CANDIDATE ONLY. Fresh pins/review/concurrency/target lease and real canary remain required.\nBEGIN;\nDO $$BEGIN RAISE EXCEPTION 'D2_NO_TARGET_APPLY_LEASE';END$$;\n"
 assert s.startswith(prefix) and s.endswith('\nROLLBACK;\n')
 result=s[len(prefix):-len('\nROLLBACK;\n')]
 # The fixed reviewed D2 statements are embedded only between actual guards.
 assert result.startswith('create function ') and 'COMMIT;' not in result
 return result
def digest(s):return hashlib.sha256(s.encode()).hexdigest()
@dataclass
class Profile:
 before:dict
 after:dict
 synthetic:bool=False
def target_profile():
 x=json.loads(source('d2-cumulative-expected-metadata.json'))
 # Observed read-only on the same fixed project; d3-work-shape.json/sql preserve provenance.
 shape={'relnatts':10,'droppedSlots':[]}
 # Exact observed finite reachability matrix, including transitive membership;
 # role flags alone cannot establish effective execution isolation.
 roles=('anon','authenticated','postgres','service_role')
 reach=[{'from':a,'to':b,'member':a==b or a=='postgres','usage':a==b or a=='postgres'} for a in roles for b in roles]
 return Profile({'objects':x['beforeD0Objects'],'extra':x['beforeAdditionalMetadata'],'workShape':shape,'roleReachability':reach},{'objects':x['expectedAfterD0Objects'],'extra':x['expectedAfterAdditionalMetadata'],'workShape':{'relnatts':11,'droppedSlots':[]},'roleReachability':reach})
def capture_sql():
 shape="(SELECT jsonb_build_object('relnatts',c.relnatts,'droppedSlots',(SELECT coalesce(jsonb_agg(a.attnum ORDER BY a.attnum),'[]'::jsonb) FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND a.attisdropped)) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='turn_private' AND c.relname='work')"
 reach="(WITH wanted(name) AS (VALUES ('postgres'),('anon'),('authenticated'),('service_role')) SELECT jsonb_agg(jsonb_build_object('from',a.name,'to',b.name,'member',CASE WHEN ar.oid IS NULL OR br.oid IS NULL THEN NULL ELSE pg_catalog.pg_has_role(ar.oid,br.oid,'MEMBER') END,'usage',CASE WHEN ar.oid IS NULL OR br.oid IS NULL THEN NULL ELSE pg_catalog.pg_has_role(ar.oid,br.oid,'USAGE') END) ORDER BY a.name,b.name) FROM wanted a CROSS JOIN wanted b LEFT JOIN pg_catalog.pg_roles ar ON ar.rolname=a.name LEFT JOIN pg_catalog.pg_roles br ON br.rolname=b.name)"
 return "SELECT jsonb_build_object('objects',a.snapshot->'objects','extra',b.metadata-'readOnly','workShape',"+shape+",'roleReachability',"+reach+") AS state FROM ("+catalog_query()+') a CROSS JOIN ('+extra_query()+') b'
def timestamp(value):
 d=datetime.datetime.fromisoformat(value.replace('Z','+00:00'))
 if d.tzinfo is None:raise ValueError('UTC_OFFSET_REQUIRED')
 return d
def validate_scope(scope,synthetic=False):
 required={'target','writer','approval_reference','concurrency_reference','window_start','window_end','run_id'}
 if not required.issubset(scope) or any(not isinstance(scope[k],str) or not scope[k].strip() for k in required):raise ValueError('MISSING_EXTERNAL_EXECUTION_SCOPE')
 if scope['target']!=('LOCAL_SYNTHETIC' if synthetic else PROJECT) or scope['writer']!=WRITER:raise ValueError('WRITER_OR_TARGET_MISMATCH')
 uuid.UUID(scope['run_id']);start=timestamp(scope['window_start']);end=timestamp(scope['window_end'])
 if end<=start or (end-start).total_seconds()>3600:raise ValueError('INVALID_EXECUTION_INTERVAL')
 # Bounded execution interval, not a reusable restore window or authorization token.
 return scope
def assertion(state,code):
 return "do $d3check$ declare observed jsonb; begin select q.state into observed from ("+capture_sql()+") q; if observed is distinct from "+lit(json.dumps(state,separators=(',',':')))+"::jsonb then raise exception using message='D3_SCOPED_METADATA_MISMATCH',errcode='"+code+"';end if;end $d3check$;\n"
def compile_transaction(profile,mode,scope,*,_body=None,_operation=None):
 if mode not in ('rollback','apply'):raise ValueError('INVALID_MODE')
 validate_scope(scope,profile.synthetic)
 role_check="current_user<>'postgres' or current_database()<>'postgres'" if not profile.synthetic else "current_user<>'postgres'"
 header="BEGIN;\nSET LOCAL statement_timeout='15s';\nSET LOCAL lock_timeout='2s';\nSET LOCAL idle_in_transaction_session_timeout='30s';\n"
 gate="""do $d3gate$ begin
 if ROLE_CHECK or current_setting('server_version_num')::integer/10000<>17 then raise exception using message='D3_ROLE_DATABASE_VERSION_MISMATCH',errcode='P0301';end if;
 if clock_timestamp()<START::timestamptz or clock_timestamp()>=FINISH::timestamptz then raise exception using message='D3_EXECUTION_INTERVAL_CLOSED',errcode='P0302';end if;
 if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('D3:dzqdzetcctkhbrhlxxgn:qa-native',0)) then raise exception using message='D3_OTHER_COOPERATING_WRITER',errcode='P0306';end if;
end $d3gate$;
""".replace('ROLE_CHECK',role_check).replace('START',lit(scope['window_start'])).replace('FINISH',lit(scope['window_end']))
 # Locks cover the tables touched by the delta and trigger's concurrent writers.
 # They do not prove absence of all unrelated deployments; external scope must do that.
 locks='LOCK TABLE turn_private.work,turn_private.text_policies,turn_private.service_task_turns,turn_private.text_content IN ACCESS EXCLUSIVE MODE;\n'
 end_gate="do $d3end$ begin if clock_timestamp()>="+lit(scope['window_end'])+"::timestamptz then raise exception using message='D3_EXECUTION_INTERVAL_CLOSED',errcode='P0302';end if;end $d3end$;\n"
 terminator='COMMIT;' if mode=='apply' else 'ROLLBACK;'
 expected=profile.after if mode=='apply' else profile.before
 receipt={'phase':'COMMIT_RETURNED' if mode=='apply' else 'ROLLBACK_RETURNED','operation':_operation or mode,'run_id':scope['run_id'],'target':scope['target'],'candidate_sha256':digest(candidate())}
 return header+gate+locks+assertion(profile.before,'P0303')+(_body if _body is not None else candidate())+'\n'+assertion(profile.after,'P0304')+end_gate+terminator+'\n'+assertion(expected,'P0307')+'SELECT '+lit(json.dumps(receipt,separators=(',',':')))+'::jsonb AS execution_receipt;\n'
def compile_safe_stop(profile,scope):
 import copy
 stopped=copy.deepcopy(profile.after);before_names={o['name']:o for o in profile.before['objects']};sql=[]
 for o in stopped['objects']:
  if o['kind']!='function' or not o['definitions'] or before_names[o['name']]['definitions'] is not None:continue
  d=o['definitions'][0];sql.append('revoke all on function '+o['name']+'('+d['signature']+') from public,anon,authenticated,service_role;')
  d['acl']=[['postgres','postgres','EXECUTE',False]]
 assert len(sql)==18
 return compile_transaction(Profile(profile.after,stopped,profile.synthetic),'apply',scope,_body='\n'.join(sql),_operation='safe-stop'),stopped
def inspect_sql(profile):
 before=lit(json.dumps(profile.before,separators=(',',':')));after=lit(json.dumps(profile.after,separators=(',',':')))
 return "BEGIN READ ONLY;\nSELECT jsonb_build_object('classification',case when q.state="+before+"::jsonb then 'BEFORE_OBSERVED' when q.state="+after+"::jsonb then 'AFTER_OBSERVED' else 'MIXED_OR_DRIFT' end,'readOnly',current_setting('transaction_read_only')) AS recovery FROM ("+capture_sql()+") q;\nROLLBACK;\n"
def outcome(receipt,scope,observation=None,expected_operation='apply'):
 # No command, retry, inverse migration, or write is returned by this classifier.
 valid=isinstance(receipt,dict) and receipt.get('phase')=='COMMIT_RETURNED' and receipt.get('operation')==expected_operation and receipt.get('run_id')==scope['run_id'] and receipt.get('target')==scope['target'] and receipt.get('candidate_sha256')==digest(candidate())
 if valid:return {'state':'COMMIT_ACKNOWLEDGED','next':'authorized acceptance only','automaticWrite':False}
 known=observation if observation in ('BEFORE_OBSERVED','AFTER_OBSERVED','MIXED_OR_DRIFT') else 'OBSERVATION_FAILED'
 return {'state':'COMMIT_OUTCOME_UNKNOWN','observed':known,'next':'STOP; preserve request/receipt; read-only reconciliation and external writer review; no automatic retry or inverse','automaticWrite':False}
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--mode',choices=('dry-run','inspect','rollback','apply','safe-stop'),default='dry-run');p.add_argument('--emit',action='store_true')
 for key in ('writer','approval-reference','concurrency-reference','window-start','window-end','run-id'):p.add_argument('--'+key)
 args=p.parse_args();profile=target_profile()
 if args.mode=='dry-run':
  print(json.dumps({'mode':'dry-run','connected':False,'target':PROJECT,'source':SOURCE,'candidateSha256':digest(candidate()),'requiredExternalScope':['exact target writer approval','documented no-conflicting-writer arrangement','bounded execution interval'],'targetReady':False}));return
 if args.mode=='inspect':query=inspect_sql(profile);scope=None
 else:
  scope={'target':PROJECT,**{key:getattr(args,key) for key in ('writer','approval_reference','concurrency_reference','window_start','window_end','run_id')}}
  try:query=compile_safe_stop(profile,scope)[0] if args.mode=='safe-stop' else compile_transaction(profile,args.mode,scope)
  except (ValueError,TypeError) as e:p.error(str(e))
 request={'tool':'supabase.execute_sql','arguments':{'link_id':LINK,'project_id':PROJECT,'query':query},'mode':args.mode,'source':SOURCE,'scope':scope,'authorization':'External verified instruction required. This request/flag/reference does not grant permission. NOT SUBMITTED.'}
 if args.emit:
  (OUT/('d3-'+args.mode+'-request.json')).write_text(json.dumps(request,indent=2)+'\n')
  print(json.dumps({'emitted':True,'mode':args.mode,'submitted':False,'sha256':digest(query)}))
 else:print(json.dumps({'mode':args.mode,'validated':True,'submitted':False,'emitRequired':True,'sha256':digest(query)}))
if __name__=='__main__':main()
