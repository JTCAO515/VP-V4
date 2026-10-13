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
  await expect(page.getByRole('link',{name:'Sign in',exact:true})).toHaveAttribute('href','/auth/sign-in?returnTo=/qa');
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
