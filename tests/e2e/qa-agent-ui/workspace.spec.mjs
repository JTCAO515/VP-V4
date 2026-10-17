import { expect, test } from '@playwright/test';

// Synthetic cookie/API data tests the actual rendered client. No real Auth/DB/provider claim.
const idA = '11111111-1111-4111-8111-111111111111';
const idB = '22222222-2222-4222-8222-222222222222';
const session = id => ({ id, label: 'Session', createdAt: '2026-10-13T00:00:00Z', updatedAt: '2026-10-13T00:00:00Z' });
const policy = { id: '33333333-3333-4333-8333-333333333333', noticeHash: 'a'.repeat(64), noticeZh: '合成供应商说明', noticeEn: 'Synthetic provider notice', provider: 'synthetic', recipient: 'synthetic', consentState: 'not_accepted', contextMode: 'qa_session_history_v1', maxTurns: 8 };
const wire = data => ({version: 'qa-agent/1', ...data});
const message = (id, input, answer='Saved answer', status='answered') => ({...input, sessionId:id,turnId:input.requestId,input:input.text,text:answer,status,createdAt:'2026-10-13T00:00:00Z'});
async function login(context, owner = idA) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const jwt = `${encode({alg:'HS256'})}.${encode({sub:owner,exp:Math.floor(Date.now()/1000)+3600})}.synthetic`;
  const data = { access_token: jwt, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, user: { id: owner } };
  await context.addCookies([{name:'sb-127-auth-token',value:`base64-${encode(data)}`,url:'http://127.0.0.1:3019'}]);
}
async function fixture(page, context, hook = () => false, entry = {}) {
  await login(context);
  const saved = new Map([[idA, []], [idB, []]]), sent = [];
  let consented = false;
  await page.route('**/api/qa-agent/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const fulfill = data => route.fulfill({contentType:'application/json',body:JSON.stringify(wire(data))});
    if(path.endsWith('/cancellation')) {
      const sid=path.split('/')[4],rid=path.split('/')[6];
      if(entry.cancellation&&await entry.cancellation(route,{path,method,saved,sent,fulfill,sessionId:sid,requestId:rid}))return;
      if(method==='POST')throw Error('Unexpected cancellation POST in existing fixture');
      const found=saved.get(sid)?.find(message=>message.requestId===rid);
      const state=!found?'not_observed':['pending','reconciliation_required'].includes(found.status)?'pending':'terminal';
      return route.fulfill({contentType:'application/json',body:JSON.stringify({version:'qa-cancellation/1',sessionId:sid,requestId:rid,state,ack:['cancelled','terminal'].includes(state)?'observed':'unknown'})});
    }
    if (await hook(route, { path, method, saved, sent, fulfill })) return;
    if(path.endsWith('/policy')) return fulfill({policy:{...policy,consentState:consented?'accepted':'not_accepted'}});
    if(path.endsWith('/consent')) { consented = true; return fulfill({policy:{...policy,consentState:consented?'accepted':'not_accepted'}}); }
    if(path.endsWith('/sessions')) return fulfill(method === 'POST' ? {session:session(idB)} : {sessions:[session(idA),session(idB)]});
    const id = path.split('/')[4];
    if(method === 'POST') {
      const body = route.request().postDataJSON(); sent.push(body);
      const savedMessage = message(id,body);
      saved.set(id,[savedMessage]); return fulfill({requestId:body.requestId,turnId:body.requestId,sessionId:id,status:'pending',reused:false});
    }
    if(path.includes('/messages/')) return fulfill({message:saved.get(id)[0]});
    return fulfill({session:session(id),messages:saved.get(id)});
  });
  await page.goto(entry.url ?? '/qa?locale=en');
  await expect(page.getByRole('button',{name:'New session'})).toBeEnabled();
  if(entry.select !== false) await page.getByRole('button',{name:`Session ${idA}`,exact:true}).click();
  if(entry.ready !== false) await expect(page.getByLabel('Message',{exact:true})).toBeEnabled();
  return {saved,sent};
}
for (const width of [1280,390]) {
  test(`consent, IME, send, refresh and mobile controls at ${width}`, async ({page,context}) => {
    await page.setViewportSize({width,height:844});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    const {sent}=await fixture(page,context);
    await page.getByLabel('Message',{exact:true}).fill('Hello');
    await expect(page.getByRole('button',{name:'Send',exact:true})).toBeDisabled();
    await page.getByRole('button',{name:'Agree to the notice above'}).click();
    await expect(page.getByRole('button',{name:'Agree to the notice above'})).toHaveCount(0);
    await expect(page.getByLabel('Message',{exact:true})).toBeEnabled();
    const input=page.getByLabel('Message',{exact:true});
    await input.dispatchEvent('compositionstart'); await input.press('Enter');
    expect(sent).toHaveLength(0); await input.dispatchEvent('compositionend');
    await input.fill('Hello'); await input.press('Enter');
    await expect(page.getByRole('log')).toContainText('Saved answer'); expect(sent).toHaveLength(1);
    await page.reload();
    await expect(page.getByRole('log')).toContainText('Hello'); await expect(page.getByRole('log')).toContainText('Saved answer');
    await page.getByRole('button',{name:'New session'}).click();
    await expect(page.getByRole('button',{name:`Session ${idB}`,exact:true})).toHaveAttribute('aria-current','true');
    const dimensions=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client); expect(errors).toEqual([]);
    await page.screenshot({path:`artifacts/QAWEB-005/ui/fixture-${width}.png`,fullPage:true});
  });
}
test('lost ACK retains original ID and never automatically POSTs a second message',async({page,context})=>{
  let recover=0;
  const {sent}=await fixture(page,context,async(route,{path,method,sent,fulfill})=>{
    if(method==='POST' && path.endsWith('/messages')) {sent.push(route.request().postDataJSON());await route.abort();return true;}
    if(path.includes('/messages/')) {recover++;await fulfill({message:message(idA,sent[0],'Recovered original')});return true;}
    return false;
  });
  await page.getByRole('button',{name:'Agree to the notice above'}).click();
    await expect(page.getByRole('button',{name:'Agree to the notice above'})).toHaveCount(0);
    await expect(page.getByLabel('Message',{exact:true})).toBeEnabled();
  await page.getByLabel('Message',{exact:true}).fill('Original'); await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect(page.getByText('Delivery is unconfirmed.',{exact:false})).toBeVisible();
  expect(sent).toHaveLength(1); await page.getByRole('button',{name:'Check original request'}).click();
  await expect(page.getByRole('log')).toContainText('Recovered original'); expect(sent).toHaveLength(1);expect(recover).toBe(1);
});
test('session switch fences late replies and preserves request recovery in the original session',async({page,context})=>{
  let release;
  await fixture(page,context,async(route,{path,method,fulfill})=>{
    if(method==='POST' && path.endsWith('/messages')) {const body=route.request().postDataJSON();await new Promise(resolve=>{release=resolve;});await fulfill({requestId:body.requestId,turnId:body.requestId,sessionId:idA,status:'pending',reused:false}).catch(()=>{});return true;}return false;
  });
  await page.getByRole('button',{name:'Agree to the notice above'}).click();
    await expect(page.getByRole('button',{name:'Agree to the notice above'})).toHaveCount(0);
    await expect(page.getByLabel('Message',{exact:true})).toBeEnabled();
  await page.getByLabel('Message',{exact:true}).fill('Slow'); await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect.poll(()=>!!release).toBe(true);
  await page.getByRole('button',{name:`Session ${idB}`,exact:true}).click(); release();
  await expect(page.getByLabel('Message',{exact:true})).toBeEnabled();
  await expect(page.getByRole('log')).not.toContainText('Old session only');
  await page.getByRole('button',{name:`Session ${idA}`,exact:true}).click();
  await expect(page.getByRole('button',{name:'Check original request'})).toBeVisible();
});
test('401 clears private history and offers existing sign-in',async({page,context})=>{
  let expired=false;
  await fixture(page,context,async(route,{path})=>{if(expired&&path.endsWith(idB)){await route.fulfill({status:401,body:'{}'});return true;}return false;});
  expired=true;await page.getByRole('button',{name:`Session ${idB}`,exact:true}).click();
  const signIn=page.getByRole('link',{name:'Sign in',exact:true});await expect(signIn).toBeVisible();
  const target=new URL(await signIn.getAttribute('href'),'http://127.0.0.1:3019');
  expect(target.pathname).toBe('/auth/sign-in');expect(target.searchParams.get('returnTo')).toBe(`/qa?locale=en&session=${idB}`);
  await expect(page.getByRole('log')).toHaveCount(0);
});
test('duplicate submit is locked immediately and terminal errors never become answers',async({page,context})=>{
  let release;
  const {sent}=await fixture(page,context,async(route,{path,method,sent,fulfill})=>{
    if(method==='POST' && path.endsWith('/messages')) { const body=route.request().postDataJSON();sent.push(body);await new Promise(resolve=>{release=resolve;});await fulfill({requestId:body.requestId,turnId:body.requestId,sessionId:idA,status:'pending',reused:false});return true; }
    if(method==='GET' && path.endsWith(idA) && sent.length) {await fulfill({session:session(idA),messages:[message(idA,sent[0],'Not a successful answer','technical_failure')]});return true;}
    return false;
  });
  await page.getByRole('button',{name:'Agree to the notice above'}).click();
  await expect(page.getByRole('button',{name:'Agree to the notice above'})).toHaveCount(0);
  const input=page.getByLabel('Message',{exact:true});await input.fill('Duplicate guard');
  await page.locator('form').evaluate(form=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  await expect.poll(()=>sent.length).toBe(1);release();
  await expect(page.getByRole('log')).toContainText('Request incomplete');
  await expect(page.getByRole('log')).not.toContainText('Not a successful answer'); expect(sent).toHaveLength(1);
});
test('SDK owner replacement clears messages and aborts old in-flight work',async({page,context})=>{
  let release, switched=false;
  const {saved}=await fixture(page,context,async(route,{path,method,fulfill})=>{
    if(switched && method==='GET' && path.endsWith('/sessions')) {await fulfill({sessions:[session(idB)]});return true;}
    if(switched && path.endsWith(idA)) {await route.fulfill({status:403,contentType:'application/json',body:JSON.stringify(wire({error:{code:'FORBIDDEN',ack:'not_submitted'}}))});return true;}
    if(method==='POST'&&path.endsWith('/messages')) {await new Promise(resolve=>{release=resolve;});await fulfill({requestId:idB,turnId:idB,sessionId:idA,status:'pending',reused:false}).catch(()=>{});return true;}return false;
  });
  saved.set(idA,[message(idA,{requestId:idB,text:'Owner A private'},'Owner A answer')]);
  await page.getByRole('button',{name:'Agree to the notice above'}).click();
  await expect(page.getByRole('log')).toContainText('Owner A private');
  await page.getByLabel('Message',{exact:true}).fill('In flight'); await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect.poll(()=>!!release).toBe(true);
  // Synthetic cross-tab SDK event, not a server identity assertion.
  switched=true; await page.evaluate(owner=>{const channel=new BroadcastChannel('sb-127-auth-token');channel.postMessage({event:'SIGNED_IN',session:{user:{id:owner}}});setTimeout(()=>channel.close(),100);},idB);
  await expect(page.getByRole('log')).not.toContainText('Owner A private');
  release();await expect(page.getByRole('button',{name:'Check original request'})).toHaveCount(0);
  await page.evaluate(()=>{const channel=new BroadcastChannel('sb-127-auth-token');channel.postMessage({event:'SIGNED_OUT',session:null});setTimeout(()=>channel.close(),100);});
  await expect(page.getByRole('link',{name:'Sign in',exact:true})).toBeVisible();
});

for (const mode of ['current_input_v1', 'task_history_v1']) {
  test(`legacy policy ${mode} cannot admit new QA messages`, async ({page,context})=>{
    const {sent}=await fixture(page,context,async(route,{path,fulfill})=>{
      if(path.endsWith('/policy')) {await fulfill({policy:{...policy,contextMode:mode,maxTurns:null,consentState:'accepted'}});return true;}
      return false;
    });
    await expect(page.getByText('This session is not yet authorized for ongoing conversation. Sending is unavailable.')).toBeVisible();
    await page.getByLabel('Message',{exact:true}).fill('Must not send under old consent');
    await expect(page.getByRole('button',{name:'Send',exact:true})).toBeDisabled();
    await page.getByLabel('Message',{exact:true}).press('Enter');
    await page.locator('form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    expect(sent).toHaveLength(0);
  });
}

for (const entry of ['select', 'create', 'query']) {
  test(`pre-consent ${entry} preserves notice through protected 403 and reload`, async ({page,context})=>{
    await login(context);
    let consented=false, saved=[], sends=0, denied=0;
    const selected=entry==='create'?idB:idA;
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/qa-agent/**',async route=>{
      const path=new URL(route.request().url()).pathname, method=route.request().method();
      const fulfill=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(wire(data))});
      if(path.endsWith('/policy')) return fulfill({policy:{...policy,consentState:consented?'accepted':'not_accepted'}});
      if(path.endsWith('/consent')) {
        expect(route.request().postDataJSON()).toEqual({policyId:policy.id,noticeHash:policy.noticeHash});
        consented=true;return fulfill({policy:{...policy,consentState:'accepted'}});
      }
      if(path.endsWith('/sessions')) return fulfill(method==='POST'?{session:session(idB)}:{sessions:[session(idA),session(idB)]});
      if(!consented) {denied++;return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify(wire({error:{code:'DATA_POLICY_BLOCKED',ack:'not_submitted'}}))});}
      if(method==='POST') {
        sends++;const body=route.request().postDataJSON();saved=[message(selected,body,'Consented answer')];
        return fulfill({requestId:body.requestId,turnId:body.requestId,sessionId:selected,status:'pending',reused:false});
      }
      return fulfill({session:session(selected),messages:saved});
    });
    await page.goto(`/qa?locale=en${entry==='query'?`&session=${idA}`:''}`);
    if(entry==='select') await page.getByRole('button',{name:`Session ${idA}`,exact:true}).click();
    if(entry==='create') await page.getByRole('button',{name:'New session',exact:true}).click();
    await expect.poll(()=>denied).toBeGreaterThan(0);
    await expect(page.getByRole('region',{name:'Agent QA'}).getByRole('alert')).toContainText('The request could not be completed.');
    await expect(page.getByText(policy.noticeEn,{exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Agree to the notice above'})).toBeEnabled();
    await expect(page.getByRole('button',{name:'Send',exact:true})).toBeDisabled();
    await page.locator('form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(sends).toBe(0);
    const previousDenied=denied;await page.reload();
    await expect.poll(()=>denied).toBeGreaterThan(previousDenied);
    await expect(page.getByText(policy.noticeEn,{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Agree to the notice above'}).click();
    await expect(page.getByLabel('Message',{exact:true})).toBeEnabled();
    await page.getByLabel('Message',{exact:true}).fill('Now authorized');
    await page.getByRole('button',{name:'Send',exact:true}).click();
    await expect(page.getByRole('log')).toContainText('Consented answer');expect(sends).toBe(1);expect(errors).toEqual([]);
  });
}

const earlierId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const recentTwenty=Array.from({length:20},(_,index)=>session(`00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`));
const savedTurns=(id,count)=>Array.from({length:count},(_,index)=>message(id,{requestId:`bbbbbbbb-bbbb-4bbb-8bbb-${String(index+1).padStart(12,'0')}`,text:`Prior ${index+1}`},`Answer ${index+1}`));
for(const foreign of [false,true]) {
 test(`explicit bookmark outside twenty-session list ${foreign?'retains RLS refusal':'loads protected detail and joins list'}`,async({page,context})=>{
  let details=0;
  await fixture(page,context,async(route,{path,method,fulfill})=>{
   if(path.endsWith('/policy')) {await fulfill({policy:{...policy,consentState:'accepted'}});return true;}
   if(method==='GET'&&path.endsWith('/sessions')) {await fulfill({sessions:recentTwenty});return true;}
   if(path.endsWith(earlierId)) {
    details++;
    if(foreign) await route.fulfill({status:403,contentType:'application/json',body:JSON.stringify(wire({error:{code:'FORBIDDEN',ack:'not_submitted'}}))});
    else await fulfill({session:{...session(earlierId),label:'Earlier session'},messages:[message(earlierId,{requestId:idB,text:'Saved bookmark'},'Saved bookmarked answer')]});
    return true;
   }
   return false;
  },{url:`/qa?locale=en&session=${earlierId}`,select:false,ready:!foreign});
  await expect.poll(()=>details).toBeGreaterThan(0);
  if(foreign) {
   await expect(page.getByRole('region',{name:'Agent QA'}).getByRole('alert')).toContainText('The request could not be completed.');
   await expect(page.getByRole('log')).toBeEmpty();await expect(page.getByRole('button',{name:'Earlier session'})).toHaveCount(0);
   await expect(page.getByRole('button',{name:'Send',exact:true})).toBeDisabled();
  } else {
   await expect(page.getByRole('log')).toContainText('Saved bookmarked answer');
   await expect(page.getByRole('button',{name:'Earlier session'})).toHaveAttribute('aria-current','true');
   await page.reload();await expect(page.getByRole('log')).toContainText('Saved bookmarked answer');
  }
 });
}
test('eighth accepted turn completes and preserves history while new sends stop; switch restores composer',async({page,context})=>{
 const prior=savedTurns(idA,7);const submitted=[];
 await fixture(page,context,async(route,{path,method,saved,fulfill})=>{
  const id=path.split('/')[4];
  if(path.endsWith('/policy')) {await fulfill({policy:{...policy,consentState:'accepted'}});return true;}
  if(method==='GET'&&path.endsWith(idA)) {await fulfill({session:session(idA),messages:saved.get(idA).length?saved.get(idA):prior});return true;}
  if(method==='POST'&&path.endsWith('/messages')) {
   const body=route.request().postDataJSON();submitted.push({id,...body});
   saved.set(id,[...(id===idA?prior:[]),message(id,body,'Accepted answer')]);
   await fulfill({requestId:body.requestId,turnId:body.requestId,sessionId:id,status:'pending',reused:false});return true;
  }
  return false;
 });
 await page.getByLabel('Message',{exact:true}).fill('Eighth');await page.getByRole('button',{name:'Send',exact:true}).click();
 await expect(page.getByRole('log')).toContainText('Accepted answer');
 await expect(page.getByText('This session has reached its context capacity limit. Please start a new session with a shorter question.')).toBeVisible();
 await expect(page.getByRole('log')).toContainText('Answer 1');await expect(page.getByRole('log').locator('article')).toHaveCount(8);
 await expect(page.getByRole('button',{name:'Send',exact:true})).toBeDisabled();
 await page.locator('form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(submitted).toHaveLength(1);
 await page.getByRole('button',{name:`Session ${idB}`,exact:true}).click();await page.getByLabel('Message',{exact:true}).fill('New session question');
 await page.getByRole('button',{name:'Send',exact:true}).click();await expect(page.getByRole('log')).toContainText('Accepted answer');expect(submitted).toHaveLength(2);
});
test('ninth rejection keeps history and notice, prevents retries, and new session restores sending',async({page,context})=>{
 const prior=savedTurns(idA,7);const submitted=[];
 await fixture(page,context,async(route,{path,method,saved,fulfill})=>{
  const id=path.split('/')[4];
  if(path.endsWith('/policy')) {await fulfill({policy:{...policy,consentState:'accepted'}});return true;}
  // Another tab has used the last slot since this protected seven-turn read.
  if(method==='GET'&&path.endsWith(idA)) {await fulfill({session:session(idA),messages:prior});return true;}
  if(method==='POST'&&path.endsWith('/messages')) {
   const body=route.request().postDataJSON();submitted.push({id,...body});
   if(id===idA) await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify(wire({error:{code:'QA_CONTEXT_LIMIT',ack:'not_submitted'}}))});
   else {saved.set(id,[message(id,body,'New session answer')]);await fulfill({requestId:body.requestId,turnId:body.requestId,sessionId:id,status:'pending',reused:false});}
   return true;
  }
  return false;
 });
 await page.getByLabel('Message',{exact:true}).fill('Ninth');await page.getByRole('button',{name:'Send',exact:true}).click();
 await expect(page.getByText('This session has reached its context capacity limit. Please start a new session with a shorter question.')).toBeVisible();
 await expect(page.getByRole('log')).toContainText('Answer 7');await expect(page.getByText(policy.noticeEn,{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Agree to the notice above'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Check original request'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Send',exact:true})).toBeDisabled();
 await page.locator('form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(submitted).toHaveLength(1);
 await page.getByRole('button',{name:'New session',exact:true}).click();await page.getByLabel('Message',{exact:true}).fill('Continue');
 await page.getByRole('button',{name:'Send',exact:true}).click();await expect(page.getByRole('log')).toContainText('New session answer');expect(submitted).toHaveLength(2);
 await page.getByRole('button',{name:`Session ${idA}`,exact:true}).click();await expect(page.getByRole('button',{name:'Send',exact:true})).toBeDisabled();
});

test('pending history retries one temporary 503 and automatically reads answer without a second POST',async({page,context})=>{
 let reads=0;
 const {sent}=await fixture(page,context,async(route,{path,method,sent,fulfill,saved})=>{
  if(method==='GET'&&path.endsWith(idA)&&sent.length) {
   reads++;
   if(reads===1) await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify(wire({error:{code:'PROVIDER_UNAVAILABLE',ack:'not_submitted'}}))});
   else await fulfill({session:session(idA),messages:saved.get(idA)});
   return true;
  }
  return false;
 });
 await page.getByRole('button',{name:'Agree to the notice above'}).click();await expect(page.getByLabel('Message',{exact:true})).toBeEnabled();
 await page.getByLabel('Message',{exact:true}).fill('Wait for original reply');await page.getByRole('button',{name:'Send',exact:true}).click();
 await expect(page.getByRole('log')).toContainText('Saved answer',{timeout:10000});expect(reads).toBe(2);expect(sent).toHaveLength(1);
});
test('pending history stops after three retries and manual Reload reads only the original answer',async({page,context})=>{
 let reads=0,healthy=false;
 const {sent}=await fixture(page,context,async(route,{path,method,sent,fulfill,saved})=>{
  if(method==='GET'&&path.endsWith(idA)&&sent.length) {
   reads++;
   if(!healthy) await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify(wire({error:{code:'PROVIDER_UNAVAILABLE',ack:'not_submitted'}}))});
   else await fulfill({session:session(idA),messages:saved.get(idA)});
   return true;
  }
  return false;
 });
 await page.getByRole('button',{name:'Agree to the notice above'}).click();await expect(page.getByLabel('Message',{exact:true})).toBeEnabled();
 await page.getByLabel('Message',{exact:true}).fill('Keep original pending');await page.getByRole('button',{name:'Send',exact:true}).click();
 await expect(page.getByText('Automatic reading has paused. Click Reload to check the original reply.')).toBeVisible({timeout:15000});
 await expect(page.getByRole('log')).toContainText('Keep original pending');await expect(page.getByRole('log')).not.toContainText('Saved answer');
 expect(reads).toBe(4);await page.waitForTimeout(2200);expect(reads).toBe(4);expect(sent).toHaveLength(1);
 healthy=true;await page.getByRole('button',{name:'Reload',exact:true}).click();await expect(page.getByRole('log')).toContainText('Saved answer');expect(sent).toHaveLength(1);
});
for(const kind of ['401','403','invalid']) {
 test(`pending history ${kind} stops immediately and clears private messages`,async({page,context})=>{
  let reads=0;
  const {sent}=await fixture(page,context,async(route,{path,method,sent,fulfill})=>{
   if(method==='GET'&&path.endsWith(idA)&&sent.length) {
    reads++;
    if(kind==='invalid') await fulfill({session:session(idB),messages:[]});
    else await route.fulfill({status:Number(kind),contentType:'application/json',body:JSON.stringify(wire({error:{code:kind==='401'?'UNAUTHENTICATED':'DATA_POLICY_BLOCKED',ack:'not_submitted'}}))});
    return true;
   }
   return false;
  });
  await page.getByRole('button',{name:'Agree to the notice above'}).click();await expect(page.getByLabel('Message',{exact:true})).toBeEnabled();
  await page.getByLabel('Message',{exact:true}).fill('Private pending input');await page.getByRole('button',{name:'Send',exact:true}).click();
  if(kind==='401') {await expect(page.getByRole('link',{name:'Sign in',exact:true})).toBeVisible();await expect(page.getByRole('log')).toHaveCount(0);}
  else {await expect(page.getByRole('region',{name:'Agent QA'}).getByRole('alert')).toContainText('The request could not be completed.');await expect(page.getByRole('log')).toBeEmpty();await expect(page.getByRole('button',{name:'Send',exact:true})).toBeDisabled();}
  await page.waitForTimeout(2200);expect(reads).toBe(1);expect(sent).toHaveLength(1);
 });
}
test('Session switch cancels scheduled pending-history backoff without leaking the old reply',async({page,context})=>{
 let reads=0;
 const {sent}=await fixture(page,context,async(route,{path,method,sent})=>{
  if(method==='GET'&&path.endsWith(idA)&&sent.length) {reads++;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify(wire({error:{code:'PROVIDER_UNAVAILABLE',ack:'not_submitted'}}))});return true;}
  return false;
 });
 await page.getByRole('button',{name:'Agree to the notice above'}).click();await expect(page.getByLabel('Message',{exact:true})).toBeEnabled();
 await page.getByLabel('Message',{exact:true}).fill('Old pending input');await page.getByRole('button',{name:'Send',exact:true}).click();
 await expect.poll(()=>reads).toBe(1);await page.getByRole('button',{name:`Session ${idB}`,exact:true}).click();
 await expect(page.getByLabel('Message',{exact:true})).toBeEnabled();await page.waitForTimeout(2200);
 expect(reads).toBe(1);expect(sent).toHaveLength(1);await expect(page.getByRole('log')).not.toContainText('Old pending input');
});

const recoveryKey='vp.qa.pending-identity/v1';
test('unknown ACK refresh restores only original UUID and late row is recovered with one POST',async({page,context})=>{
 let late=false;const recovered=[];
 const {sent}=await fixture(page,context,async(route,{path,method,sent,fulfill})=>{
  if(method==='POST'&&path.endsWith('/messages')) {sent.push(route.request().postDataJSON());await route.abort();return true;}
  if(path.includes('/messages/')) {
   recovered.push(path.split('/').at(-1));
   if(late) await fulfill({message:message(idA,sent[0],'Late original answer')});
   else await route.fulfill({status:403,contentType:'application/json',body:JSON.stringify(wire({error:{code:'FORBIDDEN',ack:'not_submitted'}}))});
   return true;
  }
  return false;
 });
 await page.getByRole('button',{name:'Agree to the notice above'}).click();await expect(page.getByLabel('Message',{exact:true})).toBeEnabled();
 await page.getByLabel('Message',{exact:true}).fill('Private original input 原文');await page.getByRole('button',{name:'Send',exact:true}).click();
 await expect(page.getByRole('button',{name:'Check original request'})).toBeVisible();
 const stored=await page.evaluate(key=>sessionStorage.getItem(key),recoveryKey);
 expect(JSON.parse(stored)).toEqual({version:1,actorId:idA,requests:[{sessionId:idA,requestId:sent[0].requestId}]});expect(stored).not.toContain('Private original input');
 await page.reload();await expect(page.getByText('Original delivery is unconfirmed.',{exact:false})).toBeVisible();
 await expect(page.getByRole('button',{name:'Send',exact:true})).toBeDisabled();
 await page.locator('form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(sent).toHaveLength(1);
 await page.getByRole('button',{name:'Check original request'}).click();await expect.poll(()=>recovered.length).toBe(1);
 await expect(page.getByRole('button',{name:'Resend original request'})).toHaveCount(0);expect(sent).toHaveLength(1);
 late=true;await page.getByRole('button',{name:'Check original request'}).click();await expect(page.getByRole('log')).toContainText('Late original answer');
 expect(recovered).toEqual([sent[0].requestId,sent[0].requestId]);expect(sent).toHaveLength(1);
 expect(await page.evaluate(key=>sessionStorage.getItem(key),recoveryKey)).toBeNull();
});
test('unknown ACK refresh finds matching history receipt and clears only its recovery marker',async({page,context})=>{
 let late=false;
 const {sent}=await fixture(page,context,async(route,{path,method,sent,fulfill})=>{
  if(method==='POST'&&path.endsWith('/messages')) {sent.push(route.request().postDataJSON());await route.abort();return true;}
  if(late&&method==='GET'&&path.endsWith(idA)) {await fulfill({session:session(idA),messages:[message(idA,sent[0],'Confirmed original history')]});return true;}
  return false;
 });
 await page.getByRole('button',{name:'Agree to the notice above'}).click();await expect(page.getByLabel('Message',{exact:true})).toBeEnabled();
 await page.getByLabel('Message',{exact:true}).fill('Original history input');await page.getByRole('button',{name:'Send',exact:true}).click();
 await expect(page.getByRole('button',{name:'Check original request'})).toBeVisible();late=true;await page.reload();
 await expect(page.getByRole('log')).toContainText('Confirmed original history');await expect(page.getByRole('button',{name:'Check original request'})).toHaveCount(0);
 expect(await page.evaluate(key=>sessionStorage.getItem(key),recoveryKey)).toBeNull();expect(sent).toHaveLength(1);
});
for(const failure of ['read','write']) {
 test(`recovery storage ${failure} failure blocks message POST before admission`,async({page,context})=>{
  await page.addInitScript(({key,failure})=>{
   const method=failure==='read'?'getItem':'setItem',original=Storage.prototype[method];
   Storage.prototype[method]=function(...args){if(args[0]===key)throw new DOMException('Synthetic recovery storage failure','SecurityError');return original.apply(this,args);};
  },{key:recoveryKey,failure});
  const {sent}=await fixture(page,context,()=>false,{ready:failure!=='read'});
  await page.getByRole('button',{name:'Agree to the notice above'}).click();
  if(failure==='write') {await page.getByLabel('Message',{exact:true}).fill('Must not leave browser');await page.getByRole('button',{name:'Send',exact:true}).click();}
  await expect(page.getByText('Request recovery storage is unavailable. New sending is paused. Please click Reload.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Send',exact:true})).toBeDisabled();expect(sent).toHaveLength(0);
 });
}
test('unknown recovery identity is cleared on actor change and logout, never leaked to new actor',async({page,context})=>{
 let changed=false;
 const {sent}=await fixture(page,context,async(route,{path,method,sent,fulfill})=>{
  if(changed&&method==='GET'&&path.endsWith('/sessions')) {await fulfill({sessions:[session(idB)]});return true;}
  if(changed&&path.endsWith(idA)) {await route.fulfill({status:403,contentType:'application/json',body:JSON.stringify(wire({error:{code:'FORBIDDEN',ack:'not_submitted'}}))});return true;}
  if(method==='POST'&&path.endsWith('/messages')) {sent.push(route.request().postDataJSON());await route.abort();return true;}
  return false;
 });
 await page.getByRole('button',{name:'Agree to the notice above'}).click();await expect(page.getByLabel('Message',{exact:true})).toBeEnabled();
 await page.getByLabel('Message',{exact:true}).fill('Owner A private draft');await page.getByRole('button',{name:'Send',exact:true}).click();
 await expect(page.getByRole('button',{name:'Check original request'})).toBeVisible();changed=true;
 await page.evaluate(owner=>{const c=new BroadcastChannel('sb-127-auth-token');c.postMessage({event:'SIGNED_IN',session:{user:{id:owner}}});setTimeout(()=>c.close(),100);},idB);
 await expect(page.getByRole('button',{name:'Check original request'})).toHaveCount(0);
 expect(await page.evaluate(key=>sessionStorage.getItem(key),recoveryKey)).toBeNull();expect(sent).toHaveLength(1);
 // An unresolved same-actor record is also erased by the SDK logout event.
 await page.evaluate(({key,owner})=>{sessionStorage.setItem(key,JSON.stringify({version:1,actorId:owner,requests:[{sessionId:owner,requestId:'44444444-4444-4444-8444-444444444444'}]}));const c=new BroadcastChannel('sb-127-auth-token');c.postMessage({event:'SIGNED_OUT',session:null});setTimeout(()=>c.close(),100);},{key:recoveryKey,owner:idB});
 await expect(page.getByRole('link',{name:'Sign in',exact:true})).toBeVisible();expect(await page.evaluate(key=>sessionStorage.getItem(key),recoveryKey)).toBeNull();
});
test('confirmed accepted receipt clears recovery identity before pending GET polling',async({page,context})=>{
 const {sent}=await fixture(page,context);
 await page.getByRole('button',{name:'Agree to the notice above'}).click();await expect(page.getByLabel('Message',{exact:true})).toBeEnabled();
 await page.getByLabel('Message',{exact:true}).fill('Accepted once');await page.getByRole('button',{name:'Send',exact:true}).click();
 await expect(page.getByLabel('Message',{exact:true})).toHaveValue('');
 expect(await page.evaluate(key=>sessionStorage.getItem(key),recoveryKey)).toBeNull();expect(sent).toHaveLength(1);
});
test('confirmed receipt cleanup failure retains marker and blocks new sends until safe readback cleanup',async({page,context})=>{
 await page.addInitScript(key=>{
  window.blockRecoveryCleanup=true;const original=Storage.prototype.removeItem;
  Storage.prototype.removeItem=function(candidate){if(candidate===key&&window.blockRecoveryCleanup)throw new DOMException('Synthetic cleanup failure','SecurityError');return original.call(this,candidate);};
 },recoveryKey);
 const {sent}=await fixture(page,context);
 await page.getByRole('button',{name:'Agree to the notice above'}).click();await expect(page.getByLabel('Message',{exact:true})).toBeEnabled();
 await page.getByLabel('Message',{exact:true}).fill('Confirmed before cleanup');await page.getByRole('button',{name:'Send',exact:true}).click();
 await expect(page.getByText('Request recovery storage is unavailable. New sending is paused. Please click Reload.')).toBeVisible();
 expect(JSON.parse(await page.evaluate(key=>sessionStorage.getItem(key),recoveryKey)).requests[0].requestId).toBe(sent[0].requestId);
 await expect(page.getByRole('button',{name:'Send',exact:true})).toBeDisabled();expect(sent).toHaveLength(1);
 await page.evaluate(()=>{window.blockRecoveryCleanup=false;});await page.getByRole('button',{name:'Reload',exact:true}).click();
 await expect(page.getByRole('log')).toContainText('Saved answer');expect(await page.evaluate(key=>sessionStorage.getItem(key),recoveryKey)).toBeNull();expect(sent).toHaveLength(1);
});
test('replay not_submitted cannot erase an earlier unknown ACK identity across refresh',async({page,context})=>{
 const lookups=[];
 const {sent}=await fixture(page,context,async(route,{path,method,sent})=>{
  if(method==='POST'&&path.endsWith('/messages')) {
   sent.push(route.request().postDataJSON());
   if(sent.length===1) await route.abort();
   else await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify(wire({error:{code:'PROVIDER_UNAVAILABLE',ack:'not_submitted'}}))});
   return true;
  }
  if(path.includes('/messages/')) {lookups.push(path.split('/').at(-1));await route.fulfill({status:403,contentType:'application/json',body:JSON.stringify(wire({error:{code:'FORBIDDEN',ack:'not_submitted'}}))});return true;}
  return false;
 });
 await page.getByRole('button',{name:'Agree to the notice above'}).click();await expect(page.getByLabel('Message',{exact:true})).toBeEnabled();
 await page.getByLabel('Message',{exact:true}).fill(' Original bytes preserved ');await page.getByRole('button',{name:'Send',exact:true}).click();
 await page.getByRole('button',{name:'Check original request'}).click();await page.getByRole('button',{name:'Resend original request'}).click();
 await expect.poll(()=>sent.length).toBe(2);expect(sent[1]).toEqual(sent[0]);expect(lookups).toEqual([sent[0].requestId]);
 expect(JSON.parse(await page.evaluate(key=>sessionStorage.getItem(key),recoveryKey)).requests[0].requestId).toBe(sent[0].requestId);
 await page.reload();await expect(page.getByText('Original delivery is unconfirmed.',{exact:false})).toBeVisible();
 await expect(page.getByRole('button',{name:'Send',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Resend original request'})).toHaveCount(0);
 await page.locator('form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(sent).toHaveLength(2);
});
test('late old actor receipt cannot clear new actor unknown recovery marker',async({page,context})=>{
 let newActor=false,releaseOld;const posts=[];
 await fixture(page,context,async(route,{path,method,fulfill})=>{
  if(path.endsWith('/policy')) {await fulfill({policy:{...policy,consentState:'accepted'}});return true;}
  if(newActor&&method==='GET'&&path.endsWith('/sessions')) {await fulfill({sessions:[session(idB)]});return true;}
  if(newActor&&path.endsWith(idA)) {await route.fulfill({status:403,contentType:'application/json',body:JSON.stringify(wire({error:{code:'FORBIDDEN',ack:'not_submitted'}}))});return true;}
  if(method==='POST'&&path.endsWith('/messages')) {
   const body=route.request().postDataJSON();posts.push(body);
   if(posts.length===1) {await new Promise(resolve=>{releaseOld=resolve;});await fulfill({requestId:body.requestId,turnId:body.requestId,sessionId:idA,status:'pending',reused:false}).catch(()=>{});}
   else await route.abort();
   return true;
  }
  return false;
 });
 await page.getByLabel('Message',{exact:true}).fill('Old actor in flight');await page.getByRole('button',{name:'Send',exact:true}).click();await expect.poll(()=>!!releaseOld).toBe(true);
 newActor=true;await page.evaluate(owner=>{const c=new BroadcastChannel('sb-127-auth-token');c.postMessage({event:'SIGNED_IN',session:{user:{id:owner}}});setTimeout(()=>c.close(),100);},idB);
 await page.getByRole('button',{name:`Session ${idB}`,exact:true}).click();await page.getByLabel('Message',{exact:true}).fill('New actor unknown');await page.getByRole('button',{name:'Send',exact:true}).click();
 await expect(page.getByRole('button',{name:'Check original request'})).toBeVisible();
 const record=await page.evaluate(key=>sessionStorage.getItem(key),recoveryKey);expect(JSON.parse(record).actorId).toBe(idB);expect(JSON.parse(record).requests[0].requestId).toBe(posts[1].requestId);
 releaseOld();await page.waitForTimeout(200);expect(await page.evaluate(key=>sessionStorage.getItem(key),recoveryKey)).toBe(record);expect(posts).toHaveLength(2);
});

const reconciliationText='The reply cannot be confirmed yet. To avoid duplicate processing, this question will not be resent automatically. You can check again later.';
test('durable reconciliation survives refresh, stops spinner and POST, and manual original GET can read stored answer',async({page,context})=>{
 let ready=false,historyReads=0;const originalReads=[];
 const {sent}=await fixture(page,context,async(route,{path,method,sent,fulfill})=>{
  if(sent.length&&method==='GET'&&path.endsWith(idA)) {historyReads++;await fulfill({session:session(idA),messages:[message(idA,sent[0],null,'reconciliation_required')]});return true;}
  if(path.includes('/messages/')) {originalReads.push(path.split('/').at(-1));await fulfill({message:message(idA,sent[0],ready?'Eventually stored answer':null,ready?'answered':'reconciliation_required')});return true;}
  return false;
 });
 await page.getByRole('button',{name:'Agree to the notice above'}).click();await expect(page.getByLabel('Message',{exact:true})).toBeEnabled();
 await page.getByLabel('Message',{exact:true}).fill('Original dispatched question');await page.getByRole('button',{name:'Send',exact:true}).click();
 await expect(page.getByRole('log')).toContainText(reconciliationText);await expect(page.getByRole('log')).not.toContainText('Replying');await expect(page.getByRole('button',{name:'Send',exact:true})).toBeDisabled();
 const count=historyReads;await page.waitForTimeout(2200);expect(historyReads).toBe(count);expect(sent).toHaveLength(1);
 await page.reload();await expect(page.getByRole('log')).toContainText(reconciliationText);await expect(page.getByRole('log')).not.toContainText('Request incomplete');
 await page.locator('form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(sent).toHaveLength(1);
 await page.getByRole('button',{name:'Check again',exact:true}).click();await expect.poll(()=>originalReads.length).toBe(1);await expect(page.getByRole('log')).toContainText(reconciliationText);
 ready=true;await page.getByRole('button',{name:'Check again',exact:true}).click();await expect(page.getByRole('log')).toContainText('Eventually stored answer');
 expect(originalReads).toEqual([sent[0].requestId,sent[0].requestId]);expect(sent).toHaveLength(1);await expect(page.getByLabel('Message',{exact:true})).toHaveValue('');
});
test('explicit new Session does not carry or resend reconciled-question body',async({page,context})=>{
 const prior={requestId:earlierId,text:'Old dispatched body'};
 const {sent}=await fixture(page,context,async(route,{path,method,fulfill})=>{
  if(path.endsWith('/policy')) {await fulfill({policy:{...policy,consentState:'accepted'}});return true;}
  if(method==='GET'&&path.endsWith(idA)) {await fulfill({session:session(idA),messages:[message(idA,prior,null,'reconciliation_required')]});return true;}
  return false;
 },{ready:false});
 await expect(page.getByRole('log')).toContainText(reconciliationText);await page.getByRole('button',{name:'New session',exact:true}).click();
 await expect(page.getByLabel('Message',{exact:true})).toBeEnabled();await expect(page.getByLabel('Message',{exact:true})).toHaveValue('');expect(sent).toHaveLength(0);
 await page.getByLabel('Message',{exact:true}).fill('A different question');await page.getByRole('button',{name:'Send',exact:true}).click();await expect(page.getByRole('log')).toContainText('Saved answer');
 expect(sent).toHaveLength(1);expect(sent[0].text).toBe('A different question');expect(sent[0].requestId).not.toBe(prior.requestId);
});
test('reconciliation, actual technical failure and normal pending remain visibly distinct',async({page,context})=>{
 await fixture(page,context,async(route,{path,method,fulfill})=>{
  if(path.endsWith('/policy')) {await fulfill({policy:{...policy,consentState:'accepted'}});return true;}
  if(method==='GET'&&path.endsWith(idA)) {await fulfill({session:session(idA),messages:[message(idA,{requestId:earlierId,text:'Reconciliation input'},null,'reconciliation_required'),message(idA,{requestId:idB,text:'Failed input'},'Hidden technical detail','technical_failure'),message(idA,{requestId:policy.id,text:'Pending input'},null,'pending')]});return true;}
  return false;
 },{ready:false});
 const articles=page.getByRole('log').locator('article');
 await expect(articles.filter({hasText:'Reconciliation input'})).toContainText(reconciliationText);await expect(articles.filter({hasText:'Reconciliation input'})).not.toContainText('Replying');
 await expect(articles.filter({hasText:'Failed input'})).toContainText('Request incomplete');await expect(articles.filter({hasText:'Failed input'})).not.toContainText('Hidden technical detail');
 await expect(articles.filter({hasText:'Pending input'})).toContainText('Replying');await expect(page.locator('form button[type=submit]')).toBeDisabled();
});
test('reconciliation original GET is fenced when Session changes during the read',async({page,context})=>{
 let release;const prior={requestId:earlierId,text:'Old reconciliation input'};
 const {sent}=await fixture(page,context,async(route,{path,method,fulfill})=>{
  if(path.endsWith('/policy')) {await fulfill({policy:{...policy,consentState:'accepted'}});return true;}
  if(method==='GET'&&path.endsWith(idA)) {await fulfill({session:session(idA),messages:[message(idA,prior,null,'reconciliation_required')]});return true;}
  if(path.includes('/messages/')) {await new Promise(resolve=>{release=resolve;});await fulfill({message:message(idA,prior,'Old protected answer')}).catch(()=>{});return true;}
  return false;
 },{ready:false});
 await page.getByRole('button',{name:'Check again',exact:true}).click();await expect.poll(()=>!!release).toBe(true);await page.getByRole('button',{name:`Session ${idB}`,exact:true}).click();
 release();await expect(page.getByLabel('Message',{exact:true})).toBeEnabled();await expect(page.getByRole('log')).not.toContainText('Old protected answer');expect(sent).toHaveLength(0);
});
test('unknown admission journal becomes confirmed durable reconciliation without allowing replacement after refresh',async({page,context})=>{
 let admitted=false;
 const {sent}=await fixture(page,context,async(route,{path,method,sent,fulfill})=>{
  if(method==='POST'&&path.endsWith('/messages')) {sent.push(route.request().postDataJSON());await route.abort();return true;}
  if(admitted&&method==='GET'&&path.endsWith(idA)) {await fulfill({session:session(idA),messages:[message(idA,sent[0],null,'reconciliation_required')]});return true;}
  return false;
 });
 await page.getByRole('button',{name:'Agree to the notice above'}).click();await expect(page.getByLabel('Message',{exact:true})).toBeEnabled();await page.getByLabel('Message',{exact:true}).fill('Uncertain dispatched question');await page.getByRole('button',{name:'Send',exact:true}).click();
 await expect(page.getByRole('button',{name:'Check original request'})).toBeVisible();admitted=true;await page.reload();
 await expect(page.getByRole('log')).toContainText(reconciliationText);await expect(page.getByRole('button',{name:'Resend original request'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Send',exact:true})).toBeDisabled();
 expect(await page.evaluate(key=>sessionStorage.getItem(key),recoveryKey)).toBeNull();expect(sent).toHaveLength(1);
});

test('WEB001 URL Session changes and browser back-forward bind the visible conversation before sending',async({page,context})=>{
 const destinations=[];
 const {saved}=await fixture(page,context,async(route,{path,method})=>{if(method==='POST'&&path.endsWith('/messages'))destinations.push(path.split('/')[4]);return false;});
 saved.set(idA,[message(idA,{requestId:earlierId,text:'Conversation A'},'Answer A')]);saved.set(idB,[message(idB,{requestId:policy.id,text:'Conversation B'},'Answer B')]);
 await page.getByRole('button',{name:'Agree to the notice above'}).click();await expect(page.getByRole('log')).toContainText('Answer A');
 await page.evaluate(id=>history.pushState(null,'',`/qa?locale=en&session=${id}`),idB);
 await expect(page.getByRole('button',{name:`Session ${idB}`,exact:true})).toHaveAttribute('aria-current','true');await expect(page.getByRole('log')).toContainText('Answer B');await expect(page.getByRole('log')).not.toContainText('Answer A');
 await page.getByLabel('Message',{exact:true}).fill('B only');await page.getByRole('button',{name:'Send',exact:true}).click();await expect(page.getByRole('log')).toContainText('Saved answer');expect(destinations).toEqual([idB]);
 await page.goBack();await expect(page.getByRole('log')).toContainText('Answer A');await expect(page.getByRole('log')).not.toContainText('B only');
 await page.goForward();await expect(page.getByRole('log')).toContainText('B only');
});
test('WEB001 permission-denied send hides previously protected history and blocks further admission',async({page,context})=>{
 let denied=false;const attempts=[];
 const {saved}=await fixture(page,context,async(route,{path,method})=>{
  if(denied&&method==='POST'&&path.endsWith('/messages')) {attempts.push(route.request().postDataJSON());await route.fulfill({status:403,contentType:'application/json',body:JSON.stringify(wire({error:{code:'FORBIDDEN',ack:'not_submitted'}}))});return true;}
  return false;
 });
 saved.set(idA,[message(idA,{requestId:earlierId,text:'Protected private history'},'Private prior answer')]);
 await page.getByRole('button',{name:'Agree to the notice above'}).click();await expect(page.getByRole('log')).toContainText('Private prior answer');
 denied=true;await page.getByLabel('Message',{exact:true}).fill('Write now denied');await page.getByRole('button',{name:'Send',exact:true}).click();
 await expect(page.getByRole('region',{name:'Agent QA'}).getByRole('alert')).toBeVisible();await expect(page.getByRole('log')).toBeEmpty();await expect(page.getByRole('button',{name:'Send',exact:true})).toBeDisabled();expect(attempts).toHaveLength(1);
});
test('WEB001 removing URL Session clears private selection and pending URL reads are fenced',async({page,context})=>{
 let release;
 await fixture(page,context,async(route,{path,method,fulfill})=>{
  if(path.endsWith('/policy')) {await fulfill({policy:{...policy,consentState:'accepted'}});return true;}
  if(method==='GET'&&path.endsWith(idB)) {await new Promise(resolve=>{release=resolve;});await fulfill({session:session(idB),messages:[message(idB,{requestId:earlierId,text:'Late B'},'Private late B answer')]}).catch(()=>{});return true;}
  return false;
 });
 await page.evaluate(id=>history.pushState(null,'',`/qa?locale=en&session=${id}`),idB);await expect.poll(()=>!!release).toBe(true);
 await page.evaluate(()=>history.pushState(null,'','/qa?locale=en'));release();
 await expect(page.getByRole('log')).toContainText('Select or create a session');await expect(page.getByRole('log')).not.toContainText('Private late B answer');await expect(page.getByRole('button',{name:'Send',exact:true})).toBeDisabled();
});
test('WEB001 same actor tabs retain independent URL Session and submission destinations',async({page,context})=>{
 const other=await context.newPage(),destinations=[];
 await other.setViewportSize({width:390,height:844});
 const hook=async(route,{path,method,fulfill})=>{
  if(path.endsWith('/policy')) {await fulfill({policy:{...policy,consentState:'accepted'}});return true;}
  if(method==='POST'&&path.endsWith('/messages'))destinations.push({sessionId:path.split('/')[4],text:route.request().postDataJSON().text});
  return false;
 };
 await fixture(page,context,hook);await fixture(other,context,hook,{url:`/qa?locale=en&session=${idB}`,select:false});
 await page.getByLabel('Message',{exact:true}).fill('Tab A question');await other.getByLabel('Message',{exact:true}).fill('Tab B question');
 await page.getByRole('button',{name:'Send',exact:true}).click();await other.getByRole('button',{name:'Send',exact:true}).click();
 await expect.poll(()=>destinations.length).toBe(2);expect(destinations).toEqual([{sessionId:idA,text:'Tab A question'},{sessionId:idB,text:'Tab B question'}]);
 await expect(page.getByRole('log')).toContainText('Tab A question');await expect(page.getByRole('log')).not.toContainText('Tab B question');await expect(other.getByRole('log')).not.toContainText('Tab A question');
 const bounds=await other.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));expect(bounds.scroll).toBeLessThanOrEqual(bounds.width);await other.close();
});

const stopWire=(sessionId,requestId,state)=>({version:'qa-cancellation/1',sessionId,requestId,state,ack:['cancelled','terminal'].includes(state)?'observed':'unknown'});
const cancellationKey='vp.qa.cancellation-target/v1';
async function beginPending(page,context,options={}) {
 let state='pending';const stops=[],reads=[];let original;
 const h=await fixture(page,context,async(route,{path,method,saved,sent,fulfill})=>{
  if(options.historyHook&&await options.historyHook(route,{path,method,saved,sent,fulfill}))return true;
  if(method==='POST'&&path.endsWith('/messages')) {
   original=route.request().postDataJSON();sent.push(original);saved.set(idA,[message(idA,original,null,'pending')]);
   await fulfill({requestId:original.requestId,turnId:original.requestId,sessionId:idA,status:'pending',reused:false});return true;
  }
  return false;
 },{cancellation:async(route,ctx)=>{
  if(ctx.method==='POST') {stops.push({sessionId:ctx.sessionId,requestId:ctx.requestId,body:route.request().postDataJSON()});}
  else reads.push(ctx.requestId);
  if(options.cancelHook&&await options.cancelHook(route,{...ctx,state,original,setState:value=>{state=value;}}))return true;
  if(ctx.method==='POST') {state='cancelled';ctx.saved.set(idA,[message(idA,original,null,'technical_failure')]);}
  await route.fulfill({contentType:'application/json',body:JSON.stringify(stopWire(ctx.sessionId,ctx.requestId,state))});return true;
 }});
 await page.getByRole('button',{name:'Agree to the notice above'}).click();await expect(page.getByLabel('Message',{exact:true})).toBeEnabled();
 await page.getByLabel('Message',{exact:true}).fill('Original pending question');await page.getByRole('button',{name:'Send',exact:true}).click();
 await expect(page.getByRole('button',{name:'Stop this question',exact:true})).toBeVisible();return {...h,stops,reads,get original(){return original;},setState:value=>{state=value;}};
}
test('cancellation requires explicit confirmation and reads original stopped state after reload without resubmission',async({page,context})=>{
 const h=await beginPending(page,context);
 await page.getByRole('button',{name:'Stop this question',exact:true}).click();expect(h.stops).toHaveLength(0);
 await page.getByRole('button',{name:'Back',exact:true}).click();expect(h.stops).toHaveLength(0);
 await page.getByRole('button',{name:'Stop this question',exact:true}).click();await page.getByRole('button',{name:'Confirm stop',exact:true}).click();
 await expect(page.getByText('Stopped.',{exact:true})).toBeVisible();expect(h.stops).toEqual([{sessionId:idA,requestId:h.original.requestId,body:{}}]);expect(h.sent).toHaveLength(1);
 await page.reload();await expect(page.getByText('Stopped.',{exact:true})).toBeVisible();expect(h.stops).toHaveLength(1);expect(h.sent).toHaveLength(1);
 expect(await page.evaluate(key=>sessionStorage.getItem(key),cancellationKey)).not.toContain('Original pending question');
});
test('unknown cancellation POST is recovered by original-ID GET after refresh, never automatically re-POSTed',async({page,context})=>{
 let failed=false;
 const h=await beginPending(page,context,{cancelHook:async(route,c)=>{
  if(c.method==='POST') {failed=true;await route.abort();return true;}
  if(failed) {await route.fulfill({contentType:'application/json',body:JSON.stringify(stopWire(c.sessionId,c.requestId,'not_observed'))});return true;}
  return false;
 }});
 await page.getByRole('button',{name:'Stop this question',exact:true}).click();await page.getByRole('button',{name:'Confirm stop',exact:true}).click();
 await expect(page.getByText(/Stopping is not confirmed|No stop result was observed/)).toBeVisible();await page.reload();
 await expect(page.getByText('No stop result was observed. Keep checking the original request.',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Stop this question',exact:true})).toHaveCount(0);expect(h.stops).toHaveLength(1);expect(h.sent).toHaveLength(1);
 await page.getByRole('button',{name:'Check stop status',exact:true}).click();expect(h.stops).toHaveLength(1);expect(h.reads.every(id=>id===h.original.requestId)).toBe(true);
});
test('terminal cancellation read keeps the original answer and never posts a stop',async({page,context})=>{
 let queries=0;
 const h=await beginPending(page,context,{cancelHook:async(_route,c)=>{
  if(c.method==='GET'&&++queries>=2) {c.setState('terminal');c.saved.set(idA,[message(idA,c.original,'Preserved answer')]);}return false;
 }});
 // Finish at confirmation preflight; the already-ended result must not be stopped.
 await expect.poll(()=>h.reads.length).toBeGreaterThan(0);
 await page.getByRole('button',{name:'Stop this question',exact:true}).click();await page.getByRole('button',{name:'Confirm stop',exact:true}).click();
 await expect(page.getByRole('log')).toContainText('Preserved answer');expect(h.stops).toHaveLength(0);expect(h.sent).toHaveLength(1);
});
test('withdrawn generation consent still permits metadata-only stop of original observed request',async({page,context})=>{
 let withdrawn=false;
 const h=await beginPending(page,context,{historyHook:async(route,c)=>{
  if(withdrawn&&c.path.endsWith('/policy')) {await c.fulfill({policy:{...policy,consentState:'withdrawn'}});return true;}
  if(withdrawn&&c.method==='GET'&&c.path.endsWith(idA)) {await route.fulfill({status:403,contentType:'application/json',body:JSON.stringify(wire({error:{code:'DATA_POLICY_BLOCKED',ack:'not_submitted'}}))});return true;}
  return false;
 }});
 await expect.poll(async()=>(JSON.parse(await page.evaluate(key=>sessionStorage.getItem(key),cancellationKey))?.requests.length??0)).toBe(1);
 withdrawn=true;await page.reload();await expect(page.getByRole('button',{name:'Send',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Stop this question',exact:true}).click();await page.getByRole('button',{name:'Confirm stop',exact:true}).click();
 await expect(page.getByText('Stopped.',{exact:true})).toBeVisible();expect(h.stops).toHaveLength(1);expect(h.sent).toHaveLength(1);await expect(page.getByRole('log')).not.toContainText('Original pending question');
});
test('cancellation not_submitted error does not confirm or erase unknown original message admission',async({page,context})=>{
 const stops=[];
 const {sent}=await fixture(page,context,async(route,c)=>{
  if(c.method==='POST'&&c.path.endsWith('/messages')) {c.sent.push(route.request().postDataJSON());await route.abort();return true;}return false;
 },{cancellation:async(route,c)=>{
  if(c.method==='POST') {stops.push(c.requestId);await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({version:'qa-cancellation/1',sessionId:c.sessionId,requestId:c.requestId,error:{code:'PROVIDER_UNAVAILABLE',ack:'not_submitted'}})});}
  else await route.fulfill({contentType:'application/json',body:JSON.stringify(stopWire(c.sessionId,c.requestId,'not_observed'))});return true;
 }});
 await page.getByRole('button',{name:'Agree to the notice above'}).click();await expect(page.getByLabel('Message',{exact:true})).toBeEnabled();await page.getByLabel('Message',{exact:true}).fill('Unknown original admission');await page.getByRole('button',{name:'Send',exact:true}).click();
 await page.getByRole('button',{name:'Stop this question',exact:true}).click();await page.getByRole('button',{name:'Confirm stop',exact:true}).click();await expect.poll(()=>stops.length).toBe(1);
 expect(JSON.parse(await page.evaluate(key=>sessionStorage.getItem(key),recoveryKey)).requests[0].requestId).toBe(sent[0].requestId);
 await page.reload();await expect(page.getByRole('button',{name:'Send',exact:true})).toBeDisabled();expect(sent).toHaveLength(1);expect(stops).toHaveLength(1);
});
test('cancellation permission refusal clears protected history and never claims stopped',async({page,context})=>{
 let denied=false;
 const h=await beginPending(page,context,{cancelHook:async(route,c)=>{
  if(denied) {await route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({version:'qa-cancellation/1',sessionId:c.sessionId,requestId:c.requestId,error:{code:'FORBIDDEN',ack:'not_submitted'}})});return true;}return false;
 }});
 denied=true;await page.getByRole('button',{name:'Stop this question',exact:true}).click();await page.getByRole('button',{name:'Confirm stop',exact:true}).click();
 await expect(page.getByRole('region',{name:'Agent QA'}).getByRole('alert')).toBeVisible();await expect(page.getByRole('log')).toBeEmpty();await expect(page.getByText('Stopped.',{exact:true})).toHaveCount(0);expect(h.stops).toHaveLength(0);expect(h.sent).toHaveLength(1);
});
test('late cancellation receipt cannot land in another URL Session',async({page,context})=>{
 let release;
 const h=await beginPending(page,context,{cancelHook:async(route,c)=>{
  if(c.method==='POST') {c.setState('cancelled');c.saved.set(idA,[message(idA,c.original,null,'technical_failure')]);await new Promise(resolve=>{release=resolve;});await route.fulfill({contentType:'application/json',body:JSON.stringify(stopWire(c.sessionId,c.requestId,'cancelled'))}).catch(()=>{});return true;}return false;
 }});
 await page.getByRole('button',{name:'Stop this question',exact:true}).click();await page.getByRole('button',{name:'Confirm stop',exact:true}).click();await expect.poll(()=>!!release).toBe(true);
 await page.evaluate(id=>history.pushState(null,'',`/qa?locale=en&session=${id}`),idB);await expect(page.getByLabel('Message',{exact:true})).toBeEnabled();release();
 await expect(page.getByText('Stopped.',{exact:true})).toHaveCount(0);await expect(page.getByRole('log')).not.toContainText('Original pending question');expect(h.stops).toHaveLength(1);expect(h.sent).toHaveLength(1);
 await page.evaluate(id=>history.pushState(null,'',`/qa?locale=en&session=${id}`),idA);await expect(page.getByText('Stopped.',{exact:true})).toBeVisible();expect(h.stops).toHaveLength(1);
});
test('same actor tabs stop one original identity without duplicate POST or carrying question body',async({page,context})=>{
 let state='pending',original;const stops=[];
 const cancellation=async(route,c)=>{
  if(c.method==='POST') {stops.push(c.requestId);state='cancelled';}
  await route.fulfill({contentType:'application/json',body:JSON.stringify(stopWire(c.sessionId,c.requestId,state))});return true;
 };
 const hook=async(route,c)=>{
  if(c.path.endsWith('/policy')) {await c.fulfill({policy:{...policy,consentState:'accepted'}});return true;}
  if(c.method==='POST'&&c.path.endsWith('/messages')) {original=route.request().postDataJSON();c.sent.push(original);await c.fulfill({requestId:original.requestId,turnId:original.requestId,sessionId:idA,status:'pending',reused:false});return true;}
  if(c.method==='GET'&&c.path.endsWith(idA)&&original) {await c.fulfill({session:session(idA),messages:[message(idA,original,null,state==='cancelled'?'technical_failure':'pending')]});return true;}
  return false;
 };
 const first=await fixture(page,context,hook,{cancellation});await page.getByLabel('Message',{exact:true}).fill('One shared original');await page.getByRole('button',{name:'Send',exact:true}).click();await expect.poll(()=>!!original).toBe(true);
 const other=await context.newPage();await other.setViewportSize({width:390,height:844});const second=await fixture(other,context,hook,{cancellation,ready:false});
 await page.getByRole('button',{name:'Stop this question',exact:true}).click();await other.getByRole('button',{name:'Stop this question',exact:true}).click();
 await Promise.all([page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Confirm stop')?.click()),other.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Confirm stop')?.click())]);
 await expect(page.getByText('Stopped.',{exact:true})).toBeVisible();await expect(other.getByText('Stopped.',{exact:true})).toBeVisible();expect(stops).toEqual([original.requestId]);expect(first.sent).toHaveLength(1);expect(second.sent).toHaveLength(0);await other.close();
});
test('cancellation recovery storage failure blocks only the stop POST and preserves original identity',async({page,context})=>{
 await page.addInitScript(key=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('Synthetic stop journal failure','SecurityError');return original.call(this,k,v);};},cancellationKey);
 const h=await beginPending(page,context);await expect(page.getByText('Stop recovery storage is unavailable. Check the original request first.')).toBeVisible();await expect(page.getByRole('button',{name:'Stop this question',exact:true})).toBeDisabled();expect(h.stops).toHaveLength(0);expect(h.sent).toHaveLength(1);
});
test('actor change clears cancellation intent and fences the old actor late stop receipt',async({page,context})=>{
 let changed=false,release;
 const h=await beginPending(page,context,{historyHook:async(route,c)=>{
  if(changed&&c.method==='GET'&&c.path.endsWith('/sessions')) {await c.fulfill({sessions:[session(idB)]});return true;}
  if(changed&&c.path.endsWith(idA)) {await route.fulfill({status:403,contentType:'application/json',body:JSON.stringify(wire({error:{code:'FORBIDDEN',ack:'not_submitted'}}))});return true;}return false;
 },cancelHook:async(route,c)=>{
  if(c.method==='POST') {await new Promise(resolve=>{release=resolve;});await route.fulfill({contentType:'application/json',body:JSON.stringify(stopWire(c.sessionId,c.requestId,'cancelled'))}).catch(()=>{});return true;}return false;
 }});
 await page.getByRole('button',{name:'Stop this question',exact:true}).click();await page.getByRole('button',{name:'Confirm stop',exact:true}).click();await expect.poll(()=>!!release).toBe(true);
 changed=true;await page.evaluate(owner=>{const ch=new BroadcastChannel('sb-127-auth-token');ch.postMessage({event:'SIGNED_IN',session:{user:{id:owner}}});setTimeout(()=>ch.close(),100);},idB);
 await page.getByRole('button',{name:`Session ${idB}`,exact:true}).click();release();await expect(page.getByLabel('Message',{exact:true})).toBeEnabled();
 await expect(page.getByText('Stopped.',{exact:true})).toHaveCount(0);await expect(page.getByRole('log')).not.toContainText('Original pending question');expect(await page.evaluate(key=>sessionStorage.getItem(key),cancellationKey)).toBeNull();expect(h.stops).toHaveLength(1);
});
test('late pending cancellation GET cannot overwrite a newer observed stop receipt',async({page,context})=>{
 let release,gets=0;
 const h=await beginPending(page,context,{cancelHook:async(route,c)=>{
  if(c.method==='GET'&&++gets===1) {await new Promise(resolve=>{release=resolve;});await route.fulfill({contentType:'application/json',body:JSON.stringify(stopWire(c.sessionId,c.requestId,'pending'))}).catch(()=>{});return true;}return false;
 }});
 await expect.poll(()=>!!release).toBe(true);await page.getByRole('button',{name:'Stop this question',exact:true}).click();await page.getByRole('button',{name:'Confirm stop',exact:true}).click();await expect(page.getByText('Stopped.',{exact:true})).toBeVisible();release();
 await page.waitForTimeout(100);await expect(page.getByText('Stopped.',{exact:true})).toBeVisible();expect(h.stops).toHaveLength(1);expect(h.sent).toHaveLength(1);
});
test('definite cancellation rejection permits only a newly confirmed stop, without repeating message admission',async({page,context})=>{
 let rejected=false;
 const h=await beginPending(page,context,{cancelHook:async(route,c)=>{
  if(c.method==='POST'&&!rejected) {rejected=true;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({version:'qa-cancellation/1',sessionId:c.sessionId,requestId:c.requestId,error:{code:'PROVIDER_UNAVAILABLE',ack:'not_submitted'}})});return true;}return false;
 }});
 await page.getByRole('button',{name:'Stop this question',exact:true}).click();await page.getByRole('button',{name:'Confirm stop',exact:true}).click();await expect.poll(()=>h.stops.length).toBe(1);
 await expect(page.getByRole('button',{name:'Stop this question',exact:true})).toBeVisible();expect(h.sent).toHaveLength(1);await expect(page.getByText('Stopped.',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Stop this question',exact:true}).click();expect(h.stops).toHaveLength(1);await page.getByRole('button',{name:'Confirm stop',exact:true}).click();
 await expect(page.getByText('Stopped.',{exact:true})).toBeVisible();expect(h.stops).toHaveLength(2);expect(new Set(h.stops.map(entry=>entry.requestId)).size).toBe(1);expect(h.sent).toHaveLength(1);
});
test('review mutex unavailable with simultaneous pending GETs permits only original reads and zero stop POST',async({page,context})=>{
 const waiters=[],posts=[];let holding=true;
 const prior={requestId:earlierId,text:'Owned original pending'};
 const hook=async(_route,c)=>{
  if(c.path.endsWith('/policy')) {await c.fulfill({policy:{...policy,consentState:'accepted'}});return true;}
  if(c.method==='GET'&&c.path.endsWith(idA)) {await c.fulfill({session:session(idA),messages:[message(idA,prior,null,'pending')]});return true;}return false;
 };
 const cancellation=async(route,c)=>{
  if(c.method==='POST')posts.push(c.requestId);
  if(holding)await new Promise(resolve=>waiters.push(resolve));
  await route.fulfill({contentType:'application/json',body:JSON.stringify(stopWire(c.sessionId,c.requestId,'pending'))});return true;
 };
 await fixture(page,context,hook,{cancellation,ready:false});const other=await context.newPage();await fixture(other,context,hook,{cancellation,ready:false});
 await expect.poll(()=>waiters.length).toBe(2);
 await page.getByRole('button',{name:'Stop this question',exact:true}).click();await other.getByRole('button',{name:'Stop this question',exact:true}).click();
 for(const tab of [page,other])await tab.evaluate(()=>Object.defineProperty(navigator,'locks',{configurable:true,value:undefined}));
 await Promise.all([page.getByRole('button',{name:'Confirm stop',exact:true}).click(),other.getByRole('button',{name:'Confirm stop',exact:true}).click()]);
 await expect.poll(()=>waiters.length).toBe(4);holding=false;waiters.forEach(resolve=>resolve());
 for(const tab of [page,other]) {await expect(tab.getByText('This browser can only read the original request status. A stop cannot be submitted safely right now.')).toBeVisible();await expect(tab.getByRole('button',{name:'Stop this question',exact:true})).toBeDisabled();}
 expect(posts).toHaveLength(0);await other.close();
});
for(const format of ['other-json','non-json','foreign-scope']) {
 test(`review cancellation401 ${format} removes old private projection and both journals`,async({page,context})=>{
  let denied=false;
  const h=await beginPending(page,context,{cancelHook:async(route,c)=>{
   if(denied) {
    const body=format==='non-json'?'<html>unauthorized</html>':JSON.stringify(format==='foreign-scope'?{version:'qa-cancellation/1',sessionId:idB,requestId:idA,error:{code:'UNAUTHENTICATED',ack:'not_submitted'}}:{message:'unauthorized'});
    await route.fulfill({status:401,contentType:format==='non-json'?'text/html':'application/json',body});return true;
   }return false;
  }});
  await expect.poll(()=>h.reads.length).toBeGreaterThan(0);
  denied=true;await page.getByRole('button',{name:'Stop this question',exact:true}).click();await page.getByRole('button',{name:'Confirm stop',exact:true}).click();
  await expect(page.getByRole('link',{name:'Sign in',exact:true})).toBeVisible();await expect(page.getByRole('log')).toHaveCount(0);expect(h.stops).toHaveLength(0);
  expect(await page.evaluate(key=>sessionStorage.getItem(key),cancellationKey)).toBeNull();expect(await page.evaluate(key=>sessionStorage.getItem(key),recoveryKey)).toBeNull();
 });
}
test('review intent hint makes only listening peer query current canonical scope before showing stopped',async({page,context})=>{
 let state='pending',releasePeer=false;const held=[],posts=[],peerReads=[];
 const original={requestId:earlierId,text:'Shared original'};
 const hook=async(_route,c)=>{if(c.path.endsWith('/policy')){await c.fulfill({policy:{...policy,consentState:'accepted'}});return true;}if(c.method==='GET'&&c.path.endsWith(idA)){await c.fulfill({session:session(idA),messages:[message(idA,original,null,'pending')]});return true;}return false;};
 const entry=peer=>({ready:false,cancellation:async(route,c)=>{
  if(c.method==='POST'){posts.push(c.requestId);state='cancelled';}
  if(peer&&c.method==='GET'){peerReads.push(state);if(state==='cancelled'&&!releasePeer)await new Promise(resolve=>held.push(resolve));}
  await route.fulfill({contentType:'application/json',body:JSON.stringify(stopWire(c.sessionId,c.requestId,state))});return true;
 }});
 await fixture(page,context,hook,entry(false));const other=await context.newPage();await fixture(other,context,hook,entry(true));await expect.poll(()=>peerReads.length).toBeGreaterThan(0);
 await page.getByRole('button',{name:'Stop this question',exact:true}).click();await page.getByRole('button',{name:'Confirm stop',exact:true}).click();await expect(page.getByText('Stopped.',{exact:true})).toBeVisible();
 await expect.poll(()=>held.length).toBeGreaterThan(0);await expect(other.getByText('Stopped.',{exact:true})).toHaveCount(0);
 releasePeer=true;held.forEach(resolve=>resolve());await expect(other.getByText('Stopped.',{exact:true})).toBeVisible();expect(peerReads).toContain('cancelled');expect(posts).toEqual([original.requestId]);await other.close();
});
test('review history401 invalidates a held stop preflight before it can rebuild intent or POST',async({page,context})=>{
 let expire=false,gets=0,release;
 const h=await beginPending(page,context,{historyHook:async(route,c)=>{
  if(expire&&c.method==='GET'&&c.path.endsWith(idA)) {await route.fulfill({status:401,contentType:'application/json',body:JSON.stringify(wire({error:{code:'UNAUTHENTICATED',ack:'not_submitted'}}))});return true;}return false;
 },cancelHook:async(route,c)=>{
  if(c.method==='GET'&&++gets>=2&&!release){await new Promise(resolve=>{release=resolve;});await route.fulfill({contentType:'application/json',body:JSON.stringify(stopWire(c.sessionId,c.requestId,'pending'))}).catch(()=>{});return true;}return false;
 }});
 await expect.poll(()=>h.reads.length).toBeGreaterThan(0);await page.getByRole('button',{name:'Stop this question',exact:true}).click();await page.getByRole('button',{name:'Confirm stop',exact:true}).click();await expect.poll(()=>!!release).toBe(true);
 expire=true;await expect(page.getByRole('link',{name:'Sign in',exact:true})).toBeVisible({timeout:10000});release();await page.waitForTimeout(100);
 expect(h.stops).toHaveLength(0);expect(await page.evaluate(key=>sessionStorage.getItem(key),cancellationKey)).toBeNull();expect(await page.evaluate(key=>sessionStorage.getItem(key),recoveryKey)).toBeNull();await expect(page.getByRole('log')).toHaveCount(0);
});

for (const width of [1440,390]) {
 test(`P0 signed-out QA bookmark preserves same Session and locale at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`/qa?locale=en&session=${idA}&returnTo=https%3A%2F%2Fexample.invalid&ignored=drop`);
  const link=page.getByRole('link',{name:'Sign in',exact:true});await expect(link).toBeVisible();
  const target=new URL(await link.getAttribute('href'),'http://127.0.0.1:3019');
  expect(target.pathname).toBe('/auth/sign-in');expect(target.searchParams.get('returnTo')).toBe(`/qa?locale=en&session=${idA}`);
  await link.click();await expect(page).toHaveURL(target.href);await expect(page.getByLabel('邮箱',{exact:true})).toBeVisible();
  expect(errors).toEqual([]);
 });
}

test('P0 signed-out QA login discards an invalid Session and unrelated return parameters',async({page})=>{
 await page.goto('/qa?locale=en&session=https%3A%2F%2Fexample.invalid&returnTo=https%3A%2F%2Fexample.invalid');
 const link=page.getByRole('link',{name:'Sign in',exact:true});await expect(link).toBeVisible();
 expect(new URL(await link.getAttribute('href'),'http://127.0.0.1:3019').searchParams.get('returnTo')).toBe('/qa?locale=en');
});
for (const width of [1440,390]) {
 test(`P0 unavailable503 shows recovery without an answer or automatic POST at ${width}px`,async({page,context})=>{
  await page.setViewportSize({width,height:900});const seen=[];
  await fixture(page,context,async(route,{method})=>{seen.push(method);await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify(wire({error:{code:'PROVIDER_UNAVAILABLE',ack:'not_submitted'}}))});return true;},{ready:false,select:false});
  await expect(page.getByRole('main').getByRole('alert')).toContainText('The service is not ready yet. This check did not send a new question.');await expect(page.getByLabel('Message',{exact:true})).toBeDisabled();
  await expect(page.getByRole('log')).not.toContainText('Saved answer');await page.getByRole('button',{name:'Reload',exact:true}).click();
  await expect.poll(()=>seen.length).toBeGreaterThanOrEqual(4);await expect(page.getByRole('main').getByRole('alert')).toContainText('The service is not ready yet. This check did not send a new question.');expect(seen.every(method=>method==='GET')).toBe(true);
 });
}

test('P0 actual sign-in server guard passes the same QA Session and locale to Continue',async({page,context})=>{
 // Local synthetic identity only; run the real Next sign-in page, server guard,
 // hydrated Continue link and QA navigation without submitting credentials.
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const {sent}=await fixture(page,context,()=>false,{ready:false,select:false});
 const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url'),expiry=Math.floor(Date.now()/1000)+3600;
 // getClaims also decodes the signature: use well-formed synthetic base64url.
 const jwt=`${encode({alg:'HS256'})}.${encode({sub:idA,exp:expiry})}.${encode('synthetic-signature')}`;
 await context.addCookies([{name:'sb-127-auth-token',value:`base64-${encode({access_token:jwt,refresh_token:'synthetic-refresh',token_type:'bearer',expires_at:expiry,expires_in:3600,user:{id:idA}})}`,url:'http://127.0.0.1:3019'}]);
 let identityReads=0;
 await page.route('http://127.0.0.1:54389/auth/v1/user',route=>{identityReads++;return route.fulfill({contentType:'application/json',body:JSON.stringify({id:idA,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}})});});
 await page.goto(`/auth/sign-in?returnTo=${encodeURIComponent(`/qa?locale=en&session=${idA}`)}`);
 const proceed=page.getByRole('link',{name:'进入工作台',exact:true});await expect(proceed).toBeVisible();
 expect(identityReads).toBeGreaterThan(0);await expect(proceed).toHaveAttribute('href',`/qa?session=${idA}&locale=en`);
 await proceed.click();await expect(page).toHaveURL(`http://127.0.0.1:3019/qa?session=${idA}&locale=en`);
 await expect(page.getByRole('button',{name:`Session ${idA}`,exact:true})).toHaveAttribute('aria-current','true');
 await expect(page.getByRole('main')).toHaveAttribute('lang','en');expect(sent).toHaveLength(0);expect(errors).toEqual([]);
});

test('readiness503 fresh Chinese visit explains no new question was sent',async({page,context})=>{
 await login(context);const methods=[];
 await page.route('**/api/qa-agent/**',route=>{methods.push(route.request().method());return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify(wire({error:{code:'PROVIDER_UNAVAILABLE',ack:'not_submitted'}}))});});
 await page.goto('/qa?locale=zh');await expect(page.getByRole('main').getByRole('alert')).toContainText('服务暂未就绪，本次仅检查服务，未发送新问题。请稍后重新读取。');
 await expect(page.getByRole('button',{name:'发送',exact:true})).toBeDisabled();expect(methods.every(method=>method==='GET')).toBe(true);
});
test('readiness503 after unknown POST preserves recovery storage byte-for-byte and only checks original ID',async({page,context})=>{
 let unavailable=false;const recovered=[];
 const {sent}=await fixture(page,context,async(route,{path,method,sent})=>{
  if(unavailable&&(path.endsWith('/sessions')||path.endsWith('/policy'))) {await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify(wire({error:{code:'PROVIDER_UNAVAILABLE',ack:'not_submitted'}}))});return true;}
  if(method==='POST'&&path.endsWith('/messages')) {sent.push(route.request().postDataJSON());await route.abort();return true;}
  if(path.includes('/messages/')&&!path.endsWith('/cancellation')) {recovered.push(path.split('/').at(-1));await route.fulfill({status:403,contentType:'application/json',body:JSON.stringify(wire({error:{code:'FORBIDDEN',ack:'not_submitted'}}))});return true;}return false;
 });
 await page.getByRole('button',{name:'Agree to the notice above'}).click();await expect(page.getByLabel('Message',{exact:true})).toBeEnabled();
 await page.getByLabel('Message',{exact:true}).fill('Original unknown input 原文');await page.getByRole('button',{name:'Send',exact:true}).click();await expect(page.getByRole('button',{name:'Check original request',exact:true})).toBeVisible();
 const before=await page.evaluate(keys=>keys.map(key=>sessionStorage.getItem(key)),[recoveryKey,cancellationKey]);expect(before[0]).toBeTruthy();expect(before[1]).toBeNull();
 unavailable=true;await page.reload();const alert=page.getByRole('main').getByRole('alert');await expect(alert).toContainText('Its recovery ID is retained. This read does not establish whether the original request was submitted.');
 await expect(alert).not.toContainText('did not send a new question');await expect(page.getByRole('button',{name:'Send',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Reload',exact:true}).click();await expect(alert).toContainText('Its recovery ID is retained.');
 expect(await page.evaluate(keys=>keys.map(key=>sessionStorage.getItem(key)),[recoveryKey,cancellationKey])).toEqual(before);expect(sent).toHaveLength(1);
 unavailable=false;await page.getByRole('button',{name:'Reload',exact:true}).click();await expect(page.getByRole('button',{name:'Check original request',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Check original request',exact:true}).click();await expect.poll(()=>recovered.length).toBe(1);
 expect(recovered).toEqual([sent[0].requestId]);expect(sent).toHaveLength(1);expect(await page.evaluate(keys=>keys.map(key=>sessionStorage.getItem(key)),[recoveryKey,cancellationKey])).toEqual(before);
 await expect(page.getByRole('button',{name:'Resend original request',exact:true})).toHaveCount(0);
});
test('readiness copy does not overwrite a legacy Session history503 failure',async({page,context})=>{
 await fixture(page,context,async(route,{path,method})=>{if(method==='GET'&&path.endsWith(idA)){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify(wire({error:{code:'PROVIDER_UNAVAILABLE',ack:'not_submitted'}}))});return true;}return false;},{ready:false});
 const alert=page.getByRole('main').getByRole('alert');await expect(alert).toContainText('The request could not be completed. Check the original request status.');await expect(alert).not.toContainText('did not send a new question');
});
