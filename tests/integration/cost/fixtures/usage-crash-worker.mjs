import {openSync,writeSync,fsyncSync,closeSync} from 'node:fs';
import {runTextWorker} from '../../../../lib/server/turn/text-worker.ts';
import {PROTOCOL_MODELS} from '../../../../lib/server/model-gateway/adapters/provider-protocol.ts';
import {rpc} from './postgres-rpc.mjs';
const [container,serialized,journal]=process.argv.slice(2),value=JSON.parse(serialized);
const {job,turnId,leaseToken}=value;
await runTextWorker(async(name)=>{
 if(name==='claim_turn_work')return {kind:'leased',turnId,ownerId:job.ownerId,leaseToken,attempt:1,leaseMs:120000};
 throw Error('Unexpected completion before crash');
},async name=>{
 if(name==='read_text_work')return {kind:'input',text:'Synthetic crash input',policyId:job.policyId,provider:'qwen',endpoint:job.provider.endpoint,locale:'en'};
 if(name==='authorize_text_dispatch')return {kind:'authorized'};
 throw Error('Unexpected text operation');
},rpc(container),job.budget,{provider:'qwen',endpoint:job.provider.endpoint,price:()=>60,
 transport:async()=>Response.json({model:PROTOCOL_MODELS.qwen,choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:'{"outcome":"answered","text":"Synthetic response"}'}}],usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15}}),
 recordUsage:async receipt=>{const fd=openSync(journal,'wx',0o600);try{writeSync(fd,JSON.stringify(receipt)+'\n');fsyncSync(fd);}finally{closeSync(fd);}process.stdout.write('DURABLE_USAGE\n');await new Promise(()=>{});},
},new AbortController().signal);
