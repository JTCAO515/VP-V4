import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

test('isolated PostgreSQL reminder storage, owner/session rejection, replay, transitions and rollback', {skip:process.env.VP_REMINDER_DB_TEST!=='1'}, async()=>{
 const name='vpj30-'+randomUUID().slice(0,8);
 const command=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe']});
 const sql=q=>command(['exec','-i',name,'psql','-h','/tmp/reminder-socket','-U','postgres','-d','reminder_test','-Atq','-v','ON_ERROR_STOP=1'],q).trim();
 let created=false;
 try {
  command(['run','--pull=never','--rm','-d','--name',name,'--network','none','--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.155','-c','umask 077; mkdir /tmp/reminder-socket; initdb -D /tmp/reminder-data -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/reminder-data -c listen_addresses= -c unix_socket_directories=/tmp/reminder-socket -c unix_socket_permissions=0700']);created=true;
  let ready=false; for(let i=0;i<80;i++){if(spawnSync('docker',['exec',name,'pg_isready','-h','/tmp/reminder-socket','-U','postgres']).status===0){ready=true;break;}await new Promise(r=>setTimeout(r,250));}assert.ok(ready);
  command(['exec',name,'createdb','-h','/tmp/reminder-socket','-U','postgres','reminder_test']);
  // Minimal Auth/Trip schema fixtures; real PostgreSQL roles and the existing
  // mobile-access/guard function bodies. This is not GoTrue or HTTP acceptance.
  sql(`create role authenticated; create role anon; create schema auth; create schema identity_private;
    create table auth.users(id uuid primary key);
    create table auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz default now());
    create function auth.uid() returns uuid language sql as $$select current_setting('request.jwt.claims',true)::jsonb->>'sub'$$;
  `.replace("select current_setting('request.jwt.claims',true)::jsonb->>'sub'","select (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid"));
  sql(`create function auth.jwt() returns jsonb language sql as $$select current_setting('request.jwt.claims',true)::jsonb$$;
    grant usage on schema auth,identity_private to authenticated;
    create table identity_private.mobile_accounts(owner_id uuid primary key,session_id uuid);
    create table identity_private.mobile_attempts(session_id uuid);
    create table identity_private.mobile_login_proofs(session_id uuid);
    create table public.trips(id uuid primary key,owner_id uuid references auth.users(id),head_version integer);
    create table public.trip_days(trip_id uuid,trip_date date,time_zone text);`);
  const source=readFileSync('supabase/migrations/20260909223841_vpj_04_native_mobile_sessions.sql','utf8');
  for(const fn of ['mobile_access_v2','guard_mobile_rpc_v2']) {
   const definition=source.match(new RegExp('create function identity_private\\.'+fn+'\\(\\)[\\s\\S]*?end \\$\\$;'))?.[0];assert.ok(definition);sql(definition);
  }
  sql(readFileSync('supabase/migrations/20260922002626_vpj_30_travel_reminders.sql','utf8'));
  const owner=randomUUID(), other=randomUUID(), session=randomUUID(), trip=randomUUID(), id=randomUUID();
  sql(`insert into auth.users values('${owner}'),('${other}');insert into auth.sessions(id,user_id) values('${session}','${owner}');insert into identity_private.mobile_accounts values('${owner}','${session}');insert into identity_private.mobile_attempts values('${session}');insert into public.trips values('${trip}','${owner}',2);`);
  const claims=JSON.stringify({sub:owner,session_id:session,role:'authenticated',is_anonymous:false});
  const prefix=`set role authenticated;set request.jwt.claims='${claims}';`;
  const body={id,baseVersion:2,reason:'Meet guide',dueAt:new Date(Date.now()+3600000).toISOString(),expiresAt:new Date(Date.now()+7200000).toISOString(),timeZone:'Asia/Shanghai',purpose:'user_set_travel',consent:true};
  const call=(action,input={})=>JSON.parse(sql(prefix+`select public.travel_reminders_v1('${trip}','${action}','${JSON.stringify(input)}');`));
  assert.equal(call('create',body).reminders.length,1);
  assert.equal(call('create',body).reminders.length,1);
  assert.throws(()=>call('create',{...body,id:randomUUID()}));
  assert.throws(()=>call('create',{...body,reason:'changed'}));
  assert.throws(()=>call('create',{...body,id:randomUUID(),consent:false}));
  assert.throws(()=>call('create',{...body,id:randomUUID(),baseVersion:1}));
  assert.equal(call('list').archived,null);
  assert.equal(call('cancel',{id}).reminders[0].status,'cancelled');
  assert.equal(call('create',body).reminders[0].status,'cancelled');
  assert.equal(call('complete',{id}).reminders[0].status,'cancelled');
  assert.throws(()=>sql(prefix+`update public.travel_reminders set status='saved';`));
  assert.throws(()=>sql(`set role anon;select public.travel_reminders_v1('${trip}','list');`));
  assert.equal(sql(`set role authenticated;set request.jwt.claims='${JSON.stringify({sub:other})}';select count(*) from public.travel_reminders;`),'0');
  sql(`create table public.trip_archives(trip_id uuid,owner_id uuid);insert into public.trip_archives values('${trip}','${owner}');`);
  assert.equal(call('list').archived,true);
  // A long resolved history must never hide an open reminder or permit unbounded opens.
  sql(`insert into public.travel_reminders(id,owner_id,trip_id,session_id,base_version,reason,due_at,expires_at,time_zone,status)
    select gen_random_uuid(),'${owner}','${trip}','${session}',2,'old-'||n,now()+interval '1 hour',now()+interval '2 hours','Asia/Shanghai','completed' from generate_series(1,110) n;`);
  for(let n=0;n<50;n++) call('create',{...body,id:randomUUID(),reason:'open-'+n});
  assert.equal(call('list').reminders.filter(r=>r.status==='saved').length,50);
  assert.throws(()=>call('create',{...body,id:randomUUID(),reason:'over-limit'}));
  sql(`update identity_private.mobile_accounts set session_id=null where owner_id='${owner}';`);
  assert.throws(()=>call('list'));
  sql(`delete from auth.users where id='${other}';begin;delete from public.trips where id='${trip}';rollback;`);
  assert.equal(sql('select count(*) from public.travel_reminders;'),'161');
  sql(`delete from public.trips where id='${trip}';`);
  assert.equal(sql('select count(*) from public.travel_reminders;'),'0');
 } finally { if(created)command(['rm','-f',name]); }
});
