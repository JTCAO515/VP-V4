// Explicit disposable consumer environment; no repository .env or default database discovery.
import { identityLocalEnv } from '../identity/local-supabase.mjs';
import { waitForNativeAPI } from '../identity/native-api-readiness.mjs';
import { createClient } from '@supabase/supabase-js';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
const e=identityLocalEnv();
if(!e || e.API_URL!=='http://127.0.0.1:59821' || e.DB_CONTAINER!=='supabase_db_vp-native-session-replay-20260910')throw Error('Only the explicit same-Trip disposable target is permitted');
const directory='/Users/jtcao/Library/Caches/visepanda/native-local-trip';
const file=directory+'/consumers.json';
const users=[];
const key=e.PUBLISHABLE_KEY || e.ANON_KEY;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','59931'],{env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:e.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key,VISEPANDA_NATIVE_LOCAL_SESSION:'true',VISEPANDA_NATIVE_LOCAL_SERVICE_KEY:e.SERVICE_ROLE_KEY,VISEPANDA_NATIVE_LOCAL_TRIP:'true'},stdio:'ignore'});
let cleaning=false;
async function cleanup(){
 if(cleaning)return;cleaning=true;server.kill('SIGTERM');
 if(users.length){const ids=users.map(u=>"'"+u.id+"'").join(',');const remaining=execFileSync('docker',['exec','-i',e.DB_CONTAINER,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],{input:`delete from public.trip_events where owner_id in (${ids}); delete from public.trip_audit_events where owner_id in (${ids}); delete from auth.users where id in (${ids}); select count(*) from auth.users where id in (${ids});`,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();if(remaining!=='0')throw Error('Exact consumer cleanup failed');}
 try{unlinkSync(file);}catch{}
}
try {
 await waitForNativeAPI('http://127.0.0.1:59931',server);
 for(const role of ['shared','other']){
  const email='vpj05-'+role+'-'+randomUUID()+'@example.test',password='Local-Synthetic-'+randomUUID();
  const client=createClient(e.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const r=await client.auth.signUp({email,password});
  if(r.data.user)users.push({id:r.data.user.id,email,password});
  if(r.error || !r.data.user)throw Error('Consumer synthetic account setup failed');
 }
 mkdirSync(directory,{recursive:true,mode:0o700});
 writeFileSync(file,JSON.stringify({apiURL:'http://127.0.0.1:59931',tripApiBase:'/api/trips/native/v2',email:users[0].email,password:users[0].password,ownerId:users[0].id,otherEmail:users[1].email,otherPassword:users[1].password,otherOwnerId:users[1].id}),{mode:0o600});
 console.log('Local consumer API ready on 59931; synthetic inputs available only in the protected local file.');
 await new Promise(resolve=>{process.once('SIGTERM',resolve);process.once('SIGINT',resolve);server.once('exit',resolve);});
} finally {await cleanup();}
