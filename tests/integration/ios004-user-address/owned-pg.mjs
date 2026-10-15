// Closure-owned local SQL fixture. No TCP, shared pointer, or target credentials.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, chmodSync, lstatSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
export function createOwnedPg({
 bin=process.env.IOS004_PG_BIN ?? process.env.VP_WIKI_PG_BIN,
 module=process.env.IOS004_PG_MODULE ?? process.env.VP_WIKI_PG_MODULE,
 execute=execFileSync,
}={}) {
 if(!bin||!module)throw Error('Explicit PG17 bin/module required');
 if(!/PostgreSQL\) 17\./.test(execute(join(bin,'postgres'),['--version'],{encoding:'utf8'})))throw Error('PostgreSQL17 required');
 const {Client}=createRequire(import.meta.url)(module);
 const root=mkdtempSync(join(tmpdir(),'ios004-'));chmodSync(root,0o700);
 const socket=join(root,'s'),data=join(root,'d');
 mkdirSync(socket,{mode:0o700});mkdirSync(data,{mode:0o700});
 const ownership=[root,socket,data].map(path=>{const s=lstatSync(path);return {path,dev:s.dev,ino:s.ino};});
 let closed=false,bootstrapped=false,client;
 const verify=()=>{
  if(closed)throw Error('Owned fixture already closed');
  for(const old of ownership){const s=lstatSync(old.path);if(s.isSymbolicLink()||!s.isDirectory()||s.dev!==old.dev||s.ino!==old.ino)throw Error('Owned resource identity changed');}
 };
 return Object.freeze({
  descriptor:Object.freeze({root,socket,data}),
  start(){
   verify();if(bootstrapped)throw Error('Owned bootstrap already attempted');bootstrapped=true;
   execute(join(bin,'initdb'),['-D',data,'-U','postgres','-A','trust','--no-locale','-E','UTF8'],{stdio:'pipe'});
   verify();
   execute(join(bin,'pg_ctl'),['-D',data,'-l',join(root,'log'),'-o',`-c timezone=UTC -c listen_addresses='' -c unix_socket_directories='${socket}' -c unix_socket_permissions=0700`,'-w','start'],{stdio:'pipe'});
   verify();
  },
  async connect({database='postgres'}={}){
   verify();if(!bootstrapped||client)throw Error('Owned connection unavailable');
   client=new Client({host:socket,user:'postgres',database});await client.connect();return client;
  },
  async cleanup(){
   const failures=[];
   // Connection failure/end failure cannot bypass resource cleanup.
   try{if(client){const current=client;client=undefined;await current.end();}}catch(error){failures.push(error);}
   try{
    verify();
    const pid=join(data,'postmaster.pid');
    if(existsSync(pid)){
     if(readFileSync(pid,'utf8').split('\n')[1]!==data)throw Error('Owned postmaster data mismatch');
     // Directory identities were captured before initdb, including on partial startup failure.
     execute(join(bin,'pg_ctl'),['-D',data,'stop','-m','fast','-w'],{stdio:'pipe'});
    }
    verify();rmSync(root,{recursive:true});closed=true;
   }catch(error){failures.push(error);}
   if(failures.length)throw new AggregateError(failures,'Owned fixture cleanup failed; changed resources preserved');
  },
 });
}
export async function ownedPg(options){
 const owner=createOwnedPg(options);
 try{owner.start();return {client:await owner.connect(),cleanup:()=>owner.cleanup()};}
 catch(error){try{await owner.cleanup();}catch(cleanup){throw new AggregateError([error,cleanup],'Owned startup/cleanup failed; resources preserved');}throw error;}
}
