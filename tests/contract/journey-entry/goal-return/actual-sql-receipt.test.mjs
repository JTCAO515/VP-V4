import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseGoalReturnScope,parseGoalReturn,qualifyGoalReturnArtifact} from '../../../../lib/server/journey-entry/goal-return/contract.ts';

test('actual same-transaction SQL reference and original chosen artifact pass Server strict readback',()=>{
 const bytes=readFileSync(new URL('./fixtures/actual-sql-receipt-pair.json',import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'00971888582d6cd784e35a8c660d604d587556a4c98ec3b42d658927ca761e1b');
 const pair=JSON.parse(bytes.toString('utf8'));
 assert.equal(pair.candidateSourceCommit,'e4ae920071afd271f72445f6b30433418090ea27');
 assert.equal(pair.nonce,'vpj13-goal-return-sql-20261012-51fb6d9a');
 assert.match(pair.provenance,/same ordinary-authenticated transaction/);
 assert.match(pair.provenance,/not GoTrue\/JWT\/HTTP/);
 const scope=parseGoalReturnScope(pair.reference.scope);
 assert.ok(scope);
 const ref=parseGoalReturn(pair.reference,scope);
 assert.ok(ref);
 assert.equal(ref.lastDecision.eventId,'130');
 assert.equal(ref.lastDecision.revision,2);
 const readback=qualifyGoalReturnArtifact(pair.result,ref,scope);
 assert.ok(readback);
 assert.equal(readback.content.schemaVersion,'decision/1');
 assert.equal(readback.content.state,'chosen');
 assert.equal(readback.content.chosenOptionId,'jingan');
 assert.equal(readback.source.tripVersion,0);
 assert.equal(readback.basis.memories.length,1);
});
