from pathlib import Path
import json,hashlib
p=Path('artifacts/QAWEB/sql-20261013');before=json.loads((p/'constraints-before.json').read_text());after=json.loads((p/'constraints-after.json').read_text())
pairs=[('turn_private.text_policies','text_policies_context_mode_check'),('turn_private.service_task_turns','service_task_turns_relationship_check')]
def lit(v):return "'"+v.replace("'","''")+"'"
checks='\n -- QA v1 accepts exactly the authored extensions; every other schema member stays in the original digest.\n';cases=[];conditions=[]
for relation,name in pairs:
 assert before[name]!=after[name]
 predicate="k.conrelid="+lit(relation)+"::regclass and k.conname="+lit(name)
 expr='(select pg_get_constraintdef(k.oid) from pg_constraint k where '+predicate+')'
 checks+=' if '+expr+' is distinct from '+lit(after[name])+" then return false;end if;\n"
 conditions.append('('+expr+' is not distinct from '+lit(after[name])+')')
 cases.append('when '+predicate+' then '+lit(before[name]))
old_sources={
 'turn_data_private.schema_supported_v1':(p/'lifecycle-schema_supported_v1-before.sql').read_text(),
 'profile_data_private.schema_v1':(p/'gate-profile_data_private-schema_v1-before.sql').read_text(),
 'result_data_private.schema_supported_v1':(p/'gate-result_data_private-schema_supported_v1-before.sql').read_text()
}
runtime=(p/'lifecycle-runtime_supported_v1-before.sql').read_text();newruntime=runtime;changed={};guards=[];defs=[]
for signature,old in old_sources.items():
 new=old.replace('jsonb_agg(pg_get_constraintdef(k.oid) order by k.conname)','jsonb_agg(case '+' '.join(cases)+' else pg_get_constraintdef(k.oid) end order by k.conname)')
 assert new!=old
 if signature.startswith('result_data_private'):
  assert '\n select ' in new
  new=new.replace('\n select ','\n select '+' and '.join(conditions)+' and ',1)
 else:
  assert 'begin\n' in new
  new=new.replace('begin\n','begin\n'+checks,1)
 oldhash=hashlib.md5((old+'\n').encode()).hexdigest();newhash=hashlib.md5((new+'\n').encode()).hexdigest()
 needle='"'+signature+'()":"'+oldhash+'"';assert needle in newruntime,signature
 newruntime=newruntime.replace(needle,'"'+signature+'()":"'+newhash+'"')
 filebase=signature.replace('.','-')
 (p/('lifecycle-'+filebase+'-before.sql')).write_text(old+';\n');(p/('lifecycle-'+filebase+'-after.sql')).write_text(new+';\n')
 guards.append("md5(pg_get_functiondef('"+signature+"()'::regprocedure))<>"+lit(oldhash));defs.append(new+';\n')
 changed[signature]={'beforePgDefMD5':oldhash,'afterAuthoredPgDefMD5':newhash}
guards.append("md5(pg_get_functiondef('turn_data_private.runtime_supported_v1()'::regprocedure))<>"+lit(hashlib.md5((runtime+'\n').encode()).hexdigest()))
(p/'lifecycle-runtime_supported_v1-after.sql').write_text(newruntime+';\n')
guard="-- REVIEW CANDIDATE ONLY: exact QA constraint interpretation; no application schema fingerprint adoption.\n-- Three authored schema-function pins updated, all other runtime members preserved.\ndo $$begin\n if "+'\n or '.join(guards)+" then raise exception 'QA_LIFECYCLE_SOURCE_CONFLICT';end if;\nend$$;\n"
(p/'lifecycle-candidate.sql').write_text(guard+''.join(defs)+newruntime+';\n')
(p/'lifecycle-pins.json').write_text(json.dumps({'authoredFunctionChanges':changed,'unchangedTurnApplicationSchemaSHA256':'0ec0fcfc206909a38756272a65a877c6ab857c00fd114178d135837da951c73a','normalizesOnly':pairs,'activation':'NONE','runtimeChangedPins':[s+'()'for s in changed]},indent=2)+'\n')
