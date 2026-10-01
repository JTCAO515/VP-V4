import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
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
    await expect(card.getByTestId('comparison-identity')).toHaveText(fixture.artifact+' · r1',{timeout:30000});
    await expect(card.getByText(fixture.content.summary,{exact:true})).toBeVisible();
    assert.equal(await card.locator('img,script,a').count(),0,'comparison text creates no model HTML/URL nodes');
    assert.equal(await card.getByRole('button').count(),1,'only read refresh action is exposed');
    await page.locator('select').first().selectOption('en');
    await expect(card.getByRole('heading',{name:'Direction comparison'})).toBeVisible();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    await page.clock.fastForward(30_001);
    await expect(card.getByText('Refresh to check whether this comparison is still current.')).toBeVisible();
    await expect(card.getByTestId('comparison-identity')).toHaveCount(0);
    await card.getByRole('button',{name:'Refresh comparison'}).click();
    await expect(card.getByTestId('comparison-identity')).toHaveText(fixture.artifact+' · r1');
    // New schema must degrade without rendering its hidden/action fields.
    const endpoint=api+'/api/trips/'+fixture.trip+'/comparison-result';
    await page.route(endpoint,route=>route.fulfill({json:{version:1,data:{...data,content:{...data.content,schemaVersion:'comparison/99',html:'<script>bad</script>'}}}}));
    await card.getByRole('button',{name:'Refresh comparison'}).click();
    await expect(card.getByText('This comparison cannot be read safely. Refresh to retry.')).toBeVisible();
    await expect(card.getByTestId('comparison-identity')).toHaveCount(0);
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
    assert.deepEqual(errors,[]);
    t.diagnostic('Web comparison '+viewport.width+'x'+viewport.height+': exact identity/literal content/unknown schema/late navigation PASS');
   } finally {await context.close();}
  }
 } finally {await browser.close();}
}
