const paths=["user-jwt-rpc","ops-jwt-rpc","system-worker-pooler"];
const local=process.env.SUPABASE_DB_URL ? "configured" : "not-configured";
console.log(JSON.stringify({status:local,paths:paths.map(path=>({path,status:local==="configured"?"planned-probe":"not-configured"})),productionConnectionAttempted:false}));
