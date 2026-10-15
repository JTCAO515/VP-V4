import {readFileSync,writeFileSync,existsSync} from 'node:fs';import {createHash} from 'node:crypto';import {connect,root} from './db.mjs';
const names=['public.knowledge_read_v1','trip_support_private.claim_basis','trip_support_private.mapping_basis','place_actions_private.sources_v1','public.read_place_action_context_v1'];
const pins=[];const c=await connect();try{for(const name of names){const before=readFileSync(root+'/before/'+(existsSync(root+'/before/'+name+'.sql')?name:name.replace(/^public\./,''))+'.sql','utf8');
 const row=(await c.query("select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,pg_get_userbyid(proowner) owner,proacl::text acl,proconfig config,prosecdef definer,provolatile volatility,proisstrict strict,proparallel parallel,prokind kind from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname||'.'||p.proname=$1",[name])).rows;
 if(row.length!==1||row[0].definition!==before)throw Error('dependency mismatch '+name);const {definition,...p}=row[0];const md5=createHash('md5').update(before).digest('hex');pins.push({...p,signature:p.signature.includes('.')?p.signature:'public.'+p.signature,beforeMd5:md5,afterMd5:md5});}
 writeFileSync(root+'/dependency-pins.json',JSON.stringify(pins,null,2)+'\n');console.log('FIXED_ORIGINAL_SOURCE_CHAIN_DEPENDENCIES',pins.length);
}finally{await c.end();}
