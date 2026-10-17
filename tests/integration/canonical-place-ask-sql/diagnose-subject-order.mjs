import {createDiagnosticPg} from './diagnostic-owned-pg.mjs';
// Reproduce the original subject before-hook's migration selector on a new owned PG17.
// The original test file and all its artifacts remain untouched.
import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';
const owned=createDiagnosticPg();
const root='artifacts/AGENT-005/canonical-place-sql-20261015';
try{
const original=readFileSync('tests/integration/knowledge/agent-grounded-subject/subject-binding-postgres.test.mjs','utf8');assert.ok(original.includes("f.endsWith('.sql')&&f!==append"));
const inspect=readFileSync('tests/integration/canonical-place-ask-sql/inspect.mjs','utf8');const selector="f.endsWith('.sql')&&f!=='20261015083120_agent005_canonical_place_ask.sql'";assert.ok(inspect.includes(selector));const replay=inspect.replace(selector,"f.endsWith('.sql')&&f!=='20261015040456_agent005_resolved_subject_context.sql'");
 const result=owned.bootstrap(replay);assert.notEqual(result.status,0);const match=result.stderr.match(/20261015083120_agent005_canonical_place_ask\.sql (CANONICAL_PLACE_BEFORE_DEFINITION_MISMATCH public\.grounded_ai_assist_work_v1\(jsonb\))/);assert.ok(match,'must reproduce the same explicit dependency mismatch');
 writeFileSync(root+'/ci-subject-order-reproduction-safe.json',JSON.stringify({originalTestChanged:false,originalSelector:'all .sql except its own40456',replay:'same omitted40456, all successors loaded chronologically',observedMigration:'20261015083120_agent005_canonical_place_ask.sql',observedFailure:match[1],failureIsExpectedGuardRefusal:true,repairOwner:'original subject owner via Main',proposedHistoricalBaseline:'files strictly before40456; original test still exercises40456 itself',GoTrueOrTargetProof:false},null,2)+'\n');console.log('SUBJECT_CHRONOLOGY_FAILURE_REPRODUCED',match[1]);
}finally{owned.cleanup();}
