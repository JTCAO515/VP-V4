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
 'native':'20261016060000_qa_native_session.sql'}
TABLES={'actor':['public.trips','public.turns'],'chat':['public.chat_threads'],'profiles':['public.user_profiles'],'mobile':['identity_private.mobile_accounts','identity_private.mobile_attempts','identity_private.mobile_login_proofs'],'budget':['public.model_budget_scopes','public.model_budget_provider_limits','public.model_budget_attempts'],'work':['turn_private.work'],'text':['turn_private.text_policies','turn_private.text_consents','turn_private.text_content','turn_private.text_dispatches'],'task':['turn_private.service_tasks','turn_private.service_task_turns']}
FUNCTIONS={'mobile':['identity_private.prepare_mobile_v2','public.native_prepare_v2','identity_private.mobile_session_v2','public.native_session_v2','identity_private.mobile_access_v2','identity_private.guard_mobile_write_v2','identity_private.guard_mobile_rpc_v2'], 'text':['turn_private.valid_text','turn_private.lock_turn','turn_private.text_owner','turn_private.text_policy_current','turn_private.immutable_text_policy','public.accept_text_policy','public.withdraw_text_policy'], 'consumer':['public.read_text_policy'],'grounded':['public.read_text_turn'],'qa':['turn_private.qa_history_v1','public.qa_read_session_v1','public.qa_list_sessions_v1','public.qa_read_policy_v1','public.qa_accept_policy_v1'],'native':['public.qa_native_session_v1']}

def table(text,name):
 m=re.search(r'create table '+re.escape(name)+r'\s*\(',text,re.I);assert m,name
 # Selected table definitions have no semicolons in quoted defaults/checks.
 end=text.index(';',m.start())+1;return text[m.start():end]
def function(text,name):
 matches=list(re.finditer(r'create (?:or replace )?function '+re.escape(name)+r'\s*\(',text,re.I));assert matches,name
 start=matches[-1].start();opening=re.search(r'\bas\s+(\$[a-zA-Z0-9_]*\$)',text[start:],re.I);assert opening,name
 tag=opening[1];body_start=start+opening.end();end=text.index(tag,body_start)+len(tag);end=text.index(';',end)+1
 return text[start:end]

def build():
 objects=[];chunks=['create schema identity_private; create schema turn_private; revoke all on schema identity_private,turn_private from public;']
 for kind,names in TABLES.items():
  path=ROOT/'supabase/migrations'/FILES[kind];text=path.read_text()
  for name in names:
   sql=table(text,name);chunks.append(sql);objects.append({'kind':'table','name':name,'source':str(path.relative_to(ROOT)),'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'objectSha256':hashlib.sha256(sql.encode()).hexdigest()})
 chunks.append((HERE/'schema-overlay.sql').read_text())
 for kind,names in FUNCTIONS.items():
  path=ROOT/'supabase/migrations'/FILES[kind];text=path.read_text()
  for name in names:
   sql=function(text,name);chunks.append(sql);objects.append({'kind':'function','name':name,'source':str(path.relative_to(ROOT)),'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'objectSha256':hashlib.sha256(sql.encode()).hexdigest()})
 chunks.append((HERE/'acl.sql').read_text())
 sql='-- SYNTHETIC OWN EMPTY PG ONLY; NOT A DEPLOYMENT MIGRATION.\nbegin;\n'+'\n\n'.join(chunks)+'\ncommit;\n'
 (HERE/'baseline.sql').write_text(sql)
 (HERE/'reuse-map.json').write_text(json.dumps({'qaBase':BASE,'scope':'native session create/list/read, policy-consent and retained-message/unknown-ACK projection','sourceObjects':objects,'baselineSha256':hashlib.sha256(sql.encode()).hexdigest(),'historyReplayed':False,'authProfile':'synthetic claims/session tables; NOT GoTrue or real JWT verification','unsupported':'submit/dispatch/worker/cancellation/TripProposal writers are NOT installed, not replaced by success stubs','schemaScope':'Selected original table definitions plus explicit schema-overlay.sql; not a whole-catalog equivalence claim'},indent=2)+'\n')
 return sql
if __name__=='__main__':build()
