import { expect, test } from '@playwright/test';

// Synthetic cookie/API data tests the actual rendered client. No real Auth/DB/provider claim.
const idA = '11111111-1111-4111-8111-111111111111';
const idB = '22222222-2222-4222-8222-222222222222';
const session = id => ({ id, label: 'Session', createdAt: '2026-10-13T00:00:00Z', updatedAt: '2026-10-13T00:00:00Z' });
const policy = { id: '33333333-3333-4333-8333-333333333333', noticeHash: 'a'.repeat(64), noticeZh: '合成供应商说明', noticeEn: 'Synthetic provider notice', provider: 'synthetic', recipient: 'synthetic', consentState: 'not_accepted', contextMode: 'qa_session_history_v1' };
const wire = data => ({version: 'qa-agent/1', ...data});
const message = (id, input, answer='Saved answer', status='answered') => ({...input, sessionId:id,turnId:input.requestId,input:input.text,text:answer,status,createdAt:'2026-10-13T00:00:00Z'});
async function login(context, owner = idA) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const jwt = `${encode({alg:'HS256'})}.${encode({sub:owner,exp:Math.floor(Date.now()/1000)+3600})}.synthetic`;
  const data = { access_token: jwt, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, user: { id: owner } };
  await context.addCookies([{name:'sb-127-auth-token',value:`base64-${encode(data)}`,url:'http://127.0.0.1:3019'}]);
}
async function fixture(page, context, hook = () => false) {
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
  await page.goto('/qa?locale=en');
  await expect(page.getByRole('button',{name:'New session'})).toBeEnabled();
  await page.getByRole('button',{name:`Session ${idA}`,exact:true}).click();
  await expect(page.getByLabel('Message',{exact:true})).toBeEnabled();
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
      if(path.endsWith('/policy')) {await fulfill({policy:{...policy,contextMode:mode,consentState:'accepted'}});return true;}
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
