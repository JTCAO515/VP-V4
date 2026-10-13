from pathlib import Path
import json,hashlib,re
p=Path('artifacts/QAWEB/sql-20261013');old=(p/'lifecycle-schema_supported_v1-before.sql').read_text();runtime=(p/'lifecycle-runtime_supported_v1-before.sql').read_text();before=json.loads((p/'constraints-before.json').read_text());after=json.loads((p/'constraints-after.json').read_text())
pairs=[('turn_private.text_policies','text_policies_context_mode_check'),('turn_private.service_task_turns','service_task_turns_relationship_check')]
def lit(v):return "'"+v.replace("'","''")+"'"
checks='\n -- QA v1 accepts exactly the authored extensions; every other schema member stays in the original digest.\n'
cases=[]
for relation,name in pairs:
 assert before[name]!=after[name]
 predicate="k.conrelid="+lit(relation)+"::regclass and k.conname="+lit(name)
 checks+=' if (select pg_get_constraintdef(k.oid) from pg_constraint k where '+predicate+') is distinct from '+lit(after[name])+" then return false;end if;\n"
 cases.append('when '+predicate+' then '+lit(before[name]))
new=old.replace('begin\n','begin\n'+checks,1).replace('jsonb_agg(pg_get_constraintdef(k.oid) order by k.conname)','jsonb_agg(case '+' '.join(cases)+' else pg_get_constraintdef(k.oid) end order by k.conname)')
oldhash=hashlib.md5((old+'\n').encode()).hexdigest();newhash=hashlib.md5((new+'\n').encode()).hexdigest()
needle='"turn_data_private.schema_supported_v1()":"'+oldhash+'"';assert needle in runtime
newruntime=runtime.replace(needle,'"turn_data_private.schema_supported_v1()":"'+newhash+'"');assert newruntime!=runtime
(p/'lifecycle-schema_supported_v1-after.sql').write_text(new+';\n');(p/'lifecycle-runtime_supported_v1-after.sql').write_text(newruntime+';\n')
guard="""-- REVIEW CANDIDATE ONLY: exact QA constraint interpretation, no new schema fingerprint.
-- Old accepted application schema digest remains unchanged. Runtime updates ONE authored function pin.
do $$begin
 if md5(pg_get_functiondef('turn_data_private.schema_supported_v1()'::regprocedure))<>%s
 or md5(pg_get_functiondef('turn_data_private.runtime_supported_v1()'::regprocedure))<>%s then raise exception 'QA_LIFECYCLE_SOURCE_CONFLICT';end if;
end$$;
"""%(lit(oldhash),lit(hashlib.md5((runtime+'\n').encode()).hexdigest()))
(p/'lifecycle-candidate.sql').write_text(guard+new+';\n'+newruntime+';\n')
(p/'lifecycle-pins.json').write_text(json.dumps({'schemaBeforePgDefMD5':oldhash,'schemaAfterAuthoredPgDefMD5':newhash,'unchangedApplicationSchemaSHA256':'0ec0fcfc206909a38756272a65a877c6ab857c00fd114178d135837da951c73a','normalizesOnly':pairs,'activation':'NONE','runtimeChangedPins':['turn_data_private.schema_supported_v1()']},indent=2)+'\n')
