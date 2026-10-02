/** Timing/control only. All receipts, CAS, session and consent responses come from the real frozen backend. */
import {createServer} from 'node:http';
import {randomUUID as uuid,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
export async function createNativeTravelIntakeAuthFixture(e,user,conversation,goal){
 let bearer,cas=false,hold=false;const held=new Set(),events=[],errors=[];
 const timeline=[],sessionReads=[];let heldIdentity,sessionProof;let requestSequence=0;const nativeRequests=[];
 const identity=authorization=>{
  const token=String(authorization).replace(/^Bearer /,'');const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());
  assert.equal(claims.sub,user.id);assert.equal(typeof claims.session_id,'string');
  return {owner:claims.sub,session:claims.session_id};
 };
 const fingerprint=value=>createHash('sha256').update(value).digest('hex').slice(0,16);
 const mark=kind=>timeline.push({kind,atMs:Math.round(performance.now())});
 const state={held:0,nativePosts:0,nativeReads:0,writeBasisReads:0,rivalWrites:0,denied401:0,nativeDenied401:0,denied403:0,sessionReplacements:0,withdrawals:0};
 async function backend(path,method='GET',body,authorization=bearer){
  const response=await fetch(e.api+path,{method,headers:{'Content-Type':'application/json',...(authorization?{Authorization:authorization}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const bytes=Buffer.from(await response.arrayBuffer());assert(response.headers.get('content-type')?.startsWith('application/json'),'Real fixture operation must return JSON');
  return {status:response.status,body:JSON.parse(bytes.toString())};
 }
 const base='/api/chat/native/v5/travel-intake',query='?conversationId='+conversation+'&goalId='+goal;
 const proxy=createServer(async(req,res)=>{let phase="request";try{
  const chunks=[];for await(const c of req)chunks.push(c);const bytes=Buffer.concat(chunks),path=new URL(req.url,'http://127.0.0.1').pathname;
  if(path==='/__intake/control'){
   if(req.method==='POST'){
    const body=JSON.parse(bytes);assert.equal(Object.keys(body).length,1);const op=Object.keys(body)[0];assert.equal(body[op],true);
    phase=op;
    if(op==='armCAS')cas=true;
    else if(op==='armRead')hold=true;
    else if(op==='release'){mark('release_old_response');for(const release of held)release();}
    else if(op==='replaceSession'){
     const previous=identity(bearer);mark('replacement_start');
     const attemptId=uuid(),credential=await backend('/api/auth/native/v2/credentials','POST',{email:user.email,password:user.password,attemptId},null);assert.equal(credential.status,200);
     const login=await backend('/api/auth/native/v2/login','POST',{attemptId},'Bearer '+credential.body.accessToken);assert.equal(login.status,200);state.sessionReplacements++;
     const next=identity('Bearer '+credential.body.accessToken);assert.notEqual(previous.session,next.session);
     assert(heldIdentity&&heldIdentity.session===previous.session);
     sessionProof={sameOwner:previous.owner===next.owner,expectedOwner:next.owner===user.id,changedSession:true,
      heldSessionMatchesOld:true,heldSessionHash:fingerprint(heldIdentity.session),oldSessionHash:fingerprint(previous.session),newSessionHash:fingerprint(next.session)};
     mark('replacement_login200');
     const probe=await backend(base+query);assert.equal(probe.status,401);state.denied401++;mark('old_session_probe401');
    }else if(op==='withdraw'){
     const withdrawn=await backend('/api/chat/native/v5/consent','DELETE',{policyId:e.policyId});assert.equal(withdrawn.status,200);state.withdrawals++;mark('withdraw200');
     const probe=await backend(base+query);assert.equal(probe.status,403);state.denied403++;
    }else throw Error('Unsupported owned fixture operation');
   }
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({...state,held:held.size}));return;
  }
  const requestID=++requestSequence;
  const allowedPath=path===base?'travel_intake':path===base+'/write-basis'?'write_basis':path==='/api/chat/native/v5/policy'?'policy':path==='/api/chat/native/v5/conversation'?'conversation':path==='/api/auth/native/v2/login'?'native_login':path==='/api/auth/native/v2/credentials'?'native_credentials':'other_native';
  nativeRequests.push({requestID,path:allowedPath,method:req.method,phase:'start',atMs:Math.round(performance.now())});
  if(req.headers.authorization)bearer=req.headers.authorization; // bounded local process memory only; never emitted
  if(path===base&&req.method==='POST'){
   state.nativePosts++;
   const request=JSON.parse(bytes.toString());
   if(cas){
    cas=false;phase='rival_read';const current=await backend(base+query);assert.equal(current.status,200);assert.equal(current.body.kind,'travel_intake');
    const b=current.body;
    phase='rival_write';const rival=await backend(base,'POST',{...request,messageId:uuid(),idempotencyKey:uuid(),text:'Explicit competing synthetic correction',relationship:'amendment',
     parentMessageId:b.messageId,expectedGoalVersion:b.goalVersion,expectedIntakeRevision:b.intakeRevision,intake:b.intake,memoryBasis:b.memoryBasis});
    assert.equal(rival.status,201);assert.equal(rival.body.current,true);state.rivalWrites++;
   }
  }
  const headers={...req.headers};delete headers.host;delete headers.connection;delete headers['content-length'];
  const upstream=await fetch(e.api+req.url,{method:req.method,headers,...(bytes.length?{body:bytes}:{}),redirect:'error'});
  const responseBytes=Buffer.from(await upstream.arrayBuffer());
  nativeRequests.push({requestID,path:allowedPath,method:req.method,phase:'received',status:upstream.status,atMs:Math.round(performance.now())});
  if(upstream.status===401){state.nativeDenied401++;mark('native401');}
  if(path===base||path===base+'/write-basis'){
   if(req.method==='GET'){
    path.endsWith('write-basis')?state.writeBasisReads++:state.nativeReads++;
    if(upstream.status===200){const id=identity(req.headers.authorization);sessionReads.push({kind:path.endsWith('write-basis')?'write_basis':'intake',sessionHash:fingerprint(id.session),expectedOwner:true});}
   }
   const body=JSON.parse(responseBytes.toString());
   events.push({method:req.method,kind:path.endsWith('write-basis')?'write_basis':'intake',status:upstream.status,
    ...(req.method==='POST'?{request:JSON.parse(bytes.toString()),receipt:body}:{body})});
   if(upstream.status===401)state.denied401++;if(upstream.status===403)state.denied403++;
   if(path===base&&req.method==='GET'&&hold&&upstream.status===200){heldIdentity=identity(req.headers.authorization);mark('held_read200');nativeRequests.push({requestID,path:allowedPath,phase:'held',status:200,atMs:Math.round(performance.now())});hold=false;await new Promise(resolve=>{const release=()=>{held.delete(release);resolve();};held.add(release);});}
  }
  nativeRequests.push({requestID,path:allowedPath,phase:'delivery',status:upstream.status,atMs:Math.round(performance.now())});
  res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')||'application/json','Cache-Control':'private, no-store'});res.end(responseBytes);
 }catch{
  errors.push({phase});
  res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:'OWNED_FIXTURE_CONTROL_FAILED'}}));
 }});
 await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(63252,'127.0.0.1',resolve);});
 return {api:'http://127.0.0.1:63252',control:'http://127.0.0.1:63252/__intake/control',summary:()=>({...state,held:held.size,events,errors,sessionProof,timeline,sessionReads,nativeRequests}),
  async cleanup(){bearer=null;for(const release of held)release();proxy.closeAllConnections();await new Promise(resolve=>proxy.close(resolve));}};
}
