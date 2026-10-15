import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
async function body(req){let value='';for await(const chunk of req){value+=chunk;if(Buffer.byteLength(value)>32000)throw Error('Test adapter body too large');}return JSON.parse(value);}
async function listen(t,handler){const server=createServer(handler);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));return `http://127.0.0.1:${server.address().port}`;}

/** C0 Auth/REST adapter, not GoTrue/PostgREST. Entire registered token fixes claims;
 * payload decoding never selects a DB actor. Every RPC is a real SQL transaction. */
export async function adapter(t,{actorRpc}) {
 const tokens=new Map(),events=[],faults=[];const key='synthetic-publishable-key-'+randomBytes(12).toString('hex');
 let origin;
 const reply=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
 origin=await listen(t,async(req,res)=>{
  try{
   const url=new URL(req.url,origin),path=url.pathname;
   if(url.search)return reply(res,404,{message:'Test adapter query denied'});
   if(req.headers.apikey!==key)return reply(res,401,{code:'bad_jwt',message:'Synthetic credential rejected'});
   const token=/^Bearer (\S+)$/.exec(req.headers.authorization??'')?.[1],actor=tokens.get(token);
   if(!actor||req.headers.cookie||req.headers.origin)return reply(res,401,{code:'bad_jwt',message:'Unregistered synthetic actor'});
   if(req.method==='GET'&&path==='/auth/v1/user')return reply(res,200,{id:actor.id,aud:'authenticated',role:'authenticated',is_anonymous:false});
   const input=await body(req);
   if(req.method!=='POST')return reply(res,404,{message:'Test adapter route denied'});
   let method;
   if(path==='/rest/v1/rpc/native_session_v2'&&exact(input,['p_action'])&&input.p_action==='session')method='native_session_v2';
   else if(path==='/rest/v1/rpc/grounded_ai_assist_work_v1'&&exact(input,['p_input'])&&['selected_submit','selected_read'].includes(input.p_input?.action))method='grounded_ai_assist_work_v1';
   else return reply(res,404,{message:'Test adapter route denied'});
   const action=method==='native_session_v2'?'session':input.p_input.action;
   events.push({method,action,owner:actor.id});
   const value=await actorRpc(actor,method,input);
   const fault=faults.find(f=>f.action===action&&!f.used);
   if(fault){fault.used=true;await fault.afterCommit?.();if(fault.kind==='lost')return reply(res,200,null);if(fault.kind==='malformed')return reply(res,200,{kind:'accepted',unexpected:true});}
   return reply(res,200,value);
  }catch(e){return reply(res,400,{code:e.code??'P0001',message:e.message});}
 });
 function register(actor){const claims={sub:actor.id,session_id:actor.session,role:'authenticated',is_anonymous:false,aud:'authenticated',iss:origin+'/auth/v1',exp:Math.floor(Date.now()/1000)+3600};const token=encode({alg:'HS256',typ:'JWT'})+'.'+encode(claims)+'.'+randomBytes(32).toString('base64url');tokens.set(token,Object.freeze({...actor}));return token;}
 return {origin,key,register,events,faults};
}
/** Actual v7 handler behind a real loopback HTTP listener; no production wrapper. */
export async function productionServer(t,{handler,NextRequest}) {
 return listen(t,async(req,res)=>{
  try{
   const chunks=[];let size=0;for await(const c of req){size+=c.length;assert.ok(size<=24000);chunks.push(c);}
   const request=new NextRequest(`http://127.0.0.1${req.url}`,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});
   const result=await handler(request);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
  }catch{res.writeHead(500,{'content-type':'application/json'});res.end('{"error":{"code":"TEST_TRANSPORT_FAILURE"}}');}
 });
}
