import {execFileSync} from 'node:child_process';
import {mkdtempSync,chmodSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function nativeDatabase(t){
 const bin=process.env.VP_TRIP_PG_BIN,module=process.env.VP_TRIP_PG_MODULE;
 if(!bin||!module)throw new Error('Private native PostgreSQL flags required');
 const {default:pg}=await import(pathToFileURL(module).href);
 const root=mkdtempSync(join(tmpdir(),'agent008-trip-'));chmodSync(root,0o700);
 const data=join(root,'data');let running=false;
 const ctl=(...a)=>execFileSync(join(bin,'pg_ctl'),['-D',data,...a],{stdio:['ignore','pipe','pipe']});
 t.after(()=>{try{if(running)ctl('stop','-m','fast','-w');}finally{rmSync(root,{recursive:true,force:true});}});
 execFileSync(join(bin,'initdb'),['-D',data,'-U','postgres','-A','trust','--no-locale','-E','UTF8'],{stdio:['ignore','pipe','pipe']});
 ctl('start','-w','-l',join(root,'postgres.log'),'-o',`-c listen_addresses='' -c unix_socket_directories='${root}' -c unix_socket_permissions=0700`);running=true;
 const db=async(sql,params=[])=>{const c=new pg.Client({host:root,user:'postgres',database:'postgres'});await c.connect();try{const r=await c.query(sql,params);return Array.isArray(r)?r.at(-1).rows:r.rows;}finally{await c.end();}};
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
 await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
 const seed='20261015034446_agent008_trip_service_task_settlement_current.sql';
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f<seed).sort()){
  try{await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');}catch(e){throw new Error('Historical migration '+f+': '+e.message);}
 }
 return {db,upgrade:readFileSync('supabase/migrations/'+seed,'utf8')};
}
