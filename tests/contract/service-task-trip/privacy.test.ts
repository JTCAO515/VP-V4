import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID as uuid} from 'node:crypto';
import {decodeTripPrivacyReply,runTripPrivacyRequest,parseTripPrivacyRequest} from '../../../lib/server/service-task-trip/privacy.ts';
import {decodeConversationReceipt} from '../../../lib/server/privacy/conversation-data/protocol.ts';
import {CONVERSATION_BOUNDARIES,GRAPH_KEYS,ERASED_KEYS,REDACTED_KEYS,RETAINED_KEYS,CONVERSATION_LIMITS} from '../../../lib/server/privacy/conversation-data/contract.ts';
import {TRIP_PRIVATE_SOURCE_KEYS,TRIP_BOUNDARY_ADDITIONS} from '../../../lib/server/service-task-trip/privacy-contract.ts';

function fixture(){
 const actor={ownerId:uuid(),sessionId:uuid(),mobileEpoch:1},trip=uuid(),root=uuid(),turn=uuid(),task=uuid(),now=Date.now();
 const command={schemaVersion:'conversation-trip-data/1',action:'erase',scope:'conversation-sensitive-data/1',requestId:uuid(),rootKind:'conversation',rootId:root,objectIds:[],sourceDigest:'a'.repeat(64),previewDigest:'b'.repeat(64),confirmed:true};
 const bytes=JSON.stringify(command),digest=createHash('sha256').update(bytes).digest('hex');
 const zeros=(keys:readonly string[])=>Object.fromEntries(keys.map(k=>[k,0]));
 const graph={...Object.fromEntries(GRAPH_KEYS.map(k=>[k,[]])),conversationIds:[root],turnIds:[turn],taskIds:[task],tripTaskIds:[task],tripPrivacyTripIds:[trip]};
 const boundaries:Record<string,string[]>=Object.fromEntries(Object.entries(CONVERSATION_BOUNDARIES['conversation-sensitive-data/1']).map(([key,values])=>[key,[...values]]));
 for(const [key,value]of Object.entries(TRIP_BOUNDARY_ADDITIONS))boundaries[key].push(value);
 const keys=[{relation:'scoped_edit_private.contexts_v1',pk:{id:uuid()}},{relation:'scoped_edit_private.work_v1',pk:{turn_id:turn}},{relation:'scoped_edit_private.requests_v1',pk:{turn_id:turn}},{relation:'scoped_edit_private.operations_v1',pk:{owner_id:actor.ownerId,operation_id:uuid()}},{relation:'scoped_edit_private.lineage_v1',pk:{proposal_id:uuid()}}];
 const receipt={schemaVersion:command.schemaVersion,kind:'receipt',state:'erased',scope:command.scope,requestId:command.requestId,rootKind:command.rootKind,rootId:root,objectIds:[],...actor,sourceDigest:command.sourceDigest,previewDigest:command.previewDigest,sourceAuthorities:[{policyId:uuid(),consentId:uuid()}],capturedAt:now-1000,expiresAt:now-1000+CONVERSATION_LIMITS.lifetimeMs,boundaries,allUserDataCompleted:false,
  decision:{requestDigest:digest,decidedAt:now,graph,erasedCounts:{...zeros(ERASED_KEYS),conversations:1,turns:1,...Object.fromEntries(TRIP_PRIVATE_SOURCE_KEYS.map(k=>[k,1]))},redactedCounts:{...zeros(REDACTED_KEYS),taskDigests:1,tripObjectives:1},retainedCounts:{...zeros(RETAINED_KEYS),tasks:1},clearedPreviews:0,retainedFences:3,sourceConversation:'erased',sourceTrip:'not_modified',explicitMemory:'not_modified',externalCopies:'not_erased',tripSourceIdentityKeys:keys}};
 return {actor,trip,now,command,bytes,receipt,keys};
}
test('new conversation erase/recover requires the complete exact Trip identity fence group',async()=>{
 const f=fixture();
 const {sourceDigest,previewDigest,confirmed,...selection}=f.command;
 const commands=[f.command,{...selection,action:'recover',mutationBytes:f.bytes}];
 const malformed:Record<string,unknown>={missing:undefined,undefined:undefined,null:null,object:{},string:'[]',empty:[],few:f.keys.slice(1),extra:[...f.keys,{relation:'scoped_edit_private.contexts_v1',pk:{id:uuid()}}],duplicate:[...f.keys,f.keys[0]],wrongOwner:f.keys.map(k=>k.relation.endsWith('operations_v1')?{...k,pk:{...k.pk,owner_id:uuid()}}:k),unknownRelation:f.keys.map((k,i)=>i===0?{...k,relation:'scoped_edit_private.future_v1'}:k),wrongPk:f.keys.map((k,i)=>i===0?{...k,pk:{turn_id:uuid()}}:k)};
 for(const [i,key]of f.keys.entries()){malformed['missingSource'+i]=f.keys.filter((_,j)=>i!==j);malformed['duplicateSource'+i]=[...f.keys,key];}
 for(const command of commands){
  assert.ok(decodeTripPrivacyReply(f.receipt,'conversation',command,f.actor,f.bytes,f.trip,f.now));
  for(const [label,value]of Object.entries(malformed)){
   const bad=structuredClone(f.receipt);if(label==='missing')delete (bad.decision as Record<string,unknown>).tripSourceIdentityKeys;else (bad.decision as Record<string,unknown>).tripSourceIdentityKeys=value;
   assert.equal(decodeTripPrivacyReply(bad,'conversation',command,f.actor,f.bytes,f.trip,f.now),null,command.action+': '+label);
   const input=parseTripPrivacyRequest({schemaVersion:'trip-service-task/1',action:'trip_privacy',target:'conversation',expectedEpoch:1,commandBytes:JSON.stringify(command)});assert.ok(input);
   await assert.rejects(runTripPrivacyRequest(f.trip,input,async(name)=>({data:name==='native_session_v2'?{version:2,subject:f.actor.ownerId,sessionId:f.actor.sessionId,mobileEpoch:1}:bad,error:null}),f.actor.ownerId,()=>f.now),/TRIP_PRIVACY_ACK_UNKNOWN/,command.action+': '+label);
  }
 }
});
test('legacy v1 exact receipt remains valid without Trip fields and rejects new fields',()=>{
 const f=fixture(),legacy=structuredClone(f.receipt) as Record<string,unknown>;
 legacy.schemaVersion='conversation-data/1';const d=legacy.decision as Record<string,unknown>;delete d.tripSourceIdentityKeys;
 const graph=d.graph as Record<string,unknown>;delete graph.tripTaskIds;delete graph.tripPrivacyTripIds;
 for(const key of TRIP_PRIVATE_SOURCE_KEYS)delete (d.erasedCounts as Record<string,unknown>)[key];delete (d.redactedCounts as Record<string,unknown>).tripObjectives;
 legacy.boundaries=structuredClone(CONVERSATION_BOUNDARIES['conversation-sensitive-data/1']);
 const {schemaVersion,...command}=f.command;
 assert.ok(decodeConversationReceipt(legacy,command as Parameters<typeof decodeConversationReceipt>[1],f.actor,f.receipt.decision.requestDigest,f.now));
 assert.equal(decodeConversationReceipt({...legacy,decision:{...d,tripSourceIdentityKeys:[]}},command as Parameters<typeof decodeConversationReceipt>[1],f.actor,f.receipt.decision.requestDigest,f.now),null);
});
