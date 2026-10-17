"""Preserve matched legacy worker semantics; only exclude the new QA context."""
import hashlib,json,re
from propose import PIN,OUT,fixed,definition
from d2_compat import body
def sources():
 metadata=json.loads((OUT/'d2-followup-target-metadata.json').read_text())
 matches=json.loads((OUT/'d2-followup-source-matches.json').read_text())['matches']
 old={};proof=[]
 for f in metadata['functions']:
  candidates=matches[f['name']];assert len(candidates)==1
  source=fixed(PIN,candidates[0]['source']);assert hashlib.sha256(source.encode()).hexdigest()==candidates[0]['sourceSha256']
  s=definition(source,f['name']);assert hashlib.sha256(body(s)[0].encode()).hexdigest()==f['bodyHash'];old[f['name']]=s
  proof.append({'name':f['name'],'source':candidates[0]['source'],'beforeBodyHash':f['bodyHash'],'owner':f['owner'],'acl':f['acl'],'effectiveExecute':f['effectiveExecute']})
 replacements={
  'public.claim_turn_work':("p.context_mode in ('task_history_v1','knowledge_intent_v1')","p.context_mode in ('task_history_v1','knowledge_intent_v1','qa_session_history_v1')"),
  'turn_private.lock_text_work':("if not found or not turn_private.text_policy_current(c.policy_id) then return false; end if;","if not found or not turn_private.text_policy_current(c.policy_id) or exists(select 1 from turn_private.text_policies where id=c.policy_id and context_mode='qa_session_history_v1') then return false; end if;")}
 patches=[]
 for name,(before,after) in replacements.items():
  assert old[name].count(before)==1
  new=old[name].replace(before,after)
  if name=='public.claim_turn_work':
   pairs=[("where (state='queued' or (state='leased' and expires_at<=clock_timestamp()))","where q.execution_mode='text' and (state='queued' or (state='leased' and expires_at<=clock_timestamp()))"),("if not found or w.state not in ('queued','leased')","if not found or w.execution_mode<>'text' or w.state not in ('queued','leased')")]
   for a,b in pairs:assert new.count(a)==1;new=new.replace(a,b)
  patches.append(re.sub(r'^create function','create or replace function',new,flags=re.I))
  next(x for x in proof if x['name']==name).update(afterBodyHash=hashlib.sha256(body(new)[0].encode()).hexdigest(),beforeFragment=before,afterFragment=after,scope='QA exclusion; global claimer also filters canonical execution_mode=text before and after locking; preserve original cancellation, lock order, owner and ACL')
 return old,'\n\n'.join(patches)+'\n',proof
def work_mode_extension():
 source=fixed(PIN,'supabase/migrations/20260927060000_vpj80_planning_comparison.sql')
 m=re.search(r"alter table turn_private.work add column execution_mode text not null default 'text'\s+check\(execution_mode in \('text','planning_comparison_v1'\)\);",source);assert m
 return m[0]+'\n'
def qa_claim_variant():
 original=definition(fixed(PIN,'scripts/qa-agent-db-baseline/baseline.sql'),'public.qa_claim_work_v1')
 observer='      perform turn_private.cancel_unclaimable_turn_v1(candidate.turn_id,candidate.owner_id);\n'
 assert original.count(observer)==1
 # The accepted observer only handles versioned assistant-linked Tasks. D0 has no
 # assistant tables/helper, and this delta creates none. Retain the old standalone
 # cancellation path; abort if that narrower structural premise ever changes.
 guard="""\n  if pg_catalog.to_regclass('turn_private.assistant_conversations') is not null
    or pg_catalog.to_regclass('turn_private.assistant_goals') is not null
    or pg_catalog.to_regclass('turn_private.assistant_messages') is not null
    or pg_catalog.to_regprocedure('turn_private.cancel_unclaimable_turn_v1(uuid,uuid)') is not null
    or pg_catalog.to_regprocedure('turn_private.assistant_event_link_v1(uuid,uuid,uuid)') is not null then
    raise exception using message='QA_STANDALONE_SCOPE_CHANGED',errcode='P0201';
  end if;
"""
 new=original.replace(observer,'')
 old_body,a,b=body(new);new_body=re.sub(r'\bbegin\b',lambda m:m[0]+guard,old_body,count=1,flags=re.I);new=new[:a]+new_body+new[b:]
 proof={'name':'public.qa_claim_work_v1','targetBefore':'absent','fixedSourceBodyHash':hashlib.sha256(body(original)[0].encode()).hexdigest(),'candidateBodyHash':hashlib.sha256(body(new)[0].encode()).hexdigest(),'change':'new standalone QA claimer retains original work cancellation and all receipt/budget filters; excludes unavailable assistant-only observer under runtime absence guard','premiseObjects':['turn_private.assistant_conversations','turn_private.assistant_goals','turn_private.assistant_messages','turn_private.cancel_unclaimable_turn_v1','turn_private.assistant_event_link_v1'],'scopeChangeSqlstate':'P0201','noStubOrAnchorCreated':True,'reference':'20261010020000_assistant_events.sql: observer returns without terminal/event update for non-assistant-linked legacy Tasks'}
 return original,new,proof
def main():
 _,patch,proof=sources()
 _,_,qa=qa_claim_variant()
 (OUT/'d2-worker-compatibility.json').write_text(json.dumps({'status':'SOURCE_ONLY','sourceCommit':PIN,'targetReady':False,'objects':proof,'newQaClaimVariant':qa,'newColumn':{'name':'turn_private.work.execution_mode','before':'absent','source':'20260927060000_vpj80_planning_comparison.sql','ddl':work_mode_extension(),'scope':'exact single additive column declaration only; no planning tables or activation'},'unresolved':['fresh whole candidate pins, independent review, concurrency interval and exact target apply/activation lease']},indent=2)+'\n')
 (OUT/'d2-worker-proposal.sql').write_text("-- SOURCE ONLY; integrate exact before/after pins into a reviewed complete patch.\nBEGIN;\nDO $$BEGIN RAISE EXCEPTION 'D2_NO_TARGET_APPLY_LEASE';END$$;\n"+patch+'ROLLBACK;\n')
 print(json.dumps({'matchedDependencies':len(proof),'minimalBodyChanges':2,'targetReady':False}))
if __name__=='__main__':main()
