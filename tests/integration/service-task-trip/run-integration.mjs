import {spawn} from 'node:child_process';
import {readdirSync} from 'node:fs';
const env={...process.env,VP_TRIP_PG_BIN:process.env.VP_TRIP_PG_BIN??process.env.VP_WIKI_PG_BIN,VP_TRIP_PG_MODULE:process.env.VP_TRIP_PG_MODULE??process.env.VP_WIKI_PG_MODULE,VP_TRIP_EXPIRY_TEST:'1'};
if(!env.VP_TRIP_PG_BIN||!env.VP_TRIP_PG_MODULE)throw Error('Caller-owned native PostgreSQL binaries and pg client are required; no skip fallback');
if(process.argv.length!==2)throw Error('No unbounded suite/target overrides');
const files=readdirSync('tests/integration/service-task-trip').filter(f=>f.endsWith('.test.mjs')).sort().map(f=>'tests/integration/service-task-trip/'+f);
const p=spawn(process.execPath,['--test',...files],{env,stdio:'inherit'});p.on('error',()=>{process.exitCode=1;});p.on('exit',code=>{process.exitCode=code??1;});
