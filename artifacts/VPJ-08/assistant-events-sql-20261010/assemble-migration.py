from pathlib import Path
import re,json,hashlib
root=Path('artifacts/VPJ-08/assistant-events-sql-20261010')
files=['events-core','events-reader','events-lifecycle','events-witness','privacy-handlers','source-catalog','d3-handlers','turn-handlers','terminal-helper','writers','schema-pins','turn-schema','runtime-pins']
pat=re.compile(r'create\s+(?:or\s+replace\s+)?function\s+([a-z_]+\.[a-z_0-9]+)\s*\((.*?)\)\s*(returns.*?)(?:as)\s*(\$[a-z_]*\$)(.*?)\4',re.I|re.S)
functions={};hashes={}
for file in files:
 s=(root/(file+'.candidate.sql')).read_text();hashes[file]=hashlib.sha256(s.encode()).hexdigest()
 for m in pat.finditer(s):
  name,args,decl,tag,body=m.groups();args=re.sub(r'\s+default\s+[^,]+','',args,flags=re.I)
  args=[re.sub(r'\s+',' ',a.strip()) for a in args.split(',') if a.strip()]
  types=[a.split(' ',1)[1] for a in args]
  sig=name+'('+','.join(types)+')'
  lang=re.search(r'language\s+(\w+)',decl,re.I)[1].lower();ret=re.search(r'returns\s+(\w+)',decl,re.I)[1].lower()
  functions[sig]={'name':name,'arguments':args,'prosrc':body,'language':lang,'result':ret,'securityDefiner':bool(re.search(r'security\s+definer',decl,re.I)),'volatility':'s' if re.search(r'\bstable\b',decl,re.I) else 'i' if re.search(r'\bimmutable\b',decl,re.I) else 'v'}
old_names={'public.claim_turn_work','public.claim_planning_comparison_work_v1','turn_private.claim_text_mode','conversation_data_private.source_v1','conversation_data_private.lock_source_v1','conversation_data_private.erase_source_v1','result_data_private.source_v1','result_data_private.lock_source_v1','result_data_private.erase_source_v1','result_data_private.relations_v1','result_data_private.related_v1','privacy_private.linked_delete_graph_v1','public.privacy_linked_trip_delete_v1','turn_data_private.source_v1','turn_data_private.lock_source_v1','turn_data_private.erase_source_v1','turn_data_private.write_hooks_valid_v1','result_data_private.schema_supported_v1','conversation_data_private.schema_supported_v1','profile_data_private.schema_v1','turn_data_private.schema_supported_v1','turn_data_private.runtime_supported_v1'}
assert len(functions)==37,(len(functions),list(functions))
assert len(old_names)==22
(root/'migration-approved-components.json').write_text(json.dumps({'sourceHead':'930b66d6fd7425c63e2ddbe1c6bd0970b489d564','componentSHA256':hashes,'functions':functions,'oldNames':sorted(old_names)},indent=2)+'\n')
print('frozen parsed constituents:',len(functions),'functions,',len(old_names),'old replacements, 15 new')
before=json.loads((root/'migration-before-metadata.json').read_text())
# This file is assembled only from the exact, approved frozen constituents and
# reviewed predecessor data; no running unknown hash/schema is adopted.
q=lambda s:"'"+s.replace("'","''")+"'"
js=lambda x:q(json.dumps(x,separators=(',',':')))+'::jsonb'
expr="jsonb_build_object('definition',pg_get_functiondef(p.oid),'prosrc',p.prosrc,'identity',pg_get_function_identity_arguments(p.oid),'arguments',pg_get_function_arguments(p.oid),'result',pg_get_function_result(p.oid),'config',p.proconfig,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'securityDefiner',p.prosecdef,'volatility',p.provolatile,'strict',p.proisstrict,'parallel',p.proparallel,'kind',p.prokind,'language',l.lanname)"
pre="""-- Main precise SQL lease: ec93d2e3 frozen 13 components, main930b66d6 source.
-- Additive durable delivery index; no provider, target or execution enablement.
begin;
set local search_path='';
-- Stop source mutation before baseline/catalog checks and backfill; runtime
-- producers keep their original source locks -> private head allocation order.
lock table public.chat_turn_events,turn_private.assistant_messages,
 turn_private.service_task_turns,turn_private.planning_action_receipts,
 turn_private.result_events,turn_private.text_content in share row exclusive mode;
do $before$
declare spec record;actual jsonb;
begin
 if to_regclass('turn_private.assistant_event_heads_v1') is not null
  or to_regclass('turn_private.assistant_events_v1') is not null then raise exception 'ASSISTANT_EVENTS_OBJECT_ALREADY_EXISTS';end if;
"""
for sig,f in functions.items():
 if f['name'] not in old_names:
  schema,name=f['name'].split('.')
  pre+=f" if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname={q(schema)} and p.proname={q(name)}) then raise exception 'ASSISTANT_EVENTS_OBJECT_ALREADY_EXISTS';end if;\n"
pre+=" for spec in select key signature,value expected from jsonb_each("+js(before)+") loop\n"
pre+="  if to_regprocedure(spec.signature) is null then raise exception 'ASSISTANT_EVENTS_BASELINE_DRIFT';end if;\n"
pre+="  select "+expr+" into actual from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=to_regprocedure(spec.signature);\n"
pre+="  if actual is distinct from spec.expected then raise exception 'ASSISTANT_EVENTS_BASELINE_DRIFT';end if;\n end loop;\n"
pre+=" if not (result_data_private.schema_supported_v1() and conversation_data_private.schema_supported_v1() and profile_data_private.schema_v1() and export_private.profile_hooks_valid_v1() and turn_data_private.schema_supported_v1() and turn_data_private.runtime_supported_v1() and turn_data_private.write_hooks_valid_v1() and turn_data_private.hooks_valid_v1()) then raise exception 'ASSISTANT_EVENTS_BASELINE_DRIFT';end if;\nend$before$;\n"
# Exact pre-approved function source/config/signature/owner/ACL after the append.
after={}
for sig,f in functions.items():
 old=before.get(sig)
 after[sig]={'prosrc':f['prosrc'],'identity':', '.join(f['arguments']),'arguments':old['arguments'] if old else ', '.join(f['arguments']),'result':old['result'] if old else f['result'],'config':['search_path=""'],'owner':old['owner'] if old else 'postgres','acl':old['acl'] if old else ('{postgres=X/postgres,authenticated=X/postgres}' if sig.startswith('public.read_assistant_events_v1(') else '{postgres=X/postgres}'),'securityDefiner':f['securityDefiner'],'volatility':f['volatility'],'strict':False,'parallel':'u','kind':'f','language':f['language']}
# Original retained terminal dependency must be wholly unchanged.
after['turn_private.terminal(uuid,text,integer)']=dict(before['turn_private.terminal(uuid,text,integer)']);after['turn_private.terminal(uuid,text,integer)'].pop('definition')
post="""\n-- Full after checks are part of the same transaction. Any unknown constituent,
-- signature, owner/config/ACL, source catalog or runtime guard rolls it back.
do $after$
declare spec record;actual jsonb;
begin
"""
expr_after=expr.replace("'definition',pg_get_functiondef(p.oid),",'')
post+=" for spec in select key signature,value expected from jsonb_each("+js(after)+") loop\n"
post+="  if to_regprocedure(spec.signature) is null then raise exception 'ASSISTANT_EVENTS_AFTER_DRIFT';end if;\n  select "+expr_after+" into actual from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=to_regprocedure(spec.signature);\n  if actual is distinct from spec.expected then raise exception 'ASSISTANT_EVENTS_AFTER_DRIFT';end if;\n end loop;\n"
for sig,f in functions.items():
 schema,name=f['name'].split('.')
 post+=f" if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname={q(schema)} and p.proname={q(name)})<>1 then raise exception 'ASSISTANT_EVENTS_AFTER_DRIFT';end if;\n"
triggers=[]
for file in files:
 source=(root/(file+'.candidate.sql')).read_text()
 for m in re.finditer(r'^create\s+trigger\s+(\w+)\s+(before|after)\s+(.*?)\s+on\s+([\w.]+)\s+for\s+each\s+row\s+execute\s+function\s+([\w.]+)\(\)',source,re.I|re.S|re.M):
  name,timing,events,table,fn=m.groups();kind=1+(2 if timing.lower()=='before' else 0)
  for event,bit in [('insert',4),('delete',8),('update',16)]:
   if event in events.lower():kind+=bit
  attr=re.search(r'update\s+of\s+(\w+)',events,re.I)
  triggers.append({'name':name,'table':table,'function':fn+'()','type':kind,'updateColumn':attr[1] if attr else None})
assert len(triggers)==19,len(triggers)
for t in triggers:
 attrs="(select attnum::text from pg_attribute where attrelid="+q(t['table'])+"::regclass and attname="+q(t['updateColumn'])+")" if t['updateColumn'] else "''"
 post+=f" if not exists(select 1 from pg_trigger t where t.tgrelid={q(t['table'])}::regclass and t.tgname={q(t['name'])} and t.tgfoid=to_regprocedure({q(t['function'])}) and t.tgtype={t['type']} and t.tgenabled='O' and not t.tgisinternal and t.tgnargs=0 and t.tgattr::text={attrs} and t.tgqual is null and octet_length(t.tgargs)=0 and not t.tgdeferrable and not t.tginitdeferred and t.tgconstraint=0) then raise exception 'ASSISTANT_EVENTS_AFTER_DRIFT';end if;\n"
(root/'migration-after-expected-triggers.json').write_text(json.dumps(triggers,indent=2)+'\n')
post+=" if not (result_data_private.schema_supported_v1() and conversation_data_private.schema_supported_v1() and profile_data_private.schema_v1() and export_private.profile_hooks_valid_v1() and turn_data_private.schema_supported_v1() and turn_data_private.runtime_supported_v1() and turn_data_private.write_hooks_valid_v1() and turn_data_private.hooks_valid_v1()) then raise exception 'ASSISTANT_EVENTS_AFTER_DRIFT';end if;\n"
post+=" if exists(select 1 from pg_class c where c.oid in('turn_private.assistant_event_heads_v1'::regclass,'turn_private.assistant_events_v1'::regclass) and (not c.relrowsecurity or pg_get_userbyid(c.relowner)<>'postgres' or c.relacl::text is distinct from '{postgres=arwdDxtm/postgres}')) then raise exception 'ASSISTANT_EVENTS_AFTER_DRIFT';end if;\nend$after$;\nnotify pgrst,'reload schema';\ncommit;\n"
# Mandatory declared components remain byte-for-byte identical to Main's lease.
components='\n'.join('-- approved constituent SHA256 '+hashes[file]+' / '+file+'\n'+(root/(file+'.candidate.sql')).read_text() for file in files)
p=Path('supabase/migrations/20261010020000_assistant_events.sql');p.write_text(pre+'\n'+components+post)
(root/'migration-after-expected-metadata.json').write_text(json.dumps(after,indent=2)+'\n')
print('product append assembled',p,len((pre+components+post).encode()),'bytes; before23 / after38 complete metadata records')
