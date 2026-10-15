import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {connect,root} from './db.mjs';
const hash=s=>createHash('md5').update(s).digest('hex');
const c=await connect();
const changes=[];
try{
 for(const name of readdirSync(root+'/after').filter(n=>n.endsWith('.sql')).sort()){
  const before=readFileSync(join(root,'before',name),'utf8');const after=readFileSync(join(root,'after',name),'utf8');
  const qualified=after.match(/FUNCTION ([^(]+)\(/)[1];
  const rows=(await c.query(`select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,pg_get_userbyid(proowner) owner,proacl::text acl,proconfig config,prosecdef definer,provolatile volatility,proisstrict strict,proparallel parallel,prokind kind from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname||'.'||p.proname=$1`,[qualified])).rows;
  if(rows.length!==1)throw Error('ambiguous authored function '+qualified);
  const row=rows[0];
  const authoredBody=after.match(/AS \$function\$([^]*?)\$function\$/)[1];const actualBody=row.definition.match(/AS \$function\$([^]*?)\$function\$/)[1];
  if(authoredBody!==actualBody)throw Error('authored after not applied '+qualified);
  const signature=row.signature.includes('.')?row.signature:'public.'+row.signature;
  changes.push({signature,beforeMd5:hash(before),afterMd5:hash(row.definition),owner:row.owner,acl:row.acl,config:row.config,definer:row.definer,volatility:row.volatility,strict:row.strict,parallel:row.parallel,kind:row.kind});
 }
 writeFileSync(root+'/function-pins.json',JSON.stringify(changes,null,2)+'\n');console.log('FROZEN_AUTHORED_FUNCTIONS',changes.length);
}finally{await c.end();}
