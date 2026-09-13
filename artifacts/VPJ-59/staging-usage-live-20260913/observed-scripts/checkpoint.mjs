import fs from 'node:fs';import {spawn} from 'node:child_process';
const end=Date.now()+120000;while(!fs.existsSync('fault-ready.json')){if(fs.existsSync('fault-process-result.json')||Date.now()>end)throw Error('Fault checkpoint unavailable');await new Promise(r=>setTimeout(r,150));}
try{const child=spawn(process.execPath,['observe.mjs','held'],{stdio:['ignore','inherit','inherit']});const code=await new Promise(r=>child.once('close',r));if(code!==0)throw Error('Hold observation failed');}finally{fs.writeFileSync('kill-worker','kill after checkpoint\n',{mode:0o600});}
