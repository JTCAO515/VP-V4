import test,{before,after} from 'node:test';
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
const enabled=process.env.CANONICAL_PLACE_NATIVE_PG==='1';
const root='artifacts/AGENT-005/canonical-place-sql-20261015';
function run(args){const p=spawnSync(process.execPath,args,{encoding:'utf8',env:process.env,maxBuffer:4*1024*1024});process.stdout.write(p.stdout??'');process.stderr.write(p.stderr??'');if(p.status!==0)throw Error(args.join(' ')+' failed '+p.status);}
if(!enabled){
 test('canonical Place native PG17: INCOMPLETE without explicit CANONICAL_PLACE_NATIVE_PG=1',{skip:true},()=>{});
}else{
 before(()=>{
  if(!process.env.VP_WIKI_PG_BIN||!process.env.VP_WIKI_PG_MODULE)throw Error('Explicit VP_WIKI_PG_BIN and VP_WIKI_PG_MODULE required; no global PG/installation fallback');
  run(['tests/integration/canonical-place-ask-sql/inspect.mjs']);
  run(['tests/integration/canonical-place-ask-sql/legacy.mjs','before']);
  run(['tests/integration/canonical-place-ask-sql/verify-append.mjs']);
  run(['tests/integration/canonical-place-ask-sql/legacy.mjs','after']);
 });
 await import('./selected-cases.mjs');
 after(()=>{if(existsSync(root+'/local-resource.json'))run(['tests/integration/canonical-place-ask-sql/cleanup.mjs']);});
}
