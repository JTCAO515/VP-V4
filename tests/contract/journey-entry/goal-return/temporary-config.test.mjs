import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {goalReturnTemporaryConfig} from '../../../../tests/integration/journey-entry/goal-return/temporary-config.mjs';
test('only two top-level enabled fields change; actual original Auth/SQL/ports and nested settings preserve bytes',()=>{
 const source=readFileSync(new URL('../../../../supabase/config.toml',import.meta.url),'utf8'),result=goalReturnTemporaryConfig(source);
 const before=source.split('\n'),after=result.split('\n');assert.equal(before.length,after.length);
 const diffs=before.flatMap((line,i)=>line===after[i]?[]:[{before:line,after:after[i]}]);
 assert.deepEqual(diffs,[{before:'enabled = true',after:'enabled = false'},{before:'enabled = true',after:'enabled = false'}]);
 assert.ok(result.includes('[auth]\nenabled = true'));assert.equal(result.match(/project_id = .*/)[0],source.match(/project_id = .*/)[0]);
 const crlf='[auth]\r\nenabled = true # keep\r\n[realtime]\r\nenabled=true\r\n[storage]\r\nenabled = true\r\n[storage.s3_protocol]\r\nenabled = true\r\n';
 assert.equal(goalReturnTemporaryConfig(crlf),'[auth]\r\nenabled = true # keep\r\n[realtime]\r\nenabled=false\r\n[storage]\r\nenabled = false\r\n[storage.s3_protocol]\r\nenabled = true\r\n');
});
test('missing/duplicate or nonliteral authority fails before any temp write',()=>{
 const good='[auth]\nenabled = true\n[realtime]\nenabled = true\n[storage]\nenabled = true\n';
 for(const bad of [null,good.replace('[auth]','[auth.other]'),good+'[realtime]\nenabled = true\n',good.replace('[auth]\nenabled = true','[auth]\nenabled = true\nenabled = true'),
  good.replace('[auth]\nenabled = true','[auth]\nenabled = false'),good.replace('[storage]\nenabled = true','[storage]\nenabled = env("VALUE")')])assert.throws(()=>goalReturnTemporaryConfig(bad),/^Error: E3_CONFIG_/);
});
