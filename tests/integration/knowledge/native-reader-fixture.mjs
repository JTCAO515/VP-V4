/** Explicit loopback UI regression only; never a knowledge or identity service. */
import http from 'node:http';
let refreshes=0, reads=0, revoked=false, disabled=false;
const fixture=http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1:59654');
 const reply=(body,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body));};
 if(u.pathname==='/control'){
  let body='';for await(const part of req)body+=part;
  const input=JSON.parse(body||'{}');if(input.reset){refreshes=0;reads=0;revoked=false;disabled=false;}
  if(input.revoked)revoked=true;if(input.disabled)disabled=true;
  return reply({refreshes,reads,revoked,disabled});
 }
 if(u.pathname.endsWith('/credentials')){refreshes=0;reads=0;return reply({subject:'knowledge-ui-only',accessToken:'synthetic-near-expiry',refreshToken:'synthetic-refresh',expiresAt:Date.now()/1000+5});}
 if(u.pathname.endsWith('/refresh')){refreshes++;await new Promise(r=>setTimeout(r,350));return reply({subject:'knowledge-ui-only',accessToken:'synthetic-refreshed',refreshToken:'synthetic-refresh',expiresAt:Date.now()/1000+5,mobileEpoch:1});}
 if(u.pathname.endsWith('/profile'))return reply({subject:'knowledge-ui-only',displayName:'Knowledge UI fixture'});
 if(u.pathname.startsWith('/api/auth/native/v2/'))return reply({subject:'knowledge-ui-only',mobileEpoch:1});
 if(u.pathname==='/api/knowledge/native/v1'){
  reads++;if(disabled)return reply({error:{code:'KNOWLEDGE_DISABLED'}},503);
  if(req.headers.authorization!=='Bearer synthetic-refreshed'||req.headers.cookie||req.headers.origin)return reply({error:{code:'UNAUTHENTICATED'}},401);
  const scope=Object.fromEntries(u.searchParams),zh=scope.locale==='zh';
  const statements=scope.scene==='payment'&&!revoked?[{factId:'11111111-1111-4111-8111-111111111111',version:1,assertionId:'22222222-2222-4222-8222-222222222222',assertionRevision:1,assertion:{subjectId:'fixture',predicate:'accepts_method',objectId:'card',conditions:['operator_support'],exclusions:['success_guarantee']},text:zh?'本机合成知识：核对商户受理方式。':'Local synthetic note: check merchant acceptance.',conditions:[zh?'向经营方核对。':'Check with the operator.'],exclusions:[zh?'不保证交易成功。':'No success guarantee.'],reviewedAt:new Date(Date.now()-2000).toISOString(),publishedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),sources:[{sourceRevisionId:'33333333-3333-4333-8333-333333333333',publisher:'Synthetic fixture source',uri:'https://example.test/fixture',locator:'UI regression only'}]}]:[];
  return reply({data:{schemaVersion:'knowledge-read/1',evaluatedAt:new Date().toISOString(),scope,purpose:'trip_planning',recipient:'first_party',territory:'CN-mainland',status:statements.length?'available':'no_eligible_content',statements}});
 }
 reply({error:{code:'NOT_FOUND'}},404);
});
fixture.listen(59654,'127.0.0.1',()=>console.log('Synthetic native knowledge fixture ready on127.0.0.1:59654'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>fixture.close(()=>process.exit()));
