import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { decodeProfileExportPage } from '../../../../lib/server/privacy/profile-export/contract.ts';
import { profileExportHandler } from '../../../../lib/server/privacy/profile-export/handler.ts';
import { collectCoreExport, exportCanonical } from '../../../../lib/server/privacy/export-dispatcher.ts';
import { encryptExportArtifact, decryptExportArtifact } from '../../../../lib/server/privacy/export-artifact.ts';

export const owner = '00000000-0000-0000-0000-000000000001';
const op = '00000000-0000-0000-0000-000000000002';
export const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const now = () => Date.now();
const lease = () => ({ requestId: id(3), ownerId: owner, leaseId: id(4), generation: 1, expiresAt: new Date(now()+60000).toISOString() });
export const profile = () => ({ ownerId: owner,
  profile: { displayName: '😀'.repeat(80), travelPace: 'packed', locale: 'en', currency: 'USD', distanceUnit: 'mile',
    temperatureUnit: 'fahrenheit', defaultDepartureTime: '08:31:02.123456', paceNotice: 'local-planning-cross-trip-v1',
    paceOperation: op, paceRequest: { action: 'save', operationId: op, expectedRevision: 4, travelPace: 'packed', noticeVersion: 'local-planning-cross-trip-v1' },
    paceUndo: { travelPace: 'relaxed', state: 'explicit', noticeVersion: 'local-planning-cross-trip-v1' } },
  summary: { profileRevision: 8, paceRevision: 5, profileErasureFloor: 3, paceErasureFloor: 2, paceState: 'explicit',
    presentFields: ['display_name','travel_pace','locale','currency','distance_unit','temperature_unit','default_departure_time','pace_notice','pace_operation','pace_request','pace_undo'], hasPaceRequest: true, hasPaceUndo: true },
  savedFields: ['display_name','travel_pace','locale','currency','distance_unit','temperature_unit','default_departure_time'],
  createdAt: '2026-10-01T01:00:00.000Z', updatedAt: '2026-10-07T01:00:00.000Z' });
export const watermark = () => ({ ownerId: owner, profileRevision: 8, paceRevision: 5, profileErasureFloor: 3, paceErasureFloor: 2 });
export const operation = n => ({ requestId:id(n),ownerId:owner,sessionId:id(8),mobileEpoch:1,scope:'profile-sensitive-data/1',profileId:owner,objectIds:[],
  sourceDigest:'b'.repeat(64),previewDigest:'c'.repeat(64),capturedAt:Date.parse('2026-10-01T01:00:00Z'),expiresAt:Date.parse('2026-10-01T01:00:00Z')+30000,
  requestDigest:null,state:'previewed',previewErased:true,summary:null,copies:null,conflicts:null,decision:null });
export const snapshot = () => ({ownerId:owner,profile:profile(),watermark:watermark(),operations:[operation(10),operation(11)],sourceRows:{profiles:1,watermarks:1,operations:2}});
export const page = (item=snapshot()) => ({schemaVersion:'profile-core-export/1',section:'snapshot',
  sourceDigest:createHash('sha256').update(exportCanonical({snapshot:[item]}),'utf8').digest('hex'),items:[item],hasMore:false,nextCursor:null,sectionComplete:true});
const decode = v => decodeProfileExportPage(v,100,owner,now());
const signal = () => new AbortController().signal;

test('one logical owner snapshot exposes exact real source row counts, all saved fields and retained pace Undo',()=>{
  const v=page();assert.deepEqual(decode(v).items,v.items);assert.equal(v.items[0].sourceRows.operations,2);
  v.items[0].profile.profile.displayName+='😀';assert.equal(decode(v),null);
});
test('clear retains fallback bytes as unsaved, revoked consent and monotonic floors',()=>{
  const s=snapshot(),p=s.profile;Object.assign(p.profile,{displayName:null,travelPace:'balanced',locale:'zh',currency:'CNY',distanceUnit:'kilometre',temperatureUnit:'celsius',
    defaultDepartureTime:'09:00:00',paceNotice:null,paceOperation:null,paceRequest:null,paceUndo:null});
  Object.assign(p.summary,{profileRevision:9,paceRevision:6,profileErasureFloor:9,paceErasureFloor:6,paceState:'revoked',presentFields:[],hasPaceRequest:false,hasPaceUndo:false});
  p.savedFields=[];Object.assign(s.watermark,{profileRevision:9,paceRevision:6,profileErasureFloor:9,paceErasureFloor:6});assert.ok(decode(page(s)));
  p.summary.paceState='explicit';assert.equal(decode(page(s)),null);
});
test('absence exports real owner inventory without inventing a Profile row or losing retained watermark',()=>{
  const s=snapshot();s.profile=null;s.sourceRows.profiles=0;assert.ok(decode(page(s)));
  s.watermark=null;s.operations=[];s.sourceRows={profiles:0,watermarks:0,operations:0};assert.ok(decode(page(s)));
  const mismatch=snapshot();mismatch.watermark=null;mismatch.sourceRows.watermarks=0;assert.equal(decode(page(mismatch)),null);
  assert.equal(decode({...page(),items:[]}),null);
});
test('foreign/unknown fields, hidden saved inventory, forged history and inconsistent row counts fail closed',()=>{
  for(const change of [s=>s.ownerId=id(99),s=>s.profile.ownerId=id(99),s=>s.secret='secret',s=>s.profile.profile.secret='secret',
    s=>s.profile.savedFields=[],s=>s.profile.summary.hasPaceUndo=false,s=>s.watermark.paceRevision=6,
    s=>s.profile.profile.paceOperation=id(99),s=>s.profile.profile.paceUndo.extra='secret',s=>s.watermark.profileErasureFloor=9,
    s=>s.profile.profile.paceRequest.ownerId=owner,s=>s.sourceRows.operations=1,s=>s.operations.reverse(),
    s=>s.operations[0].ownerId=id(99),s=>s.operations[0].mutationBytes='secret']){
    const s=snapshot();change(s);assert.equal(decode(page(s)),null);
  }
  assert.equal(decode({...page(),sourceDigest:'bad'}),null);assert.equal(decode({...page(),hasMore:true,nextCursor:id(11),sectionComplete:false}),null);
});
test('exact lease source call, dispatcher sections digest and replay do not count reads twice',async()=>{
  const calls=[],l=lease(),h=profileExportHandler(l,async(a,i)=>{calls.push([a,i]);return page();});
  const first=await h.page('snapshot',null,2,signal());first.items[0].profile.profile.displayName='edited client copy';
  assert.equal((await h.page('snapshot',null,2,signal())).items[0].profile.profile.displayName,'😀'.repeat(80));
  assert.deepEqual(h.progress(),{pages:1,rows:1,terminalSections:1});
  assert.deepEqual(calls[0],['profile_page',{requestId:l.requestId,leaseId:l.leaseId,generation:1,section:'snapshot',cursor:null,limit:2}]);
  assert.ok(h.matchesReceipt({module:'profile',status:'complete',reason:'NONE',pages:1,rows:1,digest:page().sourceDigest}));
  await assert.rejects(h.page('snapshot',null,3,signal()));
});
test('wrong bare-item digest and source replacement cannot qualify for immutable snapshot',async()=>{
  const wrong=page();wrong.sourceDigest=createHash('sha256').update(exportCanonical(wrong.items[0])).digest('hex');
  await assert.rejects(profileExportHandler(lease(),async()=>wrong).page('snapshot',null,2,signal()));
  let changed=false;const h=profileExportHandler(lease(),async()=>{const s=snapshot();if(changed)s.profile.profile.displayName='changed';return page(s);});
  await h.page('snapshot',null,2,signal());changed=true;await assert.rejects(h.page('snapshot',null,2,signal()));
});
test('whole owner source cap counts actual nested rows and rejects truncation/extra snapshot items',()=>{
  const s=snapshot();s.operations=Array.from({length:9999},(_,i)=>operation(i+10));s.sourceRows.operations=s.operations.length;
  assert.equal(decode(page(s)),null);assert.equal(decode({...page(),items:[snapshot(),snapshot()]}),null);
});
test('page/byte bounds do not claim missing or dropped snapshot bytes as exported Profile',async()=>{
  const l=lease(),h=profileExportHandler(l,async()=>page());
  const b=await collectCoreExport(l,{profile:h},{enabled:true,maxPages:10,maxBytes:20000,pageSize:2},async()=>true,signal());
  assert.ok(h.matchesReceipt(b.modules.find(m=>m.module==='profile')));
  const over=profileExportHandler(l,async()=>page());const small=await collectCoreExport(l,{profile:over},{enabled:true,maxPages:10,maxBytes:1100,pageSize:2},async()=>true,signal());
  assert.ok(small===null || !over.matchesReceipt(small.modules.find(m=>m.module==='profile')));
  assert.equal(over.progress().pages,1);
});
test('original encryption roundtrip binds owner/digest, sourceRows and unrecalled downloaded-copy notice',async()=>{
  const l=lease(),h=profileExportHandler(l,async()=>page()),bundle=await collectCoreExport(l,{profile:h},{enabled:true,maxPages:10,maxBytes:20000,pageSize:2},async()=>true,signal());
  const receipt=bundle.modules.find(m=>m.module==='profile');assert.equal(receipt.reason,'NONE');assert.equal(receipt.rows,1);assert.ok(h.matchesReceipt(receipt));
  const key={keyId:'owned-test-only',key:randomBytes(32)},artifact=encryptExportArtifact(bundle,l,key,new Date(now()+60000).toISOString());
  const decoded=JSON.parse(decryptExportArtifact(artifact,l,key).toString());assert.deepEqual(decoded.data.profile.snapshot,[snapshot()]);
  assert.equal(decoded.notices.downloadedFilesRecallable,false);assert.equal(decoded.allUserDataCompleted,false);
  assert.equal(decryptExportArtifact(artifact,{...l,ownerId:id(99)},key),null);
});
test('unknown authority, aborted read, illegal cursor/section/limit never fabricate successful empty source',async()=>{
  const h=profileExportHandler(lease(),async()=>({kind:'unavailable'}));await assert.rejects(h.page('snapshot',null,2,signal()));assert.equal(h.progress().pages,0);
  for(const limit of [0,101,1.2])await assert.rejects(h.page('snapshot',null,limit,signal()));
  await assert.rejects(h.page('snapshot',id(10),2,signal()));await assert.rejects(h.page('profiles',null,2,signal()));
  const aborted=new AbortController();aborted.abort();await assert.rejects(h.page('snapshot',null,2,aborted.signal));
});
