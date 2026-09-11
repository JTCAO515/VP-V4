import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { tripLocalEditorCopy } from '../../../lib/i18n.ts';

/** Real ordinary-cookie browser consumer against the runner-owned disposable API. */
export async function exerciseSameTripBrowser({api,jar,n,t}) {
  const origin=new URL(api);
  assert.equal(origin.protocol,'http:');assert.equal(origin.hostname,'127.0.0.1');
  const directory='/Users/jtcao/Library/Caches/visepanda/s1-same-trip-browser-'+randomUUID();
  mkdirSync(directory,{recursive:true,mode:0o700});
  const browser=await chromium.launch({headless:true});
  try {
    for(const locale of ['zh','en'])for(const viewport of [{width:1280,height:800},{width:390,height:844}]) {
      const id=randomUUID(),title=`S1 ${locale} ${viewport.width}`;
      assert.equal((await n('',{tripId:id,title})).status,201);
      const context=await browser.newContext({viewport});
      try {
        await context.addCookies([...jar].map(([name,value])=>({name,value,url:api,httpOnly:false,sameSite:'Lax'})));
        const page=await context.newPage(),errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        const result=await page.goto(`${api}/visepanda/trips/${id}`,{waitUntil:'domcontentloaded'});
        assert.equal(result.status(),200);
        const editor=page.getByTestId('same-trip-editor');
        await expect(editor).toBeVisible({timeout:30000});
        await page.locator('select').first().selectOption(locale);
        const copy=tripLocalEditorCopy[locale];
        await expect(editor.getByText(copy.localOnly,{exact:true})).toBeVisible();
        await editor.getByLabel(copy.tripTitle,{exact:true}).fill(title+' confirmed');
        await editor.getByRole('button',{name:copy.addDay,exact:true}).click();
        await editor.getByRole('button',{name:copy.addItem,exact:true}).click();
        await editor.getByLabel(copy.itemTitle,{exact:true}).fill('Synthetic shared activity');
        assert.equal((await n('/'+id)).data.trip.headVersion,0,'browser draft never silently writes');
        await editor.getByRole('button',{name:copy.review,exact:true}).click();
        await expect(editor.getByRole('button',{name:copy.confirm,exact:true})).toBeEnabled();
        assert.equal((await n('/'+id)).data.trip.headVersion,0,'review still requires explicit confirmation');
        await editor.getByRole('button',{name:copy.confirm,exact:true}).click();
        await expect.poll(async()=>(await n('/'+id)).data.trip.headVersion).toBe(1);
        const confirmed=(await n('/'+id)).data;
        assert.equal(confirmed.trip.title,title+' confirmed');
        assert.equal(confirmed.content.days[0].items[0].title,'Synthetic shared activity');
        await page.reload({waitUntil:'domcontentloaded'});
        await expect(page.getByTestId('same-trip-editor').getByRole('heading',{name:/v1$/}).first()).toBeVisible();
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'no horizontal overflow');
        assert.deepEqual(errors,[],'no browser page errors');
        await page.screenshot({path:`${directory}/${locale}-${viewport.width}.png`,fullPage:true});
        t.diagnostic(`Browser ${locale} ${viewport.width}x${viewport.height}: ordinary cookie, visible diff/confirm and native same-ID persisted reload passed`);
      } finally {await context.close();}
    }
    t.diagnostic('Synthetic browser screenshots: '+directory);
  } finally {await browser.close();}
}
