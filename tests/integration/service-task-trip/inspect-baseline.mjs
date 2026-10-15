import {nativeDatabase} from './native-db.mjs';
import {writeFileSync} from 'node:fs';
const cleanups=[];
try{
 const {db,upgrade}=await nativeDatabase({after:f=>cleanups.push(f)});
 const funcs=await db("select p.oid::regprocedure::text signature,prosrc,pg_get_functiondef(p.oid) definition,proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('result_data_private','conversation_data_private','turn_data_private','profile_data_private','export_private') and (p.proname like '%supported%' or p.proname like '%runtime%' or p.proname in('schema_v1','sources_v1','write_hooks_valid_v1')) order by signature");
 writeFileSync('artifacts/AGENT-008/trip-settlement-20261015/lifecycle-baseline-functions.json',JSON.stringify(funcs));
 console.log(funcs.map(f=>[f.signature,f.prosrc.length]));
 await db('begin;'+upgrade+'commit;');
 for(const f of funcs.filter(f=>/supported_v1\(\)|runtime_v1\(\)|schema_v1\(\)|write_hooks_valid_v1\(\)/.test(f.signature))){try{console.log(f.signature,await db('select '+f.signature+' result'));}catch(e){console.log(f.signature,e.message);}}
}finally{for(const f of cleanups)await f();}
