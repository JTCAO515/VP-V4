import assert from "node:assert/strict";
import test from "node:test";
import { correctSyntheticScreenshot, previewSyntheticScreenshot, SyntheticScreenshotImportStore } from "../../../lib/server/artifacts/screenshot-preview.ts";
const field=(kind:"date"|"amount"|"address"|"status",value:string)=>({kind,value,locator:{line:1,start:0,end:value.length}});
test("synthetic screenshot preview distinguishes added duplicate and conflict without source media",()=>{
 const result=previewSyntheticScreenshot({synthetic:true,fields:[field("date","2026-10-01"),field("amount","128")],currentValues:[{kind:"date",value:"2026-10-01"},{kind:"amount",value:"99"}]});
 assert.equal(result.kind,"preview");if(result.kind!=="preview")return;assert.deepEqual(result.fields.map(x=>x.state),["duplicate","conflict"]);
});
test("correction returns only a pending proposal and rejects raw screenshot payloads",()=>{
 const base={synthetic:true,importId:"import-1",tripId:"trip-1",baseTripVersion:2,now:"2026-09-01T00:00:00Z",expiresAt:"2026-09-01T00:05:00Z",fields:[field("status","confirmed")]};const ok=correctSyntheticScreenshot(base);assert.equal(ok.kind,"pending_screenshot_proposal");
 assert.equal(correctSyntheticScreenshot({...base,image:"raw"}).kind,"invalid");assert.equal(correctSyntheticScreenshot({...base,expiresAt:base.now}).kind,"invalid");
});
test("screenshot import replay is owner-scoped and never exposes a Trip write",()=>{
 const store=new SyntheticScreenshotImportStore();const screenshot={synthetic:true,importId:"import-1",tripId:"trip-1",baseTripVersion:2,now:"2026-09-01T00:00:00Z",expiresAt:"2026-09-01T00:05:00Z",fields:[field("status","confirmed")]};
 const first=store.confirm({ownerId:"owner-a",screenshot});assert.equal(first.kind,"pending_screenshot_proposal");assert.deepEqual(store.confirm({ownerId:"owner-a",screenshot}),first);
 assert.equal(store.confirm({ownerId:"owner-a",screenshot:{...screenshot,expiresAt:"2026-09-01T00:06:00Z"}}).kind,"invalid");
 assert.equal(store.confirm({ownerId:"owner-b",screenshot}).kind,"invalid");assert.equal("patch" in first,false);
});
test("cancellation creates no proposal and prevents that owner from replaying the import",()=>{
 const store=new SyntheticScreenshotImportStore();const screenshot={synthetic:true,importId:"import-2",tripId:"trip-1",baseTripVersion:2,now:"2026-09-01T00:00:00Z",expiresAt:"2026-09-01T00:05:00Z",fields:[field("status","confirmed")]};
 assert.deepEqual(store.cancel({ownerId:"owner-a",importId:"import-2"}),{kind:"cancelled"});assert.equal(store.confirm({ownerId:"owner-a",screenshot}).kind,"invalid");
});
