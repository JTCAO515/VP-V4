import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtempSync,mkdirSync,chmodSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

/** Own PG17 process only. Never reads the SQL owner's local-resource/socket. */
export async function database(t,{bin,module,readSource,migrations}) {
 if(!bin||!module)throw Error('Explicit VP_WIKI_PG_BIN and VP_WIKI_PG_MODULE required');
 const version=execFileSync(join(bin,'postgres'),['--version'],{encoding:'utf8'}).trim();
 if(!/PostgreSQL\) 17\.11\b/.test(version))throw Error('Fixed PostgreSQL 17.11 required: '+version);
 const {Client}=createRequire(import.meta.url)(module);
 const root=mkdtempSync(join(tmpdir(),'a005http-'));chmodSync(root,0o700);
 const socket=join(root,'s'),data=join(root,'data');mkdirSync(socket,{mode:0o700});let running=false;
 const ctl=(...args)=>execFileSync(join(bin,'pg_ctl'),['-D',data,...args],{stdio:'pipe'});
 t.after(()=>{try{if(running)ctl('-w','stop','-m','fast');}finally{rmSync(root,{recursive:true,force:true});}});
 execFileSync(join(bin,'initdb'),['-D',data,'-U','postgres','-A','trust','--no-locale','-E','UTF8'],{stdio:'pipe'});
 ctl('-l',join(root,'postgres.log'),'-o',`-c timezone=UTC -c listen_addresses='' -c unix_socket_directories='${socket}' -c unix_socket_permissions=0700`,'-w','start');running=true;
 const connect=async()=>{const c=new Client({host:socket,user:'postgres',database:'postgres'});await c.connect();await c.query("set statement_timeout='30s';set lock_timeout='5s'");return c;};
 const query=async(sql,params=[])=>{const c=await connect();try{return await c.query(sql,params);}finally{await c.end();}};
 await query(readSource('tests/integration/turn/fixtures/durable-work-schema.sql'));
 await query("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
 for(const path of migrations){try{await query('begin;'+readSource(path)+'\ncommit;');}catch(e){throw Error(path+': '+e.message);}}
 const settings=(await query("select current_setting('listen_addresses') tcp,current_setting('unix_socket_permissions') permissions,version() version")).rows[0];
 if(settings.tcp!==''||settings.permissions!=='0700')throw Error('Private no-TCP socket invariant failed');
 return {connect,query,settings};
}
