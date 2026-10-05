import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {ExperienceReferenceReader} from '../../../../lib/server/community/publication/reference.ts';
const id=uuid(),publicationId=uuid(),submissionId=uuid();
const e=()=>({id:publicationId,submissionId,submissionVersion:2,safetyVersion:0,publicationVersion:3,title:'Synthetic current text',content:'Synthetic owned content',contentKind:'experience',benefitDisclosure:'',authorDisclosure:'unknown',reviewerDisclosure:null,source:'user_experience',copyright:'author_declared_own_text_independently_reviewed',rightsPurpose:'controlled_experience_display',audience:'controlled_registered',publiclyVisible:false,retrievalEligible:false,canReport:true,canBlock:true,place:null,expiresAt:new Date(Date.now()+29000).toISOString()});
const reference=()=>({id,publicationId,submissionVersion:2,safetyVersion:0,publicationVersion:3,version:1,state:'saved',availability:'current',experience:e(),createdAt:'2026-10-06T00:00:00Z',endedAt:null});
test('saved re-open clears content before authoritative current read and source denial',async()=>{
 let value=reference();let reads=0;const reader=new ExperienceReferenceReader({read:async()=>{reads++;assert.equal(reader.view.experience,null);return value;},current:()=>true,changed:()=>{}});
 await reader.open({referenceId:id});assert.equal(reader.snapshot().availability,'current');value={...reference(),availability:'unavailable',experience:null};await reader.open({referenceId:id});assert.equal(reader.snapshot().availability,'unavailable');assert.equal(reads,2);
});
test('old replies, mismatched reference, expired authority and replacement revisions never restore content',async()=>{
 let resolve;const reader=new ExperienceReferenceReader({read:()=>new Promise(r=>{resolve=r;}),current:()=>true,changed:()=>{}});const work=reader.open({referenceId:id});reader.invalidate();resolve(reference());await work;assert.equal(reader.snapshot().experience,null);
 for(const value of [{...reference(),id:uuid()},{...reference(),safetyVersion:1},{...reference(),experience:{...e(),expiresAt:new Date(Date.now()-1).toISOString()}}]) {const r=new ExperienceReferenceReader({read:async()=>value,current:()=>true,changed:()=>{}});await r.open({referenceId:id});assert.equal(r.snapshot().experience,null);}
});
test('TTL and auth replacement clear current source display',async()=>{
 let now=Date.now(),current=true;
 const reader=new ExperienceReferenceReader({read:async()=>reference(),current:()=>current,changed:()=>{},now:()=>now});await reader.open({referenceId:id});assert.equal(reader.snapshot().availability,'current');now+=31000;assert.equal(reader.snapshot().experience,null);now=Date.now();await reader.open({referenceId:id});current=false;assert.equal(reader.snapshot().experience,null);
});
