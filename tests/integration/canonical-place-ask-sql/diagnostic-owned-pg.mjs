// Closure-owned local fixture resources. This helper never reads a shared pointer.
import {mkdtempSync,mkdirSync,chmodSync,writeFileSync,readFileSync,existsSync,lstatSync,rmSync} from 'node:fs';
import {spawnSync,execFileSync} from 'node:child_process';import {join} from 'node:path';import {tmpdir} from 'node:os';import {createRequire} from 'node:module';
export const diagnosticArtifactRoot='artifacts/AGENT-005/canonical-place-sql-20261015';
export function createDiagnosticPg({bin=process.env.VP_WIKI_PG_BIN,module=process.env.VP_WIKI_PG_MODULE}={}){
 if(!bin||!module)throw Error('Explicit diagnostic PG17 bin/module required before allocation');
 const runRoot=mkdtempSync(join(tmpdir(),'a005-diagnostic-'));chmodSync(runRoot,0o700);const nonce=join(runRoot,'pg'),socket=join(nonce,'s'),data=join(nonce,'data'),descriptorPath=join(runRoot,'resource.json');mkdirSync(nonce,{mode:0o700});mkdirSync(socket,{mode:0o700});mkdirSync(data,{mode:0o700});
 const ownership=[runRoot,nonce,socket,data].map(path=>{const s=lstatSync(path);return {path,dev:s.dev,ino:s.ino};});const descriptor=Object.freeze({nonce,socket,data,bin,projectId:'4f2191db-3e04-4042-94b5-ec94ff67b427',permissions:'danger-full-access; approval never',effectiveModel:'UNKNOWN'});let closed=false,launched=false;
 writeFileSync(descriptorPath,JSON.stringify(descriptor),{mode:0o600,flag:'wx'});
 return Object.freeze({descriptor,descriptorPath,
  bootstrap(source,{preserveSnapshots=false}={}){
   if(closed||launched)throw Error('Diagnostic bootstrap is single-use');
   const nonceLine=/^const nonce=mkdtempSync[^\n]+\n/m,sharedLine=/^writeFileSync\(join\(root,'local-resource.json'\)[^\n]+\n/m;
   if(!nonceLine.test(source)||!sharedLine.test(source))throw Error('Unrecognized diagnostic bootstrap ownership anchors');
   source=source.replace(nonceLine,`const nonce=${JSON.stringify(nonce)},socket=${JSON.stringify(socket)},data=${JSON.stringify(data)};\n`).replace(sharedLine,`writeFileSync(${JSON.stringify(descriptorPath)},JSON.stringify({nonce,socket,data,bin}),{mode:0o600});\n`);
   if(source.includes('local-resource.json'))throw Error('Diagnostic bootstrap may not use shared resource');
   // Diagnostics must not rewrite versioned before-source snapshots from a live replay.
   const snapshotAt=source.indexOf('const requested=');
   if(snapshotAt>=0&&!preserveSnapshots)source=source.slice(0,snapshotAt)+'await c.end();\n';
   const path=join(runRoot,'bootstrap.mjs');writeFileSync(path,source,{mode:0o600,flag:'wx'});launched=true;
   return spawnSync(process.execPath,[path],{env:{...process.env,VP_WIKI_PG_BIN:bin,VP_WIKI_PG_MODULE:module},encoding:'utf8',maxBuffer:1024*1024});
  },
  async connect(){if(closed||!launched)throw Error('No diagnostic bootstrap');const {Client}=createRequire(import.meta.url)(module);const c=new Client({host:socket,user:'postgres',database:'postgres',statement_timeout:20000});await c.connect();return c;},
  cleanup(){
   if(closed)return;
   // Only paths allocated in this closure, verified by identity, can be touched.
   for(const o of ownership){const s=lstatSync(o.path);if(s.isSymbolicLink()||s.dev!==o.dev||s.ino!==o.ino)throw Error('Diagnostic ownership identity changed');}
   if(existsSync(data)){
    if(lstatSync(data).isSymbolicLink())throw Error('Diagnostic data directory is a symlink');
    const pid=join(data,'postmaster.pid');
    if(existsSync(pid)){
     if(readFileSync(pid,'utf8').split('\n')[1]!==data)throw Error('Postmaster data directory does not match allocated diagnostic');
     const status=spawnSync(join(bin,'pg_ctl'),['-D',data,'status'],{encoding:'utf8'});
     if(status.status===0)execFileSync(join(bin,'pg_ctl'),['-D',data,'stop','-m','fast','-w'],{stdio:'pipe'});
     else if(status.status!==3)throw Error('Diagnostic PG status unknown; preserving owned directory');
    }
   }
   rmSync(runRoot,{recursive:true,force:false});closed=true;
  }
 });
}
