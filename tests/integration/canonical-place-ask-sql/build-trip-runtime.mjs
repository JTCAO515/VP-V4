import {readFileSync,writeFileSync,existsSync} from 'node:fs';import assert from 'node:assert/strict';import {connect,root} from './db.mjs';
const c=await connect();try{
 const path=root+'/before/turn_private.trip_service_task_runtime_v1.sql';let source=readFileSync(path,'utf8');const m=source.match(/jsonb_each\('([^]*?)'::jsonb\) loop/);assert.ok(m);const original=m[1];const expected=JSON.parse(original);let updated=original;const delta=[];
 for(const [signature,prior] of Object.entries(expected)){
  const name=signature.replace(/\([^]*$/,'');const filename=existsSync(root+'/after/'+name+'.sql')?name:name.replace(/^public\./,'');
  if(!existsSync(root+'/after/'+filename+'.sql'))continue;
  const authored=readFileSync(root+'/after/'+filename+'.sql','utf8').match(/AS \$function\$([^]*?)\$function\$/)[1];
  const r=(await c.query("select p.prosrc,pg_get_functiondef(p.oid) definition,jsonb_build_object('source',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),'definition',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'owner',pg_get_userbyid(p.proowner),'secdef',p.prosecdef,'acl',p.proacl::text,'config',p.proconfig,'kind',p.prokind::text,'language',l.lanname) metadata from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=to_regprocedure($1)",[signature])).rows[0];assert.equal(r.prosrc,authored,signature+' must be the known authored body');
  const actual=r.metadata;for(const key of Object.keys(prior).filter(k=>!['source','definition'].includes(k)))assert.deepEqual(actual[key],prior[key],signature+' '+key);
  if(prior.source===actual.source&&prior.definition===actual.definition)continue;
  const marker=JSON.stringify(signature)+':';const start=updated.indexOf(marker)+marker.length;assert.ok(start>=marker.length);let end=start;let depth=0,inString=false,escape=false;
  for(;end<updated.length;end++){const ch=updated[end];if(inString){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch==='"')inString=false;}else if(ch==='"')inString=true;else if(ch==='{')depth++;else if(ch==='}'&&--depth===0){end++;break;}}
  const old=updated.slice(start,end);assert.deepEqual(JSON.parse(old),prior);
  const next=old.replace(prior.source,actual.source).replace(prior.definition,actual.definition);updated=updated.slice(0,start)+next+updated.slice(end);delta.push({signature,before:{source:prior.source,definition:prior.definition},after:{source:actual.source,definition:actual.definition}});
 }
 assert.ok(delta.length>0);for(const key of Object.keys(expected))if(!delta.some(d=>d.signature===key))assert.deepEqual(JSON.parse(updated)[key],expected[key]);
 source=source.replace(original,updated);writeFileSync(root+'/after/turn_private.trip_service_task_runtime_v1.sql',source+';\n');writeFileSync(root+'/trip-runtime-delta.json',JSON.stringify({acceptedBase:'ead1efc19f2f540d9056eb37ed90333388b0c8a9',expectedMembers:Object.keys(expected).length,changedAuthoredMembers:delta,otherEntriesUnchanged:true,metadataUnchanged:true},null,2)+'\n');console.log('KNOWN_TRIP_RUNTIME_HASH_DELTA',delta.length,'of',Object.keys(expected).length,'members');
}finally{await c.end();}
