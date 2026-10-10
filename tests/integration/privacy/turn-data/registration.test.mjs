import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCoverageInput } from '../../../../lib/server/privacy/coverage/contract.ts';
import { MODULE_CATALOG,CATALOG_VERSION } from '../../../../lib/server/privacy/coverage/catalog.ts';
import { OWNER_HANDLERS } from '../../../../lib/server/privacy/coverage/registry.ts';
import { handleCoverage } from '../../../../lib/server/privacy/coverage/http.ts';
import { matchesCoverageResult } from '../../../../lib/server/privacy/coverage/consumer.ts';
import { handleTurnData } from '../../../../lib/server/privacy/turn-data/http.ts';
import { turnRecoveryBytes } from '../../../../lib/server/privacy/turn-data/coverage.ts';
import { actor,selection,command,bytes,receipt,preview } from './fixtures.mjs';

test('registered coverage keeps all 34 modules and dispatches exact Turn preview/erase/recovery to fixed owner HTTP',async()=>{
  assert.equal(CATALOG_VERSION,'data-coverage-catalog/2026-10-07.11');assert.equal(MODULE_CATALOG.length,34);
  assert.equal(new Set(MODULE_CATALOG.map(m=>m.id)).size,34);assert.equal(MODULE_CATALOG.find(m=>m.id==='offline').version,'device-scoped/1');
  assert.equal(typeof OWNER_HANDLERS.turn_data,'function');
  const fresh=Date.now(),times={capturedAt:fresh-5,expiresAt:fresh-5+30000};
  const terminal={...receipt(),...times,decision:{...receipt().decision,decidedAt:fresh-3}};
  const a={actorId:actor.ownerId,sessionId:actor.sessionId,mobileEpoch:actor.mobileEpoch};
  const input={schemaVersion:'data-coverage/1',catalogVersion:CATALOG_VERSION,...a,moduleId:'turn',moduleVersion:'turn-data/1',operationId:selection.requestId,action:'delete',phase:'execute',confirmed:true,tripId:null,commandBytes:bytes};
  assert.equal(parseCoverageInput(input).handler,'turn_data');
  const core={...input,action:'export',commandBytes:JSON.stringify({requestId:selection.requestId,confirmed:true})};assert.equal(parseCoverageInput(core).handler,'core');
  const calls=[];let loseAck=false;
  const options={enabled:true,authority:()=>({authenticate:async()=>a,current:async()=>true}),handlers:{turn_data:async req=>{
    assert.equal(new URL(req.url).pathname,'/api/privacy/native/v1/turn-data');
    return handleTurnData(req,{enabled:true,now:()=>fresh,authority:()=>({authenticate:async()=>actor,current:async()=>true,rpc:async(action,raw)=>{
      calls.push([action,raw]);if(loseAck)throw Error('fixture lost ACK');
      if(action==='preview')return {...preview(),...times};
      if(action==='recover')assert.equal(JSON.parse(raw).mutationBytes,bytes);else if(action==='erase')assert.equal(raw,bytes);
      return terminal;
    }})});
  }}};
  async function send(v){const raw=JSON.stringify(v),response=await handleCoverage(new Request('http://localhost/api/privacy/native/v1/coverage',{method:'POST',headers:{'content-type':'application/json'},body:raw}),options);const result=await response.json();assert.ok(matchesCoverageResult(result,raw,fresh));return result;}
  assert.equal((await send({...input,phase:'preview',commandBytes:JSON.stringify({action:'preview',...selection})})).state,'preview');
  assert.equal((await send(input)).state,'scoped_complete');assert.equal((await send({...input,phase:'recover'})).state,'scoped_complete');
  assert.deepEqual(calls.map(c=>c[0]),['preview','erase','recover']);assert.equal(calls[2][1],turnRecoveryBytes(bytes));
  loseAck=true;assert.equal((await send(input)).state,'unknown');
  for(const change of [{moduleId:'results'},{tripId:actor.ownerId},{moduleVersion:'core-export-d2/1'},{catalogVersion:'data-coverage-catalog/2026-10-07.9'}])assert.equal(parseCoverageInput({...input,...change}),null);
});
