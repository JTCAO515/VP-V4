// Local synthetic fixture only: real Web cookie + native Bearer + migrated DB + headless Chromium.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {chromium,expect} from '@playwright/test';
import {identityLocalEnv} from '../identity/local-supabase.mjs';
import {webActor,webTripResult} from '../artifacts/fixtures/web-trip-result.mjs';
import {tripLocalEditorCopy} from '../../../lib/i18n.ts';

async function boundedBarrier(promise,label,timeoutMs=20000){
 let timer;
 try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' did not settle')),timeoutMs);})]);}
 finally{clearTimeout(timer);}
}
function failureKind(error){return {name:['Error','TypeError','SyntaxError','AssertionError','TimeoutError','AggregateError'].includes(error?.name)?error.name:'OtherError',kind:/timeout|timed out/i.test(error?.message??'')?'timeout':error?.code==='ERR_ASSERTION'?'assertion':error?.name==='SyntaxError'?'decode':'other'};}
function canonicalBarrier(){
 let release,arrive,rejectArrival,finish,rejectFinish,value,started=false,phase='idle',failurePhase=null,status=null;
 const held=new Promise(resolve=>release=resolve),arrived=new Promise((resolve,reject)=>{arrive=resolve;rejectArrival=reject;}),done=new Promise((resolve,reject)=>{finish=resolve;rejectFinish=reject;});
 // Early observers prevent unhandled rejection before the owning test reaches its await.
 void arrived.catch(()=>{});void done.catch(()=>{});
 const handler=async route=>{
  started=true;
  try{phase='fetch';const response=await route.fetch({timeout:15000});status=typeof response.status==='function'?response.status():null;phase='json';value=await response.json();arrive(value);phase='held';await held;phase='fulfill';await route.fulfill({response});phase='done';finish();}
  catch(error){failurePhase=phase;phase='failed';rejectArrival(error);rejectFinish(error);}
 };
 return {handler,arrived,release,get value(){return value;},get diagnostic(){return {started,phase,failurePhase,status};},async cleanup(remove){
  release();try{if(started)await boundedBarrier(done,'canonical route fulfillment');}finally{await remove();}
 }};
}
test('canonical barrier completes fulfillment before removal and preserves response errors',async()=>{
 const order=[],b=canonicalBarrier();
 const task=b.handler({fetch:async()=>({json:async()=>({proof:true})}),fulfill:async()=>{order.push('fulfilled');}});
 assert.deepEqual(await b.arrived,{proof:true});assert.deepEqual(order,[]);
 await b.cleanup(async()=>order.push('removed'));await task;assert.deepEqual(order,['fulfilled','removed']);
 for(const phase of ['fetch','json','fulfill']){
  const failure=Error('Controlled '+phase+' failure'),gate=canonicalBarrier();let removed=false;
  const handling=gate.handler({fetch:async()=>{if(phase==='fetch')throw failure;return {json:async()=>{if(phase==='json')throw failure;return {};}};},fulfill:async()=>{throw failure;}});
  if(phase==='fulfill')await gate.arrived;else await assert.rejects(gate.arrived,e=>e===failure);
  await assert.rejects(gate.cleanup(async()=>{removed=true;}),e=>e===failure);await handling;assert.equal(removed,true);
 }
});
test('canonical diagnostic exposes only fixed failure categories and transport phase',async()=>{
 const secret='SYNTHETIC_PRIVATE_COOKIE_TOKEN';const error=Object.assign(Error(secret),{name:secret,code:secret});assert.deepEqual(failureKind(error),{name:'OtherError',kind:'other'});
 const b=canonicalBarrier();await b.handler({fetch:async()=>({status:()=>500,json:async()=>{throw SyntaxError(secret);}}),fulfill:async()=>assert.fail('failed decode cannot fulfill')});
 assert.deepEqual(b.diagnostic,{started:true,phase:'failed',failurePhase:'json',status:500});assert.ok(!JSON.stringify({diagnostic:b.diagnostic,error:failureKind(error)}).includes(secret));await assert.rejects(b.cleanup(async()=>{}),SyntaxError);
});

test('canonical barrier has a bounded failure when no arrival occurs',async()=>{
 await assert.rejects(boundedBarrier(new Promise(()=>{}),'controlled absent request',10),/controlled absent request did not settle/);
});

test('V5 result consumer cannot retarget canonical Web/native Trip confirmation',{
 skip:process.env.VP_WEB_TRIP_CONTINUITY!=='true',timeout:180000,
},async t=>{
 const state=identityLocalEnv();assert.equal(state.API_URL,'http://127.0.0.1:64641');
 assert.match(state.DB_CONTAINER,/^supabase_db_vp-web-continuity-[a-f0-9]{8}$/);
 const api='http://127.0.0.1:64651',evidence=resolve('artifacts/VPJ-41/web-trip-continuity-20261002');mkdirSync(evidence,{recursive:true});
 const sql=input=>execFileSync('docker',['exec','-i',state.DB_CONTAINER,'psql','-U','postgres','-d','postgres','-X','-Atq','-v','ON_ERROR_STOP=1'],{input:"set statement_timeout='10s';"+input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 const actor=await webActor(state);
 t.after(()=>{sql(`delete from public.trip_events where owner_id='${actor.owner}';delete from public.trip_audit_events where owner_id='${actor.owner}';delete from auth.users where id='${actor.owner}';`);});
 const fixture=await webTripResult(state,sql,actor);
 const call=async(path,token,body)=>{const r=await fetch(api+path,{method:body===undefined?'GET':'POST',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});assert.match(r.headers.get('content-type')||'',/application\/json/,'Expected JSON for '+path+' status '+r.status);return {status:r.status,body:await r.json()};};
 const attemptId=uuid(),issued=await call('/api/auth/native/v2/credentials',null,{email:actor.email,password:actor.password,attemptId});assert.equal(issued.status,200);
 const token=issued.body.accessToken;assert.equal((await call('/api/auth/native/v2/login',token,{attemptId})).status,200);
 const n=(suffix='',body)=>call('/api/trips/native/v2/'+fixture.trip+suffix,token,body);
 const patch=(version,title)=>({expectedVersion:version,operations:[{kind:'set_title',title}]});
 const proposal=await n('/proposal',{patch:patch(1,'Native pending candidate')});assert.equal(proposal.status,201);
 const initial=(await n('/proposal?proposalId='+proposal.body.proposalId)).body;
 assert.equal(initial.proposal.id,proposal.body.proposalId);assert.equal(initial.trip.id,fixture.trip);
 const count=()=>Number(sql(`select count(*) from public.trip_events where trip_id='${fixture.trip}';`));
 const baseEvents=count();
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const context=await browser.newContext({viewport:{width:1280,height:900}});t.after(()=>context.close());
 await context.addCookies(actor.cookie.split('; ').map(item=>{const at=item.indexOf('=');return {name:item.slice(0,at),value:item.slice(at+1),url:api,sameSite:'Lax'};}));
 const ownerRead=await fetch(api+'/api/trips/'+fixture.trip+'/proposal',{headers:{Cookie:actor.cookie}});
 assert.equal(ownerRead.status,200);assert.equal((await ownerRead.json()).proposal.id,initial.proposal.id,'Web and native read the same pending ID');
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(api+'/visepanda/trips/'+fixture.trip,{waitUntil:'domcontentloaded'});
 await expect(page.getByTestId('same-trip-editor')).toBeVisible({timeout:30000});await page.locator('select').first().selectOption('en');await expect(page.getByTestId('same-trip-editor').getByLabel(tripLocalEditorCopy.en.tripTitle,{exact:true})).toBeVisible();
 const copy=tripLocalEditorCopy.en,editor=page.getByTestId('same-trip-editor'),card=page.getByTestId('trip-comparison');
 await expect(editor).toBeVisible({timeout:30000});
 await expect(editor.getByRole('button',{name:copy.confirm,exact:true})).toBeEnabled();
 await expect(card.getByRole('heading',{name:'Direction comparison',exact:true})).toBeVisible();
 await expect(editor.getByText('Native pending candidate',{exact:true})).toBeVisible();
 await expect(editor.getByText(`${copy.proposalBase} 1 · ${copy.proposalRevision} ${initial.proposal.revision}`,{exact:true})).toBeVisible();
 await editor.getByLabel(copy.tripTitle,{exact:true}).fill('Web reviewed canonical child');
 const revisionResponse=page.waitForResponse(r=>r.url()===api+'/api/trips/'+fixture.trip+'/proposal/revision'&&r.request().method()==='POST');
 await editor.getByRole('button',{name:copy.revise,exact:true}).click();
 const revised=await revisionResponse;assert.equal(revised.status(),201);const revision=await revised.json();
 assert.equal(revised.request().postDataJSON().proposalId,initial.proposal.id);
 const child=(await n('/proposal?proposalId='+revision.proposalId)).body;
 assert.notEqual(child.proposal.id,initial.proposal.id);assert.ok(child.proposal.revision>initial.proposal.revision);
 await expect(editor.getByRole('button',{name:copy.confirm,exact:true})).toBeEnabled();
 await expect(editor.getByText(`${copy.proposalBase} 1 · ${copy.proposalRevision} ${child.proposal.revision}`,{exact:true})).toBeVisible();
 await expect(editor.getByRole('heading',{name:copy.before,exact:true})).toBeVisible();
 await expect(editor.getByRole('heading',{name:copy.after,exact:true})).toBeVisible();
 await expect(editor.getByText('Web reviewed canonical child',{exact:true})).toBeVisible();
 assert.equal((await n()).body.trip.headVersion,1,'Web revision and visible diff do not apply');assert.equal(count(),baseEvents);
 await editor.getByRole('heading',{name:copy.before,exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:join(evidence,'en-desktop-reviewed-diff.png')});
 // Controlled future-schema transport seam only. Authentication and all proposal/confirm/Trip reads remain real.
 const endpoint=api+'/api/trips/'+fixture.trip+'/comparison-result',alien=uuid();
 const actualResult=await fetch(endpoint,{headers:{Cookie:actor.cookie}});assert.equal(actualResult.status,200);const actualResultBody=await actualResult.json();assert.equal(actualResultBody.data.artifactId,fixture.artifact);
 await page.route(endpoint,route=>route.fulfill({json:{...actualResultBody,data:{...actualResultBody.data,
  content:{...actualResultBody.data.content,schemaVersion:'comparison/99',actions:[{kind:'confirm',proposalId:alien,revision:999}]},proposalId:alien,proposalRevision:999}}}));
 await card.getByRole('button',{name:'Refresh comparison',exact:true}).click();
 await expect(card.getByText('This comparison cannot be read safely. Refresh to retry.',{exact:true})).toBeVisible();
 assert.equal(await card.getByRole('button').count(),1,'unknown result grants only the existing read refresh action');
 await expect(editor.getByRole('button',{name:copy.confirm,exact:true})).toBeEnabled();
 assert.equal((await n()).body.trip.headVersion,1);assert.equal(count(),baseEvents);
 const confirmResponse=page.waitForResponse(r=>r.url()===api+'/api/trips/'+fixture.trip+'/confirm'&&r.request().method()==='POST');
 await editor.getByRole('button',{name:copy.confirm,exact:true}).click();
 const confirmed=await confirmResponse;assert.equal(confirmed.status(),200);
 const target=confirmed.request().postDataJSON();assert.equal(target.proposalId,child.proposal.id);assert.equal(target.digest,child.proposal.digest);assert.notEqual(target.proposalId,alien);
 await expect(editor.getByRole('status')).toHaveText(copy.stored);
 let native=(await n()).body;assert.equal(native.trip.id,fixture.trip);assert.equal(native.trip.headVersion,2);assert.equal(native.trip.title,'Web reviewed canonical child');assert.equal(count(),baseEvents+1);
 await page.unroute(endpoint);await page.reload({waitUntil:'domcontentloaded'});await expect(page.getByTestId('same-trip-editor')).toBeVisible({timeout:30000});await page.locator('select').first().selectOption('en');await expect(page.getByTestId('same-trip-editor').getByLabel(tripLocalEditorCopy.en.tripTitle,{exact:true})).toBeVisible();
 await expect(editor.getByRole('heading',{name:/v2$/}).first()).toBeVisible();
 const web=await fetch(api+'/api/trips/'+fixture.trip,{headers:{Cookie:actor.cookie}});assert.equal(web.status,200);const webRead=await web.json();
 assert.deepEqual(webRead.content,native.content);assert.equal(webRead.trip.headVersion,native.trip.headVersion);
 // Keep an actual reviewed parent in Web while native creates the next immutable child.
 const old=await n('/proposal',{patch:patch(2,'Old browser candidate')});assert.equal(old.status,201);
 await page.reload({waitUntil:'domcontentloaded'});await expect(page.getByTestId('same-trip-editor')).toBeVisible({timeout:30000});await page.locator('select').first().selectOption('en');await expect(page.getByTestId('same-trip-editor').getByLabel(tripLocalEditorCopy.en.tripTitle,{exact:true})).toBeVisible();
 await expect(editor.getByText('Old browser candidate',{exact:true})).toBeVisible();
 const oldRead=(await n('/proposal?proposalId='+old.body.proposalId)).body;
 const newChild=await n('/proposal/revision',{proposalId:old.body.proposalId,patch:patch(2,'Native newer child')});assert.equal(newChild.status,201);
 const beforeStale=count();
 const rejectedResponse=page.waitForResponse(r=>r.url()===api+'/api/trips/'+fixture.trip+'/confirm'&&r.request().method()==='POST');
 await editor.getByRole('button',{name:copy.confirm,exact:true}).click();
 const rejected=await rejectedResponse;assert.equal(rejected.status(),409);
 assert.equal(rejected.request().postDataJSON().proposalId,oldRead.proposal.id);assert.equal(rejected.request().postDataJSON().digest,oldRead.proposal.digest);
 assert.equal((await n()).body.trip.headVersion,2);assert.equal(count(),beforeStale,'old revision rejection creates no Trip write');
 await expect(editor.getByRole('status')).toHaveText(copy.conflict);
 await expect(editor.getByText('Native newer child',{exact:true})).toBeVisible();
 // Advancing the Trip using another real native proposal also rejects the stale base.
 // Reuse #192's accepted legacy-coexistence setup through the ordinary owner's existing RLS surface.
 // The normal create API admits only one pending candidate; do not weaken that guard to manufacture a CAS race.
 const heldChild=(await n('/proposal?proposalId='+newChild.body.proposalId)).body;
 const separate=await actor.client.from('trip_proposals').insert({owner_id:actor.owner,trip_id:fixture.trip,
  revision:heldChild.proposal.revision+1,base_trip_version:2,status:'pending',patch:{title:'Native advanced head'},expires_at:'2099-01-01T00:00:00Z'}).select('id').single();
 assert.ifError(separate.error);
 const separateRead=(await n('/proposal?proposalId='+separate.data.id)).body;
 assert.equal((await n('/confirm',{proposalId:separateRead.proposal.id,digest:separateRead.proposal.digest,idempotencyKey:uuid()})).status,200);
 const headEvents=count();
 const staleHeadResponse=page.waitForResponse(r=>r.url()===api+'/api/trips/'+fixture.trip+'/confirm'&&r.request().method()==='POST');
 await editor.getByRole('button',{name:copy.confirm,exact:true}).click();
 const staleHead=await staleHeadResponse;assert.equal(staleHead.status(),409);assert.equal((await staleHead.json()).error.code,'STALE_TRIP_VERSION');assert.equal(staleHead.request().postDataJSON().proposalId,newChild.body.proposalId);
 native=(await n()).body;assert.equal(native.trip.headVersion,3);assert.equal(native.trip.title,'Native advanced head');assert.equal(count(),headEvents);
 await expect(editor.getByRole('status')).toHaveText(copy.conflict);
 await editor.getByRole('status').scrollIntoViewIfNeeded();await page.screenshot({path:join(evidence,'en-desktop-stale-rejected.png')});
 await expect(editor.getByRole('button',{name:copy.confirm,exact:true})).toHaveCount(0);
 // Explicit new review can replace the conflict; automatic refresh alone could not.
 await editor.getByLabel(copy.tripTitle,{exact:true}).fill('Explicit review after conflict');
 const canonical=canonicalBarrier();
 let recoveredCanonical;
 const canonicalRoute=api+'/api/trips/'+fixture.trip+'/proposal?proposalId=*';
 await page.route(canonicalRoute,canonical.handler);
 let recoveredReceipt,reviewFailure,reviewPhase='initial';
 try {
 reviewPhase='post_response_wait';const recoveryResponse=page.waitForResponse(r=>r.url()===api+'/api/trips/'+fixture.trip+'/proposal'&&r.request().method()==='POST');
 reviewPhase='review_click';await editor.getByRole('button',{name:copy.review,exact:true}).click();
 reviewPhase='post_response';const recovered=await recoveryResponse;assert.equal(recovered.status(),201);recoveredReceipt=await recovered.json();
 reviewPhase='canonical_arrival';recoveredCanonical=await boundedBarrier(canonical.arrived,'canonical fetch/JSON arrival');
 assert.equal(recoveredCanonical.proposal.id,recoveredReceipt.proposalId);assert.equal(recoveredCanonical.proposal.baseTripVersion,3);
 assert.equal(recoveredCanonical.proposal.stale,false,'explicit review has a real current server proof');
 reviewPhase='held_ui_assert';
 // A creation receipt alone is insufficient. Keep the old conflict until canonical review finishes.
  await expect(editor.getByRole('status')).toHaveText(copy.conflict);
  await expect(editor.getByRole('button',{name:copy.confirm,exact:true})).toHaveCount(0);
  assert.equal((await n()).body.trip.headVersion,3);assert.equal(count(),headEvents);
  t.diagnostic('POST_201_REVIEW_BARRIER '+JSON.stringify({postStatus:recovered.status(),canonicalGetStatus:200,canonicalBase:recoveredCanonical.proposal.baseTripVersion,canonicalStale:recoveredCanonical.proposal.stale,delivered:false}));
 } catch(error){reviewFailure=error;t.diagnostic('CANONICAL_REVIEW_FAILURE '+JSON.stringify({reviewPhase,barrier:canonical.diagnostic,error:failureKind(error)}));throw error;}
 finally {
  try{await canonical.cleanup(()=>page.unroute(canonicalRoute,canonical.handler));}
  catch(cleanupError){t.diagnostic('CANONICAL_CLEANUP_FAILURE '+JSON.stringify({reviewPhase,barrier:canonical.diagnostic,reviewError:reviewFailure?failureKind(reviewFailure):null,cleanupError:failureKind(cleanupError)}));throw reviewFailure?new AggregateError([reviewFailure,cleanupError],'Review failed and response cleanup also failed'):cleanupError;}
 }
 await expect(editor.getByRole('status')).toHaveText(copy.pending);
 await expect(editor.getByRole('button',{name:copy.confirm,exact:true})).toBeEnabled();
 await editor.getByRole('status').scrollIntoViewIfNeeded();await page.screenshot({path:join(evidence,'explicit-review-pending.png')});
 assert.equal((await n()).body.trip.headVersion,3);assert.equal(count(),headEvents,'review is still not a write');
 const recoveryConfirmResponse=page.waitForResponse(r=>r.url()===api+'/api/trips/'+fixture.trip+'/confirm'&&r.request().method()==='POST');
 await editor.getByRole('button',{name:copy.confirm,exact:true}).click();const recoveryConfirm=await recoveryConfirmResponse;
 assert.equal(recoveryConfirm.status(),200);assert.equal(recoveryConfirm.request().postDataJSON().proposalId,recoveredCanonical.proposal.id);
 assert.equal(recoveryConfirm.request().postDataJSON().digest,recoveredCanonical.proposal.digest);
 await expect(editor.getByRole('status')).toHaveText(copy.stored);
 assert.equal((await n()).body.trip.headVersion,4);assert.equal(count(),headEvents+1,'only explicit confirmation applies the reviewed proposal');
 const secondTrip=uuid();assert.equal((await call('/api/trips/native/v2',token,{tripId:secondTrip,title:'Second isolated synthetic Trip'})).status,201);
 await page.goto(api+'/visepanda/trips/'+secondTrip,{waitUntil:'domcontentloaded'});
 await expect(page.getByTestId('same-trip-editor')).toBeVisible({timeout:30000});await page.locator('select').first().selectOption('en');
 await expect(editor.getByLabel(copy.tripTitle,{exact:true})).toHaveValue('Second isolated synthetic Trip');
 await expect(editor.getByRole('status')).toHaveText('');
 await expect(editor.getByRole('button',{name:copy.confirm,exact:true})).toHaveCount(0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.deepEqual(errors,[]);
 const summary={result:'PASS',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),testedFiles:Object.fromEntries(['components/canvas/TripContentEditor.tsx','tests/integration/web-trip-continuity/continuity.test.mjs','tests/integration/web-trip-continuity/run.mjs'].map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')])),scope:'local synthetic Web cookie + native HTTP protocol; no native UI/provider',
  viewport:'1280x900',locale:'en',tripId:fixture.trip,initialProposal:{id:initial.proposal.id,revision:initial.proposal.revision},
  webChild:{id:child.proposal.id,revision:child.proposal.revision},webConfirmedHead:2,finalNativeHead:4,
  unknownSchema:'controlled comparison-response seam; canonical real confirm target unchanged',staleRevisionStatus:rejected.status(),staleHeadStatus:staleHead.status(),casSetup:'existing ordinary-owner legacy pending row compatibility fixture; head advanced only through native confirm API',
  recovery:'delayed canonical read keeps conflict until actual current proof; explicit new review enters pending; exact user confirmation applies head4; Trip switch resets notice',events:{base:baseEvents,afterWeb:baseEvents+1,final:headEvents+1},unrun:['physical native UI','Staging/Production','real provider','full #234 acceptance']};
 writeFileSync(join(evidence,'summary.json'),JSON.stringify(summary,null,2)+'\n');
 t.diagnostic('WEB1_V5_CANONICAL_CONFIRM_PASS: real local cookie/Bearer/Trip receipts; unknown schema seam; immutable revision and stale head rejects, no extra events');
});
