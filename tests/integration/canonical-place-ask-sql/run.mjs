import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
const root='artifacts/AGENT-005/canonical-place-sql-20261015';
function run(args){const p=spawnSync(process.execPath,args,{encoding:'utf8',env:process.env,maxBuffer:4*1024*1024});process.stdout.write(p.stdout??'');process.stderr.write(p.stderr??'');if(p.status!==0)throw Error(args.join(' ')+' failed '+p.status);}
try{
 run(['tests/integration/canonical-place-ask-sql/inspect.mjs']);
 run(['tests/integration/canonical-place-ask-sql/legacy.mjs','before']);
 run(['tests/integration/canonical-place-ask-sql/verify-append.mjs']);
 run(['tests/integration/canonical-place-ask-sql/legacy.mjs','after']);
 run(['--test','tests/integration/canonical-place-ask-sql/selected.test.mjs']);
}finally{if(existsSync(root+'/local-resource.json'))run(['tests/integration/canonical-place-ask-sql/cleanup.mjs']);}
