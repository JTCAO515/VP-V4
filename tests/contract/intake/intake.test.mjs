import test from 'node:test';
import assert from 'node:assert/strict';
import { handleIntake } from '../../../lib/server/intake/http.ts';
import { parseIntakeInput, INTAKE_POLICY } from '../../../lib/server/intake/contract.ts';
const input={action:'apply',email:' Visitor@example.test ',locale:'zh',researchConsent:true,marketingConsent:false,policyVersion:INTAKE_POLICY,token:'a'.repeat(64),website:''};
const request=(body=input,headers={})=>new Request('http://localhost:3000/api/intake',{method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json',...headers},body:JSON.stringify(body)});
test('strict consent and bounded inputs',()=>{
 assert.equal(parseIntakeInput(input).email,'visitor@example.test');
 for(const changes of [{researchConsent:false},{marketingConsent:undefined},{policyVersion:'old'},{extra:'data'},{locale:'ar'},{token:'1'},{email:'a'.repeat(255)+'@example.test'}])assert.equal(parseIntakeInput({...input,...changes}),null);
 assert.equal(parseIntakeInput({action:'withdraw',token:input.token}).action,'withdraw');
 assert.equal(parseIntakeInput({action:'withdraw',token:input.token,email:input.email}),null);
});
test('cross-origin and oversized bodies never invoke storage',async()=>{
 let calls=0; const rpc=async()=>{calls++;return {kind:'received'}};
 for(const headers of [{origin:'https://other.test'},{origin:''},{'sec-fetch-site':'cross-site'}])assert.equal((await handleIntake(request(input,headers),rpc)).status,403);
 assert.equal((await handleIntake(request(input,{'content-type':'text/plain'}),rpc)).status,400);
 assert.equal((await handleIntake(request({...input,email:'x'.repeat(2100)}),rpc)).status,400);
 assert.equal(calls,0);
});
test('database failure is unavailable without echoing input or exception secrets',async()=>{
 const result=await handleIntake(request(),async()=>{throw Error('sensitive upstream')});
 assert.equal(result.status,503);assert.deepEqual(await result.json(),{kind:'unavailable'});
 assert.equal((await handleIntake(request(),null)).status,503);
});
test('only successful persistence returns a receipt; rate-limit and conflict remain errors',async()=>{
 for(const [kind,status] of [['received',201],['withdrawn',200],['rate_limited',429],['receipt_conflict',409],['request_not_accepted',409]]){
  const result=await handleIntake(request(),async()=>({kind}));assert.equal(result.status,status);assert.equal(result.headers.get('cache-control'),'no-store');
 }
});
