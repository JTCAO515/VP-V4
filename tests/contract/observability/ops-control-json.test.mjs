import test from 'node:test';import assert from 'node:assert/strict';
import {parseControlJson} from '../../../lib/server/observability/ops-control/input-json.ts';
test('duplicate encoded and nested operation fields fail before parsing erases them',()=>{
 for(const bytes of ['{"action":"set","action":"workspace"}','{"action":"set","\\u0061ction":"workspace"}','{"scope":{"kind":"city","key":"shanghai","key":"beijing"}}','[1,{"x":1,"x":2}]'])assert.throws(()=>parseControlJson(bytes));
 assert.deepEqual(parseControlJson('{ "schemaVersion":"ops-control/1", "action":"workspace" }'),{schemaVersion:'ops-control/1',action:'workspace'});
 assert.deepEqual(parseControlJson('{"a":"escaped \\"quote\\"","b":[true,null,1,-2]}'),{a:'escaped "quote"',b:[true,null,1,-2]});
});
