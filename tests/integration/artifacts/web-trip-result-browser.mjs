import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
// Existing CI Playwright harness: real ordinary cookies + local API/DB, no mocked auth.
export async function exerciseWebTripResult({api,actor,fixture,nextFixture,data,t}) {
 assert.match(api,/^http:\/\/127\.0\.0\.1:\d+$/,'synthetic cookies stay on the disposable local API');
 const browser=await chromium.launch({headless:true});
 try {
  for(const viewport of [{width:1280,height:900},{width:390,height:844}]) {
   const context=await browser.newContext({viewport});
   try {
    await context.addCookies(actor.cookie.split('; ').map(item=>{const split=item.indexOf('=');return {name:item.slice(0,split),value:item.slice(split+1),url:api,sameSite:'Lax'};}));
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.clock.install();
    await page.goto(api+'/visepanda/trips',{waitUntil:'domcontentloaded'});
    await page.locator('a[href="/visepanda/trips/'+fixture.trip+'"]').click();
    const card=page.getByTestId('trip-comparison');
    const endpoint=api+'/api/trips/'+fixture.trip+'/comparison-result';
    await expect(card.getByTestId('comparison-identity')).toHaveText(fixture.artifact+' · r1',{timeout:30000});
    await expect(card.getByText(fixture.content.summary,{exact:true})).toBeVisible();
    assert.equal(await card.locator('img,script,a').count(),0,'comparison text creates no model HTML/URL nodes');
    assert.equal(await card.getByRole('button').count(),1,'only read refresh action is exposed');
    assert.ok(!(await card.innerText()).includes(fixture.artifact),'UUID is not on the main comparison surface');
    const basis=card.getByTestId('comparison-basis');
    await basis.getByText('这份比较依据什么？',{exact:true}).press('Enter');
    await expect(basis.getByText('未记录记忆引用。',{exact:true})).toBeVisible();
    await expect(basis.getByText('读取时关联的已保存行程版本：v1。',{exact:true})).toBeVisible();
    await expect(basis.getByText('未记录外部证据引用。是否经过检索核验、是否实时，当前记录无法说明。',{exact:true})).toBeVisible();
    await basis.getByText('版本记录',{exact:true}).click();
    await expect(card.getByTestId('comparison-identity')).toBeVisible();
    await basis.getByText('版本记录',{exact:true}).click();
    await page.locator('select').first().selectOption('en');
    await expect(card.getByRole('heading',{name:'Direction comparison'})).toBeVisible();
    await expect(basis.getByText('No Memory references were recorded.',{exact:true})).toBeVisible();
    assert.ok(!(await card.innerText()).includes(fixture.artifact));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    const memoryIds=[randomUUID(),randomUUID()];
    await page.route(endpoint,route=>route.fulfill({json:{version:1,data:{...data,basis:{memories:[{id:memoryIds[0],revision:1},{id:memoryIds[1],revision:4}],evidence:[]}}}}));
    await card.getByRole('button',{name:'Refresh comparison'}).click();
    await expect(card.getByTestId('comparison-identity')).toHaveText(fixture.artifact+' · r1');
    await basis.getByText('What is this comparison based on?',{exact:true}).click();
    await expect(basis.getByText('Memory reference records: 2 entries, versions v1, v4.',{exact:true})).toBeVisible();
    await expect(basis.getByText('No external evidence references were recorded. Search verification and real-time freshness are unknown from this record.',{exact:true})).toBeVisible();
    for(const id of memoryIds) assert.ok(!(await card.innerText()).includes(id),'Memory identifiers cannot become guessed preference text');
    await page.clock.fastForward(30_001);
    await expect(card.getByText('Refresh to check whether this comparison is still current.')).toBeVisible();
    await expect(card.getByTestId('comparison-identity')).toHaveCount(0);
    await expect(card.getByTestId('comparison-basis'),'basis expires with the body').toHaveCount(0);
    await card.getByRole('button',{name:'Refresh comparison'}).click();
    await expect(card.getByTestId('comparison-identity')).toHaveText(fixture.artifact+' · r1');
    await page.unroute(endpoint);
    for(const [status,json,message]of [[200,{version:1,data:{kind:'empty'}},'No current comparison is saved for this Trip.'],
      [401,{error:{code:'UNAUTHENTICATED'}},'Sign in again to read this comparison.']]) {
      await page.route(endpoint,route=>route.fulfill({status,json}));
      await card.getByRole('button',{name:'Refresh comparison'}).click();
      await expect(card.getByText(message,{exact:true})).toBeVisible();
      await expect(card.getByTestId('comparison-basis')).toHaveCount(0);
      await expect(card.getByTestId('comparison-identity')).toHaveCount(0);
      await page.unroute(endpoint);
    }
    // New schema must degrade without rendering its hidden/action fields.
    await page.route(endpoint,route=>route.fulfill({json:{version:1,data:{...data,content:{...data.content,schemaVersion:'comparison/99',html:'<script>bad</script>'}}}}));
    await card.getByRole('button',{name:'Refresh comparison'}).click();
    await expect(card.getByText('This comparison cannot be read safely. Refresh to retry.')).toBeVisible();
    await expect(card.getByTestId('comparison-identity')).toHaveCount(0);
    await expect(card.getByTestId('comparison-basis')).toHaveCount(0);
    await page.unroute(endpoint);
    await card.getByRole('button',{name:'Refresh comparison'}).click();
    await expect(card.getByTestId('comparison-identity')).toHaveText(fixture.artifact+' · r1');
    // A late A response after client navigation must not enter Trip B.
    let release,started;const held=new Promise(resolve=>release=resolve),arrived=new Promise(resolve=>started=resolve);
    await page.route(endpoint,async route=>{started();await held;try{await route.fulfill({json:{version:1,data}});}catch{/* navigation aborted the request */}});
    await card.getByRole('button',{name:'Refresh comparison'}).click();await arrived;
    await page.goBack({waitUntil:'domcontentloaded'});
    await page.locator('a[href="/visepanda/trips/'+nextFixture.trip+'"]').click();
    release();
    await expect(page.getByTestId('comparison-identity')).toHaveText(nextFixture.artifact+' · r1',{timeout:30000});
    assert.doesNotMatch(await page.getByTestId('comparison-basis').textContent(),/2 entries|2 项/,'prior Trip basis cannot remain even in folded DOM');
    assert.deepEqual(errors,[]);
    t.diagnostic('Web comparison '+viewport.width+'x'+viewport.height+': exact identity/literal content/unknown schema/late navigation PASS');
   } finally {await context.close();}
  }
 } finally {await browser.close();}
}
