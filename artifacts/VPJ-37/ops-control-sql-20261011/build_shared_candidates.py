"""Build full before/after candidates from the OWN actual PG17 baseline catalog."""
import difflib
import hashlib
import json
from pathlib import Path

OUT = Path(__file__).resolve().parent
BASE = {x['signature']: x for x in json.loads((OUT / 'catalog-before.json').read_text())}
PLAN = []

def patch(sig, anchor, check, reason, declaration=False, definer=False):
    row = BASE[sig]; before = row['definition']; prior=next((x for x in PLAN if x['signature']==sig),None)
    current=prior['after'] if prior else row
    if current['definition'].count(anchor) != 1:
        raise ValueError(f'{sig}: exact anchor count {current["definition"].count(anchor)}')
    body = current['prosrc'].replace(anchor, check + '\n' + anchor)
    if declaration:
        import re
        body,n = re.subn(r'^(\s*)declare\b', r'\1declare ops_decision jsonb;', body, count=1, flags=re.I)
        if n!=1: raise ValueError('No original declaration for '+sig)
    after=current['definition'].replace(current['prosrc'],body,1)
    if definer:
        if row['securityDefiner']: raise ValueError('Already definer '+sig)
        after=after.replace(' LANGUAGE plpgsql\n',' LANGUAGE plpgsql\n SECURITY DEFINER\n',1)
    if body == row['prosrc']: raise ValueError('anchor outside body')
    name = sig.split('(')[0].replace('.', '-')
    folder = OUT / 'shared-candidates'; folder.mkdir(exist_ok=True)
    (folder / (name + '.before.sql')).write_text(before)
    (folder / (name + '.after.sql')).write_text(after)
    (folder / (name + '.patch')).write_text(''.join(difflib.unified_diff(before.splitlines(True),
        after.splitlines(True), fromfile=name+'.before.sql', tofile=name+'.after.sql')))
    predicted = dict(current, definition=after, prosrc=body, md5=hashlib.md5(after.encode()).hexdigest(),securityDefiner=definer or current['securityDefiner'])
    if prior:PLAN.remove(prior);reason=prior['reason']+'; '+reason
    PLAN.append({'signature':sig, 'before':row, 'after':predicted, 'reason':reason,
        'beforeSha256':hashlib.sha256(before.encode()).hexdigest(),
        'afterSha256':hashlib.sha256(after.encode()).hexdigest(), 'afterCatalogVerified':False})

def decision(turn,lease,effect,original='blocked'):
    return f"ops_decision:=ops_control_private.work_decision_v1({turn},{lease},'{effect}');if ops_decision->>'kind' is distinct from 'allowed' then if ops_decision ? 'code' then return ops_decision;end if;return jsonb_build_object('kind','{original}');end if;"

model = decision('p_turn_id','p_lease_token','model')
for sig in ['public.authorize_text_dispatch(uuid,uuid,uuid,text)',
            'public.authorize_text_task_dispatch(uuid,uuid,uuid,text,text)',
            'public.authorize_grounded_dispatch(uuid,uuid,uuid,text,text)']:
    patch(sig,'insert into turn_private.text_dispatches(',model,'same-transaction final durable text dispatch claim',declaration=True)
patch('public.authorize_planning_dispatch_v1(uuid,uuid,text,uuid,uuid)',
      'insert into turn_private.text_dispatches(',model,'V1 final model claim after original scope/attempt/context checks',declaration=True)
patch('public.authorize_planning_read_v1(uuid,uuid,text)',
      "return jsonb_build_object('kind','authorized');",
      decision('p_turn_id','p_lease_token','tool'),
      'V1 per-request external read; unknown city cannot bypass city stop',declaration=True)
patch('public.authorize_planning_intake_external_read_v1(uuid,uuid,uuid,uuid,text,text,uuid,integer)',
      'insert into turn_private.planning_v2_external_call_windows',
      decision('p_turn','p_lease','tool'),
      'V2 per-call map window claim, after exact execution basis and approved fee window',declaration=True)
patch('public.authorize_planning_intake_model_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text)',
      "return jsonb_build_object('schemaVersion','planning-v2-effect-authority/1'",
      decision('p_turn','p_lease','model'),
      'V2 pre-reserve/pre-budget-dispatch; original reserved binding rule unchanged',declaration=True)
patch('public.record_planning_intake_provider_destination_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,jsonb,uuid,text,text,text)',
      "if phase='configured' then",
      "if phase in('configured','attempted') then "+decision('p_turn','p_lease','model')+"end if;",
      'V2 final physical transport hook after budget dispatch; no re-call of reserved-only authorization; buffered readback unaffected',declaration=True)
patch('public.authorize_scoped_trip_edit_effect_v1(jsonb,text)',
      "return jsonb_build_object('kind','authorized','effect',p_effect,'binding',p_binding);",
      "if p_effect in('reserve','dispatch') then "+decision("(p_binding->>'turnId')::uuid","(p_binding->>'leaseToken')::uuid",'model','pending')+"end if;",
      'fourth existing paid mode, preserve original publish/readback of already-settled work',declaration=True)
patch('public.record_scoped_trip_edit_destination_v1(jsonb,jsonb,text,text,text,text)',
      'expected_digest:=encode(',
      "if phase in('configured','attempted') then "+decision('j.turn_id',"(p_binding->>'leaseToken')::uuid",'model','pending')+"end if;",
      'scoped edit final configured/attempted transport hook; preserve original request identity and buffered audit',declaration=True)
patch('public.dispatch_model_budget(uuid,uuid,uuid)',
      'select * into s from public.model_budget_scopes',
      "ops_decision:=ops_control_private.ledger_decision_v1(p_scope_id,p_owner_id,p_attempt_id);if ops_decision->>'kind' is distinct from 'allowed' then if ops_decision->>'kind'='unavailable' then return ops_decision;end if;return ops_decision||jsonb_build_object('kind','disabled');end if;",
      'source/task/tuple locks before original budget lock; control lock held through state transition; duplicate ledger statuses retain original branch; explicit service-only invoker-to-definer attribute delta closes private ACL chain',declaration=True,definer=True)
patch('public.stop_model_budget(uuid,uuid)',
      "return jsonb_build_object('kind','stopped'",
      'perform ops_control_private.repeated_budget_stop_v1(p_scope_id,p_owner_id,s.enabled);',
      'durable repeated-stop revision; original reserved/released and dispatched/pending handling retained; explicit service-only invoker-to-definer attribute delta closes private ACL chain',definer=True)
patch('export_private.profile_source_v1(uuid)',
      'return item;',
      "ops:=ops||ops_control_private.export_actor_operations_v1(u);n:=jsonb_array_length(ops);if rows_n+n>10000 then raise exception 'PROFILE_SCOPE_TOO_LARGE';end if;item:=jsonb_set(jsonb_set(item,'{operations}',ops),'{sourceRows,operations}',to_jsonb(n));if octet_length(notification_private.canonical(jsonb_build_object('snapshot',jsonb_build_array(item))))>1000000 then raise exception 'PROFILE_SCOPE_TOO_LARGE';end if;",
      'existing qualified Profile snapshot operation union; actual audit rows included in original source_operation_rows/provenance/hash/current-source checks; no new D2 module or sensitive-erase scope')
patch('public.grounded_ai_assist_work_v1(jsonb)',
      'insert into turn_private.grounded_ai_assist_jobs',
      'return ops_control_private.c2_unqualified_decision_v1(tid);',
      'C2 fresh ensure has no registered immutable execution/durable-budget authority; never guess original text provider or fabricate scope')
patch('public.grounded_ai_assist_work_v1(jsonb)',
      "update turn_private.grounded_ai_assist_jobs\n      set status = 'running',",
      'return ops_control_private.c2_unqualified_decision_v1(tid);',
      'C2 expired reclaim failclosed; already-done/running-pending/complete and original context read remain unchanged')

def pause_branch(turn,lease,owner,task,extra=''):
    return f"""ops_decision:=ops_control_private.work_decision_v1({turn},{lease},'model');
 if not(ops_decision ? 'code') then ops_decision:=ops_control_private.work_decision_v1({turn},{lease},'tool');end if;
 if ops_decision->>'code' in('OPS_CONTROL_DISABLED','OPS_SCOPE_UNAVAILABLE') then
 declare ops_attempt record;ops_accounting text:='not_dispatched';ops_task uuid;begin
  ops_task:={task};
  for ops_attempt in select a.scope_id,a.attempt_id,a.status from public.model_budget_attempts a
   join public.model_budget_scopes s on s.id=a.scope_id where a.task_id=ops_task and s.owner_id={owner}
   order by a.scope_id,a.attempt_id loop
   if ops_attempt.status in('dispatched','pending','settled') then ops_accounting:='pending';end if;
   if ops_attempt.status='dispatched' then perform public.finish_model_budget(ops_attempt.scope_id,{owner},ops_attempt.attempt_id,'pending',null);
   elsif ops_attempt.status='reserved' then perform public.finish_model_budget(ops_attempt.scope_id,{owner},ops_attempt.attempt_id,'release',null);end if;
  end loop;
  update turn_private.planning_comparisons set state='paused_unknown' where turn_id={turn} and owner_id={owner};
  update turn_private.text_content set output_kind='blocked',output_text=case when locale='zh'
   then '此能力暂时停用，或当前城市范围无法核实。请打开已有行程或已保存成果，按原确认流程手工调整；不会自动重发已发送请求。'
   else 'This capability is paused or the current city scope cannot be qualified. Open an existing Trip or saved result and edit manually through its original confirmation flow. Sent requests will not be retried automatically.' end
   where turn_id={turn} and owner_id={owner} and hidden_at is null;
  perform turn_private.terminal({turn},'unavailable',(select attempt from turn_private.work where turn_id={turn}));
  update turn_private.service_task_capacity set state='released',released_at=clock_timestamp() where task_id=ops_task and state='reserved';
  return jsonb_build_object('kind','ops_paused','code',ops_decision->>'code','accounting',ops_accounting{extra});
 end;end if;"""
patch('public.pause_planning_comparison_v1(uuid,uuid)',
      "update turn_private.planning_comparisons set state='paused_unknown'",
      pause_branch('p_turn_id','p_lease_token','w.owner_id',"(select task_id from turn_private.planning_comparisons where turn_id=p_turn_id and owner_id=w.owner_id)"),
      'same original pause signature; fresh qualified Ops refusal persisted as owned blocked terminal, original ledger pending/known settlement retained',declaration=True)
patch('public.pause_planning_intake_work_v1(uuid,uuid,uuid,uuid,text,text,text)',
      "update turn_private.planning_comparisons set state='paused_unknown'",
      pause_branch('p_turn','p_lease','p_owner','p_task',",'taskId',p_task,'turnId',p_turn"),
      'V2 original exact six-tuple/run basis before atomic Ops pause/readback; no new RPC or completion proof',declaration=True)
patch('public.pause_scoped_trip_edit_work_v1(jsonb,text)',
      "if coalesce(p_reason,'') not in('unsupported_request','no_change','safety_refused') then",
      """if p_reason in('ops_control_disabled','ops_scope_unavailable') then
 if not scoped_edit_private.work_current_v1(p_binding) then return jsonb_build_object('kind','pending');end if;
 ops_decision:=ops_control_private.work_decision_v1(j.turn_id,(p_binding->>'leaseToken')::uuid,'model');
 if ops_decision->>'code' is distinct from(case when p_reason='ops_control_disabled' then 'OPS_CONTROL_DISABLED' else 'OPS_SCOPE_UNAVAILABLE' end)
  or j.completion is not null or o.cancelled or o.proposal_id is not null then return jsonb_build_object('kind','pending');end if;
 if j.attempt_id is not null then
  if exists(select 1 from public.model_budget_attempts where scope_id=j.scope_id and attempt_id=j.attempt_id and task_id=j.task_id and status='dispatched')
   then perform public.finish_model_budget(j.scope_id,j.owner_id,j.attempt_id,'pending',null);
  elsif exists(select 1 from public.model_budget_attempts where scope_id=j.scope_id and attempt_id=j.attempt_id and task_id=j.task_id and status='reserved')
   then perform public.finish_model_budget(j.scope_id,j.owner_id,j.attempt_id,'release',null);end if;
 end if;
 r:=jsonb_build_object('kind','scoped_edit_pending/1','operationId',j.operation_id,'tripId',j.trip_id,'contextId',c.id,'contextDigest',c.digest,'baseVersion',c.base_version,'reason',p_reason,'reused',false);
 update scoped_edit_private.operations_v1 set receipt=r where owner_id=j.owner_id and operation_id=j.operation_id;
 update scoped_edit_private.work_v1 set paused_reason=p_reason where turn_id=j.turn_id;
 perform turn_private.terminal(j.turn_id,'unavailable',(select attempt from turn_private.work where turn_id=j.turn_id));
 return jsonb_build_object('kind','ops_paused','binding',p_binding,'receipt',r);
 end if;""",
      'original scoped pause/read operation receives only independently rechecked Ops reason, no declined/safety/provider retry or unknown refund',declaration=True)
# Extend only the two closed operational reason tokens in the original guard.
row=next(x for x in PLAN if x['signature']=='public.pause_scoped_trip_edit_work_v1(jsonb,text)')
old="'provider_unavailable','accounting_unknown','stale_basis'"
new=old+",'ops_control_disabled','ops_scope_unavailable'"
assert row['after']['prosrc'].count(old)==1
row['after']['prosrc']=row['after']['prosrc'].replace(old,new)
row['after']['definition']=row['after']['definition'].replace(old,new)
row['after']['md5']=hashlib.md5(row['after']['definition'].encode()).hexdigest()
row['afterSha256']=hashlib.sha256(row['after']['definition'].encode()).hexdigest()
name='public-pause_scoped_trip_edit_work_v1';folder=OUT/'shared-candidates'
(folder/(name+'.after.sql')).write_text(row['after']['definition'])
(folder/(name+'.patch')).write_text(''.join(difflib.unified_diff(row['before']['definition'].splitlines(True),row['after']['definition'].splitlines(True),fromfile=name+'.before.sql',tofile=name+'.after.sql')))

def guard(rows):
    v = {r['signature']:r['before'] for r in rows}
    expected = json.dumps(v, separators=(',',':')).replace("'", "''")
    # Canonical definitions are compared with the same empty path as catalog acquisition.
    return """do $ops_before$ declare s record;p pg_proc;actual_n jsonb;begin
 perform set_config('search_path','',true);
 for s in select key,value from jsonb_each('%s'::jsonb) loop
  if to_regprocedure(s.key) is null then raise exception 'OPS_SOURCE_MISSING %%',s.key;end if;
  select * into p from pg_proc where oid=s.key::regprocedure;
  select jsonb_build_object('signature',s.key,'definition',pg_get_functiondef(p.oid),'prosrc',p.prosrc,
   'identity',pg_get_function_identity_arguments(p.oid),'arguments',pg_get_function_arguments(p.oid),
   'result',pg_get_function_result(p.oid),'config',p.proconfig,'owner',pg_get_userbyid(p.proowner),
   'acl',p.proacl::text,'securityDefiner',p.prosecdef,'volatility',p.provolatile,'strict',p.proisstrict,
   'parallel',p.proparallel,'kind',p.prokind,'language',(select lanname from pg_language where oid=p.prolang),
   'md5',md5(pg_get_functiondef(p.oid))) into actual_n;
  if actual_n is distinct from s.value then raise exception 'OPS_SOURCE_MISMATCH %%',s.key;end if;
 end loop;
end $ops_before$;
""" % expected

(OUT/'shared-candidates/manifest.json').write_text(json.dumps(PLAN,indent=2)+'\n')
(OUT/'shared-functions.candidate.sql').write_text(guard(PLAN)+'\n'+''.join(r['after']['definition'].rstrip()+';\n' for r in PLAN))
print(json.dumps({'actualBaselineFunctions':len(BASE),'fullBeforeAfter':len(PLAN),
                  'predictedAfterRequiresPGReplay':True}))
