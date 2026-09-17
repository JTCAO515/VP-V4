import { test, expect } from '@playwright/test';
for (const [lang, emailLabel, consent, button, unavailable] of [
 ['en','Email','I agree to be contacted for this research and to the data use described above.','Apply for research','We could not save this request.'],
 ['zh','邮箱','我同意接收本次研究联系，并同意上方说明的数据用途。','申请参加研究','未能保存本次请求'],
]) {
 test(`research ${lang}: scope, independent consents, responsive layout and unavailable receipt`,async({page})=>{
   await page.setViewportSize({width:390,height:844});
   await page.goto(`/research?lang=${lang}`);
   await expect(page.getByRole('heading',{level:1})).toBeVisible();
   await expect(page.getByRole('checkbox')).toHaveCount(2);
   await expect(page.getByRole('checkbox').nth(0)).not.toBeChecked();
   await expect(page.getByRole('checkbox').nth(1)).not.toBeChecked();
   await page.getByRole('textbox',{name:emailLabel,exact:true}).fill('ci-research@example.test');
   await page.getByRole('checkbox',{name:consent,exact:true}).check();
   await page.getByRole('button',{name:button,exact:true}).click();
   // Generic CI deliberately has no enabled intake backend. It must never claim success.
   await expect(page.getByRole('status')).toContainText(unavailable);
   await expect(page.getByRole('button',{name:button,exact:true})).toBeEnabled();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
}
