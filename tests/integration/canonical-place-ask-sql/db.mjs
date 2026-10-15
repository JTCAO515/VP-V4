import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export const root='artifacts/AGENT-005/canonical-place-sql-20261015';
export const resource=new Proxy({}, {get:(_,key)=>JSON.parse(readFileSync(root+'/local-resource.json','utf8'))[key]});
export async function connect(){
 if(!process.env.VP_WIKI_PG_MODULE)throw Error('Explicit VP_WIKI_PG_MODULE required');
 const {Client}=createRequire(import.meta.url)(process.env.VP_WIKI_PG_MODULE);
 const c=new Client({host:resource.socket,user:'postgres',database:'postgres',statement_timeout:20000});await c.connect();return c;
}
if(process.argv[2]&&process.argv[1]===fileURLToPath(import.meta.url)){const c=await connect();try{const r=await c.query(readFileSync(process.argv[2],'utf8'));console.log(JSON.stringify(Array.isArray(r)?r.map(x=>x.rows):r.rows));}finally{await c.end();}}
