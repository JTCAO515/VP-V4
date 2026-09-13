import {query} from './transport.mjs';
import fs from 'node:fs';import assert from 'node:assert/strict';
const s=JSON.parse(fs.readFileSync(new URL('./scenario.json',import.meta.url)));
const subjects=[...new Set(s.statements.map(x=>x.statement.assertion.subjectId))];
const names=s.statements[0].statement.place.names;
const lit=x=>"'"+x.replaceAll("'","''")+"'";
const observed=JSON.parse(query(`set role postgres;begin read only;select json_build_object('historicalSubjectMatches',(select count(*) from knowledge_review_private.statements where payload#>>'{assertion,subjectId}' in (${subjects.map(lit).join(',')})),'historicalNameMatches',(select count(*) from knowledge_review_private.statements where lower(payload#>>'{place,names,en}')=lower(${lit(names.en)}) or payload#>>'{place,names,zh}'=${lit(names.zh)}));rollback;`));
assert.equal(observed.historicalSubjectMatches,0);assert.equal(observed.historicalNameMatches,0);
fs.writeFileSync(new URL('./fixture-isolation.json',import.meta.url),JSON.stringify({at:new Date().toISOString(),status:'PASS',subjects,names,...observed},null,2)+'\n',{mode:0o600,flag:'wx'});console.log(JSON.stringify({status:'PASS',...observed}));
