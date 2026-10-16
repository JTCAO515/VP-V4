"""Materialize a selected SQL object closure, never replay migration history."""
import hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).resolve().parent
BASE='813f9d7fdf956e84fe769e823850e79b79508bf4'
FILES={
 'actor':'20260825052328_ai14_actor_rls_fault_probes.sql',
 'chat':'20260828153000_v4_08_durable_chat_threads.sql',
 'profiles':'20260828200000_v4_16_user_profiles.sql',
 'mobile':'20260909223841_vpj_04_native_mobile_sessions.sql',
 'budget':'20260909184816_vpj_59_durable_model_budget.sql',
 'work':'20260910163426_vpj_07_durable_turn_work.sql',
 'text':'20260910171836_vpj_07_text_authorization.sql',
 'consumer':'20260910174748_vpj_07_native_text_consumer.sql',
 'task':'20260911200339_vpj_07_service_task_records.sql',
 'grounded':'20260912190000_vpj_16_grounded_turn.sql',
 'qa':'20261013050429_qa_agent_web.sql',
 'runtime':'20261016040522_qa_runtime_binding.sql',
 'hosted':'20260923090000_vpj_07_hosted_text_worker.sql',
 'membership':'20260927021000_vpj78_conversation_membership.sql',
 'events':'20261010020000_assistant_events.sql',
 'capacity':'20260926132008_vpj35_u1_text_capacity.sql',
 'cancellation':'20261015043710_agent001_qa_cancellation.sql',
 'place':'20261015083120_agent005_canonical_place_ask.sql',
 'repair':'20260909033302_vpj_02_repair_local_rpc_runtime.sql',
 'native':'20261016060000_qa_native_session.sql'}
TABLES={'actor':['public.trips','public.turns'],'chat':['public.chat_threads','public.chat_turn_events','public.chat_turn_idempotency'],'profiles':['public.user_profiles'],'mobile':['identity_private.mobile_accounts','identity_private.mobile_attempts','identity_private.mobile_login_proofs'],'budget':['public.model_budget_scopes','public.model_budget_provider_limits','public.model_budget_attempts'],'work':['turn_private.work'],'text':['turn_private.text_policies','turn_private.text_consents','turn_private.text_content','turn_private.text_dispatches'],'task':['turn_private.service_tasks','turn_private.service_task_turns']}
FUNCTIONS={'mobile':['identity_private.prepare_mobile_v2','public.native_prepare_v2','identity_private.mobile_session_v2','public.native_session_v2','identity_private.mobile_access_v2','identity_private.guard_mobile_write_v2','identity_private.guard_mobile_rpc_v2'], 'text':['turn_private.valid_text','turn_private.lock_turn','turn_private.text_owner','turn_private.text_policy_current','turn_private.immutable_text_policy','public.accept_text_policy','public.withdraw_text_policy'], 'consumer':['public.read_text_policy'],'grounded':['public.read_text_turn'],'qa':['turn_private.qa_history_v1','public.qa_read_session_v1','public.qa_list_sessions_v1','public.qa_read_policy_v1','public.qa_accept_policy_v1'],'native':['public.qa_native_session_v1']}

TABLES.update({'grounded':['turn_private.grounded_turns'],'capacity':['turn_private.service_task_capacity_settings','turn_private.service_task_capacity'],'hosted':['turn_private.hosted_worker_control','turn_private.hosted_worker_heartbeats'],'membership':['turn_private.assistant_conversations','turn_private.assistant_goals','turn_private.assistant_messages']})
FUNCTIONS['text'] += ['public.start_text_turn','turn_private.terminal','turn_private.hide_text_content']
FUNCTIONS['work']=['public.enqueue_turn_work']
FUNCTIONS['task']=['public.start_chat_turn','public.reserve_model_budget']
FUNCTIONS['budget']=['public.dispatch_model_budget','public.finish_model_budget']
FUNCTIONS['qa'] += ['turn_private.qa_consumer_window_v1','turn_private.qa_link_mode_v1','turn_private.require_text_task','turn_private.qa_lock_work_v1','public.qa_submit_turn_v1','public.qa_submit_message_v1','public.qa_claim_work_v1','public.qa_read_work_v1','public.qa_authorize_dispatch_v1','public.qa_complete_work_v1']
FUNCTIONS['runtime']=['public.qa_ready_groups_v3','public.qa_authorize_dispatch_v2']
FUNCTIONS['hosted']=['public.read_hosted_worker_status','public.hosted_worker_heartbeat']
FUNCTIONS['events']=['turn_private.assistant_event_link_v1','turn_private.cancel_unclaimable_turn_v1']
FUNCTIONS['place']=['public.read_text_turn','public.cancel_chat_turn']
FUNCTIONS['cancellation']=['public.qa_cancellation_v1']
FUNCTIONS['grounded']=[]

def table(text,name):
 m=re.search(r'^create table '+re.escape(name)+r'\s*\(',text,re.I|re.M);assert m,name
 # Selected table definitions have no semicolons in quoted defaults/checks.
 end=text.index(';',m.start())+1;return text[m.start():end]
def function(text,name):
 matches=list(re.finditer(r'^create (?:or replace )?function '+re.escape(name)+r'\s*\(',text,re.I|re.M));assert matches,name
 start=matches[-1].start();opening=re.search(r'\bas\s+(\$[a-zA-Z0-9_]*\$)',text[start:],re.I);assert opening,name
 tag=opening[1];body_start=start+opening.end();end=text.index(tag,body_start)+len(tag);end=text.index(';',end)+1
 return text[start:end]

def build():
 objects=[];chunks=['create schema identity_private; create schema turn_private; revoke all on schema identity_private,turn_private from public;']
 early_path=ROOT/'supabase/migrations'/FILES['text'];early=function(early_path.read_text(),'turn_private.valid_text');chunks.append(early);objects.append({'kind':'function','name':'turn_private.valid_text','source':str(early_path.relative_to(ROOT)),'sourceSha256':hashlib.sha256(early_path.read_bytes()).hexdigest(),'objectSha256':hashlib.sha256(early.encode()).hexdigest()})
 for kind,names in TABLES.items():
  path=ROOT/'supabase/migrations'/FILES[kind];text=path.read_text()
  for name in names:
   sql=table(text,name);chunks.append(sql);objects.append({'kind':'table','name':name,'source':str(path.relative_to(ROOT)),'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'objectSha256':hashlib.sha256(sql.encode()).hexdigest()})
 chunks.append((HERE/'schema-overlay.sql').read_text())
 for kind,names in FUNCTIONS.items():
  path=ROOT/'supabase/migrations'/FILES[kind];text=path.read_text()
  for name in names:
   if name=='turn_private.valid_text':continue
   sql=function(text,name);chunks.append(sql);objects.append({'kind':'function','name':name,'source':str(path.relative_to(ROOT)),'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'objectSha256':hashlib.sha256(sql.encode()).hexdigest()})
 # Materialize two original ALTER SET SCHEMA/RENAME operations as declarations.
 for kind,old,new in [('budget','public.reserve_model_budget','turn_private.reserve_model_budget_unbound'),('repair','public.cancel_chat_turn','turn_private.cancel_chat_turn_unmetered')]:
  path=ROOT/'supabase/migrations'/FILES[kind];original=function(path.read_text(),old);sql=original.replace(old,new,1);chunks.append(sql);objects.append({'kind':'function','name':new,'source':str(path.relative_to(ROOT)),'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'objectSha256':hashlib.sha256(sql.encode()).hexdigest(),'transform':'original historical SET SCHEMA + RENAME only'})
 chunks.append((HERE/'acl.sql').read_text())
 chunks.append((HERE/'write-ports-acl.sql').read_text())
 sql='-- SYNTHETIC OWN EMPTY PG ONLY; NOT A DEPLOYMENT MIGRATION.\nbegin;\n'+'\n\n'.join(chunks)+'\ncommit;\n'
 (HERE/'baseline.sql').write_text(sql)
 (HERE/'reuse-map.json').write_text(json.dumps({'qaBase':BASE,'scope':'Native QA admission, idempotency, claim/context, model budget, dispatch, settlement/completion, protected reopen and cancellation; synthetic Auth/provider only','sourceObjects':objects,'baselineSha256':hashlib.sha256(sql.encode()).hexdigest(),'historyReplayed':False,'authProfile':'synthetic claims/session tables; NOT GoTrue or real JWT verification','unsupported':'Trip/Place/Guide/Conversation writers are not exposed; required empty dependency anchors are private. No success stubs.','schemaScope':'Selected original table definitions plus explicit schema-overlay.sql; not a whole-catalog equivalence claim'},indent=2)+'\n')
 return sql
if __name__=='__main__':build()
