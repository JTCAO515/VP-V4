import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const {Client}=createRequire(import.meta.url)(process.env.CANONICAL_PLACE_PG_MODULE??process.env.AGENT005_PG_MODULE??process.env.VP_WIKI_PG_MODULE??'/Users/jtsm5p/Documents/Codex/2026-10-13/v10-main/agent008-pg-client-20261015/node_modules/pg/lib/index.js');
export const root='artifacts/AGENT-005/canonical-place-sql-20261015';
export const resource=JSON.parse(readFileSync(root+'/local-resource.json','utf8'));
export async function connect(){const c=new Client({host:resource.socket,user:'postgres',database:'postgres',statement_timeout:20000});await c.connect();return c;}
if(process.argv[2]&&process.argv[1]===fileURLToPath(import.meta.url)){const c=await connect();try{const r=await c.query(readFileSync(process.argv[2],'utf8'));console.log(JSON.stringify(Array.isArray(r)?r.map(x=>x.rows):r.rows));}finally{await c.end();}}
