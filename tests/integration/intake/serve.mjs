import http from 'node:http';
import { startIntakeDatabase } from './environment.mjs';
const db=await startIntakeDatabase();
db.sql('update research_intake_private.settings set enabled=true');
// Supabase API normally mounts PostgREST at /rest/v1. This local gateway changes
// only that prefix; all RPC validation, transactions and data are real PostgreSQL.
const proxy=http.createServer(async(req,res)=>{
  if(!req.url?.startsWith('/rest/v1/')){res.writeHead(404);res.end();return;}
  try{
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4096){res.writeHead(413);res.end();return;}chunks.push(chunk);}
    const response=await fetch(db.url+req.url.slice('/rest/v1'.length),{method:req.method,headers:{'content-type':'application/json'},body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks),signal:AbortSignal.timeout(8000)});
    res.writeHead(response.status,{'content-type':'application/json','cache-control':'no-store'});res.end(await response.text());
  }catch{res.writeHead(503);res.end();}
});
proxy.listen(56963,'127.0.0.1',()=>console.log('Real local intake DB ready. NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:56963 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_local_intake_test VISEPANDA_RESEARCH_INTAKE=true. Stop with Ctrl-C.'));
let stopping=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{if(stopping)return;stopping=true;proxy.close();db.stop();process.exit(0);});
