import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeGoalReturnHTTP} from '../../../../lib/server/journey-entry/goal-return/http.ts';

const query='conversationId=00000000-0000-0000-0000-000000000001&goalId=00000000-0000-0000-0000-000000000002&goalVersion=1&parentMessageId=00000000-0000-0000-0000-000000000003&inputSequence=1';
test('native GET rejects duplicate, extra, absent, malformed and forbidden browser headers before network',async()=>{
 const requests=[new Request(`http://127.0.0.1/api/chat/native/v5/goal-return?${query}`,{method:'POST'}),
  ...[`${query}&goalId=00000000-0000-0000-0000-000000000002`,`${query}&ownerId=foreign`,query.replace('goalVersion=1','goalVersion=01'),
   query.replace('inputSequence=1','inputSequence=1000001'),query.replace('goalVersion=1','goalVersion=10001'),query.replace('goalId=00000000-0000-0000-0000-000000000002','goalId=no'),query.replace('&inputSequence=1','')]
   .map(q=>new Request(`http://127.0.0.1/api/chat/native/v5/goal-return?${q}`)),
  ...[{cookie:''},{origin:'http://127.0.0.1'}].map(headers=>new Request(`http://127.0.0.1/api/chat/native/v5/goal-return?${query}`,{headers}))];
 for(const request of requests){const response=await nativeGoalReturnHTTP(request);assert.equal(response.status,400);assert.deepEqual(await response.json(),{error:{code:'INVALID_INPUT'}});assert.equal(response.headers.get('cache-control'),'private, no-store');}
});
