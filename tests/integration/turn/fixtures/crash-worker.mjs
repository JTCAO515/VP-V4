import { sql } from '../../cost/fixtures/postgres-rpc.mjs';
const result=await sql(process.argv[2],'set role service_role; select public.claim_turn_work();');
if(result.code!==0)process.exit(1);
process.stdout.write(result.stdout.trim()+'\n');
setInterval(()=>{},1000);
