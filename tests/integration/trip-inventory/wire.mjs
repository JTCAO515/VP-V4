import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const columns={trips:['id','owner_id','title','head_version','updated_at'],trip_audit_events:['id','action','proposal_id','created_at','trip_id'],trip_events:['id','resulting_version','proposal_id','event_type','created_at','trip_id'],trip_version_snapshots:['version','title','content','created_at','trip_id']};
/** Synthetic registered-token Auth/PostgREST wire adapter. Every table query uses
 * real SQL under SET LOCAL ROLE authenticated and actual RLS, never mocked rows.
 * No grants, security-definer helper or private-source reader is installed. */
export async function inventoryWire(t,db,ports){
 const tokens=new Map(),events=[],faults=[];const key='synthetic-only-'+randomBytes(12).toString('hex');let origin;
 const reply=(res,status,value,headers={})=>{res.writeHead(status,{'content-type':'application/json','x-supabase-api-version':'2024-01-01',...headers});res.end(JSON.stringify(value));};
 const server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,origin),actor=tokens.get(/^Bearer (\S+)$/.exec(req.headers.authorization??'')?.[1]);
   if(req.headers.apikey!==key||!actor||req.headers.cookie||req.headers.origin)return reply(res,401,{code:'bad_jwt',message:'Rejected synthetic token'});
   if(req.method==='GET'&&url.pathname==='/auth/v1/user')return reply(res,200,{id:actor.id,aud:'authenticated',role:'authenticated',is_anonymous:false});
   if(req.method==='POST'&&url.pathname==='/rest/v1/rpc/native_session_v2'){
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1000)throw Error('Body cap');}
    const input=JSON.parse(raw);if(JSON.stringify(input)!=='{"p_action":"session"}')throw Error('Only original session read');
    events.push({port:'session',owner:actor.id});return reply(res,200,await ports.actorRpc(actor,'native_session_v2',input));
   }
   const table=url.pathname.replace('/rest/v1/',''),allowed=columns[table];
   if(req.method!=='GET'||!allowed)throw Error('No wire write/history fallback');
   const select=url.searchParams.get('select')?.split(',');if(!select?.length||select.some(c=>!allowed.includes(c)))throw Error('Column denied');
   let where=[],params=[],order='',limit='';
   for(const[k,v]of url.searchParams){
    if(k==='select')continue;
    if(k==='order'){if(!/^(?:id\.asc|updated_at\.desc|created_at\.desc|resulting_version\.desc)$/.test(v))throw Error('Order denied');order=' order by '+v.replace('.',' ');continue;}
    if(k==='limit'){if(!/^\d+$/.test(v)||Number(v)>9)throw Error('Limit denied');limit=' limit '+v;continue;}
    if(!allowed.includes(k))throw Error('Filter denied');
    const m=/^(eq|lte)\.(.+)$/.exec(v);if(!m)throw Error('Filter denied');params.push(m[2]);where.push(k+(m[1]==='eq'?' = ':' <= ')+'$'+params.length);
   }
   const predicate=where.length?' where '+where.join(' and '):'';
   const c=await db.connect();let rows,count;
   try{
    await c.query('begin isolation level repeatable read read only');
    await c.query("select set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[actor.id,JSON.stringify({sub:actor.id,role:'authenticated',session_id:actor.session,is_anonymous:false})]);
    await c.query('set local role authenticated');
    rows=(await c.query('select '+select.join(',')+' from public.'+table+predicate+order+limit,params)).rows;
    count=Number((await c.query('select count(*) n from public.'+table+predicate,params)).rows[0].n);
    await c.query('commit');
   }catch(e){await c.query('rollback');throw e;}finally{await c.end();}
   events.push({port:table,owner:actor.id,count,query:url.search});
   const fault=faults.find(f=>!f.used&&f.table===table&&(!f.match||f.match(url)));if(fault){fault.used=true;await fault.action?.();if(fault.nullCount)count=null;if(fault.empty)rows=[];}
   const headers=req.headers.prefer?.includes('count=exact')&&count!==null?{'content-range':`0-${Math.max(rows.length-1,0)}/${count}`}:{};
   return reply(res,200,rows,headers);
  }catch(e){reply(res,400,{code:e.code??'P0001',message:e.message});}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});origin='http://127.0.0.1:'+server.address().port;
 t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 const register=actor=>{const claims={sub:actor.id,session_id:actor.session,role:actor.role??'authenticated',is_anonymous:false,aud:'authenticated',iss:origin+'/auth/v1',exp:Math.floor(Date.now()/1000)+3600};const token=encode({alg:'HS256',typ:'JWT'})+'.'+encode(claims)+'.'+randomBytes(32).toString('base64url');tokens.set(token,actor);return token;};
 return {origin,key,register,events,faults};
}
